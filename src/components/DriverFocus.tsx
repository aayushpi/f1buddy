import { useState } from 'react'
import { motion } from 'framer-motion'
import type { DriverState, LapDetail } from '../api/types'
import { formatDelta, formatGap, formatLapTime, teamHex } from '../utils/format'
import { TyreBadge } from './TyreBadge'

interface Props {
  drivers: DriverState[] // sorted by position
  focused: number
  onClose: () => void
}

const EPS = 0.0005
type Side = 'ahead' | 'behind'

function acrTag(d: DriverState | undefined) {
  if (!d) return <span className="df-acr muted">—</span>
  return (
    <span className="df-acr" style={{ color: teamHex(d.teamColour) }}>
      {d.acronym}
    </span>
  )
}

/** Smallest non-null value across the laps for a given accessor. */
function bestOf(hist: LapDetail[], pick: (l: LapDetail) => number | null): number | null {
  let best: number | null = null
  for (const l of hist) {
    const v = pick(l)
    if (v != null && v > 0 && (best == null || v < best)) best = v
  }
  return best
}

/** Best across the whole field — the overall (session) best, shown in purple. */
function overallBest(drivers: DriverState[], pick: (l: LapDetail) => number | null): number | null {
  let best: number | null = null
  for (const d of drivers) {
    const v = bestOf(d.lapHistory, pick)
    if (v != null && (best == null || v < best)) best = v
  }
  return best
}

/** Signed sector delta (focus − reference): negative (green) = focus quicker. */
function DeltaCell({ focus, cmp }: { focus: number | null; cmp: number | null | undefined }) {
  if (focus == null || cmp == null) return <span className="lh-cell mono dmuted">—</span>
  const d = focus - cmp
  const cls = d < -EPS ? 'dgood' : d > EPS ? 'dbad' : 'dflat'
  return <span className={`lh-cell mono ${cls}`}>{formatDelta(d)}</span>
}

export function DriverFocus({ drivers, focused, onClose }: Props) {
  const [side, setSide] = useState<Side>('ahead')

  const i = drivers.findIndex((d) => d.driverNumber === focused)
  if (i < 0) return null
  const focus = drivers[i]
  const ahead = i > 0 ? drivers[i - 1] : undefined
  const behind = i < drivers.length - 1 ? drivers[i + 1] : undefined
  const team = teamHex(focus.teamColour)

  // The sector deltas are relative to the chosen neighbour; fall back to the
  // other one if the picked side doesn't exist (leader / last place).
  const refSide: Side = side === 'ahead' ? (ahead ? 'ahead' : 'behind') : behind ? 'behind' : 'ahead'
  const ref = refSide === 'ahead' ? ahead : behind
  const refLap = new Map<number, LapDetail>()
  if (ref) for (const l of ref.lapHistory) refLap.set(l.lap, l)

  // Newest lap first. The lap-time column stays absolute: personal best (this
  // driver, this session) → green; overall session best (field) → purple.
  const hist = focus.lapHistory
  const rows = [...hist].reverse()
  const pbLap = bestOf(hist, (l) => l.time)
  const obLap = overallBest(drivers, (l) => l.time)
  const timeCell = (v: number | null) => {
    let tone = ''
    if (v != null && obLap != null && v <= obLap + EPS) tone = ' ob'
    else if (v != null && pbLap != null && v <= pbLap + EPS) tone = ' pb'
    return `lh-cell mono${tone}`
  }

  return (
    <motion.div
      className="panel focus-panel"
      style={{ ['--team' as string]: team }}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 460, damping: 38 }}
    >
      <div className="panel-title">
        <span className="dot" />
        Driver Focus
        <button className="focus-close" aria-label="Close focus" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="focus-hero">
        <span className="focus-pos mono">P{focus.position ?? '–'}</span>
        <span className="focus-acr" style={{ color: team }}>
          {focus.acronym}
        </span>
        <span className="focus-name">{focus.fullName}</span>
        <span className="focus-team">{focus.teamName}</span>
      </div>

      {/* The focused driver's tyre + pit stops sit right under the name — the
          first things you want when you tap into a car. */}
      <div className="focus-meta">
        <div className="fm-item">
          <span className="fm-label">Tyre</span>
          <TyreBadge compound={focus.compound} age={focus.tyreAge} />
        </div>
        <div className="fm-item">
          <span className="fm-label">Pit stops</span>
          <span className="fm-value mono">{focus.pitStops}</span>
        </div>
      </div>

      {/* Tap a neighbour to compare sector times against it. Each side also
          carries that car's tyre + stop count for an at-a-glance strategy read. */}
      <div className="focus-gaps">
        <button
          className={`focus-gap ${refSide === 'ahead' ? 'selected' : ''}`}
          disabled={!ahead}
          onClick={() => setSide('ahead')}
        >
          <span className="lbl">▲ Ahead {acrTag(ahead)}</span>
          <span className="val mono">{ahead ? formatGap(focus.interval) : '—'}</span>
          {ahead && (
            <span className="fg-extra">
              <TyreBadge compound={ahead.compound} age={ahead.tyreAge} />
              <span className="fg-pit mono">{ahead.pitStops} stop{ahead.pitStops === 1 ? '' : 's'}</span>
            </span>
          )}
        </button>
        <button
          className={`focus-gap ${refSide === 'behind' ? 'selected' : ''}`}
          disabled={!behind}
          onClick={() => setSide('behind')}
        >
          <span className="lbl">▼ Behind {acrTag(behind)}</span>
          <span className="val mono">{behind ? formatGap(behind.interval) : '—'}</span>
          {behind && (
            <span className="fg-extra">
              <TyreBadge compound={behind.compound} age={behind.tyreAge} />
              <span className="fg-pit mono">{behind.pitStops} stop{behind.pitStops === 1 ? '' : 's'}</span>
            </span>
          )}
        </button>
      </div>

      {/* Lap-by-lap history. Sector columns are the difference to the selected
          neighbour; the lap-time column stays absolute (green/purple = best). */}
      <div className="lap-history">
        <div className="lh-title">
          <span>Lap history</span>
          <span className="lh-sub">
            {rows.length} laps · sectors Δ vs {ref?.acronym ?? '—'} (− quicker)
          </span>
        </div>
        <div className="lh-head lh-row">
          <span>Lap</span>
          <span>Time</span>
          <span>ΔS1</span>
          <span>ΔS2</span>
          <span>ΔS3</span>
        </div>
        <div className="lh-body">
          {rows.length === 0 && <div className="lh-empty">No completed laps yet.</div>}
          {rows.map((l) => {
            const r = refLap.get(l.lap)
            return (
              <div className={`lh-row ${l.pitOut ? 'pit' : ''}`} key={l.lap}>
                <span className="lh-lap mono">{l.lap}</span>
                <span className={timeCell(l.time)}>{formatLapTime(l.time)}</span>
                <DeltaCell focus={l.s1} cmp={r?.s1} />
                <DeltaCell focus={l.s2} cmp={r?.s2} />
                <DeltaCell focus={l.s3} cmp={r?.s3} />
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
