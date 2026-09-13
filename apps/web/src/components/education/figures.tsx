/**
 * The diagrams in the clinician's Education modules, and each module's small illustration.
 *
 * Drawn in code so they stay sharp and are easy to change after Dr. Walker's review. Every label
 * comes from the module's own text. docs/plans/education-redesign.md
 */
import type { ReactNode } from 'react'

export type FigureId =
  | 'anxiety-cycle'
  | 'worry-hill'
  | 'fear-scale'
  | 'downward-arrow'
  | 'belief-falls'
  | 'exposure-ladder'
  | 'two-ladders'
  | 'before-after'
  | 'parent-stages'
  | 'patient-path'

const C = {
  teal: '#135450',
  ink: '#0d3d3a',
  mint: '#9af6e4',
  soft: '#eafaf6',
  paper: '#f6faf9',
  line: '#cfe0db',
  text: '#1e293b',
  muted: '#5b6b72',
  coral: '#e07a5f',
  coralSoft: '#fbe9e3',
  amber: '#f2c14e',
}

const font = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

function Frame({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="edu-figure">
      <div className="edu-figure-art">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

function Arrowheads() {
  return (
    <defs>
      <marker id="edu-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill={C.teal} />
      </marker>
      <marker id="edu-arrow-coral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill={C.coral} />
      </marker>
    </defs>
  )
}

function AnxietyCycle() {
  const node = (x: number, y: number, n: string, title: string, sub: string, hot = false) => (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-122} y={-34} width={244} height={68} rx={16} fill={hot ? C.coralSoft : '#fff'} stroke={hot ? C.coral : C.line} strokeWidth={1.5} />
      <circle cx={-98} cy={0} r={13} fill={hot ? C.coral : C.teal} />
      <text x={-98} y={4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{n}</text>
      <text x={-76} y={-4} fontSize={14} fontWeight={700} fill={C.ink}>{title}</text>
      <text x={-76} y={15} fontSize={11.5} fill={C.muted}>{sub}</text>
    </g>
  )
  return (
    <svg viewBox="0 0 600 380" role="img" aria-label="The anxiety cycle: trigger, anxiety response, avoidance or safety behavior, reinforcement, and back to the trigger" style={{ fontFamily: font }}>
      <Arrowheads />
      <circle cx={300} cy={190} r={118} fill="none" stroke={C.line} strokeWidth={2} strokeDasharray="3 7" />
      <path d="M 392 96 A 132 132 0 0 1 432 150" fill="none" stroke={C.teal} strokeWidth={2.5} markerEnd="url(#edu-arrow)" />
      <path d="M 432 232 A 132 132 0 0 1 392 284" fill="none" stroke={C.teal} strokeWidth={2.5} markerEnd="url(#edu-arrow)" />
      <path d="M 208 284 A 132 132 0 0 1 168 232" fill="none" stroke={C.coral} strokeWidth={2.5} markerEnd="url(#edu-arrow-coral)" />
      <path d="M 168 150 A 132 132 0 0 1 208 96" fill="none" stroke={C.coral} strokeWidth={2.5} markerEnd="url(#edu-arrow-coral)" />
      <text x={300} y={184} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.ink}>Each time round,</text>
      <text x={300} y={203} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.ink}>it fires faster</text>
      {node(300, 58, '1', 'Trigger', 'A situation, thought or sensation')}
      {node(474, 190, '2', 'Anxiety response', 'The brain screams danger')}
      {node(300, 322, '3', 'Avoid or escape', 'The distress drops', true)}
      {node(126, 190, '4', 'Reinforcement', 'Avoidance = safety', true)}
    </svg>
  )
}

