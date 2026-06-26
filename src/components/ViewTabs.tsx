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

// The Free Practice tab leads the bar, but only during a practice session
// (P1/P2/P3) — its qualifying-sim / long-run reads are meaningless elsewhere.
const PRACTICE_TAB = { id: 'practice' as ActiveView, label: 'Free Practice', icon: '⏱' }

// The Qualifying tab leads the bar during a qualifying session only — its
// knockout / drop-zone reads make no sense in a race or practice.
const QUALI_TAB = { id: 'qualifying' as ActiveView, label: 'Qualifying', icon: '⚔' }

interface Props {
  active: ActiveView
  onChange: (v: ActiveView) => void
  onHome: () => void
  // Raw session_type / session_name — used to surface the Practice tab.
  sessionType: string
}

export function ViewTabs({ active, onChange, onHome, sessionType }: Props) {
  const type = sessionType.toLowerCase()
  const isPractice = type.includes('practice')
  const isQualifying = type.includes('qualifying')
  const tabs = isPractice ? [PRACTICE_TAB, ...TABS] : isQualifying ? [QUALI_TAB, ...TABS] : TABS
  return (
    <nav className="viewtabs panel">
      <button className="icon-btn viewtabs-home" onClick={onHome} title="Home" aria-label="Home">
        ⌂
      </button>
      <div className="viewtabs-scroll">
        {tabs.map((t) => (
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
