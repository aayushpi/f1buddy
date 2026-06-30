import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type OpenF1Config } from '../api/openf1'
import { findCircuit } from '../data/circuits'
import { isUnlocked } from '../utils/access'
import type { ApiMeeting, ApiSession } from '../api/types'

interface Props {
  config: OpenF1Config
  // simulate=true replays the picked session as if live; false loads the full race.
  // gated=true when the session is in the latest two race weekends (paid).
  onPick: (sessionKey: number, simulate: boolean, gated: boolean) => void
  onClose: () => void
}

const YEARS = [2026, 2025, 2024, 2023]

// Country name → ISO-3166 alpha-2, for the flag fallback when no circuit matches.
const ISO2: Record<string, string> = {
  Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ', Bahrain: 'BH', Belgium: 'BE',
  Brazil: 'BR', Canada: 'CA', China: 'CN', France: 'FR', Germany: 'DE', Hungary: 'HU',
  India: 'IN', Italy: 'IT', Japan: 'JP', Malaysia: 'MY', Mexico: 'MX', Monaco: 'MC',
  Netherlands: 'NL', Portugal: 'PT', Qatar: 'QA', Russia: 'RU', Singapore: 'SG',
  'Saudi Arabia': 'SA', 'South Africa': 'ZA', Spain: 'ES', Turkey: 'TR',
  'United Arab Emirates': 'AE', 'United Kingdom': 'GB', 'Great Britain': 'GB',
  'United States': 'US', USA: 'US', Argentina: 'AR',
}

