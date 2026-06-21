import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Notice } from '../hooks/useRaceNotices'
import { formatLapTime } from '../utils/format'

interface Props {
  notices: Notice[]
  onDismiss: (id: string) => void
}

// How long each kind lingers before it auto-dismisses (ms).
const DURATION: Record<Notice['kind'], number> = {
  control: 8000,
  fastlap: 7000,
  fastsector: 6000,
  radio: 10000,
}

const FLAG_CLASS: Record<string, string> = {
  GREEN: 'flag-green',
  CLEAR: 'flag-green',
  YELLOW: 'flag-yellow',
  'DOUBLE YELLOW': 'flag-yellow',
  RED: 'flag-red',
  BLUE: 'flag-blue',
  CHEQUERED: 'flag-chequered',
}

/**
 * Stacked, auto-dismissing alerts in the corner. Newest sits at the bottom so a
 * burst of events (several radios, a flurry of race-control calls) reads top to
 * bottom in the order it happened. Everything here is also permanently available
 * in the Race Control tab.
 */
export function NoticeStack({ notices, onDismiss }: Props) {
  return (
    <div className="notice-stack">
      <AnimatePresence initial={false}>
        {notices.map((n) => (
          <NoticeCard key={n.id} notice={n} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function NoticeCard({ notice, onDismiss }: { notice: Notice; onDismiss: (id: string) => void }) {
  const [engaged, setEngaged] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const duration = DURATION[notice.kind]

  // Auto-dismiss countdown. Engaging (playing a radio) cancels it.
  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(notice.id), duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const play = () => {
    if (notice.kind !== 'radio') return
    if (timerRef.current) clearTimeout(timerRef.current)
    setEngaged(true)
    if (!audioRef.current) {
      const a = new Audio(notice.url)
      a.onended = () => setPlaying(false)
      a.onpause = () => setPlaying(false)
      a.onplay = () => setPlaying(true)
      audioRef.current = a
    }
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => setPlaying(false))
  }

  const team = 'colour' in notice && notice.colour ? notice.colour : 'var(--accent)'
  const flagClass = notice.kind === 'control' ? FLAG_CLASS[notice.flag ?? ''] ?? '' : ''

  return (
    <motion.div
      className={`notice notice-${notice.kind} ${flagClass}`}
      style={{ ['--team' as string]: team }}
      initial={{ x: 80, opacity: 0, scale: 0.96 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 80, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
    >
      <button
        className="notice-close"
        aria-label="Dismiss"
        onClick={() => onDismiss(notice.id)}
      >
        ✕
      </button>

      {notice.kind === 'control' && (
        <>
          <span className="notice-kicker">Race Control</span>
          <span className="notice-msg">{notice.message}</span>
        </>
      )}

      {notice.kind === 'fastlap' && (
        <>
          <span className="notice-kicker fl">Fastest Lap</span>
          <div className="notice-line">
            <span className="notice-acr" style={{ color: team }}>{notice.acronym}</span>
            <span className="notice-time mono">{formatLapTime(notice.time)}</span>
          </div>
        </>
      )}

      {notice.kind === 'fastsector' && (
        <>
          <span className="notice-kicker fl">Fastest Sector {notice.sector}</span>
          <div className="notice-line">
            <span className="notice-acr" style={{ color: team }}>{notice.acronym}</span>
            <span className="notice-time mono">{notice.time.toFixed(3)}s</span>
          </div>
        </>
      )}

      {notice.kind === 'radio' && (
        <>
          <div className="notice-line">
            <span className="notice-kicker">Team Radio</span>
            <span className="notice-acr" style={{ color: team }}>{notice.acronym}</span>
          </div>
          <button
            className={`notice-play ${playing ? 'on' : ''}`}
            aria-label="Play team radio"
            onClick={play}
          >
            <span className="np-icon">{playing ? '❚❚' : '▶'}</span>
            <span className="np-label">{engaged ? (playing ? 'Playing…' : 'Replay') : 'Tap to play'}</span>
          </button>
        </>
      )}

      {!engaged && (
        <div className="notice-countdown">
          <span className="notice-countdown-bar" style={{ animationDuration: `${duration}ms` }} />
        </div>
      )}
    </motion.div>
  )
}
