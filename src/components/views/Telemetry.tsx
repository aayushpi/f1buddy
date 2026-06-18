import { useMemo } from 'react'
import type { DriverState, TelemetryTrace } from '../../api/types'
import { teamHex } from '../../utils/format'
import { MiniLine } from '../MiniLine'

interface Props {
  drivers: DriverState[]
  telemetry: TelemetryTrace[]
  selected: Set<number>
  onToggle: (n: number) => void
}

const DRS_LABEL: Record<string, string> = { on: 'DRS', eligible: 'DRS', off: 'DRS' }

function Bar({ value, max, colour }: { value: number; max: number; colour: string }) {
  return (
    <div className="tbar">
      <div className="tbar-fill" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: colour }} />
    </div>
  )
}

function Card({ d, trace }: { d: DriverState; trace?: TelemetryTrace }) {
  const hex = teamHex(d.teamColour)
  const c = d.car
  return (
    <div className="tcard" style={{ ['--team' as string]: hex }}>
      <div className="tcard-head">
        <span className="acr" style={{ color: hex }}>
          {d.acronym}
        </span>
        <span className="pos mono">P{d.position ?? '–'}</span>
        <span className={`drs-pill ${c?.drs ?? 'off'}`}>{DRS_LABEL[c?.drs ?? 'off']}</span>
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

      <div className="tgauge">
        <span className="lbl">RPM</span>
        <Bar value={c?.rpm ?? 0} max={12000} colour="var(--accent-2)" />
        <span className="val mono">{c ? Math.round(c.rpm) : '—'}</span>
      </div>
      <div className="tgauge">
        <span className="lbl">THR</span>
        <Bar value={c?.throttle ?? 0} max={100} colour="var(--green)" />
        <span className="val mono">{c ? Math.round(c.throttle) : '—'}%</span>
      </div>
      <div className="tgauge">
        <span className="lbl">BRK</span>
        <Bar value={c?.brake ?? 0} max={100} colour="var(--red)" />
        <span className="val mono">{c ? Math.round(c.brake) : '—'}%</span>
      </div>

      <div className="tcard-trace">
        <span className="trace-lbl">Speed trace</span>
        <MiniLine values={trace?.speed ?? []} colour={hex} height={56} min={50} max={340} fill />
      </div>
    </div>
  )
}

export function Telemetry({ drivers, telemetry, selected, onToggle }: Props) {
  const traceMap = useMemo(() => {
    const m = new Map<number, TelemetryTrace>()
    for (const t of telemetry) m.set(t.driverNumber, t)
    return m
  }, [telemetry])

  const shown = drivers.filter((d) => selected.has(d.driverNumber)).slice(0, 4)

  return (
    <div className="panel telemetry">
      <div className="panel-title">
        <span className="dot" />
        Car Telemetry
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.1em' }}>
          SPEED · RPM · GEAR · THROTTLE · BRAKE · DRS
        </span>
      </div>

      <div className="driver-chips" style={{ maxHeight: 80 }}>
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

      {shown.length ? (
        <div className="tcards">
          {shown.map((d) => (
            <Card key={d.driverNumber} d={d} trace={traceMap.get(d.driverNumber)} />
          ))}
        </div>
      ) : (
        <div className="chart-empty">Select up to four drivers to inspect live car telemetry.</div>
      )}
    </div>
  )
}
