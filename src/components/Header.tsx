import type { RaceSnapshot, TrackStatus } from '../api/types'
import type { Connection } from '../store/useRaceData'

const STATUS_LABEL: Record<TrackStatus, string> = {
  GREEN: 'Track Clear',
  YELLOW: 'Yellow Flag',
  DOUBLE_YELLOW: 'Double Yellow',
  RED: 'Red Flag',
  SC: 'Safety Car',
  VSC: 'Virtual SC',
  CHEQUERED: 'Chequered',
  UNKNOWN: 'Standby',
}

const STATUS_SUB: Record<TrackStatus, string> = {
  GREEN: 'Racing',
  YELLOW: 'Caution',
  DOUBLE_YELLOW: 'Caution',
  RED: 'Session Stopped',
  SC: 'Neutralised',
  VSC: 'Neutralised',
  CHEQUERED: 'Finished',
  UNKNOWN: 'Awaiting Data',
}

interface Props {
  snapshot: RaceSnapshot | null
  connection: Connection
  onSettings: () => void
}

// The header is deliberately sparse: only the things that actually change as the
// race unfolds. Branding, circuit name, fastest-lap and the load/Demo·Live
// controls were removed — they're either static for the whole session (so you
// already know them) or one-time setup (now in Settings).
export function Header({ snapshot, connection, onSettings }: Props) {
  const race = snapshot?.race
  const status = race?.status ?? 'UNKNOWN'
  const pulse = status === 'YELLOW' || status === 'DOUBLE_YELLOW' || status === 'SC' || status === 'VSC'

  return (
    <header className="header">
      <div className={`panel status-pill status-${status}`}>
        <span className={`light ${pulse ? 'pulse' : ''}`} />
        <div className="status-text">
          <span className="label">{STATUS_LABEL[status]}</span>
          <span className="sub">{STATUS_SUB[status]}</span>
        </div>
        <div className="status-lap">
          <span className="kicker">{race?.sessionName ?? 'Session'}</span>
          <span className="value-lg mono">
            {race?.currentLap != null ? `LAP ${race.currentLap}` : '—'}
          </span>
        </div>
      </div>

      <div className="header-spacer" />

      <div className="panel controls">
        <span className={`conn-dot conn-${connection}`} title={`Status: ${connection}`} />
        <button className="icon-btn" onClick={onSettings} title="Settings" aria-label="Settings">
          ⚙
        </button>
      </div>
    </header>
  )
}
