import { useMemo } from 'react'
import type { DriverState } from '../api/types'
import { formatLapTime, teamHex } from '../utils/format'
import { LapChart } from './LapChart'

const WINDOW_OPTIONS = [5, 6, 7, 10]

interface Props {
  drivers: DriverState[]
  selected: Set<number>
  onToggle: (driverNumber: number) => void
  lapWindow: number
  onWindow: (n: number) => void
  // When embedded in another view (Telemetry) that already has a driver
  // selector, hide our own chip row to avoid a duplicate.
  embedded?: boolean
}

export function LapAnalysis({ drivers, selected, onToggle, lapWindow, onWindow, embedded = false }: Props) {
  const selectedDrivers = useMemo(
    () => drivers.filter((d) => selected.has(d.driverNumber)),
    [drivers, selected],
  )

  // Average lap times for the comparison bar table (faster = longer bar).
  const avgModel = useMemo(() => {
    const rows = selectedDrivers
      .filter((d) => d.avgLapTime != null)
      .map((d) => ({
        driverNumber: d.driverNumber,
        acronym: d.acronym,
        colour: teamHex(d.teamColour),
        avg: d.avgLapTime!,
        last: d.lastLap,
      }))
    if (!rows.length) return { rows, min: 0, max: 1 }
    const avgs = rows.map((r) => r.avg)
    return { rows, min: Math.min(...avgs), max: Math.max(...avgs) }
  }, [selectedDrivers])

  const bestAvg = avgModel.rows.length ? avgModel.min : null

  return (
    <div className="panel analysis">
      <div className="panel-title">
        <span className="dot" />
        Lap-Time Analysis
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.1em' }}>
          {selected.size} SELECTED
        </span>
      </div>

      <div className="analysis-controls">
        <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Window
        </span>
        <div className="seg window-seg">
          {WINDOW_OPTIONS.map((n) => (
            <button key={n} className={n === lapWindow ? 'active' : ''} onClick={() => onWindow(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <LapChart drivers={selectedDrivers} />

      <div className="avg-table">
        {avgModel.rows.map((r) => {
          const span = avgModel.max - avgModel.min || 1
          // Faster average -> fuller bar.
          const pct = 30 + (1 - (r.avg - avgModel.min) / span) * 70
          const isBest = bestAvg != null && r.avg <= bestAvg + 0.0005
          return (
            <div key={r.driverNumber} className="avg-row">
              <span className="swatch" style={{ background: r.colour }} />
              <span className="acr" style={{ color: r.colour }}>
                {r.acronym}
              </span>
              <span className="barwrap">
                <span className="barfill" style={{ width: `${pct}%`, background: r.colour }} />
              </span>
              <span className="num">L {formatLapTime(r.last)}</span>
              <span className={`num ${isBest ? 'best' : ''}`}>Ø {formatLapTime(r.avg)}</span>
            </div>
          )
        })}
      </div>

      {!embedded && (
        <div className="driver-chips">
          {drivers.map((d) => (
            <button
              key={d.driverNumber}
              className={`chip ${selected.has(d.driverNumber) ? 'on' : ''}`}
              style={{ ['--team' as string]: teamHex(d.teamColour) }}
              onClick={() => onToggle(d.driverNumber)}
            >
              <span className="swatch" />
              {d.acronym}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
