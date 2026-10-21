# Screenshots of the session recording screens

**2026-10-21.** Worked out while fixing issue #56 (the button on the "Saved" screen).

The recording page (`/patients/<id>/record`, `RecordSessionPage.tsx`) needs a microphone. The
Playwright browser on the mini has none, so the page cannot get past "Who's in the session?" on its
own. Two things get it to the "Saved" screen without recording anything or sending audio to the
backend.

## A pretend microphone, set before the page loads

Use `page.addInitScript` (in the Playwright "run code" tool) to replace `window.MediaRecorder` with a
small fake class and `navigator.mediaDevices.getUserMedia` with one that returns a fake track. The
fake class only needs `start`, `pause`, `resume`, `stop` (which calls `ondataavailable` then
`onstop`), `addEventListener`, and a static `isTypeSupported` that says yes to `audio/mp4`. The
same fake is in `RecordSessionPage.test.tsx`; copy it from there.

Init scripts cannot be removed from a page. To screenshot a different state (for example "Can't
record here", which needs `MediaRecorder` to be missing), add a second init script that sets it to
`undefined` and reload, or open a new page with `page.context().newPage()`. A new page in the same
context keeps the sign-in.

## Answer the recording calls in the browser

Use `page.route` on `127.0.0.1:8000/...recording...` and answer start, upload and stop with
`{"id": "rec1", "status": "recording"}` (or `"stopped"` for stop). Let the consent call through, so
the consent screen works against `float_dev`.

The web app runs on port 3000 and the backend on 8000, so these are cross-origin calls. The made-up
answers need `access-control-allow-origin: http://localhost:3000` and
`access-control-allow-credentials: true`, and the browser's `OPTIONS` check before an upload needs
its own answer (status 204 with the allow headers). I set these from the start, so I have not
checked what happens without them.

This way nothing is uploaded and no transcript job starts.
