# Tools and strategies — pages in the Library

Agreed with Peter 2026-11-27 through mockups:
https://claude.ai/artifact/EP4nMVU2vGVETSPL4TDkQz. Builds on action plans
(`action-plans-build.md`).

## What it is

Each tool or strategy is a page: a name, Tool or Strategy, who it is for (child, parent or both), a
one-line summary, and a body made of text, image and video blocks in any order. Videos are picked
from the videos already in Float. A page can have **examples** (the three mottos on Mottos). Each
example has a name and its own "How it's used" text. Pages are Draft or Published; only Peter (the
Float admin) writes them, in the admin app.

## Decisions (Peter, 2026-11-27)

- Tools and strategies sit under one heading in the Library.
- **Every family can read every published page in their app.** A clinician *highlights* a page for
  a patient's child, parent or both, which puts it first for them. The clinician sees who it is
  highlighted for and whether they opened it (yes or no).
- On an action plan the clinician picks a page. If it has examples, they pick one or write their
  own; the plan shows that example. A written one stays on that plan only.
- One page holds content for both child and parent.
- No links from a page into other parts of the app.
- **The family apps' screens wait for the redesign** around action plans. This build gives them the
  data (list, page, opened) but not new screens. Their action plan shows the name and summary.

## Data

- `tools` (from #147) gains `kind`, `audience`, `summary` (was `description`), `blocks` (a JSON
  list: `{"type":"text","text":…}`, `{"type":"image","image_id":…}`,
  `{"type":"video","video_id":…}`) and `is_published`; `link` and `is_active` go.
- `tool_examples`: the examples, in order.
- `tool_images`: uploaded images, kept in the database. They are Float's content, not patient data,
  and small (2 MB limit). The recordings bucket is not used because it deletes after two days.
- `tool_highlights`: one per page per patient, with child and/or parent.
- `tool_opens`: who opened which page, once per person.
- `action_plan_items.tool_example_id`: the example picked. A written example is the item's `text`.

## Not in this build

Family screens for reading pages; family video playback (the video rules only let clinicians play
today); the content itself.
