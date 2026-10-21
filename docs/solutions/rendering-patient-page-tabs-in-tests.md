# Rendering each patient-page tab in a test

**2026-10-21.** Worked out while moving the Case Summary to its own tab (issue #54).

## The empty API mock crashes the Chat tab

`PatientPagePlanHeader.test.tsx` mocks the API so every request answers `{ data: null }`, and seeds
the page's data with `setQueryData`. That works for the Plan tab. The Chat tab crashes with
`parents.map is not a function`: `useQuery`'s `= []` default only applies while the data is
`undefined`, and the mock makes it `null`. The real API returns a list, so this is the mock, not a
bug. Seed it: `qc.setQueryData(['parents', 'pt1'], [])`.

## The patient's name appears twice on the Chat tab

The header shows it and so does the teen's chat thread, so `findByText('Sam Rivera')` throws
"multiple elements". Use `findAllByText` when waiting for the page to load.

## Monitoring's inner screens only show once a form exists

The demo patient in `float_dev` has no monitoring form, so the Monitoring tab shows only the "send a
form" box. Anything below the form strip (the report of entries) cannot be screenshotted on the demo
patient without creating a form first.
