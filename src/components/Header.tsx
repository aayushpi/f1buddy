import type { RaceSnapshot, TrackStatus } from '../api/types'

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
}

// Just the flag status + lap, and only once a session is underway. Before data
// arrives there's nothing useful to show, so the header collapses entirely
// rather than displaying a "Standby / Awaiting Data" placeholder. (Settings and
// the connection dot now live in the view-tabs row.)
export function Header({ snapshot }: Props) {
  const race = snapshot?.race
  const status = race?.status ?? 'UNKNOWN'
  if (!race || status === 'UNKNOWN') return null

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
          <span className="kicker">{race.sessionName}</span>
          <span className="value-lg mono">
            {race.currentLap != null ? `LAP ${race.currentLap}` : '—'}
          </span>
        </div>
      </div>
    </header>
  )
}
