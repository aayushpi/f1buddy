import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type OpenF1Config } from '../api/openf1'
import type { ApiMeeting, ApiSession } from '../api/types'

interface Props {
  config: OpenF1Config
  currentSessionKey: number | 'latest'
  activeLabel: string | null
  onLoad: (sessionKey: number) => void
}

const YEARS = [2025, 2024, 2023, 2026]

function fmtDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

// Show the Race / Sprint first — that's what people usually want to replay.
function sessionRank(s: ApiSession): number {
  const t = s.session_type?.toLowerCase() ?? ''
  if (t === 'race') return 0
  if (t.includes('sprint')) return 1
  if (t.includes('qual')) return 2
  return 3
}

export function SessionBrowser({ config, currentSessionKey, activeLabel, onLoad }: Props) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(2024)

  const [meetings, setMeetings] = useState<ApiMeeting[]>([])
  const [meetingsState, setMeetingsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [selectedMeeting, setSelectedMeeting] = useState<ApiMeeting | null>(null)

  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [sessionsState, setSessionsState] = useState<'idle' | 'loading' | 'error'>('idle')

  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setMeetingsState('loading')
    setMeetings([])
    setSelectedMeeting(null)
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
  }, [open, year, config])

  useEffect(() => {
    if (selectedMeeting == null) return
    const controller = new AbortController()
    setSessionsState('loading')
    setSessions([])
    api
      .sessions(config, { meeting_key: selectedMeeting.meeting_key }, controller.signal)
      .then((s) => {
        s.sort((a, b) => sessionRank(a) - sessionRank(b))
        setSessions(s)
        setSessionsState('idle')
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionsState('error')
      })
    return () => controller.abort()
  }, [selectedMeeting, config])

  const pick = (key: number) => {
    onLoad(key)
    setOpen(false)
  }

  return (
    <div className="session-browser" ref={rootRef}>
      <button
        className={`session-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Browse historical sessions"
      >
        <span className="cal">▦</span>
        <span className="lbl">{activeLabel ?? 'Load a Race'}</span>
        <span className="chev">▾</span>
      </button>

      {open && (
        <motion.div
          className="session-pop panel"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="sp-head">
            <span>Replay a session</span>
            <div className="seg sp-years">
              {YEARS.map((y) => (
                <button key={y} className={y === year ? 'active' : ''} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="sp-steps">
            <span className={selectedMeeting ? 'done' : 'active'}>1 · Choose a Grand Prix</span>
            <span className="arrow">→</span>
            <span className={selectedMeeting ? 'active' : ''}>2 · Pick a session</span>
          </div>

          <div className="sp-cols">
            <div className="sp-col">
              <div className="sp-col-title">Grand Prix · {year}</div>
              <div className="sp-list">
                {meetingsState === 'loading' && <div className="sp-note"><span className="spinner sp-spin" /></div>}
                {meetingsState === 'error' && (
                  <div className="sp-note err">Couldn’t reach OpenF1. Check your connection, then reopen.</div>
                )}
                {meetingsState === 'idle' && meetings.length === 0 && (
                  <div className="sp-note">No Grands Prix found for {year}.</div>
                )}
                {meetings.map((m) => (
                  <button
                    key={m.meeting_key}
                    className={`sp-item ${selectedMeeting?.meeting_key === m.meeting_key ? 'sel' : ''}`}
                    onClick={() => setSelectedMeeting(m)}
                  >
                    <span className="sp-name">{m.meeting_name}</span>
                    <span className="sp-sub">{m.country_name} · {fmtDate(m.date_start)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sp-col">
              <div className="sp-col-title">
                {selectedMeeting ? selectedMeeting.meeting_name : 'Session'}
              </div>
              <div className="sp-list">
                {selectedMeeting == null && (
                  <div className="sp-note">Choose a Grand Prix first.</div>
                )}
                {selectedMeeting != null && sessionsState === 'loading' && (
                  <div className="sp-note"><span className="spinner sp-spin" /></div>
                )}
                {selectedMeeting != null && sessionsState === 'error' && (
                  <div className="sp-note err">Couldn’t load sessions for this event.</div>
                )}
                {selectedMeeting != null &&
                  sessionsState === 'idle' &&
                  sessions.map((s) => (
                    <button
                      key={s.session_key}
                      className={`sp-item session ${s.session_type?.toLowerCase() === 'race' ? 'race' : ''} ${
                        currentSessionKey === s.session_key ? 'sel' : ''
                      }`}
                      onClick={() => pick(s.session_key)}
                    >
                      <span className="sp-name">▶ {s.session_name}</span>
                      <span className="sp-sub">{fmtDate(s.date_start)}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
