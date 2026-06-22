import { motion } from 'framer-motion'
import type { ActiveView, Connection } from '../store/useRaceData'

const TABS: { id: ActiveView; label: string; icon: string }[] = [
  { id: 'timing', label: 'Timing', icon: '◳' },
  { id: 'map', label: 'Track Map', icon: '◎' },
  { id: 'speedmap', label: 'Speed Map', icon: '◉' },
  { id: 'gap', label: 'Gap to Leader', icon: '⋰' },
  { id: 'telemetry', label: 'Telemetry', icon: '∿' },
  { id: 'strategy', label: 'Strategy', icon: '▤' },
  { id: 'control', label: 'Race Control', icon: '⚑' },
  { id: 'weather', label: 'Weather', icon: '☀' },
]

interface Props {
  active: ActiveView
  onChange: (v: ActiveView) => void
  connection: Connection
  onSettings: () => void
}

export function ViewTabs({ active, onChange, connection, onSettings }: Props) {
  return (
    <nav className="viewtabs panel">
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

      {/* Connection status + settings, pinned to the right of the nav. */}
      <div className="viewtabs-controls">
        <span className={`conn-dot conn-${connection}`} title={`Status: ${connection}`} />
        <button className="icon-btn" onClick={onSettings} title="Settings" aria-label="Settings">
          ⚙
        </button>
      </div>
    </nav>
  )
}
