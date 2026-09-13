import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Prose, { parse } from './Prose'
import { clinicianModules } from '../../data/education'

describe('setting the Education text', () => {
  it('turns the content file’s formatting into real elements', () => {
    const blocks = parse(`**How to gather the information:**
- Start with the monitoring worksheet
- Ask the parent directly

1. It makes it manageable
2. It keeps it gradual

**Facilitated avoidance** — the parent helps the child avoid it.

**Providing reassurance** — answering anxious questions.

- "What you have been doing makes complete sense."
- "We will build a gradual plan."

> **Clinician:** "What are you afraid would happen?"
> **Maya:** "They'd stare at me"

| Behavior | DT for refraining |
|---|---|
| Eating without headphones in | 3 |

Not helpful: Rung 1: "Sit in cafeteria"
Helpful: Rung 1: "Sit at end of cafeteria table"`)

    expect(blocks.map(b => b.kind)).toEqual(['sub', 'ul', 'ol', 'terms', 'say', 'dialogue', 'table', 'compare'])
    expect(blocks[3]).toMatchObject({ items: [{ term: 'Facilitated avoidance' }, { term: 'Providing reassurance' }] })
    expect(blocks[5]).toMatchObject({ turns: [{ who: 'Clinician' }, { who: 'Maya' }] })
    expect(blocks[6]).toMatchObject({ head: ['Behavior', 'DT for refraining'], rows: [['Eating without headphones in', '3']] })
  })

  it('quoted feared outcomes are examples, not a script to say', () => {
    const blocks = parse('Common core feared outcomes include:\n- "I will get sick and die"\n- "I will lose control completely"')
    expect(blocks[1]).toMatchObject({ kind: 'say', examples: true })
    expect(parse('Frame it clearly:\n- "Any loving parent would do the same."')[1]).toMatchObject({ kind: 'say' })
    expect(parse('Frame it clearly:\n- "Any loving parent would do the same."')[1]).not.toHaveProperty('examples', true)
  })

  it('renders no raw markup, and puts the diagram after the opening paragraph', () => {
    const { container } = render(<Prose content={'First **bold** paragraph.\n\nSecond paragraph.'} figure={<div>THE FIGURE</div>} />)
    expect(container.innerHTML).not.toContain('**')
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    const text = container.textContent ?? ''
    expect(text.indexOf('THE FIGURE')).toBeGreaterThan(text.indexOf('First'))
    expect(text.indexOf('THE FIGURE')).toBeLessThan(text.indexOf('Second'))
  })

  it('every module’s text and answers set without leftover markup', () => {
    for (const m of clinicianModules) {
      const texts = [...m.sections.map(s => s.content), m.exercise?.vignette ?? '', m.exercise?.modelAnswer ?? '']
      for (const t of texts) {
        const { container, unmount } = render(<Prose content={t} />)
        expect(container.textContent, m.id).not.toMatch(/\*\*|^> |\|---/m)
        unmount()
      }
    }
  })
})
