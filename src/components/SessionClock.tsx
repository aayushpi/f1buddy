import { useEffect, useState } from 'react'

// The official session-clock countdown: time left until the scheduled session
// end. At the live edge it ticks off wall time (smooth, real-time, so it stays
// in sync with the broadcast's session timer); in replay / simlive it tracks
// the replay clock instead, so it counts down with playback and freezes when
// paused.

interface Props {
  // Scheduled session end (epoch ms) and the current replay-clock position (ms).
  endMs: number | null
  nowMs: number | null
  // Playback is pinned to the live edge — count down against wall time.
  live: boolean
}

/** "59:32" or, for sessions over an hour, "1:02:14". */
function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function SessionClock({ endMs, nowMs, live }: Props) {
  // A 1s heartbeat so the live (wall-time) countdown advances smoothly even
  // between data refreshes. Idle when not live (the replay clock drives it).
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setTick((t) => (t + 1) % 86400), 1000)
    return () => clearInterval(id)
  }, [live])

  if (endMs == null) return null
  const now = live ? Date.now() : nowMs
  if (now == null) return null

  const remaining = endMs - now
  const ended = remaining <= 0

  return (
    <span className={`session-clock ${ended ? 'ended' : ''}`} title="Time remaining in the session">
      <span className="session-clock-dot" />
      {ended ? (
        <span className="session-clock-label">Session ended</span>
      ) : (
        <span className="session-clock-time mono">{formatClock(remaining)}</span>
      )}
    </span>
  )
}
