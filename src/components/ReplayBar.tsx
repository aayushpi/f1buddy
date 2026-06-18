import { SPEEDS, type ReplayControls } from '../store/useRaceData'

interface Props {
  replay: ReplayControls
  currentLap: number | null
}

function clock(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-GB', { hour12: false })
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function ReplayBar({ replay, currentLap }: Props) {
  const { tMin, tMax, tNow, playing, speed } = replay
  const dur = tMax - tMin || 1
  const pct = ((tNow - tMin) / dur) * 100
  const atEnd = tNow >= tMax - 250

  return (
    <div className="panel replaybar">
      <button className="replay-play" onClick={replay.toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : atEnd ? '↺' : '▶'}
      </button>

      <div className="replay-lap">
        <span className="kicker">Lap</span>
        <span className="mono val">{currentLap ?? '—'}</span>
      </div>

      <div className="replay-scrub">
        <span className="mono time">{clock(tNow)}</span>
        <div className="scrub-wrap">
          <input
            className="scrub"
            type="range"
            min={tMin}
            max={tMax}
            step={1000}
            value={tNow}
            onChange={(e) => replay.seek(Number(e.target.value))}
            style={{ ['--pct' as string]: `${pct}%` }}
          />
        </div>
        <span className="mono time total">{elapsed(tNow - tMin)} / {elapsed(dur)}</span>
      </div>

      <div className="seg replay-speeds">
        {SPEEDS.map((s) => (
          <button key={s} className={s === speed ? 'active' : ''} onClick={() => replay.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
