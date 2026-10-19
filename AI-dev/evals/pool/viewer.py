"""Write one HTML page that shows every family in the pool, for a person to read.

    python3 -I AI-dev/evals/pool/viewer.py <output.html>

The JSON files are the source; this page is only a way of reading them.
"""
import json
import sys
from pathlib import Path

POOL = Path(__file__).resolve().parent / "families"

PAGE = r"""<title>Float Test Families</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800&display=swap">
<style>
/* Layout: family list on the left (stacks above on phones), the open family on the right in four sections: facts, log, voice notes, session. */
:root{
  --bg:#f4f8f7; --paper:#fff; --ink:#16302b; --ink2:#4b5f5c; --muted:#7f908e; --line:#dbe8e5; --tint:#eef6f3;
  --accent:#2f5d55; --accent2:#4d8478; --warn:#9a5b00; --warnbg:#fdf1dc; --bad:#991b1b; --badbg:#fde8e8;
  --av:#7a4fb3; --avbg:#f1eafb; --sa:#1f6f5c; --sabg:#e3f4ee; --es:#a14b17; --esbg:#fbeadf; --un:#5f6b6a; --unbg:#eef1f1;
  --font:"Nunito Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#0f1817; --paper:#16211f; --ink:#e4efec; --ink2:#a9bdb9; --muted:#7d918d; --line:#253634; --tint:#1a2826;
  --accent:#7cc0ae; --accent2:#7cc0ae; --warn:#e0a84a; --warnbg:#3a2c12; --bad:#f19a9a; --badbg:#3a1a1a;
  --av:#c4a6ef; --avbg:#2a2140; --sa:#7fd1b9; --sabg:#173229; --es:#f0a77a; --esbg:#3a2316; --un:#a9b5b4; --unbg:#222c2b; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0f1817; --paper:#16211f; --ink:#e4efec; --ink2:#a9bdb9; --muted:#7d918d; --line:#253634; --tint:#1a2826;
  --accent:#7cc0ae; --accent2:#7cc0ae; --warn:#e0a84a; --warnbg:#3a2c12; --bad:#f19a9a; --badbg:#3a1a1a;
  --av:#c4a6ef; --avbg:#2a2140; --sa:#7fd1b9; --sabg:#173229; --es:#f0a77a; --esbg:#3a2316; --un:#a9b5b4; --unbg:#222c2b; color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.5}
.wrap{display:grid;grid-template-columns:260px minmax(0,1fr);gap:24px;max-width:1240px;margin:0 auto;padding-block:24px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
@media (max-width:820px){.wrap{grid-template-columns:minmax(0,1fr)}}
nav{position:sticky;top:env(safe-area-inset-top,0px);align-self:start;max-height:100vh;overflow:auto;padding-bottom:16px}
@media (max-width:820px){nav{position:static;max-height:none}}
h1{font-size:20px;margin:0 0 4px;font-weight:800}
.sub{color:var(--muted);font-size:13px;margin:0 0 14px}
.group{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
.fam{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left;border:0;background:none;color:var(--ink);font:inherit;font-size:14px;padding:6px 8px;border-radius:8px;cursor:pointer}
.fam:hover{background:var(--tint)}
.fam[aria-current="true"]{background:var(--paper);box-shadow:0 0 0 1px var(--line);font-weight:700}
.fam small{color:var(--muted)}
main{min-width:0}
.head{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.head h2{margin:0;font-size:24px;font-weight:800}
.meta{color:var(--ink2);margin-top:4px}
.risk{margin-top:12px;background:var(--badbg);color:var(--bad);border-radius:10px;padding:10px 12px;font-size:14px}
.diff{margin-top:12px;background:var(--warnbg);color:var(--warn);border-radius:10px;padding:10px 12px;font-size:14px}
section{margin-top:22px}
h3{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent2);margin:0 0 8px}
.sit{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px}
.sit h4{margin:0;font-size:16px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.fl{font-variant-numeric:tabular-nums;font-size:13px;color:var(--ink2);font-weight:700}
.fear{color:var(--ink2);font-size:14px;margin:4px 0 8px}
.row{display:flex;gap:8px;align-items:baseline;margin:4px 0;font-size:14.5px}
.pill{flex:none;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:1px 8px}
.avoidance{color:var(--av);background:var(--avbg)} .safety{color:var(--sa);background:var(--sabg)}
.escape{color:var(--es);background:var(--esbg)} .unclear{color:var(--un);background:var(--unbg)}
.acc{color:var(--ink2);background:var(--tint)}
.tablewrap{overflow-x:auto;background:var(--paper);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:720px;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:var(--tint)}
tr:last-child td{border-bottom:0}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.trap{display:block;margin-top:4px;font-size:12.5px;color:var(--warn)}
.note{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:10px}
.note p{margin:0 0 6px;font-style:italic}
.exp{font-size:13px;color:var(--muted)}
.turn{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14.5px}
.turn:last-child{border-bottom:0}
.who{font-size:12.5px;color:var(--muted)} .who b{display:block;color:var(--ink2);font-size:13px}
.turn.bad{background:var(--warnbg);border-radius:8px;padding:6px 8px;margin:0 -8px}
.turn.bad .who b{color:var(--warn)}
.transcript{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:6px 14px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:10px}
.box{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px}
.box ul{margin:4px 0 0;padding-left:18px}
.muted{color:var(--muted)}
@media (max-width:560px){.turn{grid-template-columns:minmax(0,1fr)}}
:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}
</style>
<div class="wrap">
  <nav>
    <h1>Test families</h1>
    <p class="sub">Synthetic. The waiting pool, <span id="count"></span> families.</p>
    <div id="list"></div>
  </nav>
  <main id="main"></main>
</div>
<script>
const FAMILIES = __DATA__;
const GROUPS = {social:'Social anxiety',separation:'Separation anxiety',health:'Health anxiety',specific:'Specific fears',school:'School and worry',edge:'Hard edge cases'};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fl = v => v == null ? '<span class="muted">no number</span>' : v + '/10';
document.getElementById('count').textContent = FAMILIES.length;

function list(current){
  const el = document.getElementById('list'); el.innerHTML = '';
  for (const [k, label] of Object.entries(GROUPS)){
    const fams = FAMILIES.filter(f => f.id.split('-')[1] === k); if (!fams.length) continue;
    el.insertAdjacentHTML('beforeend', `<div class="group">${label}</div>`);
    for (const f of fams){
      const b = document.createElement('button'); b.className = 'fam';
      b.setAttribute('aria-current', String(f.id === current));
      b.innerHTML = `<span>${esc(f.facts.child.name)}, ${f.facts.child.age}${f.facts.risk.present ? ' ⚠' : ''}</span><small>${f.id.split('-').pop()}</small>`;
      b.onclick = () => show(f.id); el.append(b);
    }
  }
}

function show(id){
  const f = FAMILIES.find(x => x.id === id); list(id);
  try { history.replaceState(null, '', '#' + id) } catch {}
  const sits = Object.fromEntries(f.facts.situations.map(s => [s.id, s]));
  const name = id => sits[id]?.name ?? id;
  const ids = {}; f.facts.situations.forEach(s => { ids[s.id] = s.name; s.behaviors.forEach(b => ids[b.id] = b.text); s.accommodations.forEach(a => ids[a.id] = a.text) });
  let h = `<div class="head"><h2>${esc(f.facts.child.name)}, ${f.facts.child.age}</h2>
    <div class="meta">${esc(f.facts.anxiety)} · parent writes: ${esc(f.style)} · <span class="muted">${f.id}</span></div>
    ${f.facts.risk.present ? `<div class="risk"><b>Risk sign: unconfirmed, not scored.</b> ${esc(f.facts.risk.detail)} <i>What counts as a risk sign is on Dr. Walker's list.</i></div>` : ''}
    ${f.difficulty ? `<div class="diff"><b>Built-in difficulty.</b> ${esc(f.difficulty)}</div>` : ''}
    ${f.label_notes ? `<div class="diff"><b>Label notes.</b> ${esc(typeof f.label_notes === 'string' ? f.label_notes : JSON.stringify(f.label_notes))}</div>` : ''}
  </div>`;
  h += `<section><h3>The facts (answer key)</h3>`;
  for (const s of f.facts.situations){
    h += `<div class="sit"><h4><span>${esc(s.name)}</span><span class="fl">Fear Level ${fl(s.fear_level)}</span></h4>
      <div class="fear">${s.feared_outcome ? 'Feared outcome: “' + esc(s.feared_outcome) + '”' : '<span class="muted">Feared outcome not known</span>'}</div>`;
    for (const b of s.behaviors) h += `<div class="row"><span class="pill ${b.type}">${b.type}</span><span>${esc(b.text)}</span></div>`;
    for (const a of s.accommodations) h += `<div class="row"><span class="pill acc">parent</span><span>${esc(a.text)}</span></div>`;
    h += `</div>`;
  }
  h += `</section><section><h3>Monitoring log (what Float reads)</h3><div class="tablewrap"><table>
    <thead><tr><th>Date</th><th>Situation</th><th>Child</th><th>Parent</th><th>Fear</th><th>About</th></tr></thead><tbody>`;
  for (const e of f.inputs.monitoring_log){
    const words = e.parent_words ? `<td colspan="3"><i>Parent's own words:</i> ${esc(e.parent_words)}</td>` :
      `<td>${esc(e.situation)}</td><td>${esc(e.child_behavior_observed)}${e.trap ? `<span class="trap">Trap: ${esc(e.trap)}</span>` : ''}</td><td>${esc(e.parent_response)}</td>`;
    h += `<tr><td class="num">${esc(e.date)}</td>${words}<td class="num">${e.fear_thermometer ?? '–'}</td><td class="muted">${esc(name(e.situation_ref))}</td></tr>`;
  }
  h += `</tbody></table></div></section><section><h3>Voice notes</h3>`;
  for (const n of f.inputs.voice_notes || []){
    const ex = n.expected || {};
    h += `<div class="note"><p>“${esc(n.text)}”</p><div class="exp">Expected: ${ex.observations} ${ex.observations === 1 ? 'moment' : 'moments'} · Fear Level said: ${ex.fear_level_said ?? 'none'} · mentions: ${(ex.refs || []).filter(r => r.startsWith('s')).map(r => esc(name(r))).join('; ')}
      ${n.trap ? `<span class="trap">Trap: ${esc(typeof n.trap === 'string' ? n.trap : JSON.stringify(n.trap))}</span>` : ''}</div></div>`;
  }
  const S = f.inputs.session;
  if (S){
    const bad = new Map((S.mislabeled_turns || []).map(m => [m.turn, m]));
    h += `</section><section><h3>Session transcript (about ${S.minutes} minutes)</h3><div class="transcript">`;
    S.turns.forEach((t, i) => {
      const m = bad.get(i); const role = S.true_speakers[t.speaker];
      h += `<div class="turn${m ? ' bad' : ''}"><div class="who"><b>${m ? 'Labeled ' + esc(role) : esc(role)}</b>${esc(t.speaker)}${m ? ' · really ' + esc(m.correct) : ''}</div><div>${esc(t.text)}</div></div>`;
    });
    const E = S.expected_note || {};
    h += `</div><div class="cols">
      <div class="box"><b>A correct note covers</b><ul>${(E.topics || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="box"><b>Agreed next steps</b><ul>${(E.agreed || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <b>Fear Levels said</b><ul>${(E.fear_levels_said || []).map(x => `<li>${esc(name(x.situation_ref))}: ${x.level}</li>`).join('') || '<li class="muted">none</li>'}</ul></div>
      <div class="box"><b>Must not appear in the note</b><ul>${(S.must_not_appear || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>`;
  }
  h += `</section>`;
  document.getElementById('main').innerHTML = h;
  window.scrollTo(0, 0);
}
const start = (location.hash || '').slice(1);
show(FAMILIES.some(f => f.id === start) ? start : FAMILIES[0].id);
</script>
"""


def main() -> None:
    out = Path(sys.argv[1])
    fams = [json.loads(p.read_text()) for p in sorted(POOL.glob("*.json"))]
    order = ["social", "separation", "health", "specific", "school", "edge"]
    fams.sort(key=lambda f: (order.index(f["id"].split("-")[1]) if f["id"].split("-")[1] in order else 99, f["id"]))
    data = json.dumps(fams, ensure_ascii=False).replace("</", "<\\/")
    out.write_text(PAGE.replace("__DATA__", data))
    print(f"wrote {out} ({len(fams)} families)")


if __name__ == "__main__":
    main()
