import { motion } from 'framer-motion'
import type { ActiveView } from '../store/useRaceData'

const TABS: { id: ActiveView; label: string; icon: string }[] = [
  { id: 'timing', label: 'Timing', icon: '◳' },
  { id: 'map', label: 'Track Map', icon: '◎' },
  { id: 'gap', label: 'Gap to Leader', icon: '⋰' },
  { id: 'telemetry', label: 'Telemetry', icon: '∿' },
  { id: 'strategy', label: 'Strategy', icon: '▤' },
  { id: 'control', label: 'Race Control', icon: '⚑' },
]

interface Props {
  active: ActiveView
  onChange: (v: ActiveView) => void
  onHome: () => void
}

export function ViewTabs({ active, onChange, onHome }: Props) {
  return (
    <nav className="viewtabs panel">
      <button className="icon-btn viewtabs-home" onClick={onHome} title="Home" aria-label="Home">
        ⌂
      </button>
      <div className="viewtabs-scroll">
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
      </div>
    </nav>
  )
}
