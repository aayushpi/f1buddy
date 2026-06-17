import { useMemo } from 'react'
import type { LapPoint } from '../api/types'
import { teamHex } from '../utils/format'

// A compact lap-time trend drawn inside each timing-tower row. Lower is faster,
// so we invert the Y axis for an intuitive "down = quicker" read.
export function RowSparkline({ points, colour }: { points: LapPoint[]; colour: string }) {
  const path = useMemo(() => {
    if (points.length < 2) return null
    const w = 90
    const h = 26
    const pad = 3
    const times = points.map((p) => p.time)
    const min = Math.min(...times)
    const max = Math.max(...times)
    const span = max - min || 1
    const stepX = (w - pad * 2) / (points.length - 1)
    return points
      .map((p, i) => {
        const x = pad + i * stepX
        const y = pad + ((p.time - min) / span) * (h - pad * 2)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [points])

  if (!path) return <div className="row-spark" />

  const hex = teamHex(colour)
  const last = points.at(-1)!
  const min = Math.min(...points.map((p) => p.time))
  const max = Math.max(...points.map((p) => p.time))
  const span = max - min || 1
  const lastX = 3 + (points.length - 1) * ((90 - 6) / (points.length - 1))
  const lastY = 3 + ((last.time - min) / span) * (26 - 6)

  return (
    <svg className="row-spark" viewBox="0 0 90 26" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={hex} strokeWidth={1.6} strokeLinejoin="round" opacity={0.95} />
      <circle cx={lastX} cy={lastY} r={2} fill={hex} />
    </svg>
  )
}
