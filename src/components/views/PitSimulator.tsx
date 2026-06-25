import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { DriverState, StintRow } from '../../api/types'
import type { PitLoss } from '../../data/pitTimes'
import { compoundColor, compoundLabel, teamHex } from '../../utils/format'

// Gaps at or above this are "clear air" — painted green.
const CLEAR_AIR = 5

type PitType = 'green' | 'vsc' | 'sc'

const PIT_LABEL: Record<PitType, string> = { green: 'PIT', vsc: 'VSC PIT', sc: 'SC PIT' }

interface Props {
  drivers: DriverState[]
  stints: StintRow[]
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

interface Link {
  num: number
  colour: string
  x1: number
  y1: number
  x2: number
  y2: number
  moved: boolean
}

function GapCell({ value, label }: { value: number | null; label?: string }) {
  const clear = value != null && value >= CLEAR_AIR
  return (
    <div className={`ps-gap mono ${clear ? 'clear-air' : ''}`}>
      <span className="ps-gap-val">{label ?? gapText(value)}</span>
      {clear && <span className="ps-air" title="Gap over 5s — clear air">CLEAR AIR</span>}
    </div>
  )
}

// The ordered list of compounds a driver has run, from the stint feed.
function TyreStrip({ compounds, stops }: { compounds: string[]; stops: number }) {
  return (
    <div className="ps-tyres">
      {compounds.length ? (
        compounds.map((c, i) => (
          <span
            key={i}
            className="ps-tyre"
            style={{ ['--tyre' as string]: compoundColor(c) }}
            title={c ?? 'Unknown compound'}
          >
            {compoundLabel(c)}
          </span>
        ))
      ) : (
        <span className="ps-tyre empty">—</span>
      )}
      <span className="ps-stops" title="Completed pit stops">
        {stops} {stops === 1 ? 'stop' : 'stops'}
      </span>
    </div>
  )
}

export function PitSimulator({ drivers, stints, pitLoss, circuit }: Props) {
  // driverNumber -> the kind of stop being simulated for that car.
  const [pits, setPits] = useState<Map<number, PitType>>(new Map())

  // Editable pit-loss times (seconds). Seeded from the circuit defaults; reset
  // when the circuit/session changes. A modal lets the user tune them by hand.
  const [loss, setLoss] = useState<PitLoss>(pitLoss)
  const [editing, setEditing] = useState<PitType | null>(null)
  useEffect(() => {
    setLoss(pitLoss)
    // Only re-seed on a new circuit, not on every render (pitLoss is rebuilt each time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuit])
  const adjust = (type: PitType, delta: number) =>
    setLoss((prev) => ({ ...prev, [type]: Math.max(0, Math.round((prev[type] + delta) * 10) / 10) }))

  // driverNumber -> ordered compounds run this race (oldest stint first).
  const tyresByDriver = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const row of stints) {
      const seq = [...row.segments]
        .sort((a, b) => a.lapStart - b.lapStart)
        .map((s) => s.compound ?? '?')
      m.set(row.driverNumber, seq)
    }
    return m
  }, [stints])

  const setPit = (num: number, type: PitType) =>
    setPits((prev) => {
      const next = new Map(prev)
      if (next.get(num) === type) next.delete(num) // tap the active button again to clear
      else next.set(num, type)
      return next
    })

  const clearAll = () => setPits(new Map())

  // Pit every car with the given stop type, so the user can then toggle a few
  // off to compare scenarios.
  const pitAll = (type: PitType) =>
    setPits(new Map(drivers.map((d) => [d.driverNumber, type])))

  // Live order (column one) — drivers arrive already sorted by position. This
  // order is the single source of truth: column two is built from it, so with
  // no stop simulated it mirrors column one exactly and never drifts on its own
  // as the live gap figures jitter between polls.
  const live = drivers

