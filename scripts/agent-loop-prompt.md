You are one pass of the agent loop on the Mac mini (scripts/agent-loop.sh, docs/plans/agent-loop.md).
Nobody is watching this session. Do one backlog item or fix one issue, end with one PR, then stop.

1. Read CLAUDE.md (especially "Agents on the Mac mini"), STRATEGY.md, and the "Ready for agents"
   section at the top of docs/backlog.md.

2. Run `gh pr list --state open` and skip every Ready item that already has an open PR with its
   name in the title. Take the first item left.
   If no Ready item is left, go to "Fixing a ui-feedback issue" below instead.
   If that finds nothing to fix either, print exactly NO_READY_ITEMS and stop.

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

## Fixing a ui-feedback issue

Issues labelled `ui-feedback` come from people testing the app's screens, mostly through Jam
(`docs/plans/ui-testing.md`). Each has words, screenshots and the page address.

1. List them, oldest first: `gh issue list --label ui-feedback --state open --search "sort:created-asc"`.
   Skip any labelled `needs-peter`, and any that an open PR already names ("Fixes #N").
2. Read the next one: `gh issue view <N> --comments`. Download its screenshots and look at them.
   Decide which kind it is:
   - **Peter's own report** (author `peteodeasf`): treat it as his instruction. Fix it.
   - **A bug**: something does not do what it says, or breaks. Fix it.
   - **Anything else**: a suggestion, a change to how the product works, anything clinical (what
     counts as avoidance, safety or escape, Fear Level or accommodation rules), anything about who
     can see what, or a report you cannot understand. Do not change code. Comment on the issue
     with one short, plain question for Peter, add the label (`gh issue edit <N> --add-label
     needs-peter`), and go back to step 1 for the next issue.
3. **Never open the production record in the issue's link.** The page address points at the live
   app. Reproduce the problem locally, with demo data in `float_dev` (CLAUDE.md, "Agents on the Mac
   mini"). If you cannot reproduce it, comment saying what you tried, add `needs-peter`, and go
   back to step 1.
4. Fix it as in steps 3 to 6 above, with a test that fails before the fix. Screenshots before and
   after for a screen change.
5. Open the PR titled `Fix #<N>: <issue title>`, with `Fixes #<N>` in the description, so merging
   it closes the issue. Then step 8 above. A screen change waits for Peter's approval anyway.
6. One issue per PR. If two issues are the same problem, fix it once, put `Fixes #<A>, fixes #<B>`
   in the description, and say so.

If you get stuck — the item is unclear, it needs a clinical decision, or you have failed the same
check three times — open the PR as a draft, say plainly what is blocking it, request Peter's review,
and stop. Do not guess at clinical decisions.
