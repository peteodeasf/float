import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type Screen = 'welcome' | 'home' | 'add' | 'edit'

interface Entry {
  id: string
  entry_date: string
  situation: string | null
  child_behavior_observed: string | null
  parent_response: string | null
  fear_thermometer: number | null
  is_draft: boolean
  created_at: string
}

interface FormData {
  id: string
  status: string
  patient_first_name: string | null
  practitioner_name: string | null
  entries: Entry[]
}

export default function MonitorLandingPage() {
  const { token } = useParams<{ token: string }>()
  const [form, setForm] = useState<FormData | null>(null)
  const [screen, setScreen] = useState<Screen>('welcome')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTips, setShowTips] = useState(false)
  const [showResend, setShowResend] = useState(false)
  const [resendValue, setResendValue] = useState('')
  const [bookmarkDismissed, setBookmarkDismissed] = useState(false)

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
      const res = await axios.get(`${API_URL}/monitor/${token}`)
      setForm(res.data)
      if (res.data.entries.length > 0) {
        setScreen('home')
      }
    } catch {
      setError('This form link is not valid or has expired.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchForm()
  }, [token])

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
    setScreen('add')
  }

  const handleEdit = (entry: Entry) => {
    setEditingEntry(entry)
    setEntryDate(entry.entry_date)
    setSituation(entry.situation || '')
    setChildBehavior(entry.child_behavior_observed || '')
    setParentResponse(entry.parent_response || '')
    setFearThermometer(entry.fear_thermometer)
    setScreen('edit')
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
      setScreen('home')
    } catch {
      alert('Something went wrong saving your observation. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const childName = form?.patient_first_name || 'your child'
  const practitionerName = form?.practitioner_name || 'Your clinician'
  const entryCount = form?.entries.filter(e => !e.is_draft).length ?? 0

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
          <p style={{ fontSize: '16px', color: '#64748b' }}>{error}</p>
        </div>
      </Shell>
    )
  }

  // ── Welcome screen ──
  if (screen === 'welcome') {
    return (
      <Shell>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px', lineHeight: '1.6' }}>
            <strong>{practitionerName}</strong> has asked you to complete a monitoring form
            for {childName} before your first appointment.
          </p>
          <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.6', marginBottom: '32px', textAlign: 'left' }}>
            Monitoring involves watching and observing the situations in which your child experiences anxiety and noting how you respond to your child in these situations. The purpose of monitoring is to accumulate data.
          </p>

          {/* Tips panel */}
          <div style={{
            background: '#f8fafc',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
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
                color: '#334155'
              }}
            >
              What information is gathered?
              <span style={{ fontSize: '18px', color: '#94a3b8' }}>
                {showTips ? '\u2212' : '+'}
              </span>
            </button>
            {showTips && (
              <div style={{ padding: '0 20px 20px' }}>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: 0 }}>
                  The information gathered using the Parent Monitoring Form includes the date, the situation, the behavior observed, your response as a parent, and your child's level of distress (as estimated by you) gauged on a scale from 1 to 10. 1 means little to no distress/anxiety. 10 signifies the highest level of distress/anxiety you have observed your child to experience in this type of situation.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleAdd}
            style={{
              width: '100%',
              padding: '18px',
              background: '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: '14px',
              fontSize: '17px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Add my first observation
          </button>
        </div>
      </Shell>
    )
  }

  // ── Home screen ──
  if (screen === 'home') {
    return (
      <Shell>
        <div style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
            Your observations
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
            {entryCount === 0
              ? 'No observations yet — add your first one below.'
              : entryCount < 5
                ? `You've added ${entryCount} observation${entryCount === 1 ? '' : 's'}. A few more would be really helpful.`
                : `You've added ${entryCount} observations — that's great! The more you add, the better.`
            }
          </p>

          {/* Bookmark prompt */}
          {!bookmarkDismissed && entryCount > 0 && entryCount < 3 && (
            <div style={{
              background: '#fffbeb',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '16px',
              border: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                Bookmark this page for easy access later
              </p>
              <button
                onClick={() => setBookmarkDismissed(true)}
                style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: '16px' }}
              >
                x
              </button>
            </div>
          )}

          {/* Entry list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {form?.entries.map(entry => (
              <button
                key={entry.id}
                onClick={() => handleEdit(entry)}
                style={{
                  width: '100%',
                  background: '#fff',
                  borderRadius: '14px',
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                      {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    {entry.is_draft && (
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Draft</span>
                    )}
                  </div>
                  {entry.situation && (
                    <p style={{
                      fontSize: '15px',
                      color: '#1e293b',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {entry.situation}
                    </p>
                  )}
                </div>
                {entry.fear_thermometer != null && (
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: entry.fear_thermometer >= 7 ? '#fef2f2' :
                      entry.fear_thermometer >= 4 ? '#fffbeb' : '#f0fdf4',
                    color: entry.fear_thermometer >= 7 ? '#dc2626' :
                      entry.fear_thermometer >= 4 ? '#d97706' : '#16a34a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: '700',
                    flexShrink: 0
                  }}>
                    {entry.fear_thermometer}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Resend link */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <button
              onClick={() => setShowResend(!showResend)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Get the link sent to me again
            </button>
            {showResend && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <input
                  type="text"
                  placeholder="Email or phone number"
                  value={resendValue}
                  onChange={e => setResendValue(e.target.value)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px',
                    width: '220px'
                  }}
                />
                <button
                  onClick={() => {
                    // Placeholder — would call /monitor/{token}/resend
                    alert('Link sent! Check your email or messages.')
                    setShowResend(false)
                    setResendValue('')
                  }}
                  style={{
                    padding: '10px 16px',
                    background: '#0d9488',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Floating add button */}
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)',
          maxWidth: '432px'
        }}>
          <button
            onClick={handleAdd}
            style={{
              width: '100%',
              padding: '16px',
              background: '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: '14px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)'
            }}
          >
            + Add observation
          </button>
        </div>
      </Shell>
    )
  }

  // ── Add / Edit screen ──
  if (screen === 'add' || screen === 'edit') {
    return (
      <Shell>
        <div style={{
          padding: '8px 24px 0',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#fff',
          marginTop: '-1px'
        }}>
          <button
            onClick={() => setScreen('home')}
            style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '8px 4px', color: '#64748b' }}
          >
            &larr;
          </button>
          <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
            {screen === 'edit' ? 'Edit observation' : 'New observation'}
          </span>
        </div>

        <div style={{ padding: '20px 24px 120px' }}>
          {/* Date */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              Date
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Situation */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              What was the situation?
            </label>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder={`e.g. Getting ready for school, hearing about a sick classmate`}
              rows={3}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '16px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Child behavior */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              What I observed about my child
            </label>
            <textarea
              value={childBehavior}
              onChange={e => setChildBehavior(e.target.value)}
              placeholder={`What did ${childName} do or say? How did they seem?`}
              rows={3}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '16px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Parent response */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              How I responded
            </label>
            <textarea
              value={parentResponse}
              onChange={e => setParentResponse(e.target.value)}
              placeholder="What did you do or say in the moment?"
              rows={3}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '16px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Fear thermometer */}
          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
              Fear thermometer (1–10)
            </label>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
              Your estimate of {childName}'s level of distress. 1 = little to no distress. 10 = highest distress.
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '8px'
            }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button
                  key={n}
                  onClick={() => setFearThermometer(n)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: '12px',
                    border: fearThermometer === n ? '2px solid #0d9488' : '1px solid #e2e8f0',
                    background: fearThermometer === n
                      ? '#f0fdfa'
                      : n >= 8 ? '#fef2f2'
                      : n >= 5 ? '#fffbeb'
                      : '#f0fdf4',
                    color: fearThermometer === n
                      ? '#0d9488'
                      : n >= 8 ? '#dc2626'
                      : n >= 5 ? '#d97706'
                      : '#16a34a',
                    fontSize: '18px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '48px'
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
              <span>Low distress</span>
              <span>Extreme distress</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{
                width: '100%',
                padding: '16px',
                background: '#0d9488',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save observation'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              style={{
                width: '100%',
                padding: '14px',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                fontSize: '15px',
                cursor: 'pointer'
              }}
            >
              Save as draft
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: '13px', color: '#94a3b8', marginTop: '16px' }}>
            You can always come back and edit this later.
          </p>
        </div>
      </Shell>
    )
  }

  return null
}

// ── Shell wrapper ──
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      maxWidth: '480px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: '16px 24px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span style={{ fontSize: '20px' }}>~</span>
        <span style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>Float</span>
      </div>
      {children}
    </div>
  )
}
