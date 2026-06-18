import { useMemo } from 'react'
import type { TrackMapCar } from '../../api/types'
import { teamHex } from '../../utils/format'
import { DRS_ZONES, positionAt, trackBounds, trackPath } from '../../data/circuit'

interface Props {
  cars: TrackMapCar[]
  showOutline: boolean
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

export function TrackMap({ cars, showOutline }: Props) {
  const view = useMemo(() => {
    let minX: number, maxX: number, minY: number, maxY: number
    if (showOutline) {
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
    const padX = (maxX - minX) * 0.1 + 60
    const padY = (maxY - minY) * 0.1 + 60
    minX -= padX; maxX += padX; minY -= padY; maxY += padY
    // Flip Y so the track is upright in screen space.
    return {
      viewBox: `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`,
      scale: Math.max(maxX - minX, maxY - minY),
    }
  }, [cars, showOutline])

  const carR = view.scale * 0.022

  return (
    <div className="panel mapview">
      <div className="panel-title">
        <span className="dot" />
        Track Map
        {showOutline && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontWeight: 600 }}>
            <span style={{ color: 'var(--accent)' }}>━ DRS Zone</span>
          </span>
        )}
      </div>
      <div className="map-canvas">
        <svg viewBox={view.viewBox} preserveAspectRatio="xMidYMid meet" className="map-svg">
          <g transform="scale(1,-1)">
            {showOutline && (
              <>
                <path d={trackPath} className="track-outline" />
                {DRS_ZONES.map(([a, b], i) => (
                  <path key={i} d={drsZonePath(a, b)} className="track-drs" />
                ))}
              </>
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
                <circle r={carR} fill={hex} stroke="#05070d" strokeWidth={carR * 0.18} />
                {c.drs === 'on' && (
                  <circle r={carR * 1.7} fill="none" stroke="var(--accent)" strokeWidth={carR * 0.18} opacity={0.8} />
                )}
                <text
                  x={carR * 1.9}
                  y={carR * 0.6}
                  fontSize={carR * 1.7}
                  fill="#fff"
                  fontWeight={800}
                  style={{ paintOrder: 'stroke', stroke: '#05070d', strokeWidth: carR * 0.5 }}
                >
                  {c.acronym}
                </text>
              </g>
            )
          })}
        </svg>
        {!cars.length && (
          <div className="map-empty">
            No live positional data available for this session.
            <br />
            Track positions stream from OpenF1's <b>location</b> feed.
          </div>
        )}
      </div>
    </div>
  )
}
