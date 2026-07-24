# Float — Brand Asset Rollout Plan

Status: **plan for review — no code written.**
Covers the 7 new brand SVGs across floatcbt.com and the app.
Grounded against the current codebase and website (2026-07-24).

---

## 0. The assets

| Asset | Form | Intended role |
|---|---|---|
| `float-mark.svg` | Teal arc + mint dot, 120² | The mark alone, on light |
| `float-mark-reverse.svg` | Mint arc + white dot | The mark on dark |
| `float-mark-mono.svg` | All `#135450` | Single-colour contexts (print, PDF, watermark) |
| `float-logo-lockup.svg` | Mark + "float", 360×120 | **Primary logo**, on light |
| `float-logo-lockup-reverse.svg` | Mint/white | Primary logo on dark |
| `float-favicon.svg` | Chunkier stroke (16 vs 13), bigger dot | Browser tab — optimised for ~16px |
| `float-app-icon.svg` | 512² rounded teal tile, mint arc, white dot | PWA / home-screen icon |

---

## 1. Where each asset goes

| Asset | Surfaces | Replaces |
|---|---|---|
| **lockup** | Practitioner nav; all 12 auth pages (practitioner / teen / parent / admin login, set-password, reset); website nav + footer; future PDF report headers | The "wave squiggle + float" in `FloatLogo.tsx`; the two-layer wave in the site nav/footer |
| **lockup-reverse** | Email header bar (teal band); any dark website section; dark app headers | Text-only "float" in 5 email templates |
| **mark** | Tight spaces where the wordmark is already present or redundant — teen/parent app header (next to the existing text wordmark), loading/empty states | `MonitorLandingPage`'s literal `~` character |
| **mark-reverse** | Teen scoreboard (dark teal screen), the "Showing up" effort card, welcome screen | — (net new) |
| **mark-mono** | Printed/exported clinical documents, watermarks, faxed reports | — (net new) |
| **favicon** | `apps/web/public/favicon.svg`; the site's inline data-URI favicon | Both current wave favicons |
| **app-icon** | `apple-touch-icon`, PWA manifest icons, home-screen | — (nothing exists today) |

**Single best swap point:** `FloatLogo.tsx` is imported by **12 files**. Replacing the mark
inside that one component updates every auth page, the practitioner nav, and admin at once.

---

## 2. Three problems to solve before rollout

### 2.1 The colour conflict — the decision that gates everything

The new brand is **`#135450` teal + `#9af6e4` mint**. The practitioner app, admin, emails and
website all run on **`#0d9488`** — a brighter, more saturated teal.

Critically: the **teen and parent surfaces already use `#135450` / `#9af6e4` exactly** (the
teen design tokens were built to the design handoff, which drew from the same brand). So the
product is *already* two-tone, and the new assets pick the teen side.

Scale of a full re-tone:

| Surface | Old-teal footprint |
|---|---|
| App `src` | 38 hardcoded `#0d9488` across 7 files, plus `--float-primary` used widely via `var()` |
| Emails | 13 occurrences across 5 templates |
| Website | 3 hardcoded + a `--teal` custom property used throughout (cheap — mostly one token) |
| Teen / parent | **Already on brand** — no work |

Note `--float-primary-mid` is already `#99f6e4`, essentially the brand mint — the gap is
almost entirely the primary teal.

**Why this matters for the logo swap:** dropping a `#135450` lockup into a `#0d9488` nav puts
two different teals side by side. The logo change surfaces the conflict rather than avoiding it.

### 2.2 The lockup depends on a font nothing loads

Both lockup SVGs render the wordmark as **live `<text>` in 'Plus Jakarta Sans', weight 800,
letter-spacing −3**. That font is loaded **nowhere** — not in the app, and the website uses DM
Sans / DM Serif. Where it's missing the SVG silently falls back to Segoe UI / generic sans,
which changes the letterforms and makes the −3 tracking look broken.

Two fixes:
- **Outline the wordmark to paths** *(recommended)* — removes the font dependency entirely,
  renders identically in every browser, email client and PDF, and keeps the file self-contained.
- Or load Plus Jakarta Sans 800 everywhere the lockup appears — more weight, more failure modes,
  and impossible to guarantee in email.

### 2.3 Email can't use SVG

The 5 templates need a logo, but **Outlook and Gmail don't render SVG**. They need a **PNG
raster** of `lockup-reverse` (it sits on the teal header band), hosted at a stable public URL
or embedded. This is asset generation, not a code change.

---

## 3. Assets that still need generating

Not supplied, and required for a complete rollout:

- **Email logo PNG** — `lockup-reverse` @2x on transparent, for the 5 templates
- **`apple-touch-icon.png`** — 180² from `float-app-icon.svg`
- **PWA icons** — 192² and 512², plus a maskable variant
- **`og:image`** — 1200×630 social share card (neither app nor site has one today)
- Optional `.ico` fallback for older browsers

---

## 4. Surface-by-surface work

**App (`apps/web`)**
- `components/ui/FloatLogo.tsx` — swap wave → lockup/mark; add a `reverse` variant for dark
  surfaces. *One change, 12 files inherit it.*
- `public/favicon.svg` → `float-favicon.svg`
- `index.html` — add `apple-touch-icon`, PWA manifest link, and Open Graph tags (none exist)
- `public/manifest.webmanifest` — **new file**, wiring the app icons
- Teen/parent home header — currently a *text-only* wordmark; decide whether the mark joins it
- `MonitorLandingPage` — replace the `~` placeholder with the real mark
- Optional: `mark-reverse` on the teen scoreboard / effort card / welcome screen

**Emails (`backend/app/services/email_service.py`)**
- 5 templates: text wordmark → hosted PNG lockup; header band colour follows the colour decision

**Website (`Float-website/index.html`)**
- Inline data-URI wave favicon → real favicon
- Nav + footer two-layer wave SVG → lockup
- `--teal` token → brand teal (if re-toning)
- Add `apple-touch-icon` + `og:image`

---

## 5. Blocker: how does floatcbt.com actually deploy?

`Float-website/index.html` is a single untracked file with **no deploy config beside it**, and
the repo's `netlify.toml` points at `apps/web` (the app), not the site. I can't tell how the
marketing site ships — manual upload, a separate repo, or a different Netlify site.

**I shouldn't change what I can't verify shipping.** Needs an answer before website work starts.

---

## 6. Phasing

**Phase 1 — icons (zero colour risk, ships immediately).**
Favicon, apple-touch-icon, PWA manifest, og:image, across app and site. These live *outside* the
UI chrome, so no old-teal adjacency problem. Immediate brand presence in tab, home screen and
social previews.

**Phase 2 — the colour decision.** Gates everything else (§2.1).

**Phase 3 — logos into the (re-toned) UI.** `FloatLogo.tsx` swap → 12 files; website nav/footer.

**Phase 4 — emails.** Needs the PNG from §3 and the colour decision.

Prerequisite for 3 and 4: outline the lockup wordmark (§2.2).

---

## 7. Decisions needed

1. **Colour** — logo-only swap (accept two teals), full re-tone to `#135450` product-wide, or
   staged? *Recommendation: full re-tone, staged — the teen/parent surfaces are already there,
   so re-toning the clinician side converges the product instead of splitting it. Worth
   previewing first: `#0d9488` is bright and vibrant, `#135450` is deep and muted — a real
   change in how the clinician UI feels.*
2. **Lockup wordmark** — outline to paths (recommended) or load Plus Jakarta Sans?
3. **Website deploy path** — how does floatcbt.com ship? (§5)
4. **Teen/parent header** — introduce the mark, or keep the deliberately quiet text wordmark?
