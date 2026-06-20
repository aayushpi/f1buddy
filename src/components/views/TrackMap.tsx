import { useMemo } from 'react'
import type { TrackMapCar } from '../../api/types'
import { teamHex } from '../../utils/format'
import { DRS_ZONES, positionAt, trackBounds, trackPath } from '../../data/circuit'

interface Props {
  cars: TrackMapCar[]
  // Ordered circuit outline traced from the location feed (real sessions).
  outline?: { x: number; y: number }[] | null
  // Draw the synthetic demo circuit (sim mode) with its DRS zones.
  showSimOutline: boolean
}

function drsZonePath(a: number, b: number): string {
  const pts: string[] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const p = positionAt(a + ((b - a) * i) / steps)
    pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  }
  return pts.join(' ')
}

function polyPath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

export function TrackMap({ cars, outline, showSimOutline }: Props) {
  const hasOutline = !!outline && outline.length > 2

  const view = useMemo(() => {
    let minX: number, maxX: number, minY: number, maxY: number
    if (hasOutline) {
      const xs = outline!.map((p) => p.x)
      const ys = outline!.map((p) => p.y)
      minX = Math.min(...xs); maxX = Math.max(...xs)
      minY = Math.min(...ys); maxY = Math.max(...ys)
    } else if (showSimOutline) {
      const b = trackBounds()
      minX = b.minX; maxX = b.maxX; minY = b.minY; maxY = b.maxY
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
  }, [outline, hasOutline, cars, showSimOutline])

  const carR = view.scale * 0.018
  const lineW = view.scale * 0.0055

  return (
    <div className="panel mapview">
      <div className="panel-title">
        <span className="dot" />
        Track Map
        {showSimOutline && !hasOutline && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontWeight: 600 }}>
            <span style={{ color: 'var(--accent)' }}>━ DRS Zone</span>
          </span>
        )}
      </div>
      <div className="map-canvas">
        <svg viewBox={view.viewBox} preserveAspectRatio="xMidYMid meet" className="map-svg">
          <g transform="scale(1,-1)">
            {hasOutline ? (
              <path d={polyPath(outline!)} className="track-outline" style={{ strokeWidth: lineW }} />
            ) : (
              showSimOutline && (
                <>
                  <path d={trackPath} className="track-outline" />
                  {DRS_ZONES.map(([a, b], i) => (
                    <path key={i} d={drsZonePath(a, b)} className="track-drs" />
                  ))}
                </>
              )
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
