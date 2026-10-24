# A cache update in a test reaches the screen a moment later

**2026-10-24.** Found while testing that the ladder editor holds its order (PR "Ladder editor:
things stay put while you edit").

A test changed a step's Fear Level with `qc.setQueryData(['behaviors', 't1'], ...)` inside `act()`,
then checked the step had not moved. The check passed — but the screen had not changed at all.
React Query tells components about a cache change on its next tick, not straight away, so a plain
`act(() => ...)` finishes before anything re-renders. "Did not move" was true because nothing
had happened.

**Fix:** after the update, wait until the screen shows the new value, then check the order:

    act(() => { qc.setQueryData(['behaviors', 't1'], changed) })
    await waitFor(() => expect(fearLevels()).toEqual(['3', '3', '1']))

**How to tell a "nothing changed" test is real:** break the code on purpose and see it fail. Here,
making the list sort live again failed all five order tests.
