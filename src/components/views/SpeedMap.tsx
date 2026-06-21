import { useMemo, useState } from 'react'
import type { ChannelPoint } from '../../api/types'

type Mode = 'speed' | 'gear' | 'drs'

// Gear palette, indexed 1..8 (0 = neutral/unknown).
const GEAR_COLORS = [
  '#5b6472', '#2f8fff', '#19e3ff', '#22e07a', '#9be24a', '#f6d33f', '#ff9d2f', '#ff5b3b', '#ff2bd0',
]

function speedColor(t: number): string {
  const h = 240 * (1 - Math.max(0, Math.min(1, t))) // blue (slow) → red (fast)
  return `hsl(${h.toFixed(0)} 92% 55%)`
}
function gearColor(g: number): string {
  return GEAR_COLORS[Math.max(0, Math.min(8, Math.round(g)))] ?? '#5b6472'
}
const DRS_OFF = 'rgba(150, 170, 200, 0.22)'

interface Props {
  channels: ChannelPoint[] | null
}

export function SpeedMap({ channels }: Props) {
  const [mode, setMode] = useState<Mode>('speed')

  const view = useMemo(() => {
    if (!channels || channels.length < 2) return null
    const xs = channels.map((p) => p.x)
    const ys = channels.map((p) => p.y)
    let minX = Math.min(...xs), maxX = Math.max(...xs)
    let minY = Math.min(...ys), maxY = Math.max(...ys)
    const padX = (maxX - minX) * 0.08 + 50
    const padY = (maxY - minY) * 0.08 + 50
    minX -= padX; maxX += padX; minY -= padY; maxY += padY
    const speeds = channels.map((p) => p.speed)
    return {
      viewBox: `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`,
      scale: Math.max(maxX - minX, maxY - minY),
      vmin: Math.min(...speeds),
      vmax: Math.max(...speeds),
    }
  }, [channels])

  const header = (
    <div className="gap-header">
      <div>
        <div className="gap-title">Speed Map</div>
        <div className="gap-sub">Circuit painted by car telemetry — one flying lap</div>
      </div>
      <div className="seg sm-toggle">
        {(['speed', 'gear', 'drs'] as Mode[]).map((m) => (
          <button key={m} className={m === mode ? 'active' : ''} onClick={() => setMode(m)}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )

  if (!channels || !view) {
    return (
      <div className="panel gapview">
        {header}
        <div className="gap-canvas">
          <div className="map-empty">
            Painting the circuit from telemetry…
            <br />
            Speed, gear and DRS come from one reference lap of the leader.
          </div>
        </div>
      </div>
    )
  }

  const lineW = view.scale * 0.013
  const colorAt = (p: ChannelPoint) =>
    mode === 'speed'
      ? speedColor((p.speed - view.vmin) / (view.vmax - view.vmin || 1))
      : mode === 'gear'
        ? gearColor(p.gear)
        : p.drs
          ? 'var(--green)'
          : DRS_OFF

  const segs = []
  for (let i = 1; i < channels.length; i++) {
    const a = channels[i - 1]
    const b = channels[i]
    segs.push(
      <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorAt(a)} strokeWidth={lineW} strokeLinecap="round" />,
    )
  }

  return (
    <div className="panel gapview speedmap">
      {header}
      <div className="gap-canvas">
        <svg viewBox={view.viewBox} preserveAspectRatio="xMidYMid meet" className="gap-svg">
          <g transform="scale(1,-1)" strokeLinejoin="round">
            {segs}
          </g>
        </svg>

        <div className="sm-legend">
          {mode === 'speed' && (
            <>
              <span className="sm-l">{Math.round(view.vmin)}</span>
              <span className="sm-bar" />
              <span className="sm-l">{Math.round(view.vmax)} km/h</span>
            </>
          )}
          {mode === 'gear' &&
            [1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
              <span key={g} className="sm-key">
                <span className="sw" style={{ background: gearColor(g) }} />
                {g}
              </span>
            ))}
          {mode === 'drs' && (
            <>
              <span className="sm-key">
                <span className="sw" style={{ background: 'var(--green)' }} />
                DRS open
              </span>
              <span className="sm-key">
                <span className="sw" style={{ background: DRS_OFF }} />
                closed
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
