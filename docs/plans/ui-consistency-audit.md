# UI consistency audit

Date: 2026-09-16. Scope: the whole frontend, `apps/web/src` — 114 `.tsx` files.

## Bottom line

The inconsistent buttons are not an isolated bug. The same problem runs across every common
element, and it has one root cause: **the app has a full set of design tokens, but the code mostly
doesn't use them.** Colors, spacing, and corners are typed in by hand, file by file, so nothing
holds them in line.

The good news: the tokens already exist (`apps/web/src/styles/tokens.css`). This is mostly a
"use what's already there" migration plus a few missing shared components and one automated check —
not a from-scratch design system. It is still a real project, not a cleanup.

You do not have to eyeball every element. This report is the scope, in numbers.

## What the numbers say

| Measure | Count |
|---|---|
| `.tsx` files | 114 |
| Inline `style={{ }}` blocks | 1,880 |
| Hardcoded hex colors | 1,094 |
| Uses of a design token (`var(--float-*)`) | 429 |
| Distinct hex color values in the code | 119 |
| Distinct font-size values | 22 |
| Distinct box-shadow values | 8 |
| Raw `<button>` (helper covers ~100 calls) | 455 |
| Raw `<input>` / `<select>` / `<textarea>` | 132 / 14 / 20 |

About three of every four colors are typed by hand instead of pulled from a token. That single fact
is what produces every drift below.

## Where the drift shows

**Greys for text — nine different values doing the same three jobs:**

`#94a3b8` (98×), `#64748b` (78×), `#334155` (32×), `#475569` (27×), `#0f172a` (18×), `#1e293b`
(17×), `#6b7a79` (15×), `#cbd5e1` (13×), `#9aa9a8` (5×).

There are already three grey tokens for this: `--float-text`, `--float-text-secondary`,
`--float-text-hint`. Nearly all of the above should be one of those three.

**Brand green — five variants:** `#135450` (35×), `#0d3d3a` (30×), `#4d8478` (7×), `#0f6e56` (1×),
`#9af6e4` (2×). There is a `--float-primary` (and `-dark`, `-light`, `-mid`, `-text`) for exactly
this.

**Corners — nineteen different radius values,** including pills written as both `999px` and `9999px`
(33 pill uses total). Tokens exist: `--float-radius`, `--float-radius-sm`, `--float-radius-lg`. The
Build ladder vs Build plan mismatch you spotted is one instance of this.

**Type — twenty-two distinct font sizes** from `5px` to `32px`, clustered around 11/12/13px but with
one-off values (`12.5px`, `13.5px`, `11.5px`, `10.5px`, `9.5px`). No type scale.

**Shadows — eight distinct box-shadow strings** for card elevation, where tokens `--float-shadow`
and `--float-shadow-md` exist.

## Shared components: what exists, what's missing

Present in `components/ui`: a button style helper (`buttons.ts`), a small form helper (`form.tsx`),
plus `PractitionerNav`, `MessagesPanel`, `FloatLogo`, `InlineForm`.

Missing entirely — every instance is hand-built where it's used: **Input, Select, Textarea, Card,
Badge/Chip, Modal/Dialog, Tabs.**

Adoption of the two helpers that do exist is low:
- The button helper is called ~100 times against 455 buttons — roughly **three in four buttons don't
  use it.**
- The form helper is imported by **7 files**, against 166 raw form controls.
- Modals: **7 hand-rolled `position: fixed` overlays**, no shared Modal.

## Where the work concentrates

Most of the drift lives in a handful of large screens. Fixing these first covers a big share of it:

| File | Inline styles | Hardcoded hex |
|---|---|---|
| `pages/practitioner/PatientPage.tsx` | 311 | 239 |
| `pages/practitioner/patient/BehaviorPanel.tsx` | 100 | 84 |
| `pages/practitioner/SessionPage.tsx` | 74 | 74 |
| `pages/monitor/MonitorLandingPage.tsx` | 69 | 73 |
| `pages/admin/AdminDashboardPage.tsx` | 75 | 52 |
| `components/practitioner/TeenAccessPanel.tsx` | 47 | 56 |
| `pages/practitioner/sessionKit.tsx` | 38 | 55 |

`PatientPage.tsx` alone holds about a fifth of the hardcoded colors.

## What this means for trust

A standardization pass done by editing files by hand can only cover the files it touched, and
nothing stops the rest — or the next change — from drifting, because there is no single source of
truth and no check. So consistency can't be assumed from the fact that a pass was run. This is not a
judgement of that work; it's that the base it sat on was never set up to hold consistency.

## Recommended fix — phased, each phase ships on its own

1. **Tokenize (highest leverage, mostly mechanical).** Replace hardcoded hex with the existing
   tokens, worst-offender files first. The nine greys collapse to three, the five greens to one.
   Add the few missing tokens (a type scale, a couple of surface tints) to `tokens.css`. No visual
   change intended — same colors, named once.
2. **Build the missing primitives** — Button, Input, Select, Textarea, Card, Badge, Modal, Tabs —
   and route the raw elements through them. This is where the shapes stop being able to disagree.
3. **Guard it** — a lint rule that fails the build on a raw hex in a style prop, and on a
   `borderRadius` set directly on a component. After this, drift can't ship: the check catches it,
   not a person.

Order matters: tokens first make the primitives trivial, and the guard is only worth adding once the
tokens exist to satisfy it.

## Effort

This is a large item (`L`). Phase 1 is safe to do incrementally, file by file, and each file is a
self-contained, low-risk change (swap a hex for the token that already resolves to it). Phase 2 is
new components plus find-and-replace at call sites. Phase 3 is a day. The next step, if you want to
proceed, is a plan in `docs/plans/` that sequences the files and defines each primitive's API.
