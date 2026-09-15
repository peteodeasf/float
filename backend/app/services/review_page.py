"""The HTML for a review link.

Server-rendered and self-contained: no build step, no framework, no external requests beyond the
web font. Kept as one string rather than a template file because it is the only page the backend
serves, and a templating engine for one page is a dependency nobody will remember.

Every click POSTs to /review/{token}/mark. The reviewer never saves, copies, or submits anything —
that was the whole requirement.
"""
import html
import json


def _esc(value) -> str:
    return html.escape(str(value), quote=True)


CSS = """<style>
:root{
  --ground:#FBFAF8; --surface:#FFFFFF; --sunk:#F2F5F3;
  --ink:#12201E; --ink-soft:#4A5A57; --ink-faint:#7C8B88;
  --line:#E1E8E5; --line-strong:#CBD6D3;
  --brand:#135450; --brand-soft:#9AF6E4; --brand-ink:#0D3D3A;
  --yes:#135450; --yes-bg:#E4F5F1;
  --no:#8A5A3C; --no-bg:#F6EDE6;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#0D1614; --surface:#14201E; --sunk:#101A18;
    --ink:#E8EFED; --ink-soft:#A8B8B4; --ink-faint:#7B8C88;
    --line:#243330; --line-strong:#31433F;
    --brand:#9AF6E4; --brand-soft:#1B4F49; --brand-ink:#C8FBEF;
    --yes:#9AF6E4; --yes-bg:#12332F;
    --no:#E0A87E; --no-bg:#31241B;
  }
}
:root[data-theme="dark"]{
  --ground:#0D1614; --surface:#14201E; --sunk:#101A18;
  --ink:#E8EFED; --ink-soft:#A8B8B4; --ink-faint:#7B8C88;
  --line:#243330; --line-strong:#31433F;
  --brand:#9AF6E4; --brand-soft:#1B4F49; --brand-ink:#C8FBEF;
  --yes:#9AF6E4; --yes-bg:#12332F;
  --no:#E0A87E; --no-bg:#31241B;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:53rem;margin:0 auto;padding:3rem 1.5rem 6rem}
header{margin-bottom:2.5rem}
.eyebrow{
  font-size:.72rem;font-weight:600;letter-spacing:.13em;text-transform:uppercase;
  color:var(--ink-faint);margin:0 0 .9rem
}
h1{
  font-family:Newsreader,Georgia,serif;font-weight:500;font-size:clamp(2rem,4.4vw,2.9rem);
  line-height:1.12;margin:0 0 1rem;text-wrap:balance;letter-spacing:-.012em
}
.lede{font-size:1.06rem;color:var(--ink-soft);margin:0;max-width:38rem}
.lede + .lede{margin-top:.85rem}
.lede b{color:var(--ink);font-weight:600}


.bar{
  position:sticky;top:0;z-index:5;margin:2.5rem 0 0;padding:.85rem 1.1rem;
  background:var(--surface);border:1px solid var(--line);border-radius:3px;
  display:flex;align-items:center;gap:1rem;flex-wrap:wrap
}
.count{font-size:.9rem;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.count span{color:var(--ink-faint);font-weight:400}
.sync{font-size:.78rem;color:var(--brand);font-weight:500;white-space:nowrap}
.sync[data-bad="1"]{color:#B4442A;font-weight:600}
.track{flex:1;min-width:7rem;height:5px;background:var(--sunk);border-radius:99px;overflow:hidden}
.fill{height:100%;width:0;background:var(--brand);transition:width .28s ease}

button{font:inherit;cursor:pointer;border-radius:3px;transition:background .12s,border-color .12s,color .12s}
.ghost{
  padding:.42rem .85rem;font-size:.85rem;font-weight:500;
  background:transparent;border:1px solid var(--line-strong);color:var(--ink-soft)
}
.ghost:hover{border-color:var(--brand);color:var(--brand)}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}

.case{
  margin-top:1.6rem;background:var(--surface);border:1px solid var(--line);
  border-radius:3px;overflow:hidden
}
.case-head{padding:1.4rem 1.5rem 1.15rem;border-bottom:1px solid var(--line)}
.sit{
  font-family:Newsreader,Georgia,serif;font-size:1.4rem;font-weight:500;line-height:1.25;
  margin:0;text-wrap:balance;letter-spacing:-.008em
}
.rungs{margin:.95rem 0 0;display:flex;flex-wrap:wrap;gap:.4rem;align-items:baseline}
.rungs-label{
  font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-faint);margin-right:.2rem;width:100%
}
.rung{
  font-size:.83rem;padding:.22rem .6rem;background:var(--sunk);
  border:1px solid var(--line);border-radius:99px;color:var(--ink-soft)
}
.rungs.empty .rung{font-style:italic;color:var(--ink-faint)}

.sug{
  display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:center;
  padding:.9rem 1.5rem;border-bottom:1px solid var(--line)
}
.sug:last-of-type{border-bottom:0}
.sug-text{font-size:1rem;line-height:1.45}
.sug[data-choice]{background:var(--yes-bg)}
.sug[data-choice="wrong"],.sug[data-choice="neither"]{background:var(--no-bg)}
.sug[data-choice="show"]{background:var(--yes-bg)}
.sug[data-choice="hide"]{background:var(--no-bg)}
.sug[data-choice="hide"] .sug-text{color:var(--ink-soft)}
.choices{display:flex;gap:.4rem}
.choice{
  padding:.38rem .8rem;font-size:.85rem;font-weight:500;white-space:nowrap;
  background:transparent;border:1px solid var(--line-strong);color:var(--ink-soft)
}
.choice:hover{border-color:var(--ink-faint);color:var(--ink)}
.sug[data-choice="show"] .choice[data-v="show"]{
  background:var(--yes);border-color:var(--yes);color:var(--ground);font-weight:600
}
.sug[data-choice="hide"] .choice[data-v="hide"]{
  background:var(--no);border-color:var(--no);color:var(--ground);font-weight:600
}
.variations{
  padding:.85rem 1.5rem 1.1rem;background:var(--sunk);font-size:.9rem;color:var(--ink-soft);
  border-top:1px solid var(--line)
}
.own{padding:.9rem 1.5rem 1.2rem;border-top:1px solid var(--line)}
.mine{list-style:none;margin:0 0 .7rem;padding:0;display:flex;flex-direction:column;gap:.4rem}
.mine:empty{display:none}
.mine li{
  display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem;font-size:.97rem;
  background:var(--yes-bg);border:1px solid var(--line);border-radius:3px
}
.drop{
  margin-left:auto;padding:0 .35rem;font-size:1.1rem;line-height:1;background:none;
  border:0;color:var(--ink-faint)
}
.drop:hover{color:#B4442A}
.add{display:flex;gap:.5rem}
.add input{
  flex:1;min-width:0;padding:.5rem .7rem;font:inherit;font-size:.95rem;color:var(--ink);
  background:var(--surface);border:1px solid var(--line-strong);border-radius:3px
}
.add input::placeholder{color:var(--ink-faint)}
.add input:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:var(--brand)}
.comment{padding:.2rem 1.5rem 1.3rem}
.comment label{
  display:block;margin-bottom:.4rem;font-size:.7rem;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-faint)
}
.comment textarea{
  width:100%;padding:.6rem .75rem;font:inherit;font-size:.95rem;line-height:1.5;color:var(--ink);
  background:var(--surface);border:1px solid var(--line-strong);border-radius:3px;resize:vertical
}
.comment textarea::placeholder{color:var(--ink-faint)}
.comment textarea:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:var(--brand)}
.variations b{
  font-weight:600;color:var(--ink-faint);font-size:.7rem;letter-spacing:.1em;
  text-transform:uppercase;display:block;margin-bottom:.3rem
}
.log{margin:.9rem 0 0;display:flex;flex-direction:column;gap:.55rem}
.log-label{
  font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)
}
.entry{padding:.65rem .85rem;background:var(--sunk);border:1px solid var(--line);border-radius:3px;font-size:.93rem}
.entry b{font-weight:600}
.entry p{margin:.2rem 0 0;color:var(--ink-soft)}
.sug-detail{font-size:.85rem;color:var(--ink-faint);margin-top:.15rem}
.compare{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-top:.6rem}
.side{padding:.55rem .75rem;border:1px solid var(--line);border-radius:3px;font-size:.9rem}
.side b{display:block;font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:.25rem}
.side ul{margin:0;padding-left:1.1rem}
.choices{flex-wrap:wrap;justify-content:flex-end}
.choice[aria-pressed="true"]{background:var(--yes);border-color:var(--yes);color:var(--ground);font-weight:600}
.choice.proposed{border-style:dashed}
.sug.wide{grid-template-columns:1fr}
.sug.wide .choices{justify-content:flex-start}
@media (max-width:34rem){
  .compare{grid-template-columns:1fr}
  .sug{grid-template-columns:1fr;gap:.7rem}
  .choices{justify-content:flex-start}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>"""


