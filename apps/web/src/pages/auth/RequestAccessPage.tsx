import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import FloatLogo from '../../components/ui/FloatLogo'
import { btn } from '../../components/ui/buttons'
import { ERROR_BOX, Field, INPUT, SECTION_NOTE, errorMessage } from '../../components/ui/form'

/**
 * Request access: how a practice asks to use Float. Public.
 *
 * The confirmation is the same whatever happens on the server, including when the email already
 * has an account, so the form cannot be used to find out who uses Float.
 * docs/plans/clinician-practice-onboarding.md, step 1.
 */
export default function RequestAccessPage() {
  const [form, setForm] = useState({
    name: '', email: '', role: 'clinician' as 'clinician' | 'practice_manager', credentials: '',
    practice_name: '', state: '', practice_size: '1',
  })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const size = Number(form.practice_size)
  const ready = form.name.trim() && form.email.trim() && form.practice_name.trim() && form.state.trim() && size >= 1

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      await apiClient.post('/access-requests', {
        ...form,
        credentials: form.role === 'clinician' ? form.credentials.trim() || null : null,
        practice_size: size,
      })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not send your request. Check the email address and try again.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-12" style={{ background: 'var(--float-bg)' }}>
      <div className="w-full" style={{
        maxWidth: '520px', background: 'var(--float-surface)', borderRadius: 'var(--float-radius-lg)',
        boxShadow: 'var(--float-shadow-md)', padding: '40px',
      }}>
        <div className="flex flex-col items-center" style={{ marginBottom: '28px' }}>
          <FloatLogo size="lg" />
        </div>

        {sent ? (
          <div>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 10px' }}>
              Thanks, we&rsquo;ve got your request
            </p>
            <p style={SECTION_NOTE}>
              When your practice is approved, we&rsquo;ll email {form.email} a link to set up your account.
            </p>
            <p style={{ ...SECTION_NOTE, marginTop: '20px' }}>
              <Link to="/login" style={{ color: 'var(--float-primary)', fontWeight: 500 }}>&larr; Back to sign in</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }}>
              Request access for your practice
            </p>
            <p style={SECTION_NOTE}>
              Float is used by clinicians treating children&rsquo;s anxiety. Tell us about your practice and
              we&rsquo;ll be in touch.
            </p>
            {error && <div style={ERROR_BOX}>{error}</div>}

            <div style={{ display: 'grid', gap: '14px', marginTop: '20px' }}>
              <Field label="Your name">
                <input value={form.name} onChange={set('name')} style={INPUT} required />
              </Field>
              <Field label="Your work email">
                <input type="email" value={form.email} onChange={set('email')} style={INPUT} required />
              </Field>
              <Field label="Your role">
                <select value={form.role} onChange={set('role')} style={INPUT}>
                  <option value="clinician">Clinician</option>
                  <option value="practice_manager">Office manager (not a clinician)</option>
                </select>
              </Field>
              {form.role === 'clinician' && (
                <Field label="Credentials" hint="Optional. For example PsyD, or LCSW.">
                  <input value={form.credentials} onChange={set('credentials')} style={INPUT} />
                </Field>
              )}
              <Field label="Practice name">
                <input value={form.practice_name} onChange={set('practice_name')} style={INPUT} required />
              </Field>
              <Field label="State" hint="For example CA.">
                <input value={form.state} onChange={set('state')} style={INPUT} required />
              </Field>
              <Field label="Roughly how many clinicians?">
                <input type="number" min={1} value={form.practice_size} onChange={set('practice_size')} style={INPUT} required />
              </Field>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
              <button type="submit" disabled={!ready || sending} style={btn('primary', 'md')}>
                {sending ? 'Sending…' : 'Request access'}
              </button>
              <Link to="/login" style={{ fontSize: '13px', color: 'var(--float-text-secondary)' }}>Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
