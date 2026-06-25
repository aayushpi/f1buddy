import { useState } from 'react'
import { motion } from 'framer-motion'
import type { OpenF1Config } from '../api/openf1'
import { useCalendar, type CalendarSession } from '../hooks/useCalendar'
import { SessionPicker } from './SessionPicker'

interface Props {
  config: OpenF1Config
  onEnterLive: (sessionKey: number) => void
  // simulate=true replays the session as if live; false loads the full race.
  onReplay: (sessionKey: number, simulate: boolean) => void
}

// "2d 04:11:09" / "04:11:09" / "11:09" — the largest non-zero unit leads.
function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

function whenLabel(start: number): string {
  const d = new Date(start)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sessionLabel(s: CalendarSession): string {
  return `${s.meetingName} · ${s.sessionName}`
}

export function Home({ config, onEnterLive, onReplay }: Props) {
  const cal = useCalendar(config)
  const [pickerOpen, setPickerOpen] = useState(false)

  if (pickerOpen) {
    return (
      <SessionPicker
        config={config}
        onClose={() => setPickerOpen(false)}
        onPick={(key, simulate) => {
          setPickerOpen(false)
          onReplay(key, simulate)
        }}
      />
    )
  }

  return (
    <div className="home">
      <div className="fx-grid" />

      <header className="home-top">
        <div className="home-brand">
          <span className="home-logo">🏎️</span>
          <span className="home-wordmark">F1 Buddy</span>
        </div>
      </header>

      <main className="home-main">
        {cal.state === 'loading' && (
          <div className="home-hero panel">
            <span className="spinner" />
            <div className="home-hero-sub">Checking the {new Date().getFullYear()} calendar…</div>
          </div>
        )}

        {cal.state === 'error' && (
          <div className="home-hero panel">
            <div className="home-hero-kicker err">Offline</div>
            <div className="home-hero-title">Couldn’t reach OpenF1</div>
            <div className="home-hero-sub">Check your connection — you can still load a past session below.</div>
          </div>
        )}

        {cal.state === 'ready' && cal.live && (
          <motion.div
            className="home-hero panel live"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="home-hero-kicker live">
              <span className="live-pip" /> Live now
            </div>
            <div className="home-hero-title">{cal.live.meetingName}</div>
            <div className="home-hero-sub">{cal.live.sessionName} is running</div>
            <button className="home-cta primary" onClick={() => onEnterLive(cal.live!.sessionKey)}>
              Enter live session →
            </button>
          </motion.div>
        )}

        {cal.state === 'ready' && !cal.live && cal.next && (
          <motion.div
            className="home-hero panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="home-hero-kicker">Next session</div>
            <div className="home-hero-title">{sessionLabel(cal.next)}</div>
            <div className="home-countdown mono">{formatCountdown(cal.next.start - Date.now())}</div>
            <div className="home-hero-sub">{whenLabel(cal.next.start)}</div>
          </motion.div>
        )}

        {cal.state === 'ready' && !cal.live && !cal.next && (
          <div className="home-hero panel">
            <div className="home-hero-kicker">Off season</div>
            <div className="home-hero-title">No upcoming sessions</div>
            <div className="home-hero-sub">Replay a past race below.</div>
          </div>
        )}

        <div className="home-actions">
          {cal.lastRace && (
            <motion.button
              className="home-action"
              onClick={() => onReplay(cal.lastRace!.sessionKey, false)}
              whileTap={{ scale: 0.98 }}
            >
              <span className="home-action-icon">↺</span>
              <span className="home-action-text">
                <span className="home-action-title">Replay the last race</span>
                <span className="home-action-sub">{cal.lastRace.meetingName}</span>
              </span>
            </motion.button>
          )}

          <motion.button className="home-action" onClick={() => setPickerOpen(true)} whileTap={{ scale: 0.98 }}>
            <span className="home-action-icon">▦</span>
            <span className="home-action-text">
              <span className="home-action-title">Load a past session</span>
              <span className="home-action-sub">Browse every Grand Prix, 2023–2026</span>
            </span>
          </motion.button>
        </div>
      </main>

      <footer className="home-foot">
        Powered by the OpenF1 API · made by{' '}
        <a className="home-credit" href="https://aayush.fyi" target="_blank" rel="noopener noreferrer">
          Aayush
        </a>
      </footer>
    </div>
  )
}
