# Mobile app strategy — child and parent native apps

**Date:** 2026-09-23 · **Status:** plan, not started

## Decision

The child and parent experiences become native mobile apps for iOS (Apple) and Android
(Google). The clinician dashboard stays on the web — it's desktop work (tables, planning
tools) and doesn't belong on a phone.

## Framework — React Native on Expo (already chosen)

You write the apps in React and TypeScript, the same as the web app. One codebase builds
both the iOS and Android versions. You keep writing code with Claude; Expo's cloud build
service (EAS) builds, signs, and ships it, so you rarely open Xcode or Android Studio.

Rejected: fully native (Swift + Kotlin) means two codebases and a rewrite — too much for a
small team. Wrapping the web app in a shell (Capacitor) is faster to the stores but the child
app needs to feel game-like, which is better in React Native.

## Current state

- `apps/mobile` — an Expo app is scaffolded (Expo 54, React Native 0.81, React Navigation,
  React Query, axios). But `apps/mobile/src` is empty; `App.tsx` imports a login screen and
  auth context that don't exist. Treat it as a fresh start on a working toolchain.
- `packages/api-client`, `packages/clinical-logic`, `packages/ui-tokens` — created but empty.
  The web app still has all of this inline (`apps/web/src/lib/*`, the per-role auth contexts,
  the token CSS). Nothing is shared yet.
