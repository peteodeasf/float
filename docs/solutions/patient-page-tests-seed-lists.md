# Rendering the clinician's patient page in a test: seed the lists it maps over

**2026-10-21.** Worked out while writing the test for issue #59 (clicking a session note's chips
opened the note).

The page tests (`PatientPagePlanHeader.test.tsx`, `PatientPageSessionNotes.test.tsx`) mock the API
so every request answers `{ data: null }`, and seed what the test needs with `setQueryData`.

That works until the page re-renders after the mocked requests come back. Then any query that was
not seeded holds `null`, not `undefined`. A default like `const { data: parents = [] } = useQuery(...)`
only applies to `undefined`, so `parents.map` throws. `RecordingsInProgress` does the same with
`recordings.map`.

The first render passes, so a test that only reads the page is fine. A test that clicks something
re-renders and crashes with `Cannot read properties of null (reading 'map')`.

**Fix in the test:** seed those lists as empty arrays.

    qc.setQueryData(['parents', 'pt1'], [])
    qc.setQueryData(['recordings', 'pt1'], [])

The stack trace names the component and line, so a new crash of this kind points at the next
query to seed.
