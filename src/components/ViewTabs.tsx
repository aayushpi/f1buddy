import { motion } from 'framer-motion'
import type { ActiveView, Connection } from '../store/useRaceData'
import type { TrackStatus } from '../api/types'

const TABS: { id: ActiveView; label: string; icon: string }[] = [
  { id: 'timing', label: 'Timing', icon: '◳' },
  { id: 'map', label: 'Track Map', icon: '◎' },
  { id: 'gap', label: 'Gap to Leader', icon: '⋰' },
  { id: 'telemetry', label: 'Telemetry', icon: '∿' },
  { id: 'strategy', label: 'Strategy', icon: '▤' },
  { id: 'pit', label: 'Pit Simulator', icon: '⏱' },
  { id: 'control', label: 'Race Control', icon: '⚑' },
  { id: 'weather', label: 'Weather', icon: '☀' },
]

interface Props {
  active: ActiveView
  onChange: (v: ActiveView) => void
  connection: Connection
  status: TrackStatus
  onSettings: () => void
  onHome: () => void
}

interface Dot {
  cls: string
  label: string
  pulse: boolean
  showLabel: boolean
}

// The glowing dot doubles as the track-status light. During a session it shows
// the flag (clear / yellow / SC·VSC / red / chequered); before data arrives it
// falls back to the connection state. A text label appears for the states that
// matter so it's unmistakable.
function dotState(status: TrackStatus, connection: Connection): Dot {
  if (status === 'UNKNOWN') {
    if (connection === 'error') return { cls: 'sd-red', label: 'Offline', pulse: false, showLabel: true }
    if (connection === 'connecting') return { cls: 'sd-idle', label: 'Connecting', pulse: true, showLabel: false }
    return { cls: 'sd-idle', label: 'Standby', pulse: false, showLabel: false }
  }
  switch (status) {
    case 'GREEN': return { cls: 'sd-green', label: 'Clear', pulse: false, showLabel: false }
    case 'YELLOW': return { cls: 'sd-yellow', label: 'Yellow', pulse: true, showLabel: true }
    case 'DOUBLE_YELLOW': return { cls: 'sd-yellow', label: 'Double Yellow', pulse: true, showLabel: true }
    case 'SC': return { cls: 'sd-amber', label: 'Safety Car', pulse: true, showLabel: true }
    case 'VSC': return { cls: 'sd-amber', label: 'Virtual SC', pulse: true, showLabel: true }
    case 'RED': return { cls: 'sd-red', label: 'Red Flag', pulse: true, showLabel: true }
    case 'CHEQUERED': return { cls: 'sd-white', label: 'Finished', pulse: false, showLabel: true }
    default: return { cls: 'sd-idle', label: '', pulse: false, showLabel: false }
  }
}

export function ViewTabs({ active, onChange, connection, status, onSettings, onHome }: Props) {
  const dot = dotState(status, connection)
  return (
    <nav className="viewtabs panel">
      <button className="icon-btn viewtabs-home" onClick={onHome} title="Home" aria-label="Home">
        ⌂
      </button>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`viewtab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {active === t.id && (
            <motion.span layoutId="tab-bg" className="viewtab-bg" transition={{ type: 'spring', stiffness: 480, damping: 40 }} />
          )}
          <span className="viewtab-icon">{t.icon}</span>
          <span className="viewtab-label">{t.label}</span>
        </button>
      ))}

      {/* Track-status light + settings, pinned to the right of the nav. */}
      <div className="viewtabs-controls">
        <span className={`status-dot ${dot.cls} ${dot.pulse ? 'pulse' : ''}`} title={`Track: ${dot.label}`} />
        {dot.showLabel && <span className={`status-dot-label ${dot.cls}`}>{dot.label}</span>}
        <button className="icon-btn" onClick={onSettings} title="Settings" aria-label="Settings">
          ⚙
        </button>
      </div>
    </nav>
  )
}
