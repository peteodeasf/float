/**
 * Teen data testing — /teen-test. docs/plans/teen-data-testing.md
 *
 * Records a teen's exposures so the clinician's Progress tab can be tested while the teen app is
 * being redesigned. Signed in as the teen, with the teen's own account, through the same backend
 * calls the teen app makes: the clinician never writes the teen's data.
 *
 * Built for a tester at a desk with the clinician's window beside it: every value the teen app can
 * set is a plain box or slider, filled in so one press records a believable exposure. Nothing else
 * from the teen app is here.
 *
 * Back-dating and Fill in 3 weeks need the backend's TEEN_DATA_TESTING switch. With it off the page
 * says so, and recording still works, stamped now.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { TIME_BUCKETS, type BucketKey } from '../../lib/setupQuestions'
import { errorMessage } from '../../components/ui/form'
import { Badge, Banner, Button, Card, Field, Select, TextInput, Textarea, type BadgeTone } from '../../components/ui/primitives'

type Exp = {
  id: string
  status: string
  scheduled_date: string | null
  dt_actual: number | null
}
type Rung = {
  id: string
  name: string
  dt: number | null
  status: string
  situation_name: string | null
  experiments: Exp[]
}
type Ladder = {
  plan: { ladder_active: boolean } | null
  rungs: Rung[]
  situations: unknown[]
}
type Message = { id: string; content: string; sender_user_id: string; created_at: string | null }

const QK = ['teen-test']
const PENDING = ['planned', 'in_progress', 'committed']

// ── dates ──
const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localMinute = (d: Date) => `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
/** The day at the bucket's hour, as the teen app stamps it. */
const stamp = (day: string, bucket: BucketKey) => {
  const hour = TIME_BUCKETS.find(b => b.key === bucket)?.hour ?? 12
  const d = new Date(`${day}T00:00:00`)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const shortDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'no day'

/** Where a rung has got to, from its latest exposure — the six the plan names. */
function rungState(r: Rung): { label: string; tone: BadgeTone } {
  const latest = r.experiments[r.experiments.length - 1]
  if (!latest) return { label: 'Not set up', tone: 'neutral' }
  if (latest.status === 'completed') return { label: 'Done', tone: 'success' }
  if (latest.status === 'too_hard') return { label: 'Too hard', tone: 'danger' }
  if (latest.status === 'committed') {
    // Nothing stores "missed": a locked-in exposure whose day has passed is missed, the same rule
    // the clinician's Progress tab uses.
    const day = latest.scheduled_date?.split('T')[0]
    if (day && day < new Date().toISOString().split('T')[0]) return { label: 'Missed', tone: 'warning' }
    return { label: 'Scheduled', tone: 'primary' }
  }
  return { label: 'Set up', tone: 'primary' }
}

// ── the values one exposure carries ──
type Before = { day: string; bucket: BucketKey; prediction: string; belief: number; expected: number; readiness: string }
type After = { happened: boolean; whatHappened: string; actual: number; beliefAfter: number; learned: string; when: string; reason: string }

const beforeFor = (dt: number | null): Before => ({
  day: localDay(new Date()),
  bucket: 'afternoon',
  prediction: 'Test entry: I will get scared and have to leave.',
  belief: 70,
  expected: Math.round(dt ?? 5),
  readiness: 'medium',
})
const afterFor = (dt: number | null): After => ({
  happened: false,
  whatHappened: 'Test entry: it was hard at first, then it got easier.',
  actual: Math.max(1, Math.round(dt ?? 5) - 2),
  beliefAfter: 40,
  learned: 'Test entry: the fear came down when I stayed.',
  when: localMinute(new Date()),
  reason: '',
})

/** Picks a day, answers the before questions and locks it in, as the teen app's setup does. */
async function setUp(rungId: string, rungName: string, b: Before): Promise<string> {
  const scheduled_date = stamp(b.day, b.bucket)
  const created = (await teenApiClient.post(`/patient/behaviors/${rungId}/experiments`, { scheduled_date })).data
  await teenApiClient.put(`/patient/experiments/${created.id}/before`, {
    plan_description: rungName,
    prediction: b.prediction,
    bip_before: b.belief,
    distress_thermometer_expected: b.expected,
    confidence_level: b.readiness,
    scheduled_time_bucket: b.bucket,
  })
  await teenApiClient.post(`/patient/experiments/${created.id}/commit`)
  return created.id
}

const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }
const groupTitle: React.CSSProperties = {
  fontSize: 'var(--float-font-2xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--float-text-secondary)', margin: '0 0 8px',
}

