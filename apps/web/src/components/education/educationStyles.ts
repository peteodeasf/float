/** Styles for the clinician's Education pages. Float's palette: teal #135450, ink #0d3d3a, mint
 *  #9af6e4, mint-soft #eafaf6. Mint is a fill or an accent on dark, never text on white. */
export const EDU_CSS = `
.edu { background: #f6faf9; min-height: 100vh; color: #1e293b; }
.edu *, .edu *::before, .edu *::after { box-sizing: border-box; }

/* ── The Education page ── */
.edu-hero { background: #0d3d3a; color: #fff; position: relative; overflow: hidden; }
.edu-hero::after { content: ''; position: absolute; right: -120px; top: -160px; width: 420px; height: 420px; border-radius: 50%; border: 60px solid rgba(154,246,228,.08); }
.edu-hero-in { max-width: 1040px; margin: 0 auto; padding: 44px 32px 40px; display: flex; align-items: center; gap: 32px; position: relative; z-index: 1; }
.edu-eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #9af6e4; }
.edu-hero h1 { font-size: 36px; line-height: 1.1; font-weight: 800; margin: 8px 0 10px; letter-spacing: -.02em; text-wrap: balance; }
.edu-hero p { margin: 0; font-size: 15.5px; line-height: 1.55; color: rgba(255,255,255,.78); max-width: 52ch; }
.edu-ring { flex: none; position: relative; width: 116px; height: 116px; }
.edu-ring svg { transform: rotate(-90deg); }
.edu-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.edu-ring-label b { font-size: 26px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.edu-ring-label span { font-size: 11.5px; color: rgba(255,255,255,.7); margin-top: 4px; }
.edu-body { max-width: 1040px; margin: 0 auto; padding: 28px 32px 64px; }
.edu-continue { display: flex; align-items: center; gap: 18px; width: 100%; text-align: left; background: #fff; border: 1.5px solid #135450; border-radius: 16px; padding: 16px 20px; cursor: pointer; margin: -52px 0 34px; position: relative; z-index: 2; box-shadow: 0 10px 30px rgba(13,61,58,.12); font: inherit; color: inherit; }
.edu-continue:hover { box-shadow: 0 14px 34px rgba(13,61,58,.18); }
.edu-continue-icon { flex: none; width: 52px; height: 52px; border-radius: 14px; background: #eafaf6; color: #135450; display: flex; align-items: center; justify-content: center; }
.edu-continue-go { margin-left: auto; font-size: 14px; font-weight: 700; color: #135450; white-space: nowrap; }
.edu-group { margin-top: 30px; }
.edu-group-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.edu-group-head h2 { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #135450; }
.edu-group-head span { font-size: 13px; color: #5b6b72; }
.edu-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 720px) { .edu-cards { grid-template-columns: 1fr; } }
.edu-card { position: relative; display: flex; gap: 16px; text-align: left; background: #fff; border: 1px solid #dbe7e4; border-radius: 16px; padding: 18px; cursor: pointer; font: inherit; color: inherit; transition: transform .15s, box-shadow .15s, border-color .15s; }
.edu-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(13,61,58,.08); border-color: #9fc9bf; }
.edu-card:focus-visible, .edu-continue:focus-visible, .edu-btn:focus-visible, .edu-option:focus-visible, .edu-toc a:focus-visible { outline: 3px solid #135450; outline-offset: 2px; }
.edu-card-icon { flex: none; width: 60px; height: 60px; border-radius: 16px; background: #eafaf6; color: #135450; display: flex; align-items: center; justify-content: center; }
.edu-card-done .edu-card-icon { background: #135450; color: #9af6e4; }
.edu-card-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #5b6b72; margin-bottom: 4px; font-variant-numeric: tabular-nums; white-space: nowrap; padding-right: 92px; }
.edu-card .edu-pill { position: absolute; top: 16px; right: 16px; }
.edu-card h3 { margin: 0 0 4px; font-size: 16.5px; font-weight: 750; color: #0d3d3a; }
.edu-card p { margin: 0; font-size: 13.5px; line-height: 1.5; color: #5b6b72; }
.edu-pill { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 8px; }
.edu-pill-not_started { background: #f1f5f4; color: #5b6b72; }
.edu-pill-in_progress { background: #fff4d6; color: #8a5a00; }
.edu-pill-complete { background: #135450; color: #fff; }

/* ── A module ── */
.edu-mhero { background: #0d3d3a; color: #fff; }
.edu-mhero-in { max-width: 1120px; margin: 0 auto; padding: 36px 32px 34px; display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: center; }
.edu-mhero h1 { font-size: 34px; line-height: 1.12; font-weight: 800; margin: 10px 0 8px; letter-spacing: -.02em; text-wrap: balance; }
.edu-mhero p { margin: 0; color: rgba(255,255,255,.78); font-size: 15.5px; max-width: 60ch; }
.edu-mhero-art { width: 132px; height: 132px; border-radius: 32px; background: rgba(154,246,228,.12); color: #9af6e4; display: flex; align-items: center; justify-content: center; }
.edu-learn { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 8px; }
.edu-learn span { font-size: 12.5px; font-weight: 600; color: #0d3d3a; background: #9af6e4; border-radius: 999px; padding: 5px 11px; }
.edu-readbar { position: sticky; top: 0; z-index: 20; height: 4px; background: #dbe7e4; }
.edu-readbar span { display: block; height: 100%; background: #135450; transition: width .1s linear; }
.edu-layout { max-width: 1120px; margin: 0 auto; padding: 32px; display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 48px; }
.edu-toc { position: sticky; top: 28px; align-self: start; }
.edu-toc-label { font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #5b6b72; margin-bottom: 10px; }
.edu-toc ol { list-style: none; margin: 0; padding: 0; border-left: 2px solid #dbe7e4; }
.edu-toc a { display: block; padding: 7px 12px; margin-left: -2px; border-left: 2px solid transparent; font-size: 13.5px; line-height: 1.35; color: #5b6b72; text-decoration: none; }
.edu-toc a:hover { color: #0d3d3a; }
.edu-toc a[aria-current="true"] { color: #0d3d3a; font-weight: 700; border-left-color: #135450; }
.edu-toc-extra { margin-top: 18px; font-size: 13px; }
.edu-toc-extra a { color: #135450; font-weight: 600; text-decoration: none; }
.edu-main { max-width: 720px; }
.edu-section { scroll-margin-top: 24px; margin-bottom: 44px; }
.edu-section > h2 { font-size: 23px; line-height: 1.25; font-weight: 800; color: #0d3d3a; margin: 0 0 14px; letter-spacing: -.01em; }
.edu-takeaway { background: #eafaf6; border: 1px solid #9fdccd; border-radius: 20px; padding: 22px 24px; }
.edu-takeaway > h2 { font-size: 13px !important; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #135450 !important; margin-bottom: 8px !important; }
.edu-takeaway .edu-p { font-size: 17px; line-height: 1.6; color: #0d3d3a; font-weight: 500; }
@media (max-width: 900px) {
  .edu-layout { grid-template-columns: 1fr; gap: 0; padding: 24px 20px; }
  .edu-toc { display: none; }
  .edu-mhero-in { grid-template-columns: 1fr; }
  .edu-mhero-art { display: none; }
  .edu-hero-in { flex-direction: column; align-items: flex-start; }
}

/* ── The text ── */
.edu-prose { display: flex; flex-direction: column; gap: 14px; }
.edu-p { margin: 0; font-size: 15.5px; line-height: 1.72; color: #334155; }
.edu-p strong, .edu-ul strong, .edu-ol strong { color: #0d3d3a; }
.edu-sub { margin: 10px 0 -4px; font-size: 16px; font-weight: 750; color: #0d3d3a; }
.edu-ul { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.edu-ul li { position: relative; padding-left: 22px; font-size: 15.5px; line-height: 1.6; color: #334155; }
.edu-ul li::before { content: ''; position: absolute; left: 4px; top: 10px; width: 7px; height: 7px; border-radius: 50%; background: #135450; }
.edu-ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.edu-ol li { display: flex; gap: 14px; align-items: flex-start; background: #fff; border: 1px solid #dbe7e4; border-radius: 14px; padding: 12px 14px; font-size: 15px; line-height: 1.6; color: #334155; }
.edu-ol-n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: #135450; color: #fff; font-weight: 800; font-size: 13.5px; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.edu-terms { display: grid; gap: 10px; }
.edu-terms-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.edu-term { background: #fff; border: 1px solid #dbe7e4; border-radius: 14px; padding: 14px 16px; }
.edu-term-name { font-size: 14.5px; font-weight: 800; color: #135450; margin-bottom: 4px; }
.edu-term-text { font-size: 14.5px; line-height: 1.6; color: #334155; }
.edu-term-say { font-style: italic; color: #0d3d3a; }
.edu-say { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.edu-say-label { font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #135450; }
.edu-bubble { margin: 0; max-width: 92%; background: #135450; color: #fff; font-size: 15px; line-height: 1.55; padding: 11px 15px; border-radius: 18px 18px 18px 6px; }
.edu-bubble-example { background: #fff; color: #0d3d3a; border: 1.5px solid #cfe0db; border-radius: 18px 18px 6px 18px; font-style: italic; }
.edu-dialogue { background: #fff; border: 1px solid #dbe7e4; border-radius: 20px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.edu-turn { display: flex; flex-direction: column; max-width: 84%; }
.edu-turn-a { align-self: flex-start; }
.edu-turn-b { align-self: flex-end; align-items: flex-end; }
.edu-turn-who { font-size: 11.5px; font-weight: 700; color: #5b6b72; margin: 0 6px 3px; }
.edu-turn-text { margin: 0; font-size: 14.5px; line-height: 1.5; padding: 10px 14px; border-radius: 16px; }
.edu-turn-a .edu-turn-text { background: #eafaf6; color: #0d3d3a; border-bottom-left-radius: 5px; }
.edu-turn-b .edu-turn-text { background: #135450; color: #fff; border-bottom-right-radius: 5px; }
.edu-quote { margin: 0; background: #fff; border: 1px solid #dbe7e4; border-radius: 16px; padding: 16px 18px; font-size: 16px; line-height: 1.6; color: #0d3d3a; font-style: italic; }
.edu-table-wrap { overflow-x: auto; }
.edu-table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid #dbe7e4; border-radius: 14px; overflow: hidden; font-size: 14px; }
.edu-table th { text-align: left; background: #eafaf6; color: #0d3d3a; font-weight: 750; padding: 10px 14px; }
.edu-table td { padding: 10px 14px; border-top: 1px solid #e6efec; color: #334155; }
.edu-table td:last-child, .edu-table th:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.edu-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.edu-compare > div { border-radius: 14px; padding: 12px 14px; font-size: 14px; line-height: 1.55; }
.edu-compare span { display: block; font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.edu-compare-bad { background: #fbe9e3; color: #5c2a1d; }
.edu-compare-bad span { color: #b4472c; }
.edu-compare-good { background: #eafaf6; color: #0d3d3a; }
.edu-compare-good span { color: #135450; }

/* ── Diagrams ── */
.edu-figure { margin: 6px 0; background: #fff; border: 1px solid #dbe7e4; border-radius: 20px; padding: 18px 18px 12px; }
.edu-figure-art svg { display: block; width: 100%; height: auto; }
.edu-figure figcaption { font-size: 12.5px; color: #5b6b72; text-align: center; margin-top: 8px; }
.edu-ba { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; }
.edu-ba-card { border-radius: 16px; padding: 14px 16px; }
.edu-ba-card ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.edu-ba-card li { font-size: 13.5px; line-height: 1.4; padding: 6px 10px; border-radius: 9px; }
.edu-ba-title { font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 8px; }
.edu-ba-soft { background: #eafaf6; }
.edu-ba-soft .edu-ba-title { color: #135450; }
.edu-ba-soft li { background: #fff; color: #0d3d3a; }
.edu-ba-ink { background: #0d3d3a; }
.edu-ba-ink .edu-ba-title { color: #9af6e4; }
.edu-ba-ink li { background: rgba(255,255,255,.08); color: #fff; }
.edu-ba-mid { display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #135450; text-align: center; }
.edu-ba-mid b { font-size: 26px; line-height: 1; margin-top: 2px; }
@media (max-width: 640px) { .edu-ba { grid-template-columns: 1fr; } .edu-ba-mid b { transform: rotate(90deg); } .edu-compare { grid-template-columns: 1fr; } }
.edu-steps { list-style: none; margin: 0; padding: 4px 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 0; counter-reset: s; }
.edu-steps li { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 6px; }
.edu-steps li:not(:last-child)::after { content: ''; position: absolute; top: 17px; left: calc(50% + 20px); right: calc(-50% + 20px); height: 2px; background: #9fc9bf; }
.edu-steps-dot { width: 36px; height: 36px; border-radius: 50%; background: #135450; color: #9af6e4; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
.edu-steps-title { font-size: 13.5px; font-weight: 800; color: #0d3d3a; }
.edu-steps-sub { font-size: 12px; line-height: 1.35; color: #5b6b72; margin-top: 2px; }

/* ── Quiz and exercise ── */
.edu-panel { background: #fff; border: 1px solid #dbe7e4; border-radius: 22px; padding: 24px; margin-bottom: 36px; }
.edu-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.edu-panel-head h2 { margin: 0; font-size: 20px; font-weight: 800; color: #0d3d3a; }
.edu-dots { display: flex; gap: 6px; }
.edu-dots span { width: 26px; height: 6px; border-radius: 3px; background: #dbe7e4; }
.edu-dots .on { background: #135450; }
.edu-dots .right { background: #2f9e7a; }
.edu-dots .wrong { background: #e07a5f; }
.edu-q { font-size: 18px; line-height: 1.45; font-weight: 700; color: #0d3d3a; margin: 0 0 16px; }
.edu-options { display: flex; flex-direction: column; gap: 10px; }
.edu-option { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; font: inherit; font-size: 15px; line-height: 1.45; color: #1e293b; background: #fff; border: 1.5px solid #dbe7e4; border-radius: 14px; padding: 12px 14px; cursor: pointer; transition: border-color .15s, background .15s; }
.edu-option:hover:not(:disabled) { border-color: #135450; background: #f6faf9; }
.edu-option:disabled { cursor: default; }
.edu-option-letter { flex: none; width: 30px; height: 30px; border-radius: 9px; background: #eafaf6; color: #135450; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.edu-option-right { border-color: #2f9e7a; background: #eaf7f1; }
.edu-option-right .edu-option-letter { background: #2f9e7a; color: #fff; }
.edu-option-wrong { border-color: #e07a5f; background: #fbe9e3; }
.edu-option-wrong .edu-option-letter { background: #e07a5f; color: #fff; }
.edu-feedback { margin-top: 14px; border-radius: 14px; padding: 14px 16px; font-size: 14.5px; line-height: 1.55; }
.edu-feedback b { display: block; margin-bottom: 2px; }
.edu-feedback-right { background: #eaf7f1; color: #14553f; }
.edu-feedback-wrong { background: #fbe9e3; color: #5c2a1d; }
.edu-btn { font: inherit; font-size: 14.5px; font-weight: 700; border-radius: 12px; padding: 11px 18px; cursor: pointer; border: none; background: #135450; color: #fff; }
.edu-btn:disabled { opacity: .45; cursor: default; }
.edu-btn-quiet { background: #eafaf6; color: #135450; }
.edu-score { text-align: center; padding: 10px 0 4px; }
.edu-score b { display: block; font-size: 48px; font-weight: 800; color: #0d3d3a; line-height: 1; font-variant-numeric: tabular-nums; }
.edu-score span { display: block; color: #5b6b72; margin: 8px 0 18px; }
.edu-case { background: #f6faf9; border: 1px dashed #9fc9bf; border-radius: 16px; padding: 16px 18px; margin-bottom: 18px; }
.edu-case-label { font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #135450; margin-bottom: 6px; }
.edu-task { margin-bottom: 14px; }
.edu-task label { display: flex; gap: 10px; font-size: 15px; font-weight: 650; color: #0d3d3a; margin-bottom: 8px; line-height: 1.45; }
.edu-task textarea { width: 100%; font: inherit; font-size: 14.5px; line-height: 1.5; border: 1.5px solid #dbe7e4; border-radius: 12px; padding: 10px 12px; resize: vertical; color: #1e293b; }
.edu-task textarea:focus { outline: none; border-color: #135450; }
.edu-answer { background: #eafaf6; border-radius: 16px; padding: 18px; margin: 4px 0 16px; }
.edu-next { display: flex; align-items: center; gap: 16px; width: 100%; text-align: left; background: #0d3d3a; color: #fff; border: none; border-radius: 20px; padding: 18px 20px; cursor: pointer; font: inherit; }
.edu-next-icon { flex: none; width: 56px; height: 56px; border-radius: 16px; background: rgba(154,246,228,.14); color: #9af6e4; display: flex; align-items: center; justify-content: center; }
.edu-next small { display: block; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #9af6e4; }
.edu-next strong { font-size: 18px; }
.edu-prev { margin-top: 12px; background: none; border: none; font: inherit; font-size: 14px; color: #135450; cursor: pointer; padding: 6px 0; }
@media (prefers-reduced-motion: reduce) { .edu-card, .edu-option, .edu-readbar span { transition: none; } }
`
