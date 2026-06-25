import { useMemo } from 'react'
import type { DriverState, TelemetryTrace } from '../../api/types'
import { teamHex, teamLineDash } from '../../utils/format'
import { MiniLine } from '../MiniLine'
import { LapAnalysis } from '../LapAnalysis'

interface Props {
  drivers: DriverState[]
  telemetry: TelemetryTrace[]
  selected: Set<number>
  onToggle: (n: number) => void
  lapWindow: number
  onWindow: (n: number) => void
}

interface Channel {
  key: 'speed' | 'throttle' | 'brake' | 'gear' | 'rpm'
  label: string
  colour: string
  min: number
  max: number
  fill: boolean
}

const CHANNELS: Channel[] = [
  { key: 'speed', label: 'Speed', colour: 'var(--accent)', min: 50, max: 340, fill: true },
  { key: 'throttle', label: 'Throttle', colour: 'var(--green)', min: 0, max: 100, fill: true },
  { key: 'brake', label: 'Brake', colour: 'var(--red)', min: 0, max: 100, fill: true },
  { key: 'gear', label: 'Gear', colour: 'var(--accent-2)', min: 0, max: 8, fill: false },
  { key: 'rpm', label: 'RPM', colour: '#ff9d2f', min: 0, max: 13000, fill: false },
]

/** Overlay of every selected driver's speed trace for direct comparison. */
function SpeedOverlay({
  traces,
  dash,
}: {
  traces: { num: number; colour: string; speed: number[] }[]
  dash: Map<number, string>
}) {
  const W = 100
  const H = 32
  const lo = 50
  const hi = 340
  const span = hi - lo
  const path = (vals: number[]) => {
    if (vals.length < 2) return ''
    const step = W / (vals.length - 1)
    return vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - ((v - lo) / span) * H).toFixed(1)}`)
      .join(' ')
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="speed-overlay-svg">
      {traces.map((t) => (
        <path
          key={t.num}
          d={path(t.speed)}
          fill="none"
          stroke={t.colour}
          strokeWidth={1.8}
          strokeDasharray={dash.get(t.num) || undefined}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

function Card({ d, trace, dash }: { d: DriverState; trace?: TelemetryTrace; dash: string }) {
  const hex = teamHex(d.teamColour)
  const c = d.car
  return (
    <div className="tcard" style={{ ['--team' as string]: hex }}>
      <div className="tcard-head">
        <span className="acr" style={{ color: hex }}>
          {d.acronym}
        </span>
        {dash && <span className="teammate-tag" title="Second car of the team (dashed)">╌</span>}
        <span className="pos mono">P{d.position ?? '–'}</span>
        <span className={`drs-pill ${c?.drs ?? 'off'}`}>DRS</span>
      </div>

      <div className="tcard-main">
        <div className="speed-big mono">
          {c ? Math.round(c.speed) : '—'}
          <span className="unit">km/h</span>
        </div>
        <div className="gear-big mono">
          {c?.gear ?? '–'}
          <span className="unit">gear</span>
        </div>
      </div>

      <div className="tch-stack">
        {CHANNELS.map((ch) => (
          <div className="tch" key={ch.key}>
            <span className="tch-lbl">{ch.label}</span>
            <MiniLine values={trace?.[ch.key] ?? []} colour={ch.colour} height={34} min={ch.min} max={ch.max} fill={ch.fill} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Telemetry({ drivers, telemetry, selected, onToggle, lapWindow, onWindow }: Props) {
  const traceMap = useMemo(() => {
    const m = new Map<number, TelemetryTrace>()
    for (const t of telemetry) m.set(t.driverNumber, t)
    return m
  }, [telemetry])

  const dash = useMemo(() => teamLineDash(drivers), [drivers])
  const shown = drivers.filter((d) => selected.has(d.driverNumber)).slice(0, 4)
  const overlay = shown
    .map((d) => ({ num: d.driverNumber, colour: teamHex(d.teamColour), speed: traceMap.get(d.driverNumber)?.speed ?? [] }))
    .filter((t) => t.speed.length > 1)

  return (
    <div className="telemetry-section">
    <div className="panel telemetry">
      <div className="panel-title">
        <span className="dot" />
        Car Telemetry
      </div>

      <div className="driver-chips" style={{ maxHeight: 80 }}>
        {drivers.map((d) => (
          <button
            key={d.driverNumber}
            className={`chip ${selected.has(d.driverNumber) ? 'on' : ''} ${dash.get(d.driverNumber) ? 'teammate' : ''}`}
            style={{ ['--team' as string]: teamHex(d.teamColour) }}
            onClick={() => onToggle(d.driverNumber)}
          >
            <span className="swatch" />
            {d.acronym}
          </button>
        ))}
      </div>

      {shown.length ? (
        <>
          {overlay.length > 1 && (
            <div className="speed-overlay">
              <span className="trace-lbl">Speed comparison · {overlay.length} cars</span>
              <SpeedOverlay traces={overlay} dash={dash} />
            </div>
          )}
          <div className="tcards">
            {shown.map((d) => (
              <Card key={d.driverNumber} d={d} trace={traceMap.get(d.driverNumber)} dash={dash.get(d.driverNumber) ?? ''} />
            ))}
          </div>
        </>
      ) : (
        <div className="chart-empty">Select up to four drivers.</div>
      )}
    </div>

      <LapAnalysis
        drivers={drivers}
        selected={selected}
        onToggle={onToggle}
        lapWindow={lapWindow}
        onWindow={onWindow}
        embedded
      />
    </div>
  )
}
