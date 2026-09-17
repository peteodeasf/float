/**
 * The living reference for the design system: every token and every UI element the clinician and
 * admin apps use, in one place. A new screen is built from here; a framework change is reviewed
 * here. Dev-only route: /__design. docs/plans/design-system.md
 */
import { useState } from 'react'
import {
  Button, Card, Badge, Banner, Field, TextInput, Select, Textarea, Tabs, Modal,
  type BadgeTone, type BannerTone,
} from '../../components/ui/primitives'
import {
  chip, iconBtn, countPill, liveDot, statusCard, statusCardTitle, statusCardState,
  type ButtonKind,
} from '../../components/ui/buttons'

const COLORS: [string, string][] = [
  ['--float-primary', 'primary'], ['--float-primary-dark', 'primary-dark'],
  ['--float-primary-mid', 'primary-mid'], ['--float-primary-light', 'primary-light'],
  ['--float-text', 'text'], ['--float-text-secondary', 'text-secondary'], ['--float-text-hint', 'text-hint'],
  ['--float-bg', 'bg'], ['--float-surface', 'surface'], ['--float-surface-muted', 'surface-muted'], ['--float-surface-sunken', 'surface-sunken'],
  ['--float-border', 'border'], ['--float-border-strong', 'border-strong'],
  ['--float-success', 'success'], ['--float-warning', 'warning'], ['--float-danger', 'danger'], ['--float-info', 'info'],
]
const FONTS = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']
const RADII: [string, string][] = [['--float-radius-sm', 'sm'], ['--float-radius', 'md'], ['--float-radius-lg', 'lg']]
const SHADOWS: [string, string][] = [['--float-shadow', 'shadow'], ['--float-shadow-md', 'shadow-md']]
const SPACES = ['1', '2', '3', '4', '5', '6', '8']
const KINDS: ButtonKind[] = ['primary', 'secondary', 'on', 'quiet', 'danger']
const TONES: BadgeTone[] = ['neutral', 'primary', 'success', 'warning', 'danger']
const BANNERS: BannerTone[] = ['info', 'success', 'warning', 'danger']

const SECTIONS: [string, string][] = [
  ['colors', 'Colors'], ['type', 'Type scale'], ['radius', 'Radius'], ['shadow', 'Shadows'],
  ['spacing', 'Spacing'], ['buttons', 'Buttons'], ['icons', 'Icon buttons & counts'],
  ['chips', 'Chips'], ['status', 'Status cards'], ['tabs', 'Tabs'], ['badges', 'Badges'],
  ['banners', 'Banners'], ['forms', 'Form controls'], ['card', 'Card'], ['empty', 'Empty state'],
  ['modal', 'Modal'],
]

const label: React.CSSProperties = { fontSize: '12px', color: 'var(--float-text-hint)', fontFamily: 'monospace' }
const H2_STYLE: React.CSSProperties = { fontSize: '18px', fontWeight: 600, color: 'var(--float-text)', margin: '30px 0 12px', borderBottom: '1px solid var(--float-border)', paddingBottom: '6px' }
const row: React.CSSProperties = { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: '12px' }}>
      <div style={H2_STYLE}>{title}</div>
      {children}
    </section>
  )
}