- Web has the full child and parent experiences to port from:
  - Child (teen): Home ladder, Exposure, Experiment, Record, Progress, Messages, Plans,
    Login, Set/Reset password.
  - Parent: Home (child's work), Accommodations, Progress + weekly check-in, Messages,
    Login, Set/Reset password.

## App shape — one app, role-based at login (decided)

One mobile app that shows the child or the parent experience based on the account that logs
in — the same way the web works today. Least overhead for a small team: one build, one
release, one store listing per platform. The child and parent get distinct navigation and
theming inside it (the child's playful, the parent's plain).

This is advisable given the under-13 decision below. The one thing that would complicate a
single app is direct under-13 child accounts — Apple and Google apply their strict "kids
category" rules (parental gates, no third-party analytics) when under-13s use an app directly.
Because under-13 is handled through the parent (see below), the app's direct users are teens
(13+) and adults, which a normal Teen/12+ rated app handles without the kids-category burden.
Confirm the exact age-rating path during store setup rather than assuming it.

## Build order

Each phase leaves something runnable. Compliance and store setup run in parallel from the
start because they can hold up launch.

**Phase 0 — Foundations.** Get the Expo app building and running on a simulator and a real
phone through TestFlight/Play internal. Set up the Apple Developer account ($99/yr) and Google
Play account ($25 once). Wire navigation and a basic app shell.

**Phase 1 — Extract shared code (do this in the web app first).** Move the API client,
clinical logic, and design tokens out of `apps/web` into the `packages/*` folders and have the
web app consume them, with no behavior change. Doing this in the app you already ship proves
the packages work before mobile depends on them, and stops web and mobile logic from drifting
apart. Detail below.

### Phase 1 detail

**Guardrail throughout:** the web app keeps working and its tests keep passing after every
step. Each package is extracted and adopted by web *before* mobile uses it. No behavior change
— this is a move, not a rewrite.

**`packages/api-client` — the backend calls, storage-agnostic.**
- Move the axios base (`apps/web/src/api/client.ts`) and the endpoint modules
  (`apps/web/src/api/*`) here.
- The blocker: today the login token lives in the browser's `localStorage`, read inside the
  per-role auth contexts. Mobile can't use `localStorage`. So the package must not touch
  storage itself — it takes a token source (a small "get/set/clear the token" adapter) that
  the app provides. Web passes a `localStorage` adapter; mobile passes an `expo-secure-store`
  adapter (Phase 2).
- The auth *contexts* stay in each app (web is React-for-web + localStorage; mobile is
  React Native + secure store). Only the shared login/refresh/endpoint calls move into the
  package. Clinician/admin endpoints move too, but only web imports them.

**`packages/clinical-logic` — the pure logic, moves cleanly.**
- Move `apps/web/src/lib/{checkin,teenProgress,teenWork,setupQuestions,checklists}.ts` and
  their tests here. These are plain TypeScript with no web dependency, so they port as-is and
  the existing tests come with them — the safest package to do first.

**`packages/ui-tokens` — tokens as TypeScript, both platforms read them.**
- Today tokens are split: CSS variables (`tokens.css`, `teen-tokens.css`) plus some TypeScript
  (`teenTokens.ts`, `chartColors.ts`). React Native has no CSS variables.
- Make TypeScript the single source of the token values. The web keeps using CSS variables,
  but those are generated from the TypeScript values (or the web imports them directly);
  mobile imports the TypeScript values straight. Scope this to the teen and parent tokens —
  the clinician (`--float-*`) tokens can stay web-only CSS, since the clinician app isn't
  going native.

**Suggested order:** `clinical-logic` (cleanest, proves the setup) → `ui-tokens` (unblocks
shared styling) → `api-client` (most fiddly, because of the storage adapter). Land each as its
own reviewed change; run `npx tsc -b`, `npm run check:tokens`, and the web tests after each.

**Phase 2 — Auth on mobile.** Login, and set/reset password via deep links (you already email
setup links). Store the login token in the OS secure store (Keychain on Apple, Keystore on
Google) via `expo-secure-store`. Add fingerprint/face unlock and keep the idle auto-logout.

**Phase 3 — Child app (priority).** The child does the daily work, so build this first: Home
ladder, exposure flow, experiment flow, record, progress, messages. This is also where the
game-like feel is designed and built (animations, playful interactions).

**Phase 4 — Parent app.** Home (the child's work), accommodations, progress, weekly check-in,
messages.

**Phase 5 — Push notifications + a scheduler.** Build a scheduler on the backend (you don't
have one yet) and wire `expo-notifications` (Apple's APNs and Google's FCM). This drives
exposure and check-in reminders — the reminders you've tabled twice, and the main payoff of
going native.

**Phase 6 — Store submission.** Age rating, parental-consent flow, privacy labels, and review.
Ship to TestFlight and Play internal testing first, then the public stores.

## HIPAA on the device

- Login token in the OS secure store, never plain storage.
- Fingerprint/face unlock; keep the idle auto-logout.
- No patient data in crash reports or analytics. Pick tools that can strip it, and sign a BAA
  with any vendor that could touch patient data (push, crash reporting, analytics).
- Data encrypted in transit (already) and at rest on the device.

## Under-13 children — parent-only model (leaning, needs clinical sign-off)

For children under 13, the leaning is that there is no child app login: the parent uses the
parent app and the treatment runs through them. This is both a clinical call (who does the
work for a young child) and the clean COPPA answer (no direct data collection from an under-13
child; the parent provides and consents). Consequences:

- The app must handle "this family has no child account" gracefully — the child experience is
  gated to 13+.
- Direct app users are teens (13+) and adults, which keeps the single app out of the strict
  kids category.

This is a treatment-model decision, so it needs Dr. Walker's sign-off before it's built, not
just Peter's. Recorded as the leaning, not settled.

## Store review for a minors' mental-health app — start early

A mental-health app used by minors gets extra scrutiny and can gate launch:
- Age rating and Apple's and Google's rules for teen/health apps.
- Parental consent; COPPA is handled by the parent-only-under-13 model above.
- App store privacy labels describing exactly what data you collect.

Begin this in parallel with Phase 0 — it's paperwork and policy, not code, and it's slow.

## Decisions made

- **One app, role-based at login.** Decided (2026-09-23). Not two separate apps.
- **Under-13 = parent-only.** Leaning (2026-09-23); needs Dr. Walker's clinical sign-off.
- **Push notifications in scope.** Confirmed (2026-09-23) — Phase 5, including the new backend
  scheduler.

## Still open

- **Push vendor / BAA.** Expo's push service vs direct APNs/FCM, and who signs a BAA. Decide
  during Phase 5.

## Out of scope

- A native clinician app. The clinician dashboard stays on the web. A mobile clinician
  companion could come later, but isn't part of this.