#: The choices on a sub-situation suggestion, the first kind of round.
SHOW_HIDE = [{"v": "show", "label": "Show"}, {"v": "hide", "label": "Don\u2019t show"}]


def allowed_choices(items) -> dict[str, set[str]]:
    """Every markable key in a round and the choices it accepts."""
    out: dict[str, set[str]] = {}
    for item in items:
        for row in item.get("rows") or []:
            out[f'{item["key"]}:{row["id"]}'] = {o["v"] for o in row["options"]}
        for i, _ in enumerate(item.get("suggestions") or []):
            out[f'{item["key"]}:{i}'] = {o["v"] for o in SHOW_HIDE}
    return out


def _log_html(log) -> str:
    """What the parent wrote, one monitoring entry per block."""
    if not log:
        return ""
    entries = []
    for e in log:
        fear = f' &middot; fear {_esc(e["fear"])}/10' if e.get("fear") not in (None, "") else ""
        entries.append(
            f'<div class="entry"><b>{_esc(e.get("situation") or "")}</b>{fear}'
            + (f'<p>{_esc(e["child"])}</p>' if e.get("child") else "")
            + (f'<p><i>Parent did:</i> {_esc(e["parent"])}</p>' if e.get("parent") else "")
            + '</div>'
        )
    return f'<div class="log"><span class="log-label">What the parent wrote</span>{"".join(entries)}</div>'


