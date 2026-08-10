# Tier C — Behavior/situation library + reuse + sub-behaviors (#6 + #7)

Sub-plan for the two coupled testing-feedback items. Parent plan:
[`testing-feedback-features.md`](testing-feedback-features.md). Decisions already made:
**global cross-org library**, behaviors **reusable across many situations**, sub-behaviors
**clinician-initiated**. Library stores **only generic name + type**, never patient data/scores/plan
links (that boundary is the `/security-review` gate).

## Current model (from code map)
- `trigger_situations`: per-plan, `name`, `distress_thermometer_rating` (+ new `_max`). Ad-hoc.
- `avoidance_behaviors`: `trigger_situation_id NOT NULL` (one situation), `name`, `behavior_type`,
  `distress_thermometer_when_refraining`. No library, no hierarchy. Created ad-hoc per situation.
- `isSimilar` fuzzy helper exists (`PatientPage.tsx:88`), used only in AI-extraction.

## Target architecture — **additive, non-destructive** reshape
Keep `avoidance_behaviors` as the **per-situation, scored instance** (unchanged columns), and add
library + reuse + hierarchy *around* it. No destructive migration; existing rows keep working.

**New global tables (no org scoping, generic vocabulary only):**
- `situation_library` — `id`, `name`, `normalized_name` (unique, for dedup).
- `behavior_library` — `id`, `name`, `normalized_name`, `behavior_type`.

**New nullable columns:**
- `trigger_situations.situation_library_id` → `situation_library.id` (which library entry this is).
- `avoidance_behaviors.behavior_library_id` → `behavior_library.id` (reuse link).
- `avoidance_behaviors.parent_behavior_id` → `avoidance_behaviors.id` (self-ref; sub-behavior, #7).

**Many-to-many (behavior ↔ situations, #6):** realized as *one instance per (behavior_library, situation)*
— the same library behavior attached to N situations = N `avoidance_behaviors` rows sharing a
`behavior_library_id`, each with its own score. No hard join table needed; instances stay per-situation
(which is what a per-situation score requires). "Reuse" = pick an existing `behavior_library` entry.

**Sub-behaviors (#7):** a child `avoidance_behaviors` row with `parent_behavior_id` set, same
`trigger_situation_id`, a lower score. Ladder renders parent → children.

## Dedup / matching (#6)
- **Backfill** (migration): create library entries from **distinct normalized names** of existing
  situations/behaviors (exact-normalized dedup — lower/trim/strip-punct), link each existing row.
- **Going forward** (UI): as the clinician types a new name, fuzzy-match (extend `isSimilar`) against
  the library and suggest existing entries ("Did you mean 'Eats in the bathroom'?"). Pick → reuse the
  library id; confirm-new → create a library entry. Advisory, not a hard block.

## Build order (each increment shippable; migration reviewed before deploy)
- **C1 — Foundation (backend, additive migration).** Library models + tables; nullable FK columns;
  backfill from existing distinct names; library list/search endpoints (`GET /situation-library?q=`,
  `GET /behavior-library?q=`). *Migration is additive/non-destructive — but it's the biggest of the
  session; review before deploy.*
- **C2 — Situation add: pick-or-new + dedup.** Add-situation form gains a typeahead over
  `situation_library` with fuzzy suggestions; new entries create a library row.
- **C3 — Behavior add: pick-or-new + dedup**, attach to the current situation (creates an instance
  linked to the library entry).
- **C4 — Reuse across situations (#6 many-to-many).** From a library behavior, attach it to additional
  situations (one scored instance each).
- **C5 — Sub-behaviors (#7).** `parent_behavior_id` + "add a smaller step" on a high-scored behavior;
  ladder renders the hierarchy.

## Gates
- **Prod migration** (C1) — additive, but reshapes the behavior domain; **review before deploy**,
  verify backfill on the demo data.
- **`/security-review`** on the library boundary (global tables must hold no patient data).
- Backfill correctness: no behavior/situation lost; every existing row linked to a library entry.

## Deliberately deferred
Merging/renaming library entries (admin curation), cross-situation score sync, library usage
analytics, and any auto-suggested (non-clinician-initiated) sub-behaviors.
