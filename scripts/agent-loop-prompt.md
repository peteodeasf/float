You are one pass of the agent loop on the Mac mini (scripts/agent-loop.sh, docs/plans/agent-loop.md).
Nobody is watching this session. Do one backlog item, end with one PR, then stop.

1. Read CLAUDE.md (especially "Agents on the Mac mini"), STRATEGY.md, and the "Ready for agents"
   section at the top of docs/backlog.md.

2. Run `gh pr list --state open` and skip every Ready item that already has an open PR with its
   name in the title. Take the first item left.
   If none is left, print exactly NO_READY_ITEMS and stop.

3. Read anything the item points at: its plan in docs/plans/, related docs/solutions/, the code.
   Search the code before assuming something is missing.

4. Build it, completely. No placeholders, no "TODO later". Add or update tests. Give each new test
   a comment saying why it exists. Run /verify and fix what fails.

5. If the item changes a screen, take screenshots of every changed screen and attach them to the
   PR as described in CLAUDE.md.

6. Before opening the PR, add to the same branch:
   - Bugs you noticed that are not this item: add them to docs/backlog.md, outside the Ready
     list, in the backlog's format. Do not fix them now.
   - Anything non-obvious you had to work out: write it to docs/solutions/<slug>.md.
   - Remove the item from the Ready list.

7. Open the PR, titled with the item's name. Say in the description what changed and how you
   checked it, in plain English for Peter.

8. Wait for CI and fix anything that fails. Then:
   - If the item's Gate names clinical sign-off or /security-review, or your change touches
     clinical logic or who can see what: run /security-review where it applies, request Peter's
     review with `gh pr edit <number> --add-reviewer peteodeasf`, and do not merge.
   - Otherwise, if GitHub allows the merge, merge it with `gh pr merge --squash`.
   - If GitHub blocks it waiting for Peter, leave it open.

If you get stuck — the item is unclear, it needs a clinical decision, or you have failed the same
check three times — open the PR as a draft, say plainly what is blocking it, request Peter's review,
and stop. Do not guess at clinical decisions.
