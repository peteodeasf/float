# Testing the clinician's patient page without a backend

**2026-10-21.** Worked out while removing the "setup" tag beside Treatment Plan (#48).
`PatientPage.tsx` had no test, and it is 2,000 lines with dozens of queries.

## It renders with two mocks

See `apps/web/src/pages/practitioner/PatientPagePlanHeader.test.tsx`.

- **Mock `apiClient`** in `../../api/client` so every request answers `{ data: null }`. Then seed
  only what the test needs with `queryClient.setQueryData` (`['patient', id]`, `['plan', id]`), with
  `staleTime: Infinity` so the seeded data is not refetched.
- **Stub `PractitionerNav`.** It calls `useAuth`, which throws outside `AuthProvider`. The nav is
  not what these tests check.

Open the tab you want with the URL, e.g. `/patients/pt1?tab=plan`.

## Checking text is gone: textContent runs pieces together

The first version of the test passed even with the tag still on screen. The header's
`textContent` was `Treatment Plansetup·+ Add nickname`, with no space between the spans, so a
`\bsetup\b` match never fired. Check each child element's text instead. Run the test against the
old code once, to see it fail.
