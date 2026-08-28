# Three ways to guard the wrong id

**2026-08-28.** Security review of the clinician access grants change. All three findings were the
same mistake wearing different clothes: the check ran against an id that was *not* the one the
handler used.

## 1. The guard read an id from the query string

`GET /rungs/{rung_id}/experiments` was guarded by `get_permitted_behavior`, whose parameter is named
`behavior_id`. That path has no `{behavior_id}`. FastAPI does not error — it **promotes the unmatched
parameter to a required query parameter**. So the caller supplied the id their own access was checked
against, while the handler read the record named by `rung_id`.

A dependency binds by parameter NAME. If the name is not in the path, the caller controls it.

## 2. The guard checked the parent, the handler used the child

Nine nested routes — `/plans/{plan_id}/triggers/{trigger_id}`, `/triggers/{trigger_id}/behaviors/{behavior_id}`,
`/plans/{plan_id}/accommodations/{accommodation_id}`, `/ladders/{ladder_id}/rungs/{rung_id}` and their
DELETEs. The dependency resolved the parent id; the service then matched the child on
`id + organization_id`. Nothing tied the two together, so a clinician could pair a parent they
legitimately held with any child row in the institution.

This is worse than it first looks, because it defeats revocation: a clinician whose grant was removed
keeps every row id they ever saw.

## 3. The route's identity was a pair, and only half was checked

`PUT /patients/{patient_id}/plan/{plan_id}` checked the patient. The service loaded the plan by
`id + organization_id` and never confirmed the plan belonged to that patient.

## Why the route sweep missed all three

The sweep fills **every** path parameter from the same victim. On a nested route both ids belong to
the victim, the parent guard fires, and the route correctly refuses — so it passes. The mixed pair,
*my* parent id with *their* child id, is never constructed. For finding 1 it omitted the query
parameter entirely, got a 422, and passed.

A sweep proves only the shape of request it actually builds.

## What now catches them

- `tests/test_access_dependency_wiring.py` — no route may take an id from the query string, and every
  `get_permitted_*` must bind a parameter its own path declares. Needs no database. This catches
  finding 1 mechanically, for every route, forever.
- `tests/test_route_sweep.py::test_a_nested_route_cannot_pair_my_own_parent_with_someone_elses_child` —
  builds the mixed pair for all nine routes. Confirmed non-vacuous: with the guards removed, the
  DELETE returns 204 and actually destroys the other patient's situation.
- `assert_belongs_to` in `patient_access_service.py`, and `assert_rung_in_plan` for the one case where
  a rung can hang off either a plan or a situation.

## The general lesson

Ask which id the handler *acts on*, and check that one. Not the id that was convenient, not the one
the path happens to start with. Where a route's identity is a pair, both halves belong in the query.

And one trap worth remembering: `rung_id` means `AvoidanceBehavior` under `/plans/` and `LadderRung`
under `/ladders/`. One dependency name cannot serve both, which is why these checks live in the
queries rather than only in dependencies.
