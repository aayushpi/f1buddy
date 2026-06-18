import type { ApiWeather, WeatherPoint } from '../../api/types'
import { MiniLine } from '../MiniLine'

interface Props {
  current: ApiWeather | null
  history: WeatherPoint[]
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="wx-stat">
      <span className="wx-label">{label}</span>
      <span className="wx-value mono">
        {value}
        {unit && <span className="wx-unit">{unit}</span>}
      </span>
    </div>
  )
}

function Trend({
  label,
  values,
  colour,
  unit,
}: {
  label: string
  values: number[]
  colour: string
  unit: string
}) {
  const last = values.at(-1)
  return (
    <div className="panel wx-trend">
      <div className="wx-trend-head">
        <span>{label}</span>
        <span className="mono" style={{ color: colour }}>
          {last != null ? `${last.toFixed(1)}${unit}` : '—'}
        </span>
      </div>
      <MiniLine values={values} colour={colour} height={70} fill />
    </div>
  )
}

export function WeatherView({ current, history }: Props) {
  const num = (f: (w: WeatherPoint) => number | null) =>
    history.map(f).filter((v): v is number => v != null)

  const trackTemps = num((w) => w.trackTemp)
  const airTemps = num((w) => w.airTemp)
  const humidity = num((w) => w.humidity)
  const wind = num((w) => w.windSpeed)

  return (
    <div className="panel weatherview">
      <div className="panel-title">
        <span className="dot" />
        Weather & Conditions
      </div>

      <div className="wx-stats">
        <Stat label="Track Temp" value={current?.track_temperature?.toFixed(1) ?? '—'} unit="°C" />
        <Stat label="Air Temp" value={current?.air_temperature?.toFixed(1) ?? '—'} unit="°C" />
        <Stat label="Humidity" value={current?.humidity?.toFixed(0) ?? '—'} unit="%" />
        <Stat label="Wind" value={current?.wind_speed?.toFixed(1) ?? '—'} unit=" m/s" />
        <Stat label="Rainfall" value={current?.rainfall ? 'YES' : 'NO'} />
      </div>

      <div className="wx-trends">
        <Trend label="Track Temperature" values={trackTemps} colour="#ff7b3d" unit="°C" />
        <Trend label="Air Temperature" values={airTemps} colour="#19e3ff" unit="°C" />
        <Trend label="Humidity" values={humidity} colour="#7a6bff" unit="%" />
        <Trend label="Wind Speed" values={wind} colour="#22e07a" unit=" m/s" />
      </div>
    </div>
  )
}
