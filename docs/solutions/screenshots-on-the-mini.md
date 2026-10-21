# Taking screen screenshots on the Mac mini

**2026-10-15.** Worked out while fixing the parent sign-in screen. Five things that cost time.

## Another agent may already be using your port

More than one loop session can run at once, each in its own worktree. Ports 5173 and 5174 were
both taken by other sessions' web apps. The backend only accepts requests from these addresses
(`ALLOWED_ORIGINS` in `backend/app/core/config.py`):

- `http://localhost:3000`, `5173`, `5174`, `8081`

A web app on any other port loads, but every API call fails. So pick a free one of those four,
and start it from your own worktree with `--strictPort` so it fails loudly if taken:

    cd apps/web && npx vite --port 3000 --strictPort

Run `npm ci` in the worktree first — a new worktree has no `node_modules`.

The backend on port 8000 is shared and runs from the main checkout. That is fine for a
front-end-only change.

**When every allowed port is taken, or you need your own backend** (2026-10-21, issue #57): the web
app does not have to call port 8000. `VITE_API_URL` overrides it, and the backend reads
`ALLOWED_ORIGINS` from the environment as a JSON list. Run both from your worktree, in the
background:

    cd backend && ALLOWED_ORIGINS='["http://localhost:5191"]' ~/code/float/backend/.venv/bin/uvicorn app.main:app --port 8011 --host 127.0.0.1
    cd apps/web && VITE_API_URL=http://127.0.0.1:8011 npx vite --port 5191 --strictPort

This is only a command-line setting for your session. Do not create `.env.local`.

## A screenshot straight after opening a page is blank

The parent screens show nothing while they load the signed-in parent (`ParentProtectedRoute`
returns `null`). A screenshot taken right after navigating catches that blank page. Wait first,
for example with the Playwright evaluate tool:

    () => new Promise(r => setTimeout(() => r(document.body.innerText), 2000))

Returning the page text also tells you whether it loaded the screen you expected.

## Screenshots must be saved inside the worktree

The Playwright tool refuses paths outside the worktree, including `/tmp`. Save to
`.playwright-mcp/` in the worktree. That folder is not in `.gitignore`, so add files to commits by
name, never with `git add -A`. Some old files in it are checked into the repo, so do not
`rm -rf` the folder to clean up: delete only your own files, or `git checkout -- .playwright-mcp`
afterwards.

The file can appear a moment after the screenshot tool says it is done, and reading a file you
overwrote can show you the old picture. Give each new screenshot a new file name.

## A note from a recording is not in the demo data

The demo seeds only typed session notes. To screenshot the transcript or speaker controls, insert
one into `float_dev` with `source = 'recording'`, `is_draft = true`, a `transcript` list of
`{"speaker": "1:1", "text": ...}` and `speaker_names` like `{"1:1": "Clinician"}`. Copy the
`patient_id`, `organization_id` and `practitioner_id` from an existing note.

## Getting a "before" screenshot after you have made the change

An agent session cannot run git in the main checkout. To screenshot the old version, copy your
file aside, `git checkout HEAD -- <file>`, let Vite reload, take the shot, then copy your file
back.

## The demo parent sees empty screens

The demo data does not share the child's progress with the parent, so the parent's home and
Progress screens only show their empty state. Logged in `docs/backlog.md`.

## Putting screenshots on the `pr-screenshots` branch without a second checkout

**2026-10-21.** A loop session is locked to its own worktree, so it cannot check out
`pr-screenshots` in a second folder and commit there. Upload each file through the GitHub API
instead. Write the base64 to a file first, one command per file:

    base64 -i .playwright-mcp/before.png > /tmp/<worktree>/before.b64
    gh api -X PUT repos/peteodeasf/float/contents/<pr-number>/before.png \
      -f message="Screenshot for PR #<pr-number>" -f branch=pr-screenshots \
      -F content=@/tmp/<worktree>/before.b64

A loop over the files with `$(base64 ...)` inside it is refused by the worktree guard.

## Showing a dropdown's choices in a screenshot

**2026-10-21**, issue #53. A screenshot cannot catch a native `<select>` open: the list of choices
is drawn by the browser, not the page. To show every choice, turn it into a list box for the shot
only, with the Playwright evaluate tool:

    () => { const s = document.querySelector('select'); s.size = s.options.length; s.style.height = 'auto'; return s.options.length }

`style.height = 'auto'` matters: the patient list's filter has a fixed height, so without it only
two choices show. Say in the PR that the box was opened this way, since the real control is still a
dropdown.

## Parallel commands can run in the wrong folder

Running /verify's steps as parallel tool calls, each starting `cd backend && …` or
`cd apps/web && …`, left `npx tsc -b` running in `backend/`. It failed with "Cannot read file
backend/tsconfig.json", which looks like a broken build but is not. Run the steps one at a time.
