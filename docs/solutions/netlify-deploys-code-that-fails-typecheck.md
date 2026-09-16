# Netlify deploys frontend code that fails the TypeScript check

**Date:** 2026-09-16

## Symptom

Eight buttons in the clinician app lost the shared button style in production. `npm run build`
failed locally with TS17001 ("JSX elements cannot have multiple attributes with the same name"),
yet Netlify had deployed the same commit without complaint.

## Root cause

Commit `8fa2f28` added `style={btn(...)}` to buttons that already had `style={{ padding: ... }}`.
With two `style` attributes the last one wins, so each button kept only its old padding.

`npm run build` runs `tsc -b && vite build` and would have stopped it. `netlify.toml` runs
`npx vite build`, which does no type checking, so Netlify built and deployed it. CI runs
`tsc -b --force` and fails, but a failing CI run does not stop Netlify.

## Fix

Removed the leftover padding so each button has one style, from `btn()`.

## How to avoid it next time

A green Netlify deploy says nothing about types. Check CI, or run `npx tsc -b` in `apps/web`,
before pushing frontend changes. Changing the Netlify command to `npm run build` would make a
type error block the deploy; not done yet.