  // Projected order (column two). We anchor each car's race time to the LIVE
  // order (forced strictly increasing so a sort can't reshuffle equal/!noisy
  // gaps), then add the chosen pit loss to whoever is pitting and re-sort. No
  // pits => identical order, zero deltas, flat connector lines.
  const projected = useMemo<ProjectedRow[]>(() => {
    const cost: Record<PitType, number> = { green: loss.green, vsc: loss.vsc, sc: loss.sc }

    const racing: { d: DriverState; base: number; t: number; pitted: PitType | null; rank: number }[] = []
    const trailing: DriverState[] = [] // lapped / retired — kept at the back, in live order

    let prevBase = 0
    for (const d of live) {
      const g = baseTime(d)
      if (g == null) {
        trailing.push(d)
        continue
      }
      // Clamp to keep the baseline monotonic in the live order, absorbing any
      // timing noise where gap-to-leader briefly disagrees with classification.
      const base = racing.length === 0 ? 0 : Math.max(g, prevBase + 0.001)
      prevBase = base
      const pitted = pits.get(d.driverNumber) ?? null
      racing.push({ d, base, t: base + (pitted ? cost[pitted] : 0), pitted, rank: racing.length })
    }

    // Stable sort by adjusted time; ties keep live order via the original rank.
    const order = racing
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.t - b.r.t || a.i - b.i)
      .map(({ r }) => r)

    const leaderT = order.length ? order[0].t : 0

    const rows: ProjectedRow[] = order.map((r, i) => ({
      d: r.d,
      position: i + 1,
      interval: i === 0 ? null : r.t - order[i - 1].t,
      leaderGap: i === 0 ? null : r.t - leaderT,
      pitted: r.pitted,
      delta: r.rank - i, // live rank vs projected rank; positive => moved up
    }))

    let pos = racing.length
    for (const d of trailing) {
      pos += 1
      rows.push({ d, position: pos, interval: null, leaderGap: null, pitted: pits.get(d.driverNumber) ?? null, delta: null })
    }
    return rows
  }, [live, pits, loss])

  const pitCount = pits.size

  // Per-driver metadata for the connector lines (colour + whether they moved).
  const meta = useMemo(() => {
    const m = new Map<number, { colour: string; moved: boolean }>()
    for (const r of projected) m.set(r.d.driverNumber, { colour: teamHex(r.d.teamColour), moved: !!r.delta })
    return m
  }, [projected])

  // ---- Connector lines between the two columns ----
  // Each driver gets a line from their live row to their projected row. With no
  // simulation every line is horizontal; once a stop drops a driver down the
  // order their line slopes to the new position. Positions are measured from the
  // DOM so the lines stay glued to the rows through scrolling and the reorder
  // spring.
  const linksRef = useRef<SVGSVGElement>(null)
  const leftRows = useRef(new Map<number, HTMLDivElement>())
  const rightRows = useRef(new Map<number, HTMLDivElement>())
  const leftBody = useRef<HTMLDivElement>(null)
  const rightBody = useRef<HTMLDivElement>(null)
  const [links, setLinks] = useState<Link[]>([])

  const recompute = useCallback(() => {
    const svg = linksRef.current
    if (!svg) return
    const box = svg.getBoundingClientRect()
    if (box.width === 0) return
    const out: Link[] = []
    leftRows.current.forEach((lel, num) => {
      const rel = rightRows.current.get(num)
      if (!rel) return
      const a = lel.getBoundingClientRect()
      const b = rel.getBoundingClientRect()
      const info = meta.get(num)
      out.push({
        num,
        colour: info?.colour ?? '#8a93a6',
        x1: a.right - box.left,
        y1: a.top + a.height / 2 - box.top,
        x2: b.left - box.left,
        y2: b.top + b.height / 2 - box.top,
        moved: info?.moved ?? false,
      })
    })
    setLinks(out)
  }, [meta])

  // Recompute on layout / data changes.
  useLayoutEffect(() => {
    recompute()
  }, [recompute, projected])

  // Track resize and independent body scrolling.
  useEffect(() => {
    const onChange = () => recompute()
    window.addEventListener('resize', onChange)
    const bodies = [leftBody.current, rightBody.current]
    bodies.forEach((b) => b?.addEventListener('scroll', onChange, { passive: true }))
    return () => {
      window.removeEventListener('resize', onChange)
      bodies.forEach((b) => b?.removeEventListener('scroll', onChange))
    }
  }, [recompute])

  // Follow the reorder spring for a few hundred ms after a stop is toggled.
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      recompute()
      if (t - start < 650) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pits, recompute])

  return (
    <div className="panel ps-panel">
      <div className="panel-title">
        <span className="dot" />
        Pit Simulator
        <span className="ps-circuit">{circuit}</span>
        {pitCount > 0 && (
          <button className="ps-clear" onClick={clearAll}>
            Clear ({pitCount})
          </button>
        )}
      </div>

      <div className="ps-toolbar">
        <div className="ps-toolbar-group">
          <span className="ps-toolbar-label">Pit time · tap to edit</span>
          {(['green', 'vsc', 'sc'] as PitType[]).map((t) => (
            <button key={t} className={`ps-loss-chip ${t}`} onClick={() => setEditing(t)} title="Tap to change">
              {PIT_LABEL[t]} {loss[t].toFixed(0)}s
            </button>
          ))}
        </div>
        <div className="ps-toolbar-group">
          <span className="ps-toolbar-label">Pit all</span>
          {(['green', 'vsc', 'sc'] as PitType[]).map((t) => (
            <button key={t} className={`ps-btn ${t}`} onClick={() => pitAll(t)} title={`Pit every car (${PIT_LABEL[t]})`}>
              {PIT_LABEL[t]} ALL
            </button>
          ))}
        </div>
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
          <div className="ps-body" ref={leftBody}>
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
                    ref={(el: HTMLDivElement | null) => {
                      if (el) leftRows.current.set(d.driverNumber, el)
                      else leftRows.current.delete(d.driverNumber)
                    }}
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                    className={`ps-row ${active ? 'pitting' : ''}`}
                    style={{ ['--team' as string]: team }}
                  >
                    <div className="ps-pos">{d.position ?? '–'}</div>
                    <div className="ps-driver col1">
                      <div className="ps-driver-top">
                        <span className="ps-acr" style={{ color: team }}>
                          {d.acronym}
                        </span>
                        <span className="ps-team">{d.teamName}</span>
                      </div>
                      <TyreStrip compounds={tyresByDriver.get(d.driverNumber) ?? []} stops={d.pitStops} />
                    </div>
                    <GapCell value={d.isLeader ? null : interval} label={d.isLeader ? '—' : undefined} />
                    <GapCell value={d.isLeader ? null : leader} label={d.isLeader ? 'LEADER' : undefined} />
                    <div className="ps-actions">
                      {(['green', 'vsc', 'sc'] as PitType[]).map((t) => (
                        <button
                          key={t}
                          className={`ps-btn ${t} ${active === t ? 'on' : ''}`}
                          onClick={() => setPit(d.driverNumber, t)}
                          title={`${PIT_LABEL[t]} · +${loss[t].toFixed(0)}s`}
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

        {/* ---- Connector lines ---- */}
        <svg className="ps-links" ref={linksRef} preserveAspectRatio="none">
          {links.map((l) => {
            const dx = Math.max(18, (l.x2 - l.x1) * 0.5)
            return (
              <g key={l.num} className={l.moved ? 'moved' : ''}>
                <path
                  d={`M${l.x1},${l.y1} C${l.x1 + dx},${l.y1} ${l.x2 - dx},${l.y2} ${l.x2},${l.y2}`}
                  stroke={l.colour}
                  fill="none"
                />
                <circle cx={l.x1} cy={l.y1} r={l.moved ? 3 : 2} fill={l.colour} />
                <circle cx={l.x2} cy={l.y2} r={l.moved ? 3 : 2} fill={l.colour} />
              </g>
            )
          })}
        </svg>

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
          <div className="ps-body" ref={rightBody}>
            <AnimatePresence>
              {projected.map((r) => {
                const team = teamHex(r.d.teamColour)
                const moved = r.delta != null && r.delta !== 0
                return (
                  <motion.div
                    layout
                    key={r.d.driverNumber}
                    ref={(el: HTMLDivElement | null) => {
                      if (el) rightRows.current.set(r.d.driverNumber, el)
                      else rightRows.current.delete(r.d.driverNumber)
                    }}
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

      {editing && (
        <div className="ps-modal-scrim" onClick={() => setEditing(null)}>
          <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-title">{PIT_LABEL[editing]} time loss</div>
            <div className="ps-stepper">
              <button onClick={() => adjust(editing, -1)} aria-label="Decrease">−</button>
              <span className="ps-stepper-val mono">
                {loss[editing].toFixed(0)}<small>s</small>
              </span>
              <button onClick={() => adjust(editing, +1)} aria-label="Increase">+</button>
            </div>
            <button className="ps-modal-done" onClick={() => setEditing(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
