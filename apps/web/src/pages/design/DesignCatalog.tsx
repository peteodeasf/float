/**
 * The living reference for the app's look: every colour, size, and building block, in one place, in
 * plain words. A new screen is built from here; a look change is reviewed here. Dev-only: /__design.
 * docs/plans/design-system.md
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
  ['--float-primary', 'Brand green'], ['--float-primary-dark', 'Brand green (dark)'],
  ['--float-primary-mid', 'Mint accent'], ['--float-primary-light', 'Brand tint'],
  ['--float-text-strong', 'Headings'], ['--float-text', 'Main text'],
  ['--float-text-secondary', 'Secondary text'], ['--float-text-hint', 'Hint text (never body)'],
  ['--float-bg', 'Page background'], ['--float-surface', 'Card / white'], ['--float-surface-sunken', 'Sunken panel'],
  ['--float-border', 'Hairline border'], ['--float-border-strong', 'Strong border'],
  ['--float-success', 'Success (green)'], ['--float-warning', 'Warning (amber)'], ['--float-danger', 'Danger (red)'],
]
const TEXT_ROLES: [string, string][] = [
  ['12px', 'Caption'], ['14px', 'Body'], ['16px', 'Subhead'], ['20px', 'Section heading'], ['24px', 'Page title'],
]
const CORNERS: [string, string][] = [
  ['--float-radius-control', 'Buttons and input boxes'], ['--float-radius-card', 'Cards and pop-ups'], ['--float-radius-pill', 'Small labels'],
]
const SPACES = ['4px', '8px', '12px', '16px', '24px', '32px', '48px']
const KINDS: ButtonKind[] = ['primary', 'secondary', 'on', 'quiet', 'danger']
const PURPOSE: Record<ButtonKind, string> = { primary: 'Main action', secondary: 'Available', on: 'Open', quiet: 'Cancel', danger: 'Delete' }
const SIZES: [import('../../components/ui/buttons').ButtonSize, string][] = [['md', 'Normal'], ['sm', 'Small'], ['lg', 'Large']]
const TONES: BadgeTone[] = ['neutral', 'primary', 'success', 'warning', 'danger']
const BANNERS: BannerTone[] = ['info', 'success', 'warning', 'danger']

const SECTIONS: [string, string][] = [
  ['colors', 'Colours'], ['text', 'Text sizes'], ['corners', 'Corners'], ['shadows', 'Shadows'],
  ['spacing', 'Spacing'], ['buttons', 'Buttons'], ['small', 'Small buttons and counts'],
  ['choices', 'Choices'], ['status', 'Status labels'], ['tabs', 'Tabs'], ['tags', 'Tags'],
  ['messages', 'Messages'], ['fields', 'Form fields'], ['cards', 'Cards'], ['empty', 'Nothing to show'],
  ['popup', 'Pop-up'],
]

const cap: React.CSSProperties = { fontSize: '12px', color: 'var(--float-text-secondary)', marginTop: '5px', display: 'block', lineHeight: 1.3 }
const H2_STYLE: React.CSSProperties = { fontSize: '18px', fontWeight: 600, color: 'var(--float-text)', margin: '30px 0 12px', borderBottom: '1px solid var(--float-border)', paddingBottom: '6px' }
const row: React.CSSProperties = { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }

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
      <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }}>The app's look</h1>
      <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '4px 0 0' }}>
        Every colour, size, and building block the app uses, in one place. Change one here and it
        updates on every screen.
      </p>

      <nav style={{ ...row, gap: '6px', marginTop: '16px', padding: '12px', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)' }}>
        {SECTIONS.map(([id, title]) => (
          <a key={id} href={`#${id}`} style={{ fontSize: '12px', color: 'var(--float-primary)', background: 'var(--float-primary-light)', padding: '3px 9px', borderRadius: '999px', textDecoration: 'none' }}>{title}</a>
        ))}
      </nav>

      <Section id="colors" title="Colours">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px' }}>
          {COLORS.map(([v, name]) => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: `var(${v})`, border: '1px solid var(--float-border)', flexShrink: 0 }} />
              <span style={{ fontSize: '12.5px', color: 'var(--float-text)' }}>{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="text" title="Text sizes">
        {TEXT_ROLES.map(([size, name]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: '8px' }}>
            <span style={{ ...cap, width: 120, marginTop: 0 }}>{name} · {size}</span>
            <span style={{ fontSize: size, fontWeight: name === 'Body' || name === 'Caption' ? 400 : 600, color: 'var(--float-text)' }}>The quick brown fox</span>
          </div>
        ))}
      </Section>

      <Section id="corners" title="Corners">
        <div style={row}>
          {CORNERS.map(([v, name]) => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div style={{ width: 96, height: 46, background: 'var(--float-surface-sunken)', border: '1px solid var(--float-border-strong)', borderRadius: `var(${v})` }} />
              <span style={cap}>{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="shadows" title="Shadows">
        <div style={{ ...row, gap: '20px' }}>
          <div style={{ textAlign: 'center' }}><div style={{ width: 110, height: 52, background: '#fff', borderRadius: 'var(--float-radius-card)', boxShadow: 'var(--float-shadow)' }} /><span style={cap}>Resting — cards</span></div>
          <div style={{ textAlign: 'center' }}><div style={{ width: 110, height: 52, background: '#fff', borderRadius: 'var(--float-radius-card)', boxShadow: 'var(--float-shadow-md)' }} /><span style={cap}>Floating — pop-ups</span></div>
        </div>
      </Section>

      <Section id="spacing" title="Spacing">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
          {SPACES.map(s => (
            <div key={s} style={{ textAlign: 'center' }}>
              <div style={{ width: s, height: s, background: 'var(--float-primary)', borderRadius: 2 }} />
              <span style={cap}>{s}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        {SIZES.map(([size, sizeName]) => (
          <div key={size} style={{ ...row, marginBottom: '10px' }}>
            <span style={{ ...cap, width: 56, marginTop: 0 }}>{sizeName}</span>
            {KINDS.map(k => <Button key={k} kind={k} size={size}>{PURPOSE[k]}</Button>)}
          </div>
        ))}
        <div style={row}>
          <Button kind="secondary"><span aria-hidden style={liveDot} />Record session</Button>
          <Button kind="primary">Process <span style={countPill(false)}>0/28</span></Button>
        </div>
      </Section>

      <Section id="small" title="Small buttons and counts">
        <div style={row}>
          <button style={iconBtn('sm')}>+</button>
          <button style={iconBtn('md')}>&minus;</button>
          <button style={iconBtn('sm')}>&times;</button>
          <span style={countPill(true)}>3</span>
          <span style={countPill(false)}>12</span>
        </div>
      </Section>

      <Section id="choices" title="Choices (tap to turn on or off)">
        <div style={row}>
          <button style={chip(true)}>Chosen</button>
          <button style={chip(false)}>Not chosen</button>
        </div>
      </Section>

      <Section id="status" title="Status labels (state plus a name)">
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

      <Section id="tags" title="Tags (a small status word)">
        <div style={row}>{TONES.map(t => <Badge key={t} tone={t}>{t}</Badge>)}</div>
      </Section>

      <Section id="messages" title="Messages (a note in the page)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: 460 }}>
          {BANNERS.map(t => <Banner key={t} tone={t}>This is a {t} message.</Banner>)}
        </div>
      </Section>

      <Section id="fields" title="Form fields">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 360 }}>
          <Field label="Text box" hint="A short hint."><TextInput block placeholder="Type here" /></Field>
          <Field label="Dropdown"><Select block><option>One</option><option>Two</option></Select></Field>
          <Field label="Long text" error="This field has an error."><Textarea block rows={3} placeholder="Longer text" /></Field>
          <Field label="Date"><TextInput block type="date" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--float-text)' }}><input type="checkbox" defaultChecked /> Tick box</label>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--float-text)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="radio" name="demo" defaultChecked /> Option A</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="radio" name="demo" /> Option B</label>
          </div>
        </div>
      </Section>

      <Section id="cards" title="Cards">
        <Card style={{ maxWidth: 360 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)' }}>Card title</div>
          <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '4px 0 0' }}>A white card with the standard border, corners and shadow.</p>
        </Card>
      </Section>

      <Section id="empty" title="Nothing to show">
        <Card pad="lg" style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text-secondary)' }}>Nothing here yet</div>
          <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '4px 0 12px' }}>Add the first item to get started.</p>
          <Button kind="primary" size="sm">Add item</Button>
        </Card>
      </Section>

      <Section id="popup" title="Pop-up">
        <Button kind="primary" onClick={() => setModal(true)}>Open pop-up</Button>
        <Modal open={modal} onClose={() => setModal(false)} title="Example pop-up">
          <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: 0 }}>One pop-up for the whole app: dimmed background, centred panel, closes when you click outside.</p>
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