function WorryHill() {
  const x0 = 60, y0 = 250, w = 500
  const legend = (x: number, stroke: string, dash: string | undefined, label: string) => (
    <g transform={`translate(${x} 294)`}>
      <line x1={0} y1={0} x2={28} y2={0} stroke={stroke} strokeWidth={3.5} strokeDasharray={dash} />
      <text x={36} y={4.5} fontSize={12.5} fontWeight={600} fill={C.ink}>{label}</text>
    </g>
  )
  return (
    <svg viewBox="0 0 600 332" role="img" aria-label="The Worry Hill: staying in the situation, anxiety rises, peaks and comes down on its own. Escaping drops it at once, and the child never learns it comes down by itself. Each time the child stays, the hill is lower and shorter." style={{ fontFamily: font }}>
      <Arrowheads />
      <line x1={x0} y1={y0} x2={x0 + w} y2={y0} stroke={C.line} strokeWidth={1.5} />
      <line x1={x0} y1={y0} x2={x0} y2={30} stroke={C.line} strokeWidth={1.5} />
      <text x={x0 + w} y={y0 - 8} textAnchor="end" fontSize={11.5} fill={C.muted}>Time in the situation →</text>
      <text transform={`translate(${x0 - 14} ${y0 - 4}) rotate(-90)`} fontSize={11.5} fill={C.muted}>Anxiety →</text>
      <path d={`M ${x0} ${y0} C 150 ${y0}, 170 150, 230 150 S 320 ${y0 - 10}, 420 ${y0 - 6}`} fill="none" stroke={C.mint} strokeWidth={3} />
      <path d={`M ${x0} ${y0} C 130 ${y0}, 150 195, 190 195 S 250 ${y0 - 8}, 320 ${y0 - 4}`} fill="none" stroke={C.mint} strokeWidth={3} opacity={0.7} />
      <path d={`M ${x0} ${y0} C 170 ${y0}, 210 60, 280 60 S 400 ${y0 - 20}, ${x0 + w} ${y0 - 12}`} fill={C.soft} fillOpacity={0.55} stroke={C.teal} strokeWidth={3.5} />
      <path d={`M ${x0} ${y0} C 150 ${y0}, 185 110, 215 104`} fill="none" stroke={C.coral} strokeWidth={3} strokeDasharray="7 6" />
      <line x1={218} y1={106} x2={218} y2={y0 - 6} stroke={C.coral} strokeWidth={2.5} markerEnd="url(#edu-arrow-coral)" />
      <circle cx={280} cy={60} r={5} fill={C.teal} />
      <text x={292} y={50} fontSize={12.5} fontWeight={700} fill={C.ink}>The peak passes</text>
      {legend(x0, C.teal, undefined, 'Stay: it rises, peaks, comes down')}
      {legend(x0 + 250, C.coral, '7 6', 'Escape: relief now, no learning')}
      <g transform={`translate(${x0} 318)`}>
        <line x1={0} y1={0} x2={28} y2={0} stroke={C.mint} strokeWidth={3.5} />
        <text x={36} y={4.5} fontSize={12.5} fontWeight={600} fill={C.ink}>Each time they stay: lower and faster</text>
      </g>
    </svg>
  )
}

function FearScale() {
  const x0 = 40, w = 520
  const step = w / 10
  return (
    <svg viewBox="0 0 600 150" role="img" aria-label="The Distress Thermometer, 0 to 10: 0 completely calm, 10 the worst distress you can imagine" style={{ fontFamily: font }}>
      <defs>
        <linearGradient id="edu-dt" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={C.mint} />
          <stop offset="55%" stopColor={C.amber} />
          <stop offset="100%" stopColor={C.coral} />
        </linearGradient>
      </defs>
      <rect x={x0} y={46} width={w} height={26} rx={13} fill="url(#edu-dt)" />
      {Array.from({ length: 11 }, (_, i) => (
        <g key={i}>
          <line x1={x0 + i * step} y1={78} x2={x0 + i * step} y2={86} stroke={C.muted} strokeWidth={1.5} />
          <text x={x0 + i * step} y={104} textAnchor="middle" fontSize={14} fontWeight={700} fill={C.ink}>{i}</text>
        </g>
      ))}
      <text x={x0} y={32} fontSize={13} fontWeight={700} fill={C.ink}>Completely calm</text>
      <text x={x0 + w} y={32} textAnchor="end" fontSize={13} fontWeight={700} fill={C.ink}>The worst you can imagine</text>
      <text x={x0} y={132} fontSize={12} fill={C.muted}>"Like watching your favorite show"</text>
      <text x={x0 + w} y={132} textAnchor="end" fontSize={12} fill={C.muted}>"Like an emergency"</text>
    </svg>
  )
}

