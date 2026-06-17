import { useMemo } from 'react'
import type { DriverState } from '../api/types'
import { formatLapTime, teamHex } from '../utils/format'

interface Props {
  drivers: DriverState[] // already filtered to the selected set
}

const PAD = { top: 14, right: 14, bottom: 24, left: 46 }

export function LapChart({ drivers }: Props) {
  const model = useMemo(() => {
    const all = drivers.flatMap((d) => d.lapTimes)
    if (all.length < 2) return null

    const laps = all.map((p) => p.lap)
    const times = all.map((p) => p.time)
    const lapMin = Math.min(...laps)
    const lapMax = Math.max(...laps)
    let tMin = Math.min(...times)
    let tMax = Math.max(...times)
    const margin = Math.max(0.25, (tMax - tMin) * 0.12)
    tMin -= margin
    tMax += margin

    const lapSpan = lapMax - lapMin || 1
    const tSpan = tMax - tMin || 1

    // Map into a 0..1000 x 0..1000 viewBox; CSS scales to fit.
    const W = 1000
    const H = 1000
    const px = (lap: number) =>
      PAD.left + ((lap - lapMin) / lapSpan) * (W - PAD.left - PAD.right)
    // Faster (smaller) times sit lower on the chart, so dips read as quick laps.
    const py = (t: number) => PAD.top + ((tMax - t) / tSpan) * (H - PAD.top - PAD.bottom)

    const lines = drivers
      .filter((d) => d.lapTimes.length >= 2)
      .map((d) => ({
        driverNumber: d.driverNumber,
        acronym: d.acronym,
        colour: teamHex(d.teamColour),
        path: d.lapTimes
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.lap).toFixed(1)},${py(p.time).toFixed(1)}`)
          .join(' '),
        dots: d.lapTimes.map((p) => ({ x: px(p.lap), y: py(p.time) })),
      }))

    // Axis ticks.
    const lapTicks: number[] = []
    const tickCount = Math.min(6, lapMax - lapMin + 1)
    for (let i = 0; i < tickCount; i++) {
      lapTicks.push(Math.round(lapMin + (lapSpan * i) / Math.max(1, tickCount - 1)))
    }
    const timeTicks = [tMin, (tMin + tMax) / 2, tMax]

    return { W, H, px, py, lines, lapTicks, timeTicks }
  }, [drivers])

  if (!model) {
    return (
      <div className="chart-wrap">
        <div className="chart-empty">
          Select drivers below to compare lap-time series.
          <br />
          Need at least two completed laps.
        </div>
      </div>
    )
  }

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${model.W} ${model.H}`} preserveAspectRatio="none">
        <g className="chart-grid">
          {model.lapTicks.map((lap) => (
            <line
              key={`vx-${lap}`}
              x1={model.px(lap)}
              x2={model.px(lap)}
              y1={PAD.top}
              y2={model.H - PAD.bottom}
            />
          ))}
          {model.timeTicks.map((t, i) => (
            <line
              key={`hz-${i}`}
              x1={PAD.left}
              x2={model.W - PAD.right}
              y1={model.py(t)}
              y2={model.py(t)}
            />
          ))}
        </g>

        {/* time axis labels */}
        {model.timeTicks.map((t, i) => (
          <text
            key={`tl-${i}`}
            className="chart-axis-label"
            x={8}
            y={model.py(t) + 3}
          >
            {formatLapTime(t)}
          </text>
        ))}
        {/* lap axis labels */}
        {model.lapTicks.map((lap) => (
          <text
            key={`ll-${lap}`}
            className="chart-axis-label"
            x={model.px(lap)}
            y={model.H - 8}
            textAnchor="middle"
          >
            L{lap}
          </text>
        ))}

        {model.lines.map((ln) => (
          <g key={ln.driverNumber} style={{ color: ln.colour }}>
            <path className="chart-line" d={ln.path} stroke={ln.colour} />
            {ln.dots.map((dot, i) => (
              <circle
                key={i}
                className="chart-dot"
                cx={dot.x}
                cy={dot.y}
                r={i === ln.dots.length - 1 ? 6 : 3.5}
                fill={ln.colour}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}
