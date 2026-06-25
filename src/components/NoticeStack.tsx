import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Notice } from '../hooks/useRaceNotices'
import { formatLapTime, formatRaceMessage } from '../utils/format'

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

const KIND_LABEL: Record<Notice['kind'], string> = {
  control: 'Race Control',
  fastlap: 'Fastest Lap',
  fastsector: 'Fastest Sector',
  radio: 'Team Radio',
}

// Up to this many cards peek out behind the top one before the rest just add to
// the "+N" count (keeps a tall burst from sprawling down the screen).
const MAX_GHOSTS = 2

/**
 * Stacked, auto-dismissing alerts in the corner. Notices of the same kind
 * collapse into a single iOS-style deck: the newest sits on top, fully
 * interactive, with the edges of the cards behind it peeking out to signal
 * there's a stack. Tap a deck to fan it out; tap "Show less" to re-collapse.
 * Every card stays mounted while collapsed, so auto-dismiss timers and radio
 * playback keep working. The full record is always in the Race Control tab.
 */
export function NoticeStack({ notices, onDismiss }: Props) {
  // Group by kind, preserving chronological order within each group.
  const groups = new Map<Notice['kind'], Notice[]>()
  const lastIndex = new Map<Notice['kind'], number>()
  notices.forEach((n, i) => {
    const arr = groups.get(n.kind)
    if (arr) arr.push(n)
    else groups.set(n.kind, [n])
    lastIndex.set(n.kind, i)
  })

  // Freshest deck sits at the bottom (nearest the eye), matching the old order.
  const ordered = [...groups.entries()].sort(
    (a, b) => (lastIndex.get(a[0]) ?? 0) - (lastIndex.get(b[0]) ?? 0),
  )

  return (
    <div className="notice-stack">
      <AnimatePresence initial={false}>
        {ordered.map(([kind, group]) => (
          <NoticeGroup key={kind} kind={kind} notices={group} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function NoticeGroup({
  kind,
  notices,
  onDismiss,
}: {
  kind: Notice['kind']
  notices: Notice[]
  onDismiss: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const multiple = notices.length > 1
  const collapsed = multiple && !expanded
  // Newest first so the top of the deck is the most recent notice.
  const ordered = [...notices].reverse()
  const extra = notices.length - 1

  return (
    <motion.div
      layout
      className={`notice-group ${collapsed ? 'is-collapsed' : 'is-expanded'}`}
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
      onClick={collapsed ? () => setExpanded(true) : undefined}
      role={collapsed ? 'button' : undefined}
      aria-label={collapsed ? `Expand ${notices.length} ${KIND_LABEL[kind]} notices` : undefined}
    >
      {ordered.map((n, i) => {
        const ghost = collapsed && i > 0
        const ghostClass = ghost
          ? i <= MAX_GHOSTS
            ? `is-ghost ghost-${i}`
            : 'is-ghost ghost-hidden'
          : ''
        return (
          <NoticeCard
            key={n.id}
            notice={n}
            onDismiss={onDismiss}
            className={ghostClass}
            // Ghost cards must not steal the tap that expands the deck.
            inert={ghost}
          />
        )
      })}

      {collapsed && (
        <span className="notice-count" aria-hidden>
          +{extra}
        </span>
      )}
      {expanded && multiple && (
        <button
          className="notice-collapse"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(false)
          }}
        >
          Show less
        </button>
      )}
    </motion.div>
  )
}

function NoticeCard({
  notice,
  onDismiss,
  className = '',
  inert = false,
}: {
  notice: Notice
  onDismiss: (id: string) => void
  className?: string
  inert?: boolean
}) {
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
      layout
      className={`notice notice-${notice.kind} ${flagClass} ${className}`}
      style={{ ['--team' as string]: team }}
      initial={{ x: 80, opacity: 0, scale: 0.96 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 80, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
      aria-hidden={inert || undefined}
    >
      <button
        className="notice-close"
        aria-label="Dismiss"
        tabIndex={inert ? -1 : undefined}
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(notice.id)
        }}
      >
        ✕
      </button>

      {notice.kind === 'control' && (
        <>
          <span className="notice-kicker">Race Control</span>
          <span className="notice-msg">{formatRaceMessage(notice.message)}</span>
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
            tabIndex={inert ? -1 : undefined}
            onClick={(e) => {
              e.stopPropagation()
              play()
            }}
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
