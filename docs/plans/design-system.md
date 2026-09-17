# Design system — one schema for the whole app

Date: 2026-09-16. Builds on [`ui-consistency-audit.md`](ui-consistency-audit.md).

## The goal, in Peter's words

One consistent design schema for the entire app — every current screen, web and phone — that all
future screens must follow. The framework can change, but when it changes, the change propagates to
every screen automatically. No screen gets to drift.

## What makes that guarantee real

A schema only "propagates on change" if screens can't hold their own copies of the values. Today
they do: ~1,090 hardcoded colors, 1,880 inline style blocks, elements hand-built per file. So the
plan is three layers plus one enforcement, and the enforcement is what makes the guarantee hold.

1. **Tokens — the single source of truth.** Every color, space, corner, type size, shadow, and
   breakpoint is a named variable in one file (`apps/web/src/styles/tokens.css`, which already
   exists and is half-built). Nothing else defines these values. Change a token here → everything
   that uses it changes. This is the "change the framework once" layer.

2. **Primitives — the single source of shape.** One React component per element: Button, Input,
   Select, Textarea, Field, Card, Badge, Modal, Tabs, Banner, plus layout pieces (Page, Stack, Row).
   Each reads only tokens, never raw values. Screens use these; they never rebuild a button. Change a
   primitive → every instance changes. This is why two buttons can't be different shapes again.

3. **Screens — composition only.** Screens arrange primitives and pass content. They hold no colors,
   no radii, no shadows of their own.

4. **The guard — why it stays true.** A lint rule fails the build if app code sets a raw hex color,
   a raw `borderRadius`, or a raw font size in a style prop. Only the token file and the primitives
   may name raw values. Without this, drift comes back the next time someone is in a hurry. With it,
   a drifting screen can't ship — CI stops it, not a person reviewing screenshots.

Layers 1–3 make consistency possible; layer 4 makes it permanent. All four are required.

## Web and phone from the same schema

The app runs in a browser on desktop and phone (clinician on desktop, parent and teen on phones).
"Consistent on mobile" means the same tokens and primitives adapt to width, not a second design.

- **Breakpoints are tokens too** — one set of widths, named once.
- **Primitives are responsive by default** — a Card, a Modal, a Row reflow at phone width without
  the screen re-specifying anything.
- **Touch targets** — interactive primitives are at least 44px tall on touch, baked into the
  component, not remembered per screen.
- **Type scales** — one scale that holds on both; no more 22 one-off font sizes.

Because layout rules live in the primitives, a screen built once works on both, and a change to the
responsive rules propagates the same way a color does.

## Keep the current look — consolidate first, restyle later

This plan does **not** change how the app looks. It names the values the app already uses and routes
them through one place. A migration step should be "same pixels, now from a token." Bundling a visual
refresh into this would make every change risky to review and hard to roll back. Once everything is
on the schema, a restyle becomes a small, safe edit to the tokens — which is the whole point. If you
want a visual refresh, it's a separate, later, and by then easy piece of work.

## The framework reference

So future screens follow the schema without anyone remembering it:

- A **living catalog** at an in-app `/design` route that renders every token and every primitive in
  every state, web and phone width. This is the reference a new screen is built from and the place a
  framework change is reviewed.
- A short **`CONCEPTS.md` entry** naming the layers and the rule: screens compose primitives, only
  primitives touch tokens, nothing touches raw values.

## Migration — phased, incremental, each phase ships on its own

The app deploys to production continuously, so this is done in safe, shippable steps, not a big-bang.

- **Phase 0 — foundation.** Finish `tokens.css` (add the type scale, breakpoints, spacing scale,
  the missing surface tints). Wire Tailwind's theme to read the tokens so utility classes and inline
  styles resolve to the same values. Scaffold the `/design` catalog. *No screen changes yet.*
- **Phase 1 — primitives.** Build and document the component set against the tokens. Show each in the
  catalog. *No screen changes yet.*
- **Phase 2 — migrate, worst-first.** Move screens onto tokens and primitives, largest offenders
  first (`PatientPage.tsx` holds ~a fifth of the hardcoded colors; then `BehaviorPanel`,
  `SessionPage`, `MonitorLandingPage`, the admin pages). Each file is a self-contained, no-visual-
  change commit. Ships continuously.
- **Phase 3 — the guard.** Turn on the lint rule (warn while migrating, error once a screen is
  clean), add it to CI. From here, new raw values can't ship.
- **Phase 4 — phone pass.** Walk the parent and teen screens at phone width against the responsive
  primitives; fix anything that doesn't reflow. These are the phone-first experiences, so they get
  the explicit pass.

Phases 0–1 unlock everything and touch no screens. Phase 2 is the bulk and is spread out safely.
Phase 3 locks it. Phase 4 confirms mobile.

## After this, the guarantee in practice

- Change a color, a corner, the type scale, a breakpoint → edit one token → every screen updates on
  the next build.
- Change how a button or card looks or behaves → edit one component → every instance updates.
- Build a new screen → it composes primitives, so it's on-schema by construction, and the guard
  blocks it if it isn't.

## Scope and effort

- **In scope:** all three web experiences (clinician, parent, teen) and admin, desktop and phone.
- **Not in scope:** a visual redesign, dark mode, native apps. Tokens leave the door open to all
  three later.
- **Size:** large (`L`), and the biggest engineering item on the board. Phases 0, 1, 3 are each a
  few days. Phase 2 is the long one — spread across many small commits — because it's ~1,090 color
  replacements and ~450 buttons plus other elements, done file by file. Phase 4 is a focused pass.

## Decisions for Peter

1. **Consolidate-only, keeping the current look?** (Recommended. A refresh can follow, cheaply.)
2. **Go ahead with Phase 0–1 now** (foundation + primitives, no screen changes), and review the
   `/design` catalog before any screen is migrated?