def _row_html(row, key, chosen) -> str:
    """One thing to mark: its text, optional detail or side-by-side answers, and its choices."""
    attr = f' data-choice="{_esc(chosen)}"' if chosen else ""
    detail = f'<div class="sug-detail">{_esc(row["detail"])}</div>' if row.get("detail") else ""
    compare = ""
    if row.get("compare"):
        sides = "".join(
            f'<div class="side"><b>{_esc(side["label"])}</b><ul>'
            + "".join(f"<li>{_esc(line)}</li>" for line in side["lines"])
            + "</ul></div>"
            for side in row["compare"]
        )
        compare = f'<div class="compare">{sides}</div>'
    buttons = "".join(
        f'<button class="choice{" proposed" if o["v"] == row.get("proposed") else ""}" '
        f'data-v="{_esc(o["v"])}" data-key="{_esc(key)}" '
        f'aria-pressed="{"true" if o["v"] == chosen else "false"}">{_esc(o["label"])}</button>'
        for o in row["options"]
    )
    wide = " wide" if compare or len(row["options"]) > 2 else ""
    return (
        f'<div class="sug{wide}" data-key="{_esc(key)}"{attr}>'
        f'<div><div class="sug-text">{_esc(row["text"])}</div>{detail}{compare}</div>'
        f'<div class="choices">{buttons}</div></div>'
    )


