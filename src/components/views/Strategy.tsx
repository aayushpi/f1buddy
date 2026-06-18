import type { GridRow, PitEvent, ResultRow, StintRow } from '../../api/types'
import {
  compoundColor,
  compoundLabel,
  formatGap,
  formatLapTime,
  formatPlaces,
  teamHex,
  timeOfDay,
} from '../../utils/format'

interface Props {
  stints: StintRow[]
  pitLog: PitEvent[]
  grid: GridRow[]
  results: ResultRow[]
  currentLap: number | null
  finished: boolean
}

function StintGantt({ stints, maxLap }: { stints: StintRow[]; maxLap: number }) {
  return (
    <div className="panel strat-gantt">
      <div className="panel-title">
        <span className="dot" />
        Tyre Strategy · Stints
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600 }}>
          {maxLap} LAPS
        </span>
      </div>
      <div className="gantt-body">
        {stints.map((row) => (
          <div key={row.driverNumber} className="gantt-row">
            <span className="gantt-acr" style={{ color: teamHex(row.colour) }}>
              {row.acronym}
            </span>
            <div className="gantt-track">
              {row.segments.map((s, i) => (
                <div
                  key={i}
                  className="gantt-seg"
                  style={{
                    width: `${(s.laps / maxLap) * 100}%`,
                    ['--tyre' as string]: compoundColor(s.compound),
                  }}
                  title={`${s.compound ?? '?'} · laps ${s.lapStart}-${s.lapEnd}`}
                >
                  <span className="seg-c">{compoundLabel(s.compound)}</span>
                  <span className="seg-l">{s.laps}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Strategy({ stints, pitLog, grid, results, currentLap, finished }: Props) {
  const maxLap = Math.max(1, currentLap ?? 1)

  return (
    <div className="strategy">
      <StintGantt stints={stints} maxLap={maxLap} />

      <div className="strat-side">
        <div className="panel strat-pits">
          <div className="panel-title">
            <span className="dot" />
            Pit Stops
            <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600 }}>
              {pitLog.length}
            </span>
          </div>
          <div className="strat-scroll">
            {pitLog.length ? (
              pitLog.map((p, i) => (
                <div key={i} className="pit-row">
                  <span className="acr" style={{ color: teamHex(p.colour) }}>
                    {p.acronym}
                  </span>
                  <span className="mono lap">L{p.lap}</span>
                  <span className="mono dur">
                    {p.duration != null ? `${p.duration.toFixed(1)}s` : '—'}
                  </span>
                  <span className="mono time">{timeOfDay(p.date)}</span>
                </div>
              ))
            ) : (
              <div className="chart-empty">No pit stops yet.</div>
            )}
          </div>
        </div>

        <div className="panel strat-grid">
          <div className="panel-title">
            <span className="dot" />
            {finished && results.length ? 'Result' : 'Grid → Position'}
          </div>
          <div className="strat-scroll">
            {finished && results.length
              ? results.map((r) => (
                  <div key={r.driverNumber} className="grid-row">
                    <span className="mono gpos">{r.position ?? '–'}</span>
                    <span className="acr" style={{ color: teamHex(r.colour) }}>
                      {r.acronym}
                    </span>
                    <span className="mono gap">
                      {r.status === 'FIN' ? formatGap(r.gapToLeader) : r.status}
                    </span>
                    <span className="mono laps">{r.laps != null ? `${r.laps}L` : ''}</span>
                  </div>
                ))
              : grid.map((g) => (
                  <div key={g.driverNumber} className="grid-row">
                    <span className="mono gpos">{g.gridPosition}</span>
                    <span className="acr" style={{ color: teamHex(g.colour) }}>
                      {g.acronym}
                    </span>
                    <span className="mono gap">
                      {g.qualifyingTime != null ? formatLapTime(g.qualifyingTime) : ''}
                    </span>
                    <span
                      className={`mono delta ${
                        g.delta != null && g.delta > 0 ? 'up' : g.delta != null && g.delta < 0 ? 'down' : ''
                      }`}
                    >
                      {formatPlaces(g.delta)}
                    </span>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  )
}