function DownwardArrow() {
  const steps = [
    "They'd stare at me",
    "They'd think I'm weird",
    'The whole school would know',
    "I'd have no friends",
  ]
  const boxW = 300, x = 150
  return (
    <svg viewBox="0 0 600 470" role="img" aria-label="The Downward Arrow for Maya: they'd stare at me, they'd think I'm weird, the whole school would know, I'd have no friends, down to the feared outcome: I will be completely alone and have no friends, ever" style={{ fontFamily: font }}>
      <Arrowheads />
      <text x={300} y={22} textAnchor="middle" fontSize={12.5} fill={C.muted}>If you sat near other students in the cafeteria, what are you afraid would happen?</text>
      {steps.map((s, i) => {
        const y = 40 + i * 82
        return (
          <g key={s}>
            <rect x={x} y={y} width={boxW} height={48} rx={12} fill="#fff" stroke={C.line} strokeWidth={1.5} />
            <text x={300} y={y + 29} textAnchor="middle" fontSize={15} fontWeight={600} fill={C.ink}>“{s}”</text>
            <line x1={300} y1={y + 50} x2={300} y2={y + 78} stroke={C.teal} strokeWidth={2} markerEnd="url(#edu-arrow)" />
            <text x={312} y={y + 68} fontSize={11.5} fill={C.teal} fontStyle="italic">And then what?</text>
          </g>
        )
      })}
      <rect x={110} y={368} width={380} height={80} rx={16} fill={C.ink} />
      <text x={300} y={394} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.mint} letterSpacing="1.2">FEARED OUTCOME</text>
      <text x={300} y={420} textAnchor="middle" fontSize={15.5} fontWeight={700} fill="#fff">“I will be completely alone</text>
      <text x={300} y={438} textAnchor="middle" fontSize={15.5} fontWeight={700} fill="#fff">and have no friends — ever”</text>
    </svg>
  )
}

function BeliefFalls() {
  // The module's own numbers: a BIP of 80% at the start, 10% after five exposures.
  const points = [80, 10]
  const x0 = 70, y0 = 230, h = 180
  const bar = (v: number, i: number, label: string) => {
    const bh = (v / 100) * h
    const bx = x0 + 70 + i * 250
    return (
      <g key={label}>
        <rect x={bx} y={y0 - bh} width={120} height={bh} rx={10} fill={i === 0 ? C.coral : C.teal} />
        <text x={bx + 60} y={y0 - bh - 10} textAnchor="middle" fontSize={20} fontWeight={800} fill={C.ink}>{v}%</text>
        <text x={bx + 60} y={y0 + 22} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.ink}>{label}</text>
      </g>
    )
  }
  return (
    <svg viewBox="0 0 600 270" role="img" aria-label="Belief in Prediction: 80% before exposures, 10% after five exposures" style={{ fontFamily: font }}>
      {[0, 50, 100].map(t => (
        <g key={t}>
          <line x1={x0} y1={y0 - (t / 100) * h} x2={560} y2={y0 - (t / 100) * h} stroke={C.line} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 5'} />
          <text x={x0 - 10} y={y0 - (t / 100) * h + 4} textAnchor="end" fontSize={11} fill={C.muted}>{t}%</text>
        </g>
      ))}
      {bar(points[0], 0, 'Before exposures')}
      {bar(points[1], 1, 'After 5 exposures')}
    </svg>
  )
}

function ExposureLadder() {
  // The module's own "helpful" example: one situation, gradual steps.
  const rungs = ['Sit at end of cafeteria table', 'Sit in the middle of the table', 'Sit near the most social group']
  return (
    <svg viewBox="0 0 600 330" role="img" aria-label="An exposure ladder for one situation, easiest at the bottom: sit at end of cafeteria table, sit in the middle of the table, sit near the most social group" style={{ fontFamily: font }}>
      <Arrowheads />
      <line x1={120} y1={20} x2={120} y2={300} stroke={C.teal} strokeWidth={6} strokeLinecap="round" />
      <line x1={440} y1={20} x2={440} y2={300} stroke={C.teal} strokeWidth={6} strokeLinecap="round" />
      {rungs.map((r, i) => {
        const y = 250 - i * 95
        return (
          <g key={r}>
            <rect x={117} y={y - 22} width={326} height={44} rx={10} fill={i === 0 ? C.mint : '#fff'} stroke={C.teal} strokeWidth={2} />
            <text x={280} y={y + 5} textAnchor="middle" fontSize={14.5} fontWeight={700} fill={C.ink}>{r}</text>
          </g>
        )
      })}
      <text x={470} y={256} fontSize={13} fontWeight={700} fill={C.ink}>Start here:</text>
      <text x={470} y={274} fontSize={12.5} fill={C.muted}>lowest DT</text>
      <line x1={500} y1={225} x2={500} y2={70} stroke={C.teal} strokeWidth={2} markerEnd="url(#edu-arrow)" />
      <text x={514} y={150} fontSize={12} fill={C.muted}>Move up</text>
      <text x={514} y={166} fontSize={12} fill={C.muted}>at mastery</text>
      <text x={20} y={30} fontSize={12} fontWeight={700} fill={C.muted}>Hardest</text>
      <text x={20} y={292} fontSize={12} fontWeight={700} fill={C.muted}>Easiest</text>
    </svg>
  )
}

