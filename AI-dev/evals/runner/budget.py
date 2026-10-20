"""The spending limit.

Every AI call goes through `MeteredClient`, which adds up what each call cost from the token counts
the API returns, and refuses the next call once it could take the total over the limit.

"Could" is judged from the most expensive call so far. Before the first call it is judged from the
call's own `max_tokens`, so even the first call cannot overshoot by much.
"""

# Dollars per million tokens: (input, output). Anthropic's list prices, 2026-10.
# A model not listed here is refused rather than run unmetered.
PRICES_PER_MTOK = {
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-5-5": (4.00, 20.00),  # the trigger matcher (compare_triggers.py); as in generator/generate.py
}
CACHE_WRITE = 1.25  # times the input price
CACHE_READ = 0.10


class BudgetExceeded(Exception):
    pass


class Budget:
    def __init__(self, limit_usd: float):
        self.limit_usd = float(limit_usd)
        self.spent_usd = 0.0
        self.calls = 0
        self.largest_call_usd = 0.0

    def cost(self, model: str, usage) -> float:
        inp, out = PRICES_PER_MTOK[model]
        tokens_in = getattr(usage, "input_tokens", 0) or 0
        tokens_out = getattr(usage, "output_tokens", 0) or 0
        cache_w = getattr(usage, "cache_creation_input_tokens", 0) or 0
        cache_r = getattr(usage, "cache_read_input_tokens", 0) or 0
        return (tokens_in * inp + cache_w * inp * CACHE_WRITE + cache_r * inp * CACHE_READ
                + tokens_out * out) / 1_000_000

    def check(self, model: str, max_tokens: int) -> None:
        if model not in PRICES_PER_MTOK:
            raise ValueError(f"no price for {model!r}, so its spending cannot be limited. "
                             f"Add it to PRICES_PER_MTOK in budget.py.")
        estimate = self.largest_call_usd or max_tokens * PRICES_PER_MTOK[model][1] / 1_000_000
        if self.spent_usd + estimate > self.limit_usd:
            raise BudgetExceeded(
                f"spending limit ${self.limit_usd:.2f} reached: ${self.spent_usd:.4f} spent "
                f"over {self.calls} calls, and the next could cost about ${estimate:.4f}"
            )

    def record(self, model: str, usage) -> None:
        c = self.cost(model, usage)
        self.spent_usd += c
        self.calls += 1
        self.largest_call_usd = max(self.largest_call_usd, c)


class _Messages:
    def __init__(self, inner, budget: Budget):
        self._inner = inner
        self._budget = budget

    def create(self, **kwargs):
        model = kwargs["model"]
        self._budget.check(model, kwargs.get("max_tokens", 0))
        message = self._inner.messages.create(**kwargs)
        self._budget.record(model, message.usage)
        return message


class MeteredClient:
    """Looks like an Anthropic client to the app's code (`client.messages.create`), and counts."""

    def __init__(self, inner, budget: Budget):
        self.budget = budget
        self.messages = _Messages(inner, budget)
