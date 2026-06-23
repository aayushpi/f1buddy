import { useMemo } from 'react'
import type { TrackMapCar } from '../../api/types'
import { teamHex } from '../../utils/format'
import { findCircuit } from '../../data/circuits'
import { alignOutline, type Pt } from '../../utils/trackAlign'

// Reject a library outline whose best fit onto the live trace is worse than this
// (fraction of the track's bounding-box diagonal) and fall back to the trace.
const ALIGN_MAX_RESIDUAL = 0.1

interface Props {
  cars: TrackMapCar[]
  // Ordered circuit outline traced from the location feed.
  outline?: Pt[] | null
  // Candidate names (circuit / country / meeting) to match a library circuit.
  circuit?: (string | null | undefined)[]
}

function polyPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

export function TrackMap({ cars, outline, circuit }: Props) {
  const circuitKey = (circuit ?? []).filter(Boolean).join('|')

  // Prefer a clean library outline registered onto the live (location-feed)
  // frame so the cars still sit on it; fall back to the raw trace when there's
  // no matching circuit or the fit is poor.
  const drawn = useMemo<Pt[] | null>(() => {
    const traced = outline && outline.length > 2 ? outline : null
    const names = circuitKey ? circuitKey.split('|') : []
    const lib = names.length ? findCircuit(...names) : null
    if (lib && traced) {
      const staticPts = lib.points.map(([x, y]) => ({ x, y }))
      const aligned = alignOutline(staticPts, traced)
      if (aligned && aligned.residual <= ALIGN_MAX_RESIDUAL) return aligned.points
    }
    return traced
  }, [outline, circuitKey])

  const hasOutline = !!drawn && drawn.length > 2

  const view = useMemo(() => {
    let minX: number, maxX: number, minY: number, maxY: number
    if (hasOutline) {
      const xs = drawn!.map((p) => p.x)
      const ys = drawn!.map((p) => p.y)
      minX = Math.min(...xs); maxX = Math.max(...xs)
      minY = Math.min(...ys); maxY = Math.max(...ys)
    } else if (cars.length) {
      minX = Math.min(...cars.map((c) => c.x))
      maxX = Math.max(...cars.map((c) => c.x))
      minY = Math.min(...cars.map((c) => c.y))
      maxY = Math.max(...cars.map((c) => c.y))
    } else {
      minX = -1000; maxX = 1000; minY = -1000; maxY = 1000
    }
    const padX = (maxX - minX) * 0.08 + 50
    const padY = (maxY - minY) * 0.08 + 50
    minX -= padX; maxX += padX; minY -= padY; maxY += padY
    // Flip Y so the track is upright in screen space.
    return {
      viewBox: `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`,
      scale: Math.max(maxX - minX, maxY - minY),
    }
  }, [drawn, hasOutline, cars])

  const carR = view.scale * 0.018
  const lineW = view.scale * 0.0055

  return (
    <div className="panel mapview">
      <div className="panel-title">
        <span className="dot" />
        Track Map
      </div>
      <div className="map-canvas">
        <svg viewBox={view.viewBox} preserveAspectRatio="xMidYMid meet" className="map-svg">
          <g transform="scale(1,-1)">
            {hasOutline && (
              <path d={polyPath(drawn!)} className="track-outline" style={{ strokeWidth: lineW }} />
            )}
          </g>

          {cars.map((c) => {
            const hex = teamHex(c.colour)
            return (
              <g
                key={c.driverNumber}
                style={{
                  transform: `translate(${c.x}px, ${-c.y}px)`,
                  transition: 'transform 1s linear',
                }}
              >
                <circle r={carR} fill={hex} stroke="#05070d" strokeWidth={carR * 0.18} opacity={c.inPit ? 0.5 : 1} />
                {c.drs === 'on' && (
                  <circle r={carR * 1.7} fill="none" stroke="var(--accent)" strokeWidth={carR * 0.18} opacity={0.8} />
                )}
                <text
                  x={carR * 1.9}
                  y={carR * 0.55}
                  fontSize={carR * 1.5}
                  fill="#fff"
                  fontWeight={800}
                  style={{ paintOrder: 'stroke', stroke: '#05070d', strokeWidth: carR * 0.55 }}
                >
                  {c.acronym}
                </text>
              </g>
            )
          })}
        </svg>
        {!cars.length && (
          <div className="map-empty">
            {hasOutline ? 'Waiting for car positions…' : 'Loading car positions…'}
            <br />
            Track positions stream from OpenF1's free <b>location</b> feed.
          </div>
        )}
      </div>
    </div>
  )
}