def render_page(round_, reviewer, marks: dict, token: str, additions=None, comments=None) -> str:
    """`round_.items` is a list of items. A sub-situation item is {key, situation, existing,
    suggestions, note}. Any item can instead carry `rows`, each {id, text, detail?, compare?,
    options: [{v, label}], proposed?}, and `log`, the parent's entries shown above them."""
    additions = additions or {}
    comments = comments or {}
    body = []
    total = 0

    for item in round_.items:
        rungs = item.get("existing") or []
        chips = "".join(f'<span class="rung">{_esc(r)}</span>' for r in rungs)
        rows = []
        for row in item.get("rows") or []:
            total += 1
            key = f'{item["key"]}:{row["id"]}'
            rows.append(_row_html(row, key, marks.get(key)))
        for i, suggestion in enumerate(item.get("suggestions") or []):
            total += 1
            key = f'{item["key"]}:{i}'
            chosen = marks.get(key)
            attr = f' data-choice="{_esc(chosen)}"' if chosen else ""
            rows.append(_row_html(
                {"text": suggestion, "options": SHOW_HIDE}, key, chosen,
            ))
        note = item.get("note")
        note_html = (
            f'<div class="variations"><b>Other variations</b>{_esc(note)}</div>' if note else ""
        )
        mine = "".join(
            '<li>' + _esc(a["body"]) +
            '<button class="drop" data-id="' + _esc(a["id"]) + '" aria-label="Remove">&times;</button></li>'
            for a in additions.get(item["key"], [])
        )
        comment_html = (
            '<div class="comment"><label for="c-' + _esc(item["key"]) + '">Comments</label>'
            '<textarea id="c-' + _esc(item["key"]) + '" data-key="' + _esc(item["key"]) + '" '
            'rows="3" placeholder="Anything worth saying about this one">'
            + _esc(comments.get(item["key"], "")) + '</textarea></div>'
        )
        placeholder = item.get("add_placeholder") or "Add one of your own"
        add_html = "" if item.get("no_add") else (
            '<div class="own"><ul class="mine" data-for="' + _esc(item["key"]) + '">' + mine + '</ul>'
            '<div class="add"><input type="text" data-key="' + _esc(item["key"]) + '" '
            'placeholder="' + _esc(placeholder) + '" aria-label="' + _esc(placeholder) + '">'
            '<button class="ghost addbtn" data-key="' + _esc(item["key"]) + '">Add</button></div></div>'
        )
        # Only when there are any. A round whose situations have none showed
        # "Safety Behaviors: nothing yet" on every card, which is a label for the old model where a
        # rung was a behaviour the child gave up.
        rungs_html = (
            f'<div class="rungs"><span class="rungs-label">Safety Behaviors</span>{chips}</div>'
            if rungs else ''
        )
        body.append(
            f'<section class="case"><div class="case-head">'
            f'<h2 class="sit">{_esc(item["situation"])}</h2>'
            f'{rungs_html}{_log_html(item.get("log"))}'
            f'</div>{"".join(rows)}{note_html}{add_html}{comment_html}</section>'
        )

    instructions = round_.instructions or "Mark every one <b>Show</b> or <b>Don\u2019t show</b>."

    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{_esc(round_.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Public+Sans:wght@400;500;600&display=swap">
{CSS}
</head><body>
<div class="wrap">
<header>
  <p class="eyebrow">Test Data &middot; Clinical Review</p>
  <h1>{_esc(round_.title)}</h1>
  <p class="lede">{instructions}</p>
</header>

<div class="bar">
  <div class="count"><span id="done">{len(marks)}</span> <span>of</span> <span>{total}</span> <span>reviewed</span></div>
  <div class="track"><div class="fill" id="fill"></div></div>
  <span class="sync" id="sync">saved</span>
</div>

<main id="list">{"".join(body)}</main>

</div>

<script>
const TOTAL = {total};
const TOKEN = {json.dumps(token)};
const URL = "/review/" + TOKEN + "/mark";
const sync = document.getElementById("sync");
const list = document.getElementById("list");
let pending = 0;

list.addEventListener("click", async (e) => {{
  const b = e.target.closest(".choice");
  if (!b) return;
  const row = b.closest(".sug");
  const key = b.dataset.key;
  const next = row.dataset.choice === b.dataset.v ? null : b.dataset.v;

  const before = row.dataset.choice || null;
  if (next) row.dataset.choice = next; else delete row.dataset.choice;
  press(row);
  count();

  pending++; state("saving\u2026");
  try {{
    const r = await fetch(URL, {{
      method: "POST",
      headers: {{"Content-Type": "application/json"}},
      body: JSON.stringify({{item_key: key, choice: next}})
    }});
    if (!r.ok) throw new Error(r.status);
    pending--; if (!pending) state("saved");
  }} catch (err) {{
    pending--;
    if (before) row.dataset.choice = before; else delete row.dataset.choice;
    press(row);
    count();
    state("not saved \u2014 check your connection", true);
  }}
}});

list.addEventListener("click", async (e) => {{
  const add = e.target.closest(".addbtn");
  if (add) return submit(add.dataset.key);
  const drop = e.target.closest(".drop");
  if (drop) {{
    const li = drop.closest("li");
    li.remove();
    state("saving\u2026");
    try {{
      const r = await fetch("/review/" + TOKEN + "/add/" + drop.dataset.id, {{method: "DELETE"}});
      if (!r.ok) throw new Error(r.status);
          state("saved");
    }} catch (err) {{ state("not saved \u2014 check your connection", true); }}
  }}
}});

list.addEventListener("keydown", (e) => {{
  if (e.key === "Enter" && e.target.matches(".add input")) {{
    e.preventDefault();
    submit(e.target.dataset.key);
  }}
}});

async function submit(key){{
  const input = list.querySelector('.add input[data-key="' + CSS.escape(key) + '"]');
  const body = (input.value || "").trim();
  if (!body) return;
  input.value = "";
  state("saving\u2026");
  try {{
    const r = await fetch("/review/" + TOKEN + "/add", {{
      method: "POST",
      headers: {{"Content-Type": "application/json"}},
      body: JSON.stringify({{item_key: key, body: body}})
    }});
    if (!r.ok) throw new Error(r.status);
    const saved = await r.json();
    const ul = list.querySelector('.mine[data-for="' + CSS.escape(key) + '"]');
    const li = document.createElement("li");
    li.textContent = body;
    const x = document.createElement("button");
    x.className = "drop"; x.dataset.id = saved.id; x.setAttribute("aria-label", "Remove");
    x.innerHTML = "&times;";
    li.appendChild(x);
    ul.appendChild(li);
      state("saved");
  }} catch (err) {{
    input.value = body;
    state("not saved \u2014 check your connection", true);
  }}
}}

// Saved when she clicks away, and again a moment after she stops typing, so nothing is lost if
// she closes the tab mid-thought.
let commentTimer;
list.addEventListener("input", (e) => {{
  if (!e.target.matches(".comment textarea")) return;
  clearTimeout(commentTimer);
  const el = e.target;
  commentTimer = setTimeout(() => saveComment(el), 1200);
}});

list.addEventListener("focusout", (e) => {{
  if (e.target.matches(".comment textarea")) saveComment(e.target);
}}, true);

async function saveComment(el){{
  if (el.dataset.saved === el.value) return;
  const body = el.value;
  state("saving\u2026");
  try {{
    const r = await fetch("/review/" + TOKEN + "/comment", {{
      method: "POST",
      headers: {{"Content-Type": "application/json"}},
      body: JSON.stringify({{item_key: el.dataset.key, body: body}})
    }});
    if (!r.ok) throw new Error(r.status);
    el.dataset.saved = body;
    state("saved");
  }} catch (err) {{
    state("not saved \u2014 check your connection", true);
  }}
}}

function press(row){{
  row.querySelectorAll(".choice").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === row.dataset.choice)));
}}

function count(){{
  const done = list.querySelectorAll(".sug[data-choice]").length;
  document.getElementById("done").textContent = done;
  document.getElementById("fill").style.width = (TOTAL ? done / TOTAL * 100 : 0) + "%";
}}

function state(text, bad){{
  sync.textContent = text;
  sync.dataset.bad = bad ? "1" : "0";
}}

count();
</script>
</body></html>"""
