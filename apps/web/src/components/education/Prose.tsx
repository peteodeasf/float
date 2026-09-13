/**
 * The Education modules' text, set properly. The content file keeps its light formatting (bold,
 * lists, quotes, tables); this turns each pattern into a real element instead of HTML strings:
 * numbered steps, lists, the scripts to say as speech bubbles, the example Downward Arrows as a
 * conversation, "**Term** — meaning" as cards, tables, and "Not helpful / Helpful" side by side.
 * docs/plans/education-redesign.md
 */
import { Fragment, type ReactNode } from 'react'

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'sub'; text: string }
  | { kind: 'terms'; items: { term: string; text: string }[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number }
  | { kind: 'say'; items: string[]; examples?: boolean }
  | { kind: 'dialogue'; turns: { who: string; text: string }[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'compare'; bad: string; good: string }

const QUOTED = /^["“].*["”]$/
const SUB = /^\*\*([^*]+)\*\*$/
const TERM = /^\*\*([^*]+?)\*\*\s*(?:—|–|-|:)?\s+(.+)$/
const TURN = /^\*\*([^*:]+):\*\*\s*(.*)$/

/** Content text → blocks. Exported for the tests. */
export function parse(content: string): Block[] {
  const lines = content.split('\n')
  const blocks: Block[] = []
  let para: string[] = []

  const flush = () => {
    if (para.length === 0) return
    const text = para.join(' ').trim()
    para = []
    if (QUOTED.test(text)) return push({ kind: 'say', items: [text] })
    const term = text.match(TERM)
    // A card starts with a capital: "**Prediction** — the child's feared outcome" reads as "The child's…".
    if (term) return push({ kind: 'terms', items: [{ term: term[1].replace(/:$/, ''), text: term[2].charAt(0).toUpperCase() + term[2].slice(1) }] })
    push({ kind: 'p', text })
  }
  // Neighbouring term cards share one grid, and neighbouring scripts one set of bubbles.
  const push = (b: Block) => {
    const last = blocks[blocks.length - 1]
    // Quoted lines are usually what the clinician or parent says. After "…feared outcomes
    // include:" they are examples of what a child believes, so they are not labelled as a script.
    if (b.kind === 'say' && last?.kind === 'p' && /feared outcomes? include/i.test(last.text)) b = { ...b, examples: true }
    if (b.kind === 'terms' && last?.kind === 'terms') last.items.push(...b.items)
    else if (b.kind === 'say' && last?.kind === 'say' && !!b.examples === !!last.examples) last.items.push(...b.items)
    else if (b.kind === 'ol' && last?.kind === 'ol') last.items.push(...b.items)
    else blocks.push(b)
  }
  const run = (i: number, test: (l: string) => boolean) => {
    const out: string[] = []
    while (i < lines.length && test(lines[i])) out.push(lines[i++])
    return out
  }

  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim()
    if (line === '') { flush(); i++; continue }

    if (line.startsWith('> ')) {
      flush()
      const group = run(i, l => l.trim().startsWith('> ')).map(l => l.trim().slice(2))
      i += group.length
      const turns = group.map(g => g.match(TURN))
      if (turns.every(Boolean)) push({ kind: 'dialogue', turns: turns.map(t => ({ who: t![1], text: t![2] })) })
      else push({ kind: 'quote', text: group.join(' ') })
      continue
    }
    if (line.startsWith('|')) {
      flush()
      const group = run(i, l => l.trim().startsWith('|'))
      i += group.length
      const cells = group
        .filter(g => !/^\|[\s|:-]+\|$/.test(g.trim()))
        .map(g => g.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      push({ kind: 'table', head: cells[0] ?? [], rows: cells.slice(1) })
      continue
    }
    if (/^\d+\.\s/.test(line)) {
      flush()
      const group = run(i, l => /^\d+\.\s/.test(l.trim()))
      i += group.length
      push({ kind: 'ol', start: Number(line.match(/^(\d+)/)![1]), items: group.map(g => g.trim().replace(/^\d+\.\s/, '')) })
      continue
    }
    if (line.startsWith('- ')) {
      flush()
      const group = run(i, l => l.trim().startsWith('- '))
      i += group.length
      const items = group.map(g => g.trim().slice(2))
      push(items.every(it => QUOTED.test(it)) ? { kind: 'say', items } : { kind: 'ul', items })
      continue
    }
    if (line.startsWith('Not helpful:') && lines[i + 1]?.trim().startsWith('Helpful:')) {
      flush()
      push({ kind: 'compare', bad: line.slice('Not helpful:'.length).trim(), good: lines[i + 1].trim().slice('Helpful:'.length).trim() })
      i += 2
      continue
    }
    const sub = line.match(SUB)
    if (sub) { flush(); push({ kind: 'sub', text: sub[1].replace(/:$/, '') }); i++; continue }

    para.push(line)
    i++
  }
  flush()
  return blocks
}

/** **bold** inside a line. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  )
}

function stripQuotes(s: string) {
  return s.replace(/^["“]/, '').replace(/["”]$/, '')
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'p':
      return <p className="edu-p"><Inline text={b.text} /></p>
    case 'sub':
      return <h3 className="edu-sub">{b.text}</h3>
    case 'terms':
      return (
        <div className={`edu-terms ${b.items.length > 1 ? 'edu-terms-grid' : ''}`}>
          {b.items.map(t => (
            <div key={t.term} className="edu-term">
              <div className="edu-term-name">{t.term}</div>
              <div className="edu-term-text">
                {QUOTED.test(t.text) ? <span className="edu-term-say">“{stripQuotes(t.text)}”</span> : <Inline text={t.text} />}
              </div>
            </div>
          ))}
        </div>
      )
    case 'ul':
      return <ul className="edu-ul">{b.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}</ul>
    case 'ol':
      return (
        <ol className="edu-ol">
          {b.items.map((it, i) => (
            <li key={i}><span className="edu-ol-n">{b.start + i}</span><span><Inline text={it} /></span></li>
          ))}
        </ol>
      )
    case 'say':
      return (
        <div className="edu-say" role="group" aria-label={b.examples ? 'Examples' : 'What to say'}>
          <div className="edu-say-label">{b.examples ? 'Examples' : 'What to say'}</div>
          {b.items.map((it, i) => <p key={i} className={`edu-bubble ${b.examples ? 'edu-bubble-example' : ''}`}>{stripQuotes(it)}</p>)}
        </div>
      )
    case 'dialogue': {
      const first = b.turns[0]?.who
      return (
        <div className="edu-dialogue" role="group" aria-label="Example conversation">
          {b.turns.map((t, i) => (
            <div key={i} className={`edu-turn ${t.who === first ? 'edu-turn-a' : 'edu-turn-b'}`}>
              <span className="edu-turn-who">{t.who}</span>
              <p className="edu-turn-text">{stripQuotes(t.text)}</p>
            </div>
          ))}
        </div>
      )
    }
    case 'quote':
      return <blockquote className="edu-quote"><Inline text={stripQuotes(b.text)} /></blockquote>
    case 'table':
      return (
        <div className="edu-table-wrap">
          <table className="edu-table">
            <thead><tr>{b.head.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Inline text={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    case 'compare':
      return (
        <div className="edu-compare">
          <div className="edu-compare-bad"><span>Not helpful</span><Inline text={b.bad} /></div>
          <div className="edu-compare-good"><span>Helpful</span><Inline text={b.good} /></div>
        </div>
      )
  }
}

/** A section's text, with its diagram placed after the opening paragraph. */
export default function Prose({ content, figure }: { content: string; figure?: ReactNode }) {
  const blocks = parse(content)
  return (
    <div className="edu-prose">
      {blocks.map((b, i) => (
        <Fragment key={i}>
          <BlockView b={b} />
          {i === 0 && figure}
        </Fragment>
      ))}
      {blocks.length === 0 && figure}
    </div>
  )
}
