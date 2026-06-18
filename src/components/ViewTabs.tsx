import { motion } from 'framer-motion'
import type { ActiveView } from '../store/useRaceData'

const TABS: { id: ActiveView; label: string; icon: string }[] = [
  { id: 'timing', label: 'Timing', icon: '◳' },
  { id: 'map', label: 'Track Map', icon: '◎' },
  { id: 'telemetry', label: 'Telemetry', icon: '∿' },
  { id: 'strategy', label: 'Strategy', icon: '▤' },
  { id: 'control', label: 'Race Control', icon: '⚑' },
  { id: 'weather', label: 'Weather', icon: '☀' },
]

export function ViewTabs({
  active,
  onChange,
}: {
  active: ActiveView
  onChange: (v: ActiveView) => void
}) {
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
    </nav>
  )
}
