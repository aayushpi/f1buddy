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
  const { tMin, tMax, tNow, playing, speed, lapMarkers, live, atLive } = replay
  const dur = tMax - tMin || 1
  const pct = ((tNow - tMin) / dur) * 100
  const atEnd = tNow >= tMax - 250

  // Everything before lap 1 (formation / grid / standing start) is "pre-race".
  // We keep it on the timeline but shade it so it's clearly not racing.
  const raceStartT = lapMarkers.length ? lapMarkers[0].t : tMin
  const prePct = Math.max(0, Math.min(100, ((raceStartT - tMin) / dur) * 100))
  const showPreBand = prePct > 0.8
  const showPreLabel = prePct >= 7

  // Show every lap as a notch; label majors so a long race stays legible.
  const majorEvery = lapMarkers.length > 40 ? 10 : 5
  const jumpToLap = (lap: number) => {
    const m = lapMarkers.find((x) => x.lap === lap)
    if (m) replay.seek(m.t)
  }
  const cur = currentLap ?? 0

  return (
    <div className="panel replaybar">
      <button className="replay-play" onClick={replay.toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : atEnd ? '↺' : '▶'}
      </button>

      <div className="replay-lapnav">
        <button onClick={() => jumpToLap(cur - 1)} disabled={cur <= 1} aria-label="Previous lap">
          ‹
        </button>
        <div className="replay-lap">
          <span className="kicker">Lap</span>
          <span className="mono val">{currentLap ?? '—'}</span>
        </div>
        <button onClick={() => jumpToLap(cur + 1)} aria-label="Next lap">
          ›
        </button>
      </div>

      <div className="replay-scrub">
        <span className="mono time">{clock(tNow)}</span>
        <div className="scrub-wrap">
          <div className="lap-ticks">
            {showPreLabel && (
              <span className="prerace-label" style={{ left: 0 }}>
                Pre-race
              </span>
            )}
            {lapMarkers.map((m) => {
              const left = ((m.t - tMin) / dur) * 100
              if (left < 0 || left > 100) return null
              const major = m.lap % majorEvery === 0 || m.lap === 1
              return (
                <button
                  key={m.lap}
                  className={`lap-tick ${major ? 'major' : ''} ${m.lap === cur ? 'now' : ''}`}
                  style={{ left: `${left}%` }}
                  title={`Jump to lap ${m.lap}`}
                  onClick={() => replay.seek(m.t)}
                >
                  {major && <span className="lap-num">{m.lap}</span>}
                </button>
              )
            })}
          </div>
          {showPreBand && <div className="prerace-band" style={{ width: `${prePct}%` }} />}
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
        <span className="mono time total">
          {elapsed(tNow - tMin)} / {elapsed(dur)}
        </span>
      </div>

      <div className="seg replay-speeds">
        {SPEEDS.map((s) => (
          <button key={s} className={s === speed ? 'active' : ''} onClick={() => replay.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>

      {live && (
        <button
          className={`live-btn ${atLive ? 'on' : ''}`}
          onClick={replay.goLive}
          disabled={atLive}
          title={atLive ? 'Watching live' : 'Jump to the live edge'}
        >
          <span className="live-dot" />
          LIVE
        </button>
      )}
    </div>
  )
}
