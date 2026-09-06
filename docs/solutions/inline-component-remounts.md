# A component declared inside another one throws away everything below it

**2026-09-05.** Adding a situation in the ladder builder closed the Add situation panel every time,
so you could only add one before reopening it.

## The cause

`SessionInterview` had this:

```tsx
const Shell = ({ children }) => embedded ? <div>{children}</div> : <Chrome>{children}</Chrome>
return <Shell><LadderEditor … /></Shell>
```

`Shell` is created fresh on every render, so React sees a different component type each time and
throws away everything inside it — including `LadderEditor` and all of its state. Adding a situation
invalidates a query, the query refetches, `SessionInterview` re-renders, and the panel's `adding`
flag goes back to false along with everything else.

Nothing looked wrong. It rebuilds fast enough that the only symptom was state quietly resetting.

## The fix

Return elements from a plain function instead of declaring a component:

```tsx
const shell = (children: React.ReactNode) => embedded ? <div>{children}</div> : <Chrome>{children}</Chrome>
return shell(<LadderEditor … />)
```

## How to avoid it

Never write `const X = (props) => …JSX…` inside a component body and then use it as `<X />`. Either
hoist it to module scope, or make it a function you call. The rule is about the `<X />` — a helper
that returns JSX and is *called* is fine, because React never sees it as a type.

Symptom to recognise: state resets, inputs lose focus, or panels close whenever something unrelated
re-renders the parent.
