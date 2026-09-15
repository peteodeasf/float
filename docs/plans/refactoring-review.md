# Refactoring review, every two weeks

Peter, 2026-09-15: he suspects there is a lot of old, unused and slow code. A review runs on a
schedule, writes a report, and changes nothing. Peter picks what gets fixed.

## Schedule

The 1st and 15th of each month at 9am, as a scheduled task in the Claude desktop app
(`refactoring-review`). It runs while the app is open; if the app is closed, it runs the next time it
opens.

## What it checks

1. **Unused code.** Files nothing imports, functions and exports nothing uses, server routes the web
   app never calls, database columns nothing reads. Tools: `knip` for the web app (`npx knip@5`),
   `vulture` for the server (installed in `backend/.venv`, not in `requirements.txt`). Both report
   things that are used in ways they cannot see, such as routes registered by name, so every item is
   checked by hand before it goes in the report.
2. **Very large files.** On 2026-09-15: `PatientPage.tsx` 2,560 lines, `patients.py` 2,297 lines.
3. **The same logic written in more than one place.**
4. **Old code left behind when a feature changed**, for example the hidden Plan-tab builder and action
   plans.
5. **Slow spots**: a database query run once per row, a page loading data it does not show.

## The report

`docs/refactoring/YYYY-MM-DD.md`, not committed by the task. It has:
- A short summary: how much unused code was found, and how that compares with the last report.
- Each item: what it is, where, how sure (checked by hand or tool only), the size of the fix (S, M,
  L), and whether it touches who can see what or clinical logic.
- Nothing is changed, deleted or committed.

## Rules for fixes Peter picks

- Each fix is a small separate commit.
- All tests pass before and after, and nothing changes for users.
- A security review runs if the fix touches who can see what.
- Anything clinical goes to Peter first.

## First look, 2026-09-15 (before the schedule)

- About 41,000 lines: server 16,800, web app 24,600.
- Web app files nothing imports (about 360 lines): `lib/treatmentJourney.ts`,
  `lib/temptingBehaviors.ts`, `api/streak.ts`, `components/ui/InlineForm.tsx`,
  `components/ui/MessagesPanel.tsx`. Not yet checked by hand.
- The server check was a quick text search and not reliable; the first scheduled run covers it.
