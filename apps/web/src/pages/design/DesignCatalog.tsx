/**
 * The living reference for the design system. Every token and every primitive, in one place, so a
 * new screen is built from here and a framework change is reviewed here. Dev-only route: /__design.
 * docs/plans/design-system.md
 */
import { useState } from 'react'
import { Button, Card, Badge, Field, TextInput, Select, Textarea, Tabs, Modal, type BadgeTone } from '../../components/ui/primitives'
import { chip, iconBtn, type ButtonKind } from '../../components/ui/buttons'

const COLORS = [
  ['--float-primary', 'primary'], ['--float-primary-dark', 'primary-dark'], ['--float-primary-light', 'primary-light'],
  ['--float-text', 'text'], ['--float-text-secondary', 'text-secondary'], ['--float-text-hint', 'text-hint'],
  ['--float-bg', 'bg'], ['--float-surface', 'surface'], ['--float-surface-muted', 'surface-muted'], ['--float-surface-sunken', 'surface-sunken'],
  ['--float-border', 'border'], ['--float-border-strong', 'border-strong'],
  ['--float-success', 'success'], ['--float-warning', 'warning'], ['--float-danger', 'danger'], ['--float-info', 'info'],
]
const FONTS = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']
const RADII = [['--float-radius-sm', 'sm'], ['--float-radius', 'md'], ['--float-radius-lg', 'lg']]
const KINDS: ButtonKind[] = ['primary', 'secondary', 'on', 'quiet', 'danger']
const TONES: BadgeTone[] = ['neutral', 'primary', 'success', 'warning', 'danger']

const H2: React.CSSProperties = { fontSize: '18px', fontWeight: 600, color: 'var(--float-text)', margin: '28px 0 12px', borderBottom: '1px solid var(--float-border)', paddingBottom: '6px' }
const label: React.CSSProperties = { fontSize: '12px', color: 'var(--float-text-hint)', fontFamily: 'monospace' }

export default function DesignCatalog() {
  const [tab, setTab] = useState('experiments')
  const [modal, setModal] = useState(false)
  return (
    <div className="float-app" style={{ background: 'var(--float-bg)', minHeight: '100vh', padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }}>Design catalog</h1>
      <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '4px 0 0' }}>
        The single source: every token and primitive. Change one here, it changes everywhere.
      </p>

      <div style={H2}>Colors</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
        {COLORS.map(([v, name]) => (
          <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 28, height: 28, borderRadius: 6, background: `var(${v})`, border: '1px solid var(--float-border)', flexShrink: 0 }} />
            <span style={label}>{name}</span>
          </div>
        ))}
      </div>

      <div style={H2}>Type scale</div>
      {FONTS.map(f => (
        <div key={f} style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
          <span style={{ ...label, width: 40 }}>{f}</span>
          <span style={{ fontSize: `var(--float-font-${f})`, color: 'var(--float-text)' }}>The quick brown fox</span>
        </div>
      ))}

      <div style={H2}>Radius</div>
      <div style={{ display: 'flex', gap: '16px' }}>
        {RADII.map(([v, name]) => (
          <div key={v} style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 40, background: 'var(--float-primary-light)', border: '1px solid var(--float-primary)', borderRadius: `var(${v})` }} />
            <span style={label}>{name}</span>
          </div>
        ))}
      </div>

      <div style={H2}>Buttons</div>
      {(['md', 'sm', 'lg'] as const).map(size => (
        <div key={size} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ ...label, width: 24 }}>{size}</span>
          {KINDS.map(k => <Button key={k} kind={k} size={size}>{k}</Button>)}
        </div>
      ))}

      <div style={H2}>Chips (on / off)</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button style={chip(true)}>Selected</button>
        <button style={chip(false)}>Not selected</button>
        <button style={iconBtn()}>+</button>
        <button style={iconBtn()}>&times;</button>
      </div>

      <div style={H2}>Badges</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {TONES.map(t => <Badge key={t} tone={t}>{t}</Badge>)}
      </div>

      <div style={H2}>Form controls</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 360 }}>
        <Field label="Text input" hint="A short hint."><TextInput block placeholder="Type here" /></Field>
        <Field label="Select"><Select block><option>One</option><option>Two</option></Select></Field>
        <Field label="Textarea" error="This field has an error."><Textarea block rows={3} placeholder="Longer text" /></Field>
      </div>

      <div style={H2}>Card</div>
      <Card style={{ maxWidth: 360 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)' }}>Card title</div>
        <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '4px 0 0' }}>A white card with the standard border, radius and shadow.</p>
      </Card>

      <div style={H2}>Tabs</div>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'experiments', label: 'Experiments' },
        { id: 'weekly', label: 'Weekly' },
        { id: 'chat', label: 'Chat', count: 3 },
      ]} />

      <div style={H2}>Modal</div>
      <Button kind="primary" onClick={() => setModal(true)}>Open modal</Button>
      <Modal open={modal} onClose={() => setModal(false)} title="Example modal">
        <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: 0 }}>One dialog for the whole app: dimmed backdrop, centred panel, closes on backdrop click.</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button kind="quiet" onClick={() => setModal(false)}>Cancel</Button>
          <Button kind="primary" onClick={() => setModal(false)}>Confirm</Button>
        </div>
      </Modal>

      <div style={{ height: 48 }} />
    </div>
  )
}