function TwoLadders() {
  const ladder = (x: number, title: string, sub: string, rungs: string[], fill: string) => (
    <g>
      <text x={x + 110} y={24} textAnchor="middle" fontSize={14} fontWeight={800} fill={C.ink}>{title}</text>
      <text x={x + 110} y={42} textAnchor="middle" fontSize={11.5} fill={C.muted}>{sub}</text>
      <line x1={x} y1={60} x2={x} y2={290} stroke={C.teal} strokeWidth={5} strokeLinecap="round" />
      <line x1={x + 220} y1={60} x2={x + 220} y2={290} stroke={C.teal} strokeWidth={5} strokeLinecap="round" />
      {rungs.map((r, i) => (
        <g key={r}>
          <rect x={x - 2} y={250 - i * 72 - 18} width={224} height={36} rx={9} fill={i === 0 ? fill : '#fff'} stroke={C.teal} strokeWidth={1.8} />
          <text x={x + 110} y={250 - i * 72 + 5} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={C.ink}>{r}</text>
        </g>
      ))}
    </g>
  )
  return (
    <svg viewBox="0 0 600 310" role="img" aria-label="Two ladders climbed together: the child's exposure ladder and the parent's accommodation ladder, each from lowest to highest distress" style={{ fontFamily: font }}>
      <Arrowheads />
      {ladder(40, "The child's exposure ladder", 'Refraining from avoidance', ['Lowest DT', 'Next step', 'Hardest'], C.mint)}
      {ladder(340, "The parent's accommodation ladder", 'Stopping accommodation', ['Lowest DT', 'Next step', 'Hardest'], C.amber)}
      <path d="M 272 178 L 330 178" stroke={C.teal} strokeWidth={2} markerEnd="url(#edu-arrow)" markerStart="url(#edu-arrow)" />
      <text x={301} y={166} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.teal}>in step</text>
    </svg>
  )
}

function BeforeAfter() {
  const card = (title: string, items: string[], tone: 'soft' | 'ink') => (
    <div className={`edu-ba-card edu-ba-${tone}`}>
      <div className="edu-ba-title">{title}</div>
      <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>
    </div>
  )
  return (
    <figure className="edu-figure">
      <div className="edu-ba">
        {card('Before', ['Plan description', 'Prediction', 'BIP (0–100%)', 'Expected DT', 'Tempting behaviors', 'Confidence level'], 'soft')}
        <div className="edu-ba-mid" aria-hidden="true"><span>Do the</span><span>exposure</span><b>→</b></div>
        {card('After', ['Did the feared outcome occur?', 'Actual DT', 'Updated BIP', 'What I learned'], 'ink')}
      </div>
      <figcaption>The two worksheets around every exposure</figcaption>
    </figure>
  )
}