export default function DesignCatalog() {
  const [tabValue, setTabValue] = useState('experiments')
  const [modal, setModal] = useState(false)
  return (
    <div className="float-app" style={{ background: 'var(--float-bg)', minHeight: '100vh', padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }}>Design catalog</h1>
      <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '4px 0 0' }}>
        Every colour, size, and building block the app uses, in one place. Change one here and it
        updates on every screen.
      </p>

      {/* Contents — so the full scope is visible without scrolling. */}
      <nav style={{ ...row, gap: '6px', marginTop: '16px', padding: '12px', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius)' }}>
        {SECTIONS.map(([id, title]) => (
          <a key={id} href={`#${id}`} style={{ fontSize: '12px', color: 'var(--float-primary)', background: 'var(--float-primary-light)', padding: '3px 9px', borderRadius: '999px', textDecoration: 'none' }}>{title}</a>
        ))}
      </nav>

      <Section id="colors" title="Colors">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
          {COLORS.map(([v, name]) => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 28, height: 28, borderRadius: 6, background: `var(${v})`, border: '1px solid var(--float-border)', flexShrink: 0 }} />
              <span style={label}>{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Type scale">
        {FONTS.map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
            <span style={{ ...label, width: 40 }}>{f}</span>
            <span style={{ fontSize: `var(--float-font-${f})`, color: 'var(--float-text)' }}>The quick brown fox</span>
          </div>
        ))}
      </Section>

      <Section id="radius" title="Radius">
        <div style={row}>
          {RADII.map(([v, name]) => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 40, background: 'var(--float-primary-light)', border: '1px solid var(--float-primary)', borderRadius: `var(${v})` }} />
              <span style={label}>{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="shadow" title="Shadows">
        <div style={{ ...row, gap: '20px' }}>
          {SHADOWS.map(([v, name]) => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div style={{ width: 80, height: 48, background: 'var(--float-surface)', borderRadius: 'var(--float-radius)', boxShadow: `var(${v})` }} />
              <span style={label}>{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="spacing" title="Spacing">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
          {SPACES.map(s => (
            <div key={s} style={{ textAlign: 'center' }}>
              <div style={{ width: `var(--float-space-${s})`, height: `var(--float-space-${s})`, background: 'var(--float-primary)', borderRadius: 2 }} />
              <span style={label}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        {(['md', 'sm', 'lg'] as const).map(size => (
          <div key={size} style={{ ...row, marginBottom: '10px' }}>
            <span style={{ ...label, width: 24 }}>{size}</span>
            {KINDS.map(k => <Button key={k} kind={k} size={size}>{k}</Button>)}
          </div>
        ))}
        <div style={row}>
          <Button kind="secondary"><span aria-hidden style={liveDot} />Record session</Button>
          <Button kind="primary">Process <span style={countPill(false)}>0/28</span></Button>
        </div>
      </Section>

      <Section id="icons" title="Icon buttons & counts">
        <div style={row}>
          <button style={iconBtn('sm')}>+</button>
          <button style={iconBtn('md')}>&minus;</button>
          <button style={iconBtn('sm')}>&times;</button>
          <span style={countPill(true)}>3</span>
          <span style={countPill(false)}>12</span>
        </div>
      </Section>

      <Section id="chips" title="Chips (a choice, on / off)">
        <div style={row}>
          <button style={chip(true)}>Selected</button>
          <button style={chip(false)}>Not selected</button>
          <button style={chip(true, 'md')}>Selected (md)</button>
          <button style={chip(false, 'md')}>Not selected (md)</button>
        </div>
      </Section>

      <Section id="status" title="Status cards (state + label)">
        <div style={row}>
          <button style={statusCard(true)}>
            <span><span style={statusCardTitle}>Child access</span><span style={statusCardState}>Connected</span></span>
          </button>
          <button style={statusCard(false)}>
            <span><span style={statusCardTitle}>Parent access</span><span style={statusCardState}>Not invited</span></span>
          </button>
        </div>
      </Section>

      <Section id="tabs" title="Tabs">
        <Tabs value={tabValue} onChange={setTabValue} items={[
          { id: 'experiments', label: 'Experiments' },
          { id: 'weekly', label: 'Weekly' },
          { id: 'chat', label: 'Chat', count: 3 },
        ]} />
      </Section>

      <Section id="badges" title="Badges (a status label)">
        <div style={row}>{TONES.map(t => <Badge key={t} tone={t}>{t}</Badge>)}</div>
      </Section>

      <Section id="banners" title="Banners (an inline message)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: 460 }}>
          {BANNERS.map(t => <Banner key={t} tone={t}>This is a {t} message.</Banner>)}
        </div>
      </Section>

      <Section id="forms" title="Form controls">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 360 }}>
          <Field label="Text input" hint="A short hint."><TextInput block placeholder="Type here" /></Field>
          <Field label="Select"><Select block><option>One</option><option>Two</option></Select></Field>
          <Field label="Textarea" error="This field has an error."><Textarea block rows={3} placeholder="Longer text" /></Field>
          <Field label="Date"><TextInput block type="date" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--float-text)' }}><input type="checkbox" defaultChecked /> Checkbox</label>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--float-text)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="radio" name="demo" defaultChecked /> Option A</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="radio" name="demo" /> Option B</label>
          </div>
        </div>
      </Section>

      <Section id="card" title="Card">
        <Card style={{ maxWidth: 360 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)' }}>Card title</div>
          <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '4px 0 0' }}>A white card with the standard border, radius and shadow.</p>
        </Card>
      </Section>

      <Section id="empty" title="Empty state">
        <Card pad="lg" style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text-secondary)' }}>Nothing here yet</div>
          <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '4px 0 12px' }}>Add the first item to get started.</p>
          <Button kind="primary" size="sm">Add item</Button>
        </Card>
      </Section>

      <Section id="modal" title="Modal">
        <Button kind="primary" onClick={() => setModal(true)}>Open modal</Button>
        <Modal open={modal} onClose={() => setModal(false)} title="Example modal">
          <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: 0 }}>One dialog for the whole app: dimmed backdrop, centred panel, closes on backdrop click.</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <Button kind="quiet" onClick={() => setModal(false)}>Cancel</Button>
            <Button kind="primary" onClick={() => setModal(false)}>Confirm</Button>
          </div>
        </Modal>
      </Section>

      <div style={{ height: 48 }} />
    </div>
  )
}
