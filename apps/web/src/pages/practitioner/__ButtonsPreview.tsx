/**
 * Dev only: every button style in one place, plus the rows they are used in, so a change can be
 * looked at without signing in. components/ui/buttons.ts is the source.
 */
import { btn, buttonRow, countPill, liveDot, statusCard, statusCardState, statusCardTitle } from '../../components/ui/buttons'

const section: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-lg)',
  padding: '20px 24px', marginBottom: '18px',
}
const cap: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--float-text-hint)', marginBottom: '12px',
}

export default function ButtonsPreview() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)', padding: '28px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--float-text)', margin: '0 0 6px' }}>Buttons</h1>
        <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 20px' }}>
          Five kinds, two sizes. Same height, same radius, same type size everywhere.
        </p>

        <div style={section}>
          <div style={cap}>The five kinds</div>
          <div style={buttonRow}>
            <button style={btn('primary')}>Save</button>
            <button style={btn('secondary')}>Edit profile</button>
            <button style={btn('on')}>Clinician access</button>
            <button style={btn('quiet')}>Cancel</button>
            <button style={btn('danger')}>Delete</button>
          </div>
          <div style={{ ...buttonRow, marginTop: '14px' }}>
            <button style={btn('primary', 'sm')}>+ Add note</button>
            <button style={btn('secondary', 'sm')}>Edit</button>
            <button style={btn('on', 'sm')}>Open</button>
            <button style={btn('quiet', 'sm')}>Cancel</button>
            <button style={btn('danger', 'sm')}>Delete</button>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--float-text-secondary)', margin: '14px 0 0', lineHeight: 1.6 }}>
            <strong>Save</strong> is the one action a screen is for. <strong>Edit profile</strong> is always
            available. <strong>Clinician access</strong> is the same button with its panel open.
            <strong> Cancel</strong> walks away. <strong>Delete</strong> removes something.
          </p>
        </div>

        <div style={section}>
          <div style={cap}>The patient page header</div>
          <div style={buttonRow}>
            <button style={statusCard(false)}>
              <span style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#22c55e', flexShrink: 0 }} />
              <span>
                <span style={statusCardTitle}>Teen access</span>
                <span style={statusCardState}>Set up</span>
              </span>
            </button>
            <button style={statusCard(false)}>
              <span style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#cbd5e1', flexShrink: 0 }} />
              <span>
                <span style={statusCardTitle}>Parent access</span>
                <span style={statusCardState}>Not set up</span>
              </span>
            </button>
            <span aria-hidden="true" style={{ width: '1px', height: '24px', background: 'var(--float-border)' }} />
            <button style={btn('secondary')}>Edit profile</button>
            <button style={btn('secondary')}>Clinician access</button>
            <button style={btn('secondary')}>Close treatment</button>
            <button style={btn('secondary')}>Process <span style={countPill(false)}>0/28</span></button>
          </div>
        </div>

        <div style={section}>
          <div style={cap}>Session notes</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>Session notes</span>
            <div style={buttonRow}>
              <button style={btn('secondary', 'sm')}><span aria-hidden="true" style={liveDot} />Record session</button>
              <button style={btn('primary', 'sm')}>+ Add note</button>
            </div>
          </div>
          <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: '#475569' }}>Patient · Initial · Sep 15</span>
              <div style={buttonRow}>
                <button style={btn('secondary', 'sm')}>Edit</button>
                <button style={btn('danger', 'sm')}>Delete</button>
              </div>
            </div>
            <p style={{ fontSize: '12.5px', color: '#475569', margin: '8px 0 0' }}>
              What was covered — an introductory session with George…
            </p>
            <div style={{ ...buttonRow, marginTop: '10px' }}>
              <button style={btn('secondary', 'sm')}>Transcript</button>
              <button style={btn('primary', 'sm')}>Approve note</button>
            </div>
          </div>
          <div style={{ ...buttonRow, marginTop: '16px' }}>
            <button style={btn('primary')}>Update and approve</button>
            <button style={btn('quiet')}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
