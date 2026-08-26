# Development setup — assessment and what to change

> Written 2026-08-26, after a session that shipped ~20 changes to production. Prompted by: another
> founder running ~10 agents against a backlog, and the question of what it would take here.

## Where the time actually went

This session's loop was: **describe → build → deploy → owner looks → correct.** It moved fast and
the work landed. But every single change was verified by a human looking at a screen.

What that cost, concretely:

- **"this doesn't work", "it's a mess", "this looks unchanged to me"** — three rounds where work
  shipped to production before anyone could see it was wrong.
- The **preview harness** (`__SessionPreview.tsx`, built mid-session) was the turning point. Every
  screen checked there landed. The ones shipped blind came back.
- Deploys were verified by `curl`-ing the production bundle and grepping for strings. That is
  forensics, not testing.
- Two design recommendations were made on a wrong premise and corrected after grounding —
  `ladder_rungs` being dead scaffolding was a two-minute query that should have run *first*.

## The bottleneck

**The owner is the test suite.** Not a figure of speech: there is no other mechanism that can tell
whether a change is correct.

```
backend tests      none        (pytest + pytest-asyncio already in requirements.txt, unused)
frontend tests     none        (no test script, no test files, no runner)
CI                 none        (no .github/)
```

Ten agents against this produce ten things for one person to inspect. Agent count is not the
constraint; **unattended verification is.**

## Three bugs this session that tests would have caught

Not hypothetical — each cost a round trip, and each is a plain service-level test:

1. **`delete_trigger` 500'd on any situation with dependents.** Nothing pointing at
   `trigger_situations` cascades, so deleting a worked-on situation always failed. Presented as
   "click Yes, nothing happens."
2. **Session mode showed placeholder situations the builder hides.** Two surfaces disagreed about
   `is_placeholder`. Presented as "I deleted them and they're still there."
3. **`run_ladder_review` has always reviewed an empty list.** It reads `ladder_rungs`, which has
   zero rows. "Run AI review" reports no flags regardless of input.

## The actual blocker to backend tests

Worth naming, because it is why "just write tests" hasn't happened: **there is no database to test
against.** `.env` points at production; the only local Postgres is 9.5, too old for
`gen_random_uuid()` and JSONB usage; Docker is not installed. SQLite will not substitute — the
schema leans on Postgres types.

So step one is not "write tests", it is **get a throwaway Postgres**: Docker Desktop, or a second
Railway database used only by tests. Half a day, and it unblocks everything else.

## What to build, in order

### 1. A test database + the first ten backend tests
Target the service layer — it is where the bugs were, and it is pure enough to test directly.
Start with `trigger_situation_service` (delete cascade), `avoidance_behavior_service` (cascade,
grouping, the flat-ladder query's situation fallback), and `checklist_item_service` (seeding).

### 2. `vitest` + component tests using the preview-harness pattern
`__SessionPreview.tsx` already proves it: seed the react-query cache with fixtures, render the
component, assert. That is a component test with the assertions missing. The phases are already
exported for it.

### 3. CI on push
Typecheck, build, backend tests, frontend tests. Today's equivalent is running four commands by
hand and reading the output.

### 4. A written backlog
Agents cannot pick up work that exists only in a chat thread. The `docs/plans/` habit that emerged
mid-session is the right instinct — extend it to a task list with enough detail to act on
unsupervised. "Add Plan an experiment to the flat ladder" is a file, not a memory.

### 5. Split `PatientPage.tsx`
**3,931 lines.** Two agents working in it will collide on every edit. This is a prerequisite for
parallelism, not tidiness. `BehaviorPanel` and `FlatLadder` are already exported and could move
out today.

## Where parallel agents actually help here

**They do:** writing tests against existing behaviour; applying one pattern across many files;
independent investigation ("is `X` still referenced anywhere?"); adversarial review of a diff.
Anything with a definition of done a machine can check.

**They don't:** the design judgment that produced this session's best decisions. "The ladder is the
hero and this banner shouts over it", "sub-behaviours aren't the need, sub-situations are", "we're
still loading up the screen" — none of that comes from throughput. The point of the work above is
not to remove that judgment from the loop; it is to stop spending it on things a test would have
caught.

## Also worth doing

- **`.claude/settings.local.json` has 279 allow entries.** Worth pruning to patterns.
- **No custom agents or slash commands.** Once there is a backlog and tests, a `/verify` command
  (typecheck + build + tests + preview screenshot) is the obvious first one.
- **`.claude/worktrees/` exists but is empty** — that is the isolation mechanism for parallel agents
  touching the same files.

## Honest sizing

Steps 1–3 are roughly two focused days and they change the shape of everything after. Step 5 is a
day. Until step 1 exists, adding agents increases how much the owner has to review, which is the
opposite of the goal.
