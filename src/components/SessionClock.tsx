// The session-clock countdown: time left until the scheduled session end,
// measured against the *replay clock* (tNow), not wall time. Because it's a pure
// function of the clock position, it advances with playback and freezes the
// instant you pause — so you can pause the app and the broadcast together, then
// resume in sync. Lives next to the scrubber, where it replaces the time-of-day.

interface Props {
  // Scheduled session end (epoch ms) and the current replay-clock position (ms).
  endMs: number | null
  nowMs: number | null
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

export function SessionClock({ endMs, nowMs }: Props) {
  if (endMs == null || nowMs == null) return null
  const remaining = endMs - nowMs
  const ended = remaining <= 0

  return (
    <span className={`session-clock ${ended ? 'ended' : ''}`} title="Time remaining in the session">
      <span className="session-clock-dot" />
      {ended ? (
        <span className="session-clock-label">Ended</span>
      ) : (
        <span className="session-clock-time mono">{formatClock(remaining)}</span>
      )}
    </span>
  )
}
