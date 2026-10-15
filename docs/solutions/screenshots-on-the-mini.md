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
front-end-only change. A backend change needs its own backend, which the web app would not use
(it always calls port 8000).

## A screenshot straight after opening a page is blank

The parent screens show nothing while they load the signed-in parent (`ParentProtectedRoute`
returns `null`). A screenshot taken right after navigating catches that blank page. Wait first,
for example with the Playwright evaluate tool:

    () => new Promise(r => setTimeout(() => r(document.body.innerText), 2000))

Returning the page text also tells you whether it loaded the screen you expected.

## Screenshots must be saved inside the worktree

The Playwright tool refuses paths outside the worktree, including `/tmp`. Save to
`.playwright-mcp/` in the worktree. That folder is not in `.gitignore`, so add files to commits by
name, never with `git add -A`.

## Getting a "before" screenshot after you have made the change

An agent session cannot run git in the main checkout. To screenshot the old version, copy your
file aside, `git checkout HEAD -- <file>`, let Vite reload, take the shot, then copy your file
back.

## The demo parent sees empty screens

The demo data does not share the child's progress with the parent, so the parent's home and
Progress screens only show their empty state. Logged in `docs/backlog.md`.
