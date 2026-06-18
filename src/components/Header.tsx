import type { RaceSnapshot, TrackStatus } from '../api/types'
import type { Connection, DataMode } from '../store/useRaceData'
import type { OpenF1Config } from '../api/openf1'
import { formatLapTime } from '../utils/format'
import { SessionBrowser } from './SessionBrowser'

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
  mode: DataMode
  onMode: (m: DataMode) => void
  connection: Connection
  onSettings: () => void
  config: OpenF1Config
  sessionKey: number | 'latest'
  onLoadSession: (sessionKey: number) => void
}

export function Header({
  snapshot,
  mode,
  onMode,
  connection,
  onSettings,
  config,
  sessionKey,
  onLoadSession,
}: Props) {
  const race = snapshot?.race
  const status = race?.status ?? 'UNKNOWN'
  const pulse = status === 'YELLOW' || status === 'DOUBLE_YELLOW' || status === 'SC' || status === 'VSC'

  return (
    <header className="header">
      <div className="panel header-block brand">
        <div>
          <div className="brand-mark">F1 BUDDY</div>
          <div className="brand-sub">Race Telemetry</div>
        </div>
      </div>

      <div className={`panel status-pill status-${status}`}>
        <span className={`light ${pulse ? 'pulse' : ''}`} />
        <div className="status-text">
          <span className="label">{STATUS_LABEL[status]}</span>
          <span className="sub">{STATUS_SUB[status]}</span>
        </div>
      </div>

      <div className="panel header-block">
        <span className="kicker">Circuit</span>
        <span className="value-md">{race?.circuit ?? '—'}</span>
      </div>

      <div className="panel header-block">
        <span className="kicker">{race?.sessionName ?? 'Session'}</span>
        <span className="value-lg mono">
          {race?.currentLap != null ? `LAP ${race.currentLap}` : '—'}
        </span>
      </div>

      <div className="panel header-block">
        <span className="kicker">Fastest Lap</span>
        <span className="value-md mono" style={{ color: 'var(--purple)' }}>
          {snapshot?.fastestLap
            ? `${snapshot.fastestLap.acronym} ${formatLapTime(snapshot.fastestLap.time)}`
            : '—'}
        </span>
      </div>

      <div className="header-spacer" />

      <SessionBrowser
        config={config}
        currentSessionKey={sessionKey}
        activeLabel={
          mode === 'live' && typeof sessionKey === 'number' && race
            ? `${race.meetingName || race.circuit} · ${race.sessionName}`
            : null
        }
        onLoad={onLoadSession}
      />

      <div className="panel controls">
        <span className={`conn-dot conn-${connection}`} title={`Status: ${connection}`} />
        <div className="seg">
          <button className={mode === 'sim' ? 'active' : ''} onClick={() => onMode('sim')}>
            Demo
          </button>
          <button className={mode === 'live' ? 'active' : ''} onClick={() => onMode('live')}>
            Live
          </button>
        </div>
        <button className="icon-btn" onClick={onSettings} title="Settings" aria-label="Settings">
          ⚙
        </button>
      </div>
    </header>
  )
}
