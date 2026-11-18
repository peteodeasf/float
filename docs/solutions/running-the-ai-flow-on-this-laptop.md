# Running the clinician AI flow on Peter's laptop, not production

**2026-11-17.** Written after running monitoring → session note → ladder → step suggestions end to
end with real AI calls on a local database. Three things went wrong before it worked.

## Getting a local Postgres

The laptop has no Docker. Its Homebrew Postgres (`postgresql@14`, really 9.5.3) is broken, and
Homebrew cannot install a new one because its folders are not writable by Peter's user.

What worked: the `pgserver` package from PyPI, which ships Postgres 16 binaries. Install it into a
throwaway virtualenv, then use its `pginstall/bin/initdb`, `pg_ctl` and `createdb`.

- **Create the databases as UTF-8.** `initdb` with no locale makes them `SQL_ASCII`. Then saving an
  AI reply into a JSONB column fails with `unsupported Unicode escape sequence`, which looks like a
  Float bug and is not. Use `createdb -E UTF8 -T template0 --locale=C`.
- **Turn off the Unix socket** (`pg_ctl -o "-p 55433 -k ''"`) when the data folder is under the
  long scratchpad path. The socket path is limited to 103 characters and Postgres refuses to start.

## Keeping it off production

`backend/.env` points at production. Set `DATABASE_URL` in the shell. pydantic-settings takes a
shell variable over `.env`, and `seed_local.py` refuses anything but localhost. Also blank
`RESEND_API_KEY` and the `TWILIO_*` variables when starting the backend, so nothing is emailed or
texted.

## The Anthropic key

A shell `ANTHROPIC_API_KEY` also wins over `.env`. Claude Code's shell has one that the Anthropic
API rejects, so every AI step returned 401. Start the backend with `env -u ANTHROPIC_API_KEY` so
it reads the key from `backend/.env`.

## What the run found

Session-note analysis made a second copy of situations the monitoring log already had ("Bedtime"
beside "Bedtime, going to sleep in her own room"), because suggestions are matched by exact wording
and the extractor was never shown the existing names. Fixed by giving it the list's situation names
(`format_session_note` in `backend/app/services/insight_service.py`). Behaviours and accommodations
are still matched only by wording under their situation.