function Slider({ label, value, min, max, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; suffix?: string; onChange: (n: number) => void
}) {
  return (
    <Field label={`${label}: ${value}${suffix}`}>
      <input type="range" min={min} max={max} value={value} aria-label={label}
        onChange={e => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </Field>
  )
}

/** `dayFromWhen`: the day is the one under "When it happened", so it is not asked twice. */
function BeforeFields({ b, set, dayFromWhen = false }: { b: Before; set: (b: Before) => void; dayFromWhen?: boolean }) {
  return (
    <>
      <p style={groupTitle}>Picks a day</p>
      <div style={row}>
        {dayFromWhen
          ? <Field label="Day" hint="The day it happened, below."><TextInput block disabled value="Same as when it happened" /></Field>
          : <Field label="Day"><TextInput type="date" block value={b.day} onChange={e => set({ ...b, day: e.target.value })} /></Field>}
        <Field label="Time of day">
          <Select block value={b.bucket} onChange={e => set({ ...b, bucket: e.target.value as BucketKey })}>
            {TIME_BUCKETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
      </div>
      <p style={{ ...groupTitle, marginTop: 14 }}>Before</p>
      <div style={row}>
        <Field label="What they predict will happen">
          <TextInput block value={b.prediction} onChange={e => set({ ...b, prediction: e.target.value })} />
        </Field>
        <Slider label="Belief" value={b.belief} min={0} max={100} suffix="%" onChange={n => set({ ...b, belief: n })} />
        <Slider label="Expected Fear Level" value={b.expected} min={1} max={10} onChange={n => set({ ...b, expected: n })} />
        <Field label="How ready they feel">
          <Select block value={b.readiness} onChange={e => set({ ...b, readiness: e.target.value })}>
            <option value="low">Not very</option>
            <option value="medium">Fairly</option>
            <option value="high">Very</option>
          </Select>
        </Field>
      </div>
    </>
  )
}

function RungCard({ rung, switchedOn, onDone }: { rung: Rung; switchedOn: boolean; onDone: () => void }) {
  const [b, setB] = useState<Before>(() => beforeFor(rung.dt))
  const [a, setA] = useState<After>(() => afterFor(rung.dt))
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const state = rungState(rung)
  // The teen records the exposure already set up on this rung, if there is one.
  const pending = [...rung.experiments].reverse().find(e => PENDING.includes(e.status))
  const at = switchedOn ? new Date(a.when).toISOString() : undefined

  const run = useMutation({
    mutationFn: async (kind: 'done' | 'too_hard') => {
      // A new exposure recorded on a past day was set for that day, as a teen's would have been.
      const id = pending?.id ?? (await setUp(rung.id, rung.name, switchedOn ? { ...b, day: a.when.slice(0, 10) } : b))
      if (kind === 'done') {
        await teenApiClient.put(`/patient/experiments/${id}/after`, {
          feared_outcome_occurred: a.happened,
          what_happened: a.whatHappened,
          distress_thermometer_actual: a.actual,
          bip_after: a.beliefAfter,
          what_learned: a.learned,
          ...(at ? { completed_at: at } : {}),
        })
      } else {
        await teenApiClient.post(`/patient/experiments/${id}/too-hard`, {
          reason: a.reason.trim() || null,
          ...(at ? { at } : {}),
        })
      }
      return kind
    },
    onSuccess: kind => {
      setNote({ tone: 'success', text: kind === 'done' ? 'Recorded as done.' : 'Recorded as too hard.' })
      onDone()
    },
    onError: e => setNote({ tone: 'danger', text: errorMessage(e, "Couldn't save that.") }),
  })

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--float-font-md)', fontWeight: 700, color: 'var(--float-text)' }}>{rung.name}</span>
        <Badge tone={state.tone}>{state.label}</Badge>
        <span style={{ fontSize: 'var(--float-font-xs)', color: 'var(--float-text-secondary)' }}>
          {rung.situation_name ?? 'No situation'} · Fear Level {rung.dt ?? '—'}
          {' · '}{rung.experiments.filter(e => e.status === 'completed').length} done
        </span>
      </div>

      {rung.experiments.length > 0 && (
        <p style={{ fontSize: 'var(--float-font-xs)', color: 'var(--float-text-secondary)', margin: '6px 0 0' }}>
          {rung.experiments.map(e => `${shortDay(e.scheduled_date)}: ${e.status.replace('_', ' ')}`).join(' · ')}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        {pending ? (
          <Banner>Recording the exposure already set up for {shortDay(pending.scheduled_date)}.</Banner>
        ) : (
          <BeforeFields b={b} set={setB} dayFromWhen={switchedOn} />
        )}

        <p style={{ ...groupTitle, marginTop: 14 }}>After</p>
        <div style={row}>
          <Field label="Did the feared thing happen?">
            <Select block value={a.happened ? 'yes' : 'no'} onChange={e => setA({ ...a, happened: e.target.value === 'yes' })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="What happened">
            <TextInput block value={a.whatHappened} onChange={e => setA({ ...a, whatHappened: e.target.value })} />
          </Field>
          <Slider label="Actual Fear Level" value={a.actual} min={1} max={10} onChange={n => setA({ ...a, actual: n })} />
          <Slider label="Belief after" value={a.beliefAfter} min={0} max={100} suffix="%" onChange={n => setA({ ...a, beliefAfter: n })} />
          <Field label="What they learned">
            <TextInput block value={a.learned} onChange={e => setA({ ...a, learned: e.target.value })} />
          </Field>
        </div>

        <p style={{ ...groupTitle, marginTop: 14 }}>When it happened</p>
        <div style={row}>
          <Field label="Date and time" hint={switchedOn ? 'Today or earlier.' : 'Switched off: it records as now.'}>
            <TextInput type="datetime-local" block value={a.when} max={localMinute(new Date())}
              disabled={!switchedOn} onChange={e => setA({ ...a, when: e.target.value })} />
          </Field>
          <Field label="Too hard: reason (optional)" hint="A reason sends a message to the clinician.">
            <TextInput block value={a.reason} onChange={e => setA({ ...a, reason: e.target.value })} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button kind="primary" disabled={run.isPending} onClick={() => run.mutate('done')}>Record done</Button>
          <Button disabled={run.isPending} onClick={() => run.mutate('too_hard')}>Too hard</Button>
          {note && <Banner tone={note.tone} style={{ padding: '6px 10px' }}>{note.text}</Banner>}
        </div>
      </div>
    </Card>
  )
}

function StartExposure({ rungs, onDone }: { rungs: Rung[]; onDone: () => void }) {
  const [rungId, setRungId] = useState(rungs[0]?.id ?? '')
  const rung = rungs.find(r => r.id === rungId) ?? rungs[0]
  const [b, setB] = useState<Before>(() => beforeFor(rung?.dt ?? null))
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const start = useMutation({
    mutationFn: () => setUp(rung.id, rung.name, b),
    onSuccess: () => {
      setNote({ tone: 'success', text: `Set up for ${shortDay(stamp(b.day, b.bucket))}.` })
      onDone()
    },
    onError: e => setNote({ tone: 'danger', text: errorMessage(e, "Couldn't set that up.") }),
  })

  if (!rung) return null
  return (
    <Card>
      <h2 style={{ fontSize: 'var(--float-font-lg)', fontWeight: 700, margin: '0 0 4px' }}>Start an exposure</h2>
      <p style={{ fontSize: 'var(--float-font-sm)', color: 'var(--float-text-secondary)', margin: '0 0 14px' }}>
        Sets one up and locks it in, without recording it — as when the teen picks a rung and a day.
        Set a past day to leave one missed.
      </p>
      <div style={{ ...row, marginBottom: 14 }}>
        <Field label="Rung">
          <Select block value={rung.id} onChange={e => {
            setRungId(e.target.value)
            const next = rungs.find(r => r.id === e.target.value)
            setB(prev => ({ ...prev, expected: Math.round(next?.dt ?? 5) }))
          }}>
            {rungs.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
      <BeforeFields b={b} set={setB} />
      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button kind="primary" disabled={start.isPending} onClick={() => start.mutate()}>Set it up</Button>
        {note && <Banner tone={note.tone} style={{ padding: '6px 10px' }}>{note.text}</Banner>}
      </div>
    </Card>
  )
}

function FillThreeWeeks({ switchedOn, onDone }: { switchedOn: boolean; onDone: () => void }) {
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const fill = useMutation({
    mutationFn: async () => (await teenApiClient.post('/patient/testing/fill-three-weeks')).data as
      { done: number; too_hard: number; missed: number },
    onSuccess: r => {
      setNote({ tone: 'success', text: `Made ${r.done} done, ${r.too_hard} too hard and ${r.missed} missed over the past 3 weeks.` })
      onDone()
    },
    onError: e => setNote({ tone: 'danger', text: errorMessage(e, "Couldn't fill in 3 weeks.") }),
  })
  const go = () => {
    // Pressing it twice adds a second history on top of the first.
    if (window.confirm('This adds about 10 made-up exposures over the past 3 weeks. Pressing it again adds another set. Go ahead?')) {
      fill.mutate()
    }
  }
  return (
    <Card>
      <h2 style={{ fontSize: 'var(--float-font-lg)', fontWeight: 700, margin: '0 0 4px' }}>Fill in 3 weeks</h2>
      <p style={{ fontSize: 'var(--float-font-sm)', color: 'var(--float-text-secondary)', margin: '0 0 14px' }}>
        Makes a believable history for this teen: 2 to 3 exposures a week up the ladder from the easiest
        rung, one too hard and one missed. Every text answer starts "Test entry".
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button kind="primary" disabled={!switchedOn || fill.isPending} onClick={go}>Fill in 3 weeks</Button>
        {!switchedOn && <span style={{ fontSize: 'var(--float-font-xs)', color: 'var(--float-text-secondary)' }}>Needs the test switch on.</span>}
        {note && <Banner tone={note.tone} style={{ padding: '6px 10px' }}>{note.text}</Banner>}
      </div>
    </Card>
  )
}

function Messages({ me }: { me: string | undefined }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [...QK, 'messages'],
    queryFn: async () => (await teenApiClient.get('/patient/messages')).data,
  })
  const send = useMutation({
    mutationFn: async () => teenApiClient.post('/patient/messages', { content: text.trim(), message_type: 'general' }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: [...QK, 'messages'] })
    },
  })
  return (
    <Card>
      <h2 style={{ fontSize: 'var(--float-font-lg)', fontWeight: 700, margin: '0 0 12px' }}>Message to the clinician</h2>
      {messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 220, overflowY: 'auto' }}>
          {messages.slice(-8).map(m => (
            <div key={m.id} style={{ fontSize: 'var(--float-font-sm)', color: 'var(--float-text)' }}>
              <b>{m.sender_user_id === me ? 'Teen' : 'Clinician'}:</b> {m.content}
            </div>
          ))}
        </div>
      )}
      <Textarea block rows={3} value={text} placeholder="Test entry: …" onChange={e => setText(e.target.value)} />
      <div style={{ marginTop: 10 }}>
        <Button kind="primary" disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}>Send</Button>
      </div>
    </Card>
  )
}