function Steps({ items, label }: { items: [string, string][]; label: string }) {
  return (
    <figure className="edu-figure">
      <ol className="edu-steps" aria-label={label}>
        {items.map(([t, s], i) => (
          <li key={t}>
            <span className="edu-steps-dot">{i + 1}</span>
            <span className="edu-steps-title">{t}</span>
            <span className="edu-steps-sub">{s}</span>
          </li>
        ))}
      </ol>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

export function Figure({ id }: { id: FigureId }) {
  switch (id) {
    case 'anxiety-cycle': return <Frame caption="The anxiety cycle"><AnxietyCycle /></Frame>
    case 'worry-hill': return <Frame caption="The Worry Hill"><WorryHill /></Frame>
    case 'fear-scale': return <Frame caption="The Distress Thermometer"><FearScale /></Frame>
    case 'downward-arrow': return <Frame caption="Maya's Downward Arrow"><DownwardArrow /></Frame>
    case 'belief-falls': return <Frame caption="BIP falls as the feared outcome keeps not happening"><BeliefFalls /></Frame>
    case 'exposure-ladder': return <Frame caption="One situation, gradual rungs"><ExposureLadder /></Frame>
    case 'two-ladders': return <Frame caption="The child and the parent climb together"><TwoLadders /></Frame>
    case 'before-after': return <BeforeAfter />
    case 'parent-stages': return (
      <Steps label="The five stages of parent work" items={[
        ['Monitor', 'Identify accommodation'],
        ['Plan', 'The accommodation ladder'],
        ['Practice', 'Non-accommodating responses'],
        ['Accept', "The child's anxiety, calmly"],
        ['Express confidence', 'You can cope'],
      ]} />
    )
    case 'patient-path': return (
      <Steps label="A patient's path through Float" items={[
        ['Referred', 'Patient created'],
        ['Monitoring', 'About a week'],
        ['Consulting', 'Sessions and notes'],
        ['Setup', 'The treatment plan'],
        ['Active', 'Exposures underway'],
        ['Maintenance', 'Generalization'],
        ['Complete', 'Goals achieved'],
      ]} />
    )
  }
}

// ── Each module's illustration ───────────────────────────────────────────────

const icons: Record<string, ReactNode> = {
  'understanding-anxiety': (
    <>
      <path d="M32 12a20 20 0 1 1-17.3 10" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <path d="M8 16l6.7 6 5.5-7.3" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={32} cy={32} r={5} fill="currentColor" />
    </>
  ),
  'family-accommodation': (
    <>
      <circle cx={22} cy={18} r={7} fill="currentColor" />
      <path d="M10 50V38a12 12 0 0 1 24 0v12" fill="currentColor" />
      <circle cx={44} cy={28} r={5.5} fill="currentColor" opacity={0.6} />
      <path d="M35 50v-8a9 9 0 0 1 18 0v8" fill="currentColor" opacity={0.6} />
    </>
  ),
  'assessment-tools': (
    <>
      <rect x={26} y={8} width={12} height={36} rx={6} fill="none" stroke="currentColor" strokeWidth={4} />
      <circle cx={32} cy={48} r={9} fill="currentColor" />
      <rect x={30} y={24} width={4} height={24} rx={2} fill="currentColor" />
    </>
  ),
  'downward-arrow': (
    <>
      <rect x={14} y={6} width={36} height={10} rx={5} fill="currentColor" opacity={0.45} />
      <rect x={14} y={22} width={36} height={10} rx={5} fill="currentColor" opacity={0.7} />
      <path d="M32 36v16m-8-8l8 8 8-8" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'exposure-ladder': (
    <>
      <path d="M20 6v52M44 6v52" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <path d="M20 16h24M20 30h24M20 44h24" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  ),
  'planning-exposures': (
    <>
      <rect x={8} y={12} width={48} height={42} rx={7} fill="none" stroke="currentColor" strokeWidth={4} />
      <path d="M8 24h48M20 6v10M44 6v10" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <path d="M22 39l7 7 13-13" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'parent-module': (
    <>
      <circle cx={24} cy={14} r={7} fill="currentColor" />
      <path d="M12 52V34a12 12 0 0 1 24 0v18" fill="currentColor" />
      <path d="M36 40c4-6 14-6 16 2 1 5-6 10-9 12-3-2-10-7-7-14z" fill="currentColor" opacity={0.6} />
    </>
  ),
  'using-float': (
    <>
      <rect x={18} y={4} width={28} height={56} rx={7} fill="none" stroke="currentColor" strokeWidth={4} />
      <circle cx={32} cy={30} r={8} fill="currentColor" />
      <path d="M27 50h10" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </>
  ),
}

export function ModuleIcon({ id, size = 40 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {icons[id] ?? <circle cx={32} cy={32} r={16} fill="currentColor" />}
    </svg>
  )
}
