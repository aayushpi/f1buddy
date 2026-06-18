import { useRef, useState } from 'react'
import type { OvertakeEvent, RaceControlEntry, RadioClip } from '../../api/types'
import { teamHex, timeOfDay } from '../../utils/format'

interface Props {
  log: RaceControlEntry[]
  overtakes: OvertakeEvent[]
  radios: RadioClip[]
}

function flagClass(entry: RaceControlEntry): string {
  if (entry.category === 'SafetyCar') return 'rc-sc'
  const f = (entry.flag ?? '').toUpperCase()
  if (f === 'RED') return 'rc-red'
  if (f.includes('YELLOW')) return 'rc-yellow'
  if (f === 'GREEN' || f === 'CLEAR' || f === 'CHEQUERED') return 'rc-green'
  if (f === 'BLUE') return 'rc-blue'
  return ''
}

function RadioPlayer({ clip }: { clip: RadioClip }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(clip.url)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.currentTime = 0
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  return (
    <button className={`radio-play ${playing ? 'on' : ''}`} onClick={toggle} aria-label="Play team radio">
      {playing ? '❚❚' : '▶'}
    </button>
  )
}

export function RaceControlView({ log, overtakes, radios }: Props) {
  return (
    <div className="control-view">
      <div className="panel rc-log">
        <div className="panel-title">
          <span className="dot" />
          Race Control
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600 }}>{log.length}</span>
        </div>
        <div className="strat-scroll">
          {log.length ? (
            log.map((m, i) => (
              <div key={i} className={`rc-row ${flagClass(m)}`}>
                <span className="rc-flag" />
                <span className="mono rc-time">{timeOfDay(m.date)}</span>
                {m.lap != null && <span className="mono rc-lap">L{m.lap}</span>}
                <span className="rc-msg">{m.message}</span>
              </div>
            ))
          ) : (
            <div className="chart-empty">No race-control messages yet.</div>
          )}
        </div>
      </div>

      <div className="control-side">
        <div className="panel rc-overtakes">
          <div className="panel-title">
            <span className="dot" />
            Overtakes
            <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600 }}>
              {overtakes.length}
            </span>
          </div>
          <div className="strat-scroll">
            {overtakes.length ? (
              overtakes.map((o, i) => (
                <div key={i} className="ot-row">
                  <span className="acr" style={{ color: teamHex(o.byColour) }}>
                    {o.byAcronym}
                  </span>
                  <span className="ot-arrow">▸ P{o.position} ▸</span>
                  <span className="acr dim">{o.onAcronym}</span>
                  <span className="mono ot-time">{timeOfDay(o.date)}</span>
                </div>
              ))
            ) : (
              <div className="chart-empty">No overtakes recorded.</div>
            )}
          </div>
        </div>

        <div className="panel rc-radio">
          <div className="panel-title">
            <span className="dot" />
            Team Radio
            <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600 }}>
              {radios.length}
            </span>
          </div>
          <div className="strat-scroll">
            {radios.length ? (
              radios.map((r, i) => (
                <div key={i} className="radio-row">
                  {r.url ? <RadioPlayer clip={r} /> : <span className="radio-play disabled">▶</span>}
                  <span className="acr" style={{ color: teamHex(r.colour) }}>
                    {r.acronym}
                  </span>
                  <span className="mono radio-time">{timeOfDay(r.date)}</span>
                </div>
              ))
            ) : (
              <div className="chart-empty">No team radio clips.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
