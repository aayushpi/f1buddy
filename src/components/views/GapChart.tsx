import { useMemo } from 'react'
import type { DriverState, RaceControlEntry } from '../../api/types'
import { teamHex, teamLineDash } from '../../utils/format'

interface Props {
  drivers: DriverState[] // sorted by position
  selected: Set<number> // which drivers to plot
  onToggle: (n: number) => void
  raceControl: RaceControlEntry[]
}

// SVG coordinate space (scaled to fit via viewBox).
const W = 1200
const H = 640
const M = { top: 54, right: 72, bottom: 40, left: 58 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

/** Safety-car / VSC lap ranges, derived from race-control messages. */
function scBands(rc: RaceControlEntry[], maxLap: number): [number, number][] {
  const sorted = [...rc].sort((a, b) => (a.date < b.date ? -1 : 1))
  const bands: [number, number][] = []
  let open: number | null = null
  for (const e of sorted) {
    const msg = (e.message ?? '').toUpperCase()
    if (e.category !== 'SafetyCar' && !msg.includes('SAFETY CAR')) continue
    const lap = e.lap ?? null
    const ending = msg.includes('ENDING') || msg.includes('IN THIS LAP')
    if (!ending && open == null) open = lap ?? 1
    else if (ending && open != null) {
      bands.push([open, lap ?? open])
      open = null
    }
  }
  if (open != null) bands.push([open, maxLap])
  return bands
}

function niceStep(max: number): number {
  if (max <= 10) return 2
  if (max <= 25) return 5
  if (max <= 60) return 10
  if (max <= 120) return 20
  return 30
}

export function GapChart({ drivers, selected, onToggle, raceControl }: Props) {
  const model = useMemo(() => {
    // Cumulative race time per lap for EVERY car, so the leader baseline is the
    // true race leader even when that car is toggled off.
    const series = drivers.map((d) => {
      let cum = 0
      const byLap = new Map<number, number>()
      for (const l of d.lapHistory) {
        if (l.time != null && l.time > 0) {
          cum += l.time
          byLap.set(l.lap, cum)
        }
      }
      return { driver: d, byLap }
    })

    const maxLap = series.reduce(
      (m, s) => Math.max(m, ...(s.byLap.size ? [...s.byLap.keys()] : [0])),
      0,
    )
    if (maxLap < 2) return null

    // Leader (smallest cumulative time) at each lap → everyone's gap to it.
    const leaderCum = new Map<number, number>()
    for (let lap = 1; lap <= maxLap; lap++) {
      let best = Infinity
      for (const s of series) {
        const c = s.byLap.get(lap)
        if (c != null && c < best) best = c
      }
      if (best < Infinity) leaderCum.set(lap, best)
    }

    // Plot only the selected drivers, but gap is always to the real leader.
    let maxGap = 1
    const lines = series
      .filter((s) => selected.has(s.driver.driverNumber))
      .map((s) => {
        const pts: { lap: number; gap: number }[] = []
        for (let lap = 1; lap <= maxLap; lap++) {
          const c = s.byLap.get(lap)
          const lead = leaderCum.get(lap)
          if (c != null && lead != null) {
            const gap = c - lead
            if (gap > maxGap) maxGap = gap
            pts.push({ lap, gap })
          }
        }
        return { driver: s.driver, pts }
      })

    return { lines, maxLap, maxGap, bands: scBands(raceControl, maxLap) }
  }, [drivers, selected, raceControl])

  const chips = (
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
  )

  const header = (
    <div className="gap-header">
      <div>
        <div className="gap-title">Gap to Leader</div>
      </div>
    </div>
  )

  if (!model || !model.lines.some((l) => l.pts.length >= 2)) {
    return (
      <div className="panel gapview">
        {header}
        {chips}
        <div className="gap-canvas">
          <div className="map-empty">
            {!model
              ? 'Waiting for lap data — at least two completed laps are needed.'
              : 'Select at least one driver to plot.'}
          </div>
        </div>
      </div>
    )
  }

  const { lines, maxLap, maxGap, bands } = model
  const dash = teamLineDash(drivers)
  const step = niceStep(maxGap)
  const yMax = Math.max(step, Math.ceil(maxGap / step) * step)

  const x = (lap: number) => M.left + ((lap - 1) / (maxLap - 1)) * PW
  const y = (gap: number) => M.top + (gap / yMax) * PH

  const xTicks: number[] = []
  for (let l = 1; l <= maxLap; l += 10) xTicks.push(l)
  if (xTicks[xTicks.length - 1] !== maxLap) xTicks.push(maxLap)

  const yTicks: number[] = []
  for (let g = 0; g <= yMax; g += step) yTicks.push(g)

  // Stagger labels vertically if two lines finish very close together.
  const labels = lines
    .filter((l) => l.pts.length)
    .map((l) => {
      const last = l.pts[l.pts.length - 1]
      return { acr: l.driver.acronym, colour: teamHex(l.driver.teamColour), lap: last.lap, gap: last.gap }
    })
    .sort((a, b) => a.gap - b.gap)
  let prevY = -Infinity
  const placed = labels.map((lb) => {
    let ly = y(lb.gap)
    if (ly - prevY < 16) ly = prevY + 16
    prevY = ly
    return { ...lb, ly }
  })

  return (
    <div className="panel gapview">
      {header}
      {chips}

      <div className="gap-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="gap-svg">
          {/* Safety-car / VSC bands */}
          {bands.map(([a, b], i) => {
            const x0 = x(a)
            const x1 = x(Math.max(b, a + 0.4))
            return <rect key={i} className="gap-band" x={x0} y={M.top} width={Math.max(3, x1 - x0)} height={PH} />
          })}

          {/* Y gridlines + labels */}
          {yTicks.map((g) => (
            <g key={g}>
              <line className="gap-grid" x1={M.left} y1={y(g)} x2={M.left + PW} y2={y(g)} />
              <text className="gap-axis" x={M.left - 10} y={y(g) + 5} textAnchor="end">
                {g}s
              </text>
            </g>
          ))}

          {/* Leader baseline */}
          <line className="gap-zero" x1={M.left} y1={y(0)} x2={M.left + PW} y2={y(0)} />

          {/* X ticks + labels */}
          {xTicks.map((l) => (
            <text key={l} className="gap-axis" x={x(l)} y={H - 12} textAnchor="middle">
              {l}
            </text>
          ))}

          {/* Driver traces */}
          {lines.map((l) => {
            if (l.pts.length < 2) return null
            const d = l.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.lap).toFixed(1)},${y(p.gap).toFixed(1)}`).join(' ')
            return (
              <path
                key={l.driver.driverNumber}
                d={d}
                fill="none"
                stroke={teamHex(l.driver.teamColour)}
                strokeWidth={2.5}
                strokeDasharray={dash.get(l.driver.driverNumber) || undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {/* Driver labels at the right end */}
          {placed.map((lb) => (
            <text
              key={lb.acr}
              className="gap-label"
              x={x(lb.lap) + 10}
              y={lb.ly + 5}
              fill={lb.colour}
            >
              {lb.acr}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
