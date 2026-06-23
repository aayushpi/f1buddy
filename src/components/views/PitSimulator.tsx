import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { DriverState } from '../../api/types'
import type { PitLoss } from '../../data/pitTimes'
import { teamHex } from '../../utils/format'

// Gaps at or above this are "clear air" — painted green.
const CLEAR_AIR = 5

type PitType = 'green' | 'vsc' | 'sc'

const PIT_LABEL: Record<PitType, string> = { green: 'PIT', vsc: 'VSC PIT', sc: 'SC PIT' }

interface Props {
  drivers: DriverState[]
  pitLoss: PitLoss
  circuit: string
}

// A driver's cumulative race time relative to the leader, in seconds. The
// leader sits at 0; everyone else is their live gap-to-leader. Lapped/retired
// cars (a string gap, or no gap at all) can't be placed on the same numeric
// scale, so they return null and sit at the back, untouched by the sim.
function baseTime(d: DriverState): number | null {
  if (d.isLeader) return 0
  if (typeof d.gapToLeader === 'number' && Number.isFinite(d.gapToLeader)) return d.gapToLeader
  return null
}

function gapText(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds <= 0.0005) return '+0.0'
  return `+${seconds.toFixed(1)}`
}

interface ProjectedRow {
  d: DriverState
  position: number
  interval: number | null // gap to the car ahead in the projected order
  leaderGap: number | null
  pitted: PitType | null
  delta: number | null // places gained (+) / lost (−) vs the live order
}

function GapCell({ value, label }: { value: number | null; label?: string }) {
  const clear = value != null && value >= CLEAR_AIR
  return (
    <span className={`ps-gap mono ${clear ? 'clear-air' : ''}`} title={clear ? 'Clear air (>5s)' : undefined}>
      {label ?? gapText(value)}
    </span>
  )
}

