import type { Connection } from '../store/useRaceData'
import type { TrackStatus as TrackStatusType } from '../api/types'

interface Dot {
  cls: string
  label: string
  pulse: boolean
}

// The glowing dot doubles as the track-status light. During a session it shows
// the flag (clear / yellow / SC·VSC / red / chequered); before data arrives it
// falls back to the connection state.
export function dotState(status: TrackStatusType, connection: Connection): Dot {
  if (status === 'UNKNOWN') {
    if (connection === 'error') return { cls: 'sd-red', label: 'Offline', pulse: false }
    if (connection === 'connecting') return { cls: 'sd-idle', label: 'Connecting', pulse: true }
    return { cls: 'sd-idle', label: 'Standby', pulse: false }
  }
  switch (status) {
    case 'GREEN': return { cls: 'sd-green', label: 'Track Clear', pulse: false }
    case 'YELLOW': return { cls: 'sd-yellow', label: 'Yellow', pulse: true }
    case 'DOUBLE_YELLOW': return { cls: 'sd-yellow', label: 'Double Yellow', pulse: true }
    case 'SC': return { cls: 'sd-amber', label: 'Safety Car', pulse: true }
    case 'VSC': return { cls: 'sd-amber', label: 'Virtual SC', pulse: true }
    case 'RED': return { cls: 'sd-red', label: 'Red Flag', pulse: true }
    case 'CHEQUERED': return { cls: 'sd-white', label: 'Finished', pulse: false }
    default: return { cls: 'sd-idle', label: '', pulse: false }
  }
}

// Fixed bottom-left flag/track-status badge.
export function TrackStatus({ status, connection }: { status: TrackStatusType; connection: Connection }) {
  const dot = dotState(status, connection)
  if (!dot.label) return null
  return (
    <div className="track-status" title={`Track: ${dot.label}`}>
      <span className={`status-dot ${dot.cls} ${dot.pulse ? 'pulse' : ''}`} />
      <span className={`status-dot-label ${dot.cls}`}>{dot.label}</span>
    </div>
  )
}