function SignIn() {
  const { login } = useTeenAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
    } catch {
      setError('Invalid email or password')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card style={{ maxWidth: 420 }}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 'var(--float-font-sm)', color: 'var(--float-text-secondary)', margin: 0 }}>
          Sign in with the teen's own account.
        </p>
        <Field label="Email"><TextInput block type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Password"><TextInput block type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {error && <Banner tone="danger">{error}</Banner>}
        <div><Button kind="primary" type="submit" disabled={busy || !email || !password}>Sign in</Button></div>
      </form>
    </Card>
  )
}

export default function TeenDataTestingPage() {
  const { isAuthenticated, isLoading, logout } = useTeenAuth()
  const qc = useQueryClient()
  const signedIn = isAuthenticated && !isLoading

  const { data: me } = useQuery<{ user_id: string; patient_name: string | null }>({
    queryKey: [...QK, 'me'],
    queryFn: async () => (await teenApiClient.get('/auth/me')).data,
    enabled: signedIn,
  })
  const { data: testing } = useQuery<{ switched_on: boolean }>({
    queryKey: [...QK, 'switch'],
    queryFn: async () => (await teenApiClient.get('/patient/testing')).data,
    enabled: signedIn,
  })
  const { data: ladder, isLoading: ladderLoading } = useQuery<Ladder>({
    queryKey: [...QK, 'ladder'],
    queryFn: async () => (await teenApiClient.get('/patient/ladder')).data,
    enabled: signedIn,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: QK })
    // The teen app's own screens, if they are open in another tab.
    qc.invalidateQueries({ queryKey: ['teen-ladder'] })
    qc.invalidateQueries({ queryKey: ['teen-pending'] })
  }
  const switchedOn = !!testing?.switched_on
  const rungs = ladder?.rungs ?? []
  const hidden = !!ladder?.plan && !ladder.plan.ladder_active

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)', padding: '32px 20px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 'var(--float-font-2xl)', fontWeight: 700, margin: 0, color: 'var(--float-text)' }}>Teen data testing</h1>
          {signedIn && (
            <>
              <span style={{ fontSize: 'var(--float-font-sm)', color: 'var(--float-text-secondary)' }}>
                Signed in as {me?.patient_name ?? 'the teen'}
              </span>
              <Button kind="quiet" size="sm" onClick={logout} style={{ marginLeft: 'auto' }}>Sign out</Button>
            </>
          )}
        </div>

        {!signedIn && !isLoading && <SignIn />}

        {signedIn && testing && !switchedOn && (
          <Banner tone="warning">
            Teen data testing is switched off on this server. You can still record exposures, stamped
            now. Choosing when it happened and Fill in 3 weeks are refused.
          </Banner>
        )}

        {signedIn && !ladderLoading && !ladder?.plan && (
          <Banner>This teen has no treatment plan yet.</Banner>
        )}
        {signedIn && hidden && (
          <Banner tone="warning">
            The clinician has not turned on "Visible to patient" for this ladder, so the teen app shows
            no rungs. Turn it on in the clinician app to record exposures.
          </Banner>
        )}

        {signedIn && ladder?.plan?.ladder_active && rungs.length === 0 && (
          // Safety and avoidance behaviors are not rungs (app/core/behavior_types.py), so a plan
          // can have plenty of behaviors and still give the teen nothing to do.
          <Banner tone="warning">
            This ladder has no rungs the teen can do. Add a situation step to the ladder in the
            clinician app.
          </Banner>
        )}

        {signedIn && rungs.length > 0 && (
          <>
            <FillThreeWeeks switchedOn={switchedOn} onDone={refresh} />
            <StartExposure rungs={rungs} onDone={refresh} />
            <h2 style={{ fontSize: 'var(--float-font-lg)', fontWeight: 700, margin: '8px 0 0' }}>The ladder</h2>
            {rungs.map(r => <RungCard key={r.id} rung={r} switchedOn={switchedOn} onDone={refresh} />)}
          </>
        )}

        {signedIn && <Messages me={me?.user_id} />}
      </div>
    </div>
  )
}