export function PitSimulator({ drivers, pitLoss, circuit }: Props) {
  // driverNumber -> the kind of stop being simulated for that car.
  const [pits, setPits] = useState<Map<number, PitType>>(new Map())

  const setPit = (num: number, type: PitType) =>
    setPits((prev) => {
      const next = new Map(prev)
      if (next.get(num) === type) next.delete(num) // tap the active button again to clear
      else next.set(num, type)
      return next
    })

  const clearAll = () => setPits(new Map())

  // Live order (column one) — drivers arrive already sorted by position.
  const live = drivers
  const livePos = useMemo(() => {
    const m = new Map<number, number>()
    live.forEach((d, i) => m.set(d.driverNumber, d.position ?? i + 1))
    return m
  }, [live])

  // Projected order (column two): add the chosen pit loss to each pitting
  // driver's race time and re-sort.
  const projected = useMemo<ProjectedRow[]>(() => {
    const cost: Record<PitType, number> = { green: pitLoss.green, vsc: pitLoss.vsc, sc: pitLoss.sc }

    const racing: { d: DriverState; t: number; pitted: PitType | null }[] = []
    const trailing: DriverState[] = [] // lapped / retired — kept at the back

    for (const d of live) {
      const base = baseTime(d)
      if (base == null) {
        trailing.push(d)
        continue
      }
      const pitted = pits.get(d.driverNumber) ?? null
      racing.push({ d, t: base + (pitted ? cost[pitted] : 0), pitted })
    }

    racing.sort((a, b) => a.t - b.t)
    const leaderT = racing.length ? racing[0].t : 0

    const rows: ProjectedRow[] = racing.map((r, i) => {
      const pos = i + 1
      const prevT = i === 0 ? r.t : racing[i - 1].t
      const oldPos = livePos.get(r.d.driverNumber) ?? pos
      return {
        d: r.d,
        position: pos,
        interval: i === 0 ? null : r.t - prevT,
        leaderGap: i === 0 ? null : r.t - leaderT,
        pitted: r.pitted,
        delta: oldPos - pos, // positive => moved up
      }
    })

    let pos = racing.length
    for (const d of trailing) {
      pos += 1
      rows.push({ d, position: pos, interval: null, leaderGap: null, pitted: pits.get(d.driverNumber) ?? null, delta: null })
    }
    return rows
  }, [live, pits, pitLoss, livePos])

  const pitCount = pits.size

  return (
    <div className="panel ps-panel">
      <div className="panel-title">
        <span className="dot" />
        Pit Simulator
        <span className="ps-circuit">{circuit}</span>
        <div className="ps-losses">
          <span className="ps-loss-chip green">PIT {pitLoss.green.toFixed(0)}s</span>
          <span className="ps-loss-chip vsc">VSC {pitLoss.vsc.toFixed(0)}s</span>
          <span className="ps-loss-chip sc">SC {pitLoss.sc.toFixed(0)}s</span>
        </div>
        {pitCount > 0 && (
          <button className="ps-clear" onClick={clearAll}>
            Clear ({pitCount})
          </button>
        )}
      </div>

      <div className="ps-cols">
        {/* ---- Column one: live race pace ---- */}
        <div className="ps-col">
          <div className="ps-col-head">
            <span className="ps-col-title">Live Race Pace</span>
            <span className="ps-col-sub">tap a stop to simulate</span>
          </div>
          <div className="ps-head live">
            <div>P</div>
            <div className="ps-c-driver">Driver</div>
            <div>Interval</div>
            <div>Leader</div>
            <div className="ps-c-actions">Simulate stop</div>
          </div>
          <div className="ps-body">
            <AnimatePresence>
              {live.map((d) => {
                const active = pits.get(d.driverNumber) ?? null
                const team = teamHex(d.teamColour)
                const interval = typeof d.interval === 'number' ? d.interval : null
                const leader = typeof d.gapToLeader === 'number' ? d.gapToLeader : null
                return (
                  <motion.div
                    layout
                    key={d.driverNumber}
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                    className={`ps-row ${active ? 'pitting' : ''}`}
                    style={{ ['--team' as string]: team }}
                  >
                    <div className="ps-pos">{d.position ?? '–'}</div>
                    <div className="ps-driver">
                      <span className="ps-acr" style={{ color: team }}>
                        {d.acronym}
                      </span>
                      <span className="ps-team">{d.teamName}</span>
                    </div>
                    <GapCell value={d.isLeader ? null : interval} label={d.isLeader ? '—' : undefined} />
                    <GapCell value={d.isLeader ? null : leader} label={d.isLeader ? 'LEADER' : undefined} />
                    <div className="ps-actions">
                      {(['green', 'vsc', 'sc'] as PitType[]).map((t) => (
                        <button
                          key={t}
                          className={`ps-btn ${t} ${active === t ? 'on' : ''}`}
                          onClick={() => setPit(d.driverNumber, t)}
                          title={`${PIT_LABEL[t]} · +${pitLoss[t].toFixed(0)}s`}
                        >
                          {PIT_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* ---- Column two: projected after pit ---- */}
        <div className="ps-col">
          <div className="ps-col-head">
            <span className="ps-col-title">Projected Order</span>
            <span className="ps-col-sub">{pitCount > 0 ? `${pitCount} stop${pitCount > 1 ? 's' : ''} applied` : 'waiting for input'}</span>
          </div>
          <div className="ps-head proj">
            <div>P</div>
            <div className="ps-c-driver">Driver</div>
            <div>Interval</div>
            <div>Leader</div>
            <div className="ps-c-move">±</div>
          </div>
          <div className="ps-body">
            <AnimatePresence>
              {projected.map((r) => {
                const team = teamHex(r.d.teamColour)
                const moved = r.delta != null && r.delta !== 0
                return (
                  <motion.div
                    layout
                    key={r.d.driverNumber}
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                    className={`ps-row ${r.pitted ? `pitting ${r.pitted}` : ''}`}
                    style={{ ['--team' as string]: team }}
                  >
                    <div className="ps-pos">{r.position}</div>
                    <div className="ps-driver">
                      <span className="ps-acr" style={{ color: team }}>
                        {r.d.acronym}
                      </span>
                      {r.pitted ? (
                        <span className={`ps-tag ${r.pitted}`}>{PIT_LABEL[r.pitted]}</span>
                      ) : (
                        <span className="ps-team">{r.d.teamName}</span>
                      )}
                    </div>
                    <GapCell value={r.interval} label={r.leaderGap == null && r.interval == null ? '—' : undefined} />
                    <GapCell value={r.leaderGap} label={r.leaderGap == null ? 'LEADER' : undefined} />
                    <div className={`ps-move ${moved ? (r.delta! > 0 ? 'up' : 'down') : ''}`}>
                      {moved ? `${r.delta! > 0 ? '▲' : '▼'}${Math.abs(r.delta!)}` : '—'}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
