"""A small check of the feared-outcome draft (docs/plans/arrow-feared-outcome.md).

Made-up arrows, each written to test one of the prompt's rules. NOT a test set to tune the prompt
on, and never to be copied into a prompt. Eight cases cannot tell you how often it is right; they
show whether it obviously breaks. Prints each draft for a person to read, plus a word-overlap note:
words in the draft that the child never said (a hint of invented content, not proof).

    ~/code/float/backend/.venv/bin/python -I "AI-dev/Arrow Eval/feared_outcome_check.py"
"""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
import anthropic  # noqa: E402
from app.api.routers.downward_arrows import FEARED_OUTCOME_SYSTEM_PROMPT, _whole_arrow_text  # noqa: E402
from app.schemas.downward_arrow import NextProbeRequest  # noqa: E402

CASES = [
    ("vague bottom", "I'll have to sit alone at lunch.", [
        ("What will happen if you sit alone?", "People will see I have no friends."),
        ("What will happen if people see?", "I dunno, it would just be really bad.")]),
    ("repeat at the bottom", "My mom won't come back from work.", [
        ("What will happen if she doesn't come back?", "Something bad happened to her, like a car crash."),
        ("What will happen if she's in a crash?", "She won't come home."),
        ("What will happen if she doesn't come home?", "She won't come home and I'll be alone.")]),
    ("avoidance answer", "The dog at the park will run at me.", [
        ("What will happen if it runs at you?", "It'll bite me."),
        ("What will happen if it bites you?", "I'd just stay home and not go to the park.")]),
    ("feeling as part of it", "I'll get called on in math.", [
        ("What will happen if you get called on?", "I'll freeze and my face goes red."),
        ("What will happen if you freeze?", "I'll start crying in front of everyone.")]),
    ("dangling phrase", "I'll throw up at the sleepover.", [
        ("What will happen if you throw up?", "They'd find out."),
        ("What will happen if they find out?", "They'd tell everyone at school and nobody would sit with me.")]),
    ("one step only", "I won't be able to fall asleep.", [
        ("What will happen if you can't fall asleep?", "I'll be too tired for my test and fail it.")]),
    ("meaning, not event", "I'll get a bad grade.", [
        ("What will happen if you get a bad grade?", "My parents will be disappointed."),
        ("What will happen if they're disappointed?", "It means I'm a failure.")]),
    ("long chain", "My hands will have germs on them.", [
        ("What will happen if your hands have germs?", "I'll touch my food."),
        ("What will happen if you touch your food?", "I'll get sick."),
        ("What will happen if you get sick?", "I'll miss school."),
        ("What will happen if you miss school?", "I'll fall behind and have to repeat the grade.")]),
]

STOP = set("i i'll i'd i'm a an the and to of at in on my me it if will would be is was they them that what then so as for with have has had not no".split())


def words(t):
    return set(re.findall(r"[a-z']+", t.lower())) - STOP


client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
spent_in = spent_out = 0
for name, thought, steps in CASES:
    req = NextProbeRequest(starting_thought=thought, steps=[{"question": q, "response": a} for q, a in steps])
    m = client.messages.create(model="claude-sonnet-4-6", max_tokens=200, system=FEARED_OUTCOME_SYSTEM_PROMPT,
                               messages=[{"role": "user", "content": _whole_arrow_text(req)}])
    spent_in += m.usage.input_tokens
    spent_out += m.usage.output_tokens
    out = m.content[0].text.strip()
    said = words(thought + " " + " ".join(a for _, a in steps))
    new = sorted(words(out) - said)
    print(f"[{name}] {out}\n    words not in the child's answers: {new or 'none'}\n")
print(f"{len(CASES)} cases, 1 run each. Tokens: {spent_in} in, {spent_out} out (about ${spent_in*3/1e6 + spent_out*15/1e6:.3f} at Sonnet list prices).")
