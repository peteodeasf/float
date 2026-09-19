import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import JustSayIt, { MicIcon, NoteRow, captureApi, type CapturedNote } from './JustSayIt'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type Screen = 'welcome' | 'main' | 'capture'
type Tab = 'form' | 'observations'

interface Entry {
  id: string
  entry_date: string
  situation: string | null
  child_behavior_observed: string | null
  parent_response: string | null
  fear_thermometer: number | null
  is_draft: boolean
  parent_words?: string | null
  captured_by?: string
  /** Written up from something they said or typed. The parent sees their words instead. */
  note_id?: string | null
  created_at: string
}

interface FormData {
  id: string
  status: string
  patient_first_name: string | null
  practitioner_name: string | null
  voice_available?: boolean
  entries: Entry[]
  notes?: CapturedNote[]
}

export default function MonitorLandingPage() {
  const { token } = useParams<{ token: string }>()
  const [form, setForm] = useState<FormData | null>(null)
  const [screen, setScreen] = useState<Screen>('welcome')
  const [activeTab, setActiveTab] = useState<Tab>('form')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTips, setShowTips] = useState(false)
  const [showResend, setShowResend] = useState(false)
  const [resendValue, setResendValue] = useState('')
  const [bookmarkDismissed, setBookmarkDismissed] = useState(() => {
    try { return localStorage.getItem('float-monitor-tip') === 'dismissed' } catch { return false }
  })
  const [remindersOff, setRemindersOff] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [consentSaving, setConsentSaving] = useState(false)
  // Just say it: talking, or a quick note, instead of the four boxes. docs/plans/monitoring-just-say-it.md
  const [captureMode, setCaptureMode] = useState<'talk' | 'note'>('talk')
  const api = useMemo(() => captureApi(token ?? ''), [token])

  // Entry form state
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [situation, setSituation] = useState('')
  const [childBehavior, setChildBehavior] = useState('')
  const [parentResponse, setParentResponse] = useState('')
  const [fearThermometer, setFearThermometer] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchForm = async () => {
    try {
      // Where they live, for the evening email during the monitoring week.
      let tz: string | undefined
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { tz = undefined }
      const res = await axios.get(`${API_URL}/monitor/${token}`, { params: tz ? { tz } : {} })
      setForm(res.data)
      if (res.data.entries.length > 0 || res.data.notes?.length > 0) {
        // Returning parent: land on the tabbed view, showing what they've recorded.
        setScreen('main')
        setActiveTab('observations')
      }
      return res.data as FormData
    } catch {
      setError('This form link is not valid or has expired.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchForm()
  }, [token])

  // The off link in the evening email lands here with ?reminders=off.
  useEffect(() => {
    if (!token || new URLSearchParams(window.location.search).get('reminders') !== 'off') return
    axios.post(`${API_URL}/monitor/${token}/reminders-off`).then(() => setRemindersOff(true)).catch(() => {})
  }, [token])

  // A home screen icon should open this page, not Float's sign-in page. The app-wide manifest starts
  // at "/", so it is taken off while this page is open and the phone uses this page's address.
  // docs/plans/monitoring-just-say-it.md
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]')
    const parent = link?.parentNode ?? null
    const next = link?.nextSibling ?? null
    link?.remove()
    return () => { if (link && parent) parent.insertBefore(link, next) }
  }, [])

  const resetEntryForm = () => {
    setEditingEntry(null)
    setEntryDate(new Date().toISOString().split('T')[0])
    setSituation('')
    setChildBehavior('')
    setParentResponse('')
    setFearThermometer(null)
  }

  const handleAdd = () => {
    resetEntryForm()
    setActiveTab('form')
    setScreen('main')
  }

  const handleEdit = (entry: Entry) => {
    setEditingEntry(entry)
    setEntryDate(entry.entry_date)
    setSituation(entry.situation || '')
    setChildBehavior(entry.child_behavior_observed || '')
    setParentResponse(entry.parent_response || '')
    setFearThermometer(entry.fear_thermometer)
    setActiveTab('form')
    setScreen('main')
  }

  const handleSave = async (isDraft: boolean) => {
    setSaving(true)
    try {
      const payload = {
        entry_date: entryDate,
        situation: situation || null,
        child_behavior_observed: childBehavior || null,
        parent_response: parentResponse || null,
        fear_thermometer: fearThermometer,
        is_draft: isDraft
      }

      if (editingEntry) {
        await axios.put(`${API_URL}/monitor/${token}/entries/${editingEntry.id}`, payload)
      } else {
        await axios.post(`${API_URL}/monitor/${token}/entries`, payload)
      }

      await fetchForm()
      resetEntryForm()
      setScreen('main')
      setActiveTab('observations')
    } catch {
      alert('Something went wrong saving your observation. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const childName = form?.patient_first_name || 'your child'
  const practitionerName = form?.practitioner_name || 'Your clinician'
  // What they said or typed shows as their words; the observations Float wrote up from it are the
  // clinician's, so they are left out of this list.
  const notes = form?.notes ?? []
  const formEntries = form?.entries.filter(e => !e.note_id) ?? []
  const entryCount = notes.length + formEntries.filter(e => !e.is_draft).length
  const listItems = [
    ...notes.map(n => ({ kind: 'note' as const, date: n.entry_date, note: n })),
    ...formEntries.map(e => ({ kind: 'entry' as const, date: e.entry_date, entry: e })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true
  const homeTip = /iPhone|iPad|iPod/.test(navigator.userAgent)
    ? 'Add Float to your home screen: tap Share, then “Add to Home Screen”. Next time it’s one tap away.'
    : /Android/.test(navigator.userAgent)
      ? 'Add Float to your home screen from your browser’s menu. Next time it’s one tap away.'
      : 'Bookmark this page for easy access later'
  const dismissTip = () => {
    setBookmarkDismissed(true)
    try { localStorage.setItem('float-monitor-tip', 'dismissed') } catch { /* shown again next time */ }
  }
  const offBanner = remindersOff && (
    <div role="status" style={{ background: 'var(--float-surface-sunken)', borderRadius: 'var(--float-radius-card)', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: 'var(--float-text)' }}>
      You won't get the evening emails any more.
    </div>
  )
  const startCapture = (m: 'talk' | 'note') => {
    setCaptureMode(m)
    setScreen('capture')
  }

  if (loading) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>Loading...</div>
        </div>
      </Shell>
    )
  }

  if (error) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <p style={{ fontSize: '16px', color: 'var(--float-text-secondary)' }}>{error}</p>
        </div>
      </Shell>
    )
  }

  // ── Just say it ──
  if (screen === 'capture') {
    return (
      <JustSayIt
        mode={captureMode}
        childName={childName}
        api={api}
        onClose={async () => {
          await fetchForm()
          setScreen('main')
          setActiveTab('observations')
        }}
      />
    )
  }

  // ── Welcome screen ──
  if (screen === 'welcome') {
    return (
      <Shell>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          {offBanner}
          <p style={{ fontSize: '15px', color: 'var(--float-text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
            <strong>{practitionerName}</strong> has asked you to complete a monitoring form
            for {childName} before your first appointment.
          </p>
          <p style={{ fontSize: '15px', color: 'var(--float-text-secondary)', lineHeight: '1.6', marginBottom: '32px', textAlign: 'left' }}>
            Monitoring involves watching and observing the situations in which your child experiences anxiety and noting how you respond to your child in these situations. The purpose of monitoring is to accumulate data.
          </p>

          {/* Tips panel */}
          <div style={{
            background: 'var(--float-surface-muted)',
            borderRadius: '16px',
            border: '1px solid var(--float-border)',
            marginBottom: '32px',
            textAlign: 'left',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setShowTips(!showTips)}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--float-text)'
              }}
            >
              What information is gathered?
              <span style={{ fontSize: '18px', color: 'var(--float-text-hint)' }}>
                {showTips ? '\u2212' : '+'}
              </span>
            </button>
            {showTips && (
              <div style={{ padding: '0 20px 20px' }}>
                <p style={{ fontSize: '14px', color: 'var(--float-text-secondary)', lineHeight: '1.6', margin: 0 }}>
                  The information gathered using the Parent Monitoring Form includes the date, the situation, the behavior observed, your response as a parent, and your child's level of distress (as estimated by you) gauged on a scale from 1 to 10. 1 means little to no distress/anxiety. 10 signifies the highest level of distress/anxiety you have observed your child to experience in this type of situation.
                </p>
              </div>
            )}
          </div>

          {/* Consent to connect the child to the app (unblocks the clinician's teen invite) */}
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', textAlign: 'left', background: consentGiven ? 'var(--float-success-bg)' : 'var(--float-surface-muted)', border: '1px solid ' + (consentGiven ? 'var(--float-success-border)' : 'var(--float-border)'), borderRadius: '14px', padding: '14px 16px', marginBottom: '20px', cursor: consentGiven || consentSaving ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              checked={consentGiven}
              disabled={consentGiven || consentSaving}
              onChange={async () => {
                setConsentSaving(true)
                try { await axios.post(`${API_URL}/monitor/${token}/consent`, { granted: true }); setConsentGiven(true) }
                catch { /* leave unchecked so they can retry */ }
                finally { setConsentSaving(false) }
              }}
              style={{ marginTop: '3px', width: '18px', height: '18px', flexShrink: 0, accentColor: 'var(--float-primary)' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--float-text-secondary)', lineHeight: 1.5 }}>
              I give permission for {childName} to be connected to the Float app, so their clinician can invite them to sign in and use it as part of treatment.
              {consentGiven && <span style={{ display: 'block', color: 'var(--float-success)', fontWeight: 600, marginTop: '4px' }}>✓ Thank you — permission recorded.</span>}
            </span>
          </label>

          <button
            onClick={() => { setActiveTab('form'); setScreen('main') }}
            style={{ width: '100%', padding: '16px', background: 'var(--float-primary)', color: '#fff', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
          >
            Get started
          </button>
        </div>
      </Shell>
    )
  }

  // ── Home screen ──
  // ── Main: three tabs — Form / Tap & Talk / Observations ──
  if (screen === 'main') {
    const tabBtn = (label: React.ReactNode, active: boolean, onClick: () => void) => (
      <button
        onClick={onClick}
        aria-pressed={active}
        style={{
          flex: 1, font: 'inherit', fontSize: '14px', fontWeight: 700, padding: '13px 8px',
          border: 'none', background: 'none', cursor: 'pointer',
          color: active ? 'var(--float-primary)' : 'var(--float-text-secondary)',
          borderBottom: `2.5px solid ${active ? 'var(--float-primary)' : 'transparent'}`,
        }}
      >
        {label}
      </button>
    )
    const boxStyle = (border: string, bg: string): React.CSSProperties => ({
      width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: '15px',
      fontFamily: 'inherit', resize: 'none', color: 'var(--float-text)',
      border: '1px solid var(--float-border)', borderLeft: `4px solid ${border}`,
      borderRadius: 'var(--float-radius-card)', background: bg,
    })
    const flabel: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--float-text)', marginBottom: '6px' }
    return (
      <Shell wide>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--float-border)', background: 'var(--float-surface)' }}>
          {tabBtn('Form', activeTab === 'form', handleAdd)}
          {tabBtn(<span>🎤 Tap & Talk</span>, false, () => startCapture('talk'))}
          {tabBtn('Observations', activeTab === 'observations', () => setActiveTab('observations'))}
        </div>

        {activeTab === 'form' ? (
          <div style={{ padding: '18px 20px 24px' }}>
            {editingEntry && (
              <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '0 0 14px' }}>Editing an observation.</p>
            )}
            <div style={{ marginBottom: '18px' }}>
              <label style={flabel}>Fear level (1&ndash;10)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button key={n} onClick={() => setFearThermometer(n)}
                    style={{
                      minHeight: '44px', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                      border: fearThermometer === n ? '2px solid var(--float-primary)' : '1px solid var(--float-border)',
                      background: fearThermometer === n ? 'var(--float-primary-light)' : n >= 8 ? 'var(--float-danger-bg)' : n >= 5 ? 'var(--float-warning-bg)' : 'var(--float-success-bg)',
                      color: fearThermometer === n ? 'var(--float-primary)' : n >= 8 ? 'var(--float-danger)' : n >= 5 ? 'var(--float-warning)' : 'var(--float-success)',
                    }}>
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '11.5px', color: 'var(--float-text-hint)' }}>
                <span>Low distress</span><span>Extreme distress</span>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={flabel}>What was the situation?</label>
              <textarea value={situation} onChange={e => setSituation(e.target.value)} rows={2}
                placeholder={`e.g. Getting ready for school, hearing about a sick classmate`}
                style={boxStyle('var(--float-primary)', 'var(--float-primary-light)')} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={flabel}>What I observed about my child</label>
              <textarea value={childBehavior} onChange={e => setChildBehavior(e.target.value)} rows={3}
                placeholder={`What did ${childName} do or say? How did they seem?`}
                style={boxStyle('var(--float-accent-purple)', 'var(--float-accent-purple-bg)')} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={flabel}>How I responded</label>
              <textarea value={parentResponse} onChange={e => setParentResponse(e.target.value)} rows={3}
                placeholder="What did you do or say in the moment?"
                style={boxStyle('var(--float-success)', 'var(--float-success-bg)')} />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--float-text-secondary)', marginBottom: '4px' }}>Date</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                  style={{ border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '10px 12px', fontSize: '15px', fontFamily: 'inherit' }} />
              </div>
              <button onClick={() => handleSave(false)} disabled={saving}
                style={{ background: 'var(--float-primary)', color: '#fff', border: 'none', borderRadius: '12px', padding: '13px 26px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save observation'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px' }}>
            {offBanner}
            <p style={{ fontSize: '14px', color: 'var(--float-text-secondary)', margin: '0 0 16px' }}>
              {entryCount === 0
                ? 'No observations yet — add your first one in the Form tab, or tap and talk.'
                : entryCount < 5
                  ? `You've added ${entryCount} observation${entryCount === 1 ? '' : 's'}. A few more would be really helpful.`
                  : `You've added ${entryCount} observations — that's great! The more you add, the better.`}
            </p>
            {!bookmarkDismissed && !standalone && (
              <div style={{ background: 'var(--float-warning-bg)', borderRadius: 'var(--float-radius-card)', padding: '14px 16px', marginBottom: '16px', border: '1px solid var(--float-warning-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '13px', color: 'var(--float-warning)', margin: 0 }}>{homeTip}</p>
                <button onClick={dismissTip} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--float-warning)', cursor: 'pointer', fontSize: '16px' }}>x</button>
              </div>
            )}
            {listItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {listItems.map(item => item.kind === 'note' ? (
                  <NoteRow key={item.note.id} note={item.note} onDelete={async () => { await api.deleteNote(item.note.id); await fetchForm() }} />
                ) : ((entry: Entry) => (
                  <button key={entry.id} onClick={() => handleEdit(entry)}
                    style={{ width: '100%', background: 'var(--float-surface)', borderRadius: '14px', padding: '16px', border: '1px solid var(--float-border)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--float-text-secondary)' }}>
                          {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {entry.captured_by === 'voice' && (
                          <span title="Said out loud" style={{ color: 'var(--float-primary)', display: 'inline-flex' }}><MicIcon size={13} /></span>
                        )}
                      </div>
                      {entry.situation && (
                        <p style={{ fontSize: '15px', color: 'var(--float-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.situation}</p>
                      )}
                    </div>
                    {entry.fear_thermometer != null && (
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: entry.fear_thermometer >= 7 ? 'var(--float-danger-bg)' : entry.fear_thermometer >= 4 ? 'var(--float-warning-bg)' : 'var(--float-success-bg)', color: entry.fear_thermometer >= 7 ? 'var(--float-danger)' : entry.fear_thermometer >= 4 ? 'var(--float-warning)' : 'var(--float-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>{entry.fear_thermometer}</div>
                    )}
                  </button>
                ))(item.entry))}
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => setShowResend(!showResend)} style={{ background: 'none', border: 'none', color: 'var(--float-text-hint)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                Get the link sent to me again
              </button>
              {showResend && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <input type="text" placeholder="Email or phone number" value={resendValue} onChange={e => setResendValue(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--float-border)', fontSize: '14px', width: '220px' }} />
                  <button onClick={() => { alert('Link sent! Check your email or messages.'); setShowResend(false); setResendValue('') }}
                    style={{ padding: '10px 16px', background: 'var(--float-primary)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Send</button>
                </div>
              )}
            </div>
          </div>
        )}
      </Shell>
    )
  }

  return null
}

// ── Shell wrapper ──
function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--float-bg)',
      maxWidth: wide ? '760px' : '480px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--float-surface)',
        padding: '16px 24px',
        borderBottom: '1px solid var(--float-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span style={{ fontSize: '20px' }}>~</span>
        <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--float-text)' }}>Float</span>
      </div>
      {children}
    </div>
  )
}
