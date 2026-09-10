# A flag that stopped being written was still being read

**2026-09-10.** A child tapping a scheduled exposure was sent back to the home screen.

## The cause

On 2026-09-01 the per-situation on/off flag, `trigger_situations.is_active`, was replaced by one
switch for the whole ladder, `treatment_plans.ladder_active`. The plan said to leave the column and
stop reading it. The child's home stopped reading it. The exposure screen's deep-link guard did not:
it still sent the child home whenever the flag was off.

New situations are created with the flag off, and after 2026-09-01 nothing turns it on. So every
exposure on a situation made in the new ladder editor sent the child home.

No test caught it. The ladder endpoint had stopped using the flag, so it only reached the child's
app through a second endpoint, `/patient/behaviors/{id}`, and no test opened the exposure screen.

## The fix

`/patient/behaviors/{id}` returns `ladder_active`, and the guard reads that. The endpoint no longer
returns `is_active` at all, so nothing can read it by mistake again.

## How to avoid it

When a column stops being the source of truth, remove it from every API response in the same
change. If a field is still returned, something will still read it. Before calling it done, search
the frontend for the field name.