function countryFlag(name: string | undefined): string {
  const code = name ? ISO2[name] : undefined
  if (!code) return '🏁'
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

// A Grand Prix weekend runs ~Fri→Sun. With only date_start to go on, treat a
// meeting as happening "now" for a few days after it opens, future before it,
// past after — used to emphasise the live weekend and dim what hasn't run yet.
const WEEKEND_MS = 4 * 24 * 60 * 60 * 1000
function meetingPhase(m: ApiMeeting, now: number): 'past' | 'current' | 'future' {
  const start = Date.parse(m.date_start)
  if (!Number.isFinite(start)) return 'past'
  if (now < start) return 'future'
  if (now <= start + WEEKEND_MS) return 'current'
  return 'past'
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

// Race / Sprint first — that's what people usually want to replay.
function sessionRank(s: ApiSession): number {
  const t = s.session_type?.toLowerCase() ?? ''
  if (t === 'race') return 0
  if (t.includes('sprint')) return 1
  if (t.includes('qual')) return 2
  return 3
}

// A mini circuit outline from the local library, or the country flag if the
// track isn't recognised. The dataset's y is screen-down, so flip it upright.
function TrackThumb({ meeting }: { meeting: ApiMeeting }) {
  const circuit = findCircuit(
    meeting.circuit_short_name,
    meeting.location,
    meeting.country_name,
    meeting.meeting_name,
  )
  if (!circuit || circuit.points.length < 8) {
    return <div className="gp-thumb flag">{countryFlag(meeting.country_name)}</div>
  }
  const pts = circuit.points.map(([x, y]) => [x, -y] as const)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const pad = Math.max(w, h) * 0.1
  const vb = `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <div className="gp-thumb">
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="gp-track">
        <path d={d} fill="none" />
      </svg>
    </div>
  )
}

export function SessionPicker({ config, onPick, onClose }: Props) {
  const [year, setYear] = useState(2026)
  const [simulate, setSimulate] = useState(false)
  const [meetings, setMeetings] = useState<ApiMeeting[]>([])
  const [meetingsState, setMeetingsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [selected, setSelected] = useState<ApiMeeting | null>(null)
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [sessionsState, setSessionsState] = useState<'idle' | 'loading' | 'error'>('idle')

  // A redeemed device already has access to the gated weekends, so don't tease
  // it with locks — the padlocks are only a prompt for users who still need a key.
  const unlocked = isUnlocked()

  // The latest two race weekends are gated (paid); everything older is free.
  // Only the current season can be recent — past years are always free.
  const gatedMeetings = useMemo(() => {
    if (year !== new Date().getFullYear()) return new Set<number>()
    const now = Date.now()
    const started = meetings.filter((m) => Date.parse(m.date_start) <= now) // meetings are sorted ascending
    return new Set(started.slice(-2).map((m) => m.meeting_key))
  }, [meetings, year])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (selected ? setSelected(null) : onClose())
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, selected])

  useEffect(() => {
    const controller = new AbortController()
    setMeetingsState('loading')
    setMeetings([])
    setSelected(null)
    setSessions([])
    api
      .meetings(config, { year }, controller.signal)
      .then((m) => {
        m.sort((a, b) => (a.date_start < b.date_start ? -1 : 1))
        setMeetings(m)
        setMeetingsState('idle')
      })
      .catch(() => {
        if (!controller.signal.aborted) setMeetingsState('error')
      })
    return () => controller.abort()
  }, [year, config])

  useEffect(() => {
    if (selected == null) return
    const controller = new AbortController()
    setSessionsState('loading')
    setSessions([])
    api
      .sessions(config, { meeting_key: selected.meeting_key }, controller.signal)
      .then((s) => {
        s.sort((a, b) => sessionRank(a) - sessionRank(b))
        setSessions(s)
        setSessionsState('idle')
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionsState('error')
      })
    return () => controller.abort()
  }, [selected, config])

  return (
    <div className="picker-screen">
      <div className="picker-bar">
        <button className="picker-back" onClick={() => (selected ? setSelected(null) : onClose())}>
          ‹ {selected ? 'All Grands Prix' : 'Home'}
        </button>
        <div className="picker-title">{selected ? selected.meeting_name : 'Load a past session'}</div>
        <div className="seg picker-years">
          {YEARS.map((y) => (
            <button key={y} className={y === year ? 'active' : ''} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {!selected ? (
        <div className="picker-body">
          {meetingsState === 'loading' && (
            <div className="picker-note">
              <span className="spinner" /> Loading the {year} calendar…
            </div>
          )}
          {meetingsState === 'error' && (
            <div className="picker-note err">Couldn’t reach OpenF1. Check your connection and try again.</div>
          )}
          {meetingsState === 'idle' && meetings.length === 0 && (
            <div className="picker-note">No Grands Prix found for {year}.</div>
          )}
          <div className="picker-grid">
            {meetings.map((m) => {
              const phase = meetingPhase(m, Date.now())
              return (
                <motion.button
                  key={m.meeting_key}
                  className={`gp-card ${phase}`}
                  onClick={() => setSelected(m)}
                  whileTap={{ scale: 0.97 }}
                >
                  {phase === 'current' && <span className="gp-now">● This weekend</span>}
                  {!unlocked && gatedMeetings.has(m.meeting_key) && phase !== 'current' && (
                    <span className="gp-lock" title="Recent weekend — members only">🔒</span>
                  )}
                  <TrackThumb meeting={m} />
                  <span className="gp-country">
                    <span className="gp-flag">{countryFlag(m.country_name)}</span>
                    {m.country_name}
                  </span>
                  <span className="gp-name">{m.meeting_name}</span>
                  <span className="gp-date">{fmtDate(m.date_start)}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="picker-body">
          {sessionsState === 'loading' && (
            <div className="picker-note">
              <span className="spinner" /> Loading sessions…
            </div>
          )}
          {sessionsState === 'error' && (
            <div className="picker-note err">Couldn’t load sessions for this event.</div>
          )}
          <div className="picker-sessions">
            {sessionsState === 'idle' &&
              sessions.map((s) => (
                <motion.button
                  key={s.session_key}
                  className={`ses-card ${s.session_type?.toLowerCase() === 'race' ? 'race' : ''}`}
                  onClick={() => onPick(s.session_key, simulate, selected ? gatedMeetings.has(selected.meeting_key) : false)}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="ses-name">
                    {!unlocked && selected && gatedMeetings.has(selected.meeting_key) ? '🔒' : '▶'} {s.session_name}
                  </span>
                  <span className="ses-date">{fmtDate(s.date_start)}</span>
                </motion.button>
              ))}
          </div>
          <button
          className={`chip pick-sim ${simulate ? 'on' : ''}`}
          onClick={() => setSimulate((v) => !v)}
          title="Replay as if live (real-time growing edge) instead of loading the full race"
        >
          <span className="swatch" />Simulate live
        </button>
          <div className="picker-foot">
            {simulate
              ? 'Session will be simulated live. For testing only'
              : 'Replay this session'}
          </div>
        </div>
      )}
    </div>
  )
}
