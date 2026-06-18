interface Props {
  values: number[]
  colour: string
  height?: number
  min?: number
  max?: number
  fill?: boolean
}

// A lightweight line/area chart for a single numeric series, drawn in a
// normalized 100x?? viewBox and stretched to fit its container.
export function MiniLine({ values, colour, height = 40, min, max, fill = false }: Props) {
  if (values.length < 2) return <div style={{ height }} />
  const W = 100
  const H = 36
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo || 1
  const step = W / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = i * step
    const y = H - ((v - lo) / span) * H
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block', color: colour }}
    >
      {fill && <path d={area} fill={colour} opacity={0.12} />}
      <path d={line} fill="none" stroke={colour} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
