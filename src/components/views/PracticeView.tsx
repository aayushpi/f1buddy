import { useEffect, useMemo, useState } from 'react'
import type { DriverState, StintRow } from '../../api/types'
import { compoundColor, compoundLabel, formatDelta, formatLapTime, formatSector } from '../../utils/format'
import { buildLongRuns, buildTimesheet, recountRun, type Run } from '../../utils/practice'

interface Props {
  drivers: DriverState[]
  stints: StintRow[]
  sessionName: string
}

type Sub = 'quali' | 'long'

/**
 * The Free Practice view. Two sub-tabs matching how a session reads:
 *   - Quali Sims: the one-lap timesheet with sector splits + ideal lap.
 *   - Long Runs:  clean race-pace averages and tyre degradation per stint.
 * Shown only for Practice sessions (gated by the caller).
 */
export function PracticeView({ drivers, stints, sessionName }: Props) {
  const [sub, setSub] = useState<Sub>('quali')

  return (
    <div className="practice">
      <div className="practice-head">
        <div className="seg practice-subtabs">
          <button className={sub === 'quali' ? 'active' : ''} onClick={() => setSub('quali')}>
            Quali Sims
          </button>
          <button className={sub === 'long' ? 'active' : ''} onClick={() => setSub('long')}>
            Long Runs
          </button>
        </div>
        <span className="practice-session">{sessionName}</span>
      </div>

      {sub === 'quali' ? (
        <QualiSims drivers={drivers} stints={stints} />
      ) : (
        <LongRuns drivers={drivers} stints={stints} />
      )}
    </div>
  )
}

// ---- Quali sims timesheet ----

function QualiSims({ drivers, stints }: { drivers: DriverState[]; stints: StintRow[] }) {
  const sheet = useMemo(() => buildTimesheet(drivers, stints), [drivers, stints])
  const fastest = sheet.rows.find((r) => r.bestLap != null)

  const sectorClass = (val: number | null, sessionBest: number | null) =>
    val != null && sessionBest != null && Math.abs(val - sessionBest) < 1e-6 ? 'sb' : ''

  return (
    <div className="panel practice-panel">
      <div className="practice-banner">
        <div className="pb-item">
          <span className="pb-k">Fastest lap</span>
          <span className="pb-v">
            {fastest ? (
              <>
                <span style={{ color: fastest.colour }}>{fastest.acronym}</span>{' '}
                {formatLapTime(fastest.bestLap)}
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="pb-item">
          <span className="pb-k">Theoretical best</span>
          <span className="pb-v sb">{formatLapTime(sheet.theoreticalBest)}</span>
        </div>
        <div className="pb-item">
          <span className="pb-k">Ideal sectors</span>
          <span className="pb-v mono">
            {formatSector(sheet.sessionBest.s1)} / {formatSector(sheet.sessionBest.s2)} /{' '}
            {formatSector(sheet.sessionBest.s3)}
          </span>
        </div>
      </div>

      <div className="ts-scroll">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-pos">#</th>
              <th className="ts-drv">Driver</th>
              <th>Tyre</th>
              <th className="ts-num">Best Lap</th>
              <th className="ts-num">Gap</th>
              <th className="ts-num">Int</th>
              <th className="ts-num">S1</th>
              <th className="ts-num">S2</th>
              <th className="ts-num">S3</th>
              <th className="ts-num">Ideal</th>
              <th className="ts-num">Trap</th>
              <th className="ts-num">Laps</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.driverNumber} className={r.bestLap == null ? 'ts-empty' : ''}>
                <td className="ts-pos">{r.position}</td>
                <td className="ts-drv">
                  <span className="ts-drv-inner">
                    <span className="swatch" style={{ background: r.colour }} />
                    <span style={{ color: r.colour, fontWeight: 800 }}>{r.acronym}</span>
                  </span>
                </td>
                <td>
                  <span className="tyre-pill" style={{ ['--tyre' as string]: compoundColor(r.compound) }}>
                    {compoundLabel(r.compound)}
                  </span>
                </td>
                <td className="ts-num strong">{formatLapTime(r.bestLap)}</td>
                <td className="ts-num dim">{r.position === 1 ? '—' : formatDelta(r.gapToBest)}</td>
                <td className="ts-num dim">{r.intervalAhead == null ? '—' : formatDelta(r.intervalAhead)}</td>
                <td className={`ts-num ${sectorClass(r.bestSectors.s1, sheet.sessionBest.s1)}`}>
                  {formatSector(r.bestSectors.s1)}
                </td>
                <td className={`ts-num ${sectorClass(r.bestSectors.s2, sheet.sessionBest.s2)}`}>
                  {formatSector(r.bestSectors.s2)}
                </td>
                <td className={`ts-num ${sectorClass(r.bestSectors.s3, sheet.sessionBest.s3)}`}>
                  {formatSector(r.bestSectors.s3)}
                </td>
                <td className="ts-num dim">{formatLapTime(r.idealLap)}</td>
                <td className="ts-num dim">{r.speedTrap == null ? '—' : `${Math.round(r.speedTrap)}`}</td>
                <td className="ts-num dim">{r.laps}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!fastest && <div className="practice-empty">No timed laps yet this session.</div>}
      </div>
    </div>
  )
}

// ---- Long runs ----
//
// A comparative read of race-pace runs. Pick drivers with the toggle chips and
// their best long run is lined up beside the others — grouped *by driver*: each
// driver owns a block of per-lap bars (graph) or its own lap table. The analyst
// can flip any lap in or out of the average with the ± control and the pace /
// degradation / consistency recompute live (recountRun, pure — never mutates the
// session report).

function LongRuns({ drivers, stints }: { drivers: DriverState[]; stints: StintRow[] }) {
  const report = useMemo(() => buildLongRuns(drivers, stints), [drivers, stints])

  // One primary run per driver: the longest counted run, ties broken by pace.
  const runByDriver = useMemo(() => {
    const m = new Map<number, Run>()
    for (const r of report.runs) {
      if (r.countedLaps < 2) continue
      const cur = m.get(r.driverNumber)
      const better =
        !cur ||
        r.countedLaps > cur.countedLaps ||
        (r.countedLaps === cur.countedLaps && (r.avg ?? Infinity) < (cur.avg ?? Infinity))
      if (better) m.set(r.driverNumber, r)
    }
    return m
  }, [report])

  // Drivers available to compare, fastest long-run pace first.
  const available = useMemo(
    () => [...runByDriver.values()].sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity)),
    [runByDriver],
  )

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [seeded, setSeeded] = useState(false)
  // Seed once with the four quickest runs, then leave selection to the user.
  useEffect(() => {
    if (seeded || available.length === 0) return
    setSelected(new Set(available.slice(0, 4).map((r) => r.driverNumber)))
    setSeeded(true)
  }, [available, seeded])

  const [mode, setMode] = useState<'graph' | 'table'>('graph')
  // Manual include/exclude overrides, keyed "driverNumber:lap" → forced counted.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())

  const toggleDriver = (dn: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(dn)) next.delete(dn)
      else next.add(dn)
      return next
    })

  const setLap = (dn: number, lap: number, counted: boolean) =>
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(`${dn}:${lap}`, counted)
      return next
    })

  // The selected runs with any manual overrides applied and stats recomputed,
  // re-sorted fastest → slowest on the *current* average so the comparison
  // reorders live as laps are counted in or out.
  const runs = useMemo(() => {
    return available
      .filter((r) => selected.has(r.driverNumber))
      .map((r) => {
        const ov = new Map<number, boolean>()
        for (const l of r.laps) {
          const k = `${r.driverNumber}:${l.lap}`
          if (overrides.has(k)) ov.set(l.lap, overrides.get(k)!)
        }
        return ov.size ? recountRun(r, ov) : r
      })
      .sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity))
  }, [available, selected, overrides])

  const fastestAvg = useMemo(() => {
    const a = runs.map((r) => r.avg).filter((x): x is number => x != null)
    return a.length ? Math.min(...a) : null
  }, [runs])

  return (
    <div className="lr">
      <div className="panel practice-panel">
        <div className="lr-head">
          <span className="lr-title">Long-run comparison</span>
          <span className="lr-thresh" title="Adapts to this session — rain or red flags shorten runs">
            long run ≥ {report.threshold} laps · longest {report.sessionMaxLen}
          </span>
          <div className="seg rd-toggle lrc-modetoggle">
            <button className={mode === 'graph' ? 'active' : ''} onClick={() => setMode('graph')}>
              Graph
            </button>
            <button className={mode === 'table' ? 'active' : ''} onClick={() => setMode('table')}>
              Table
            </button>
          </div>
        </div>

        {available.length === 0 ? (
          <div className="practice-empty">
            No multi-lap runs yet — long-run pace appears once cars string laps together.
          </div>
        ) : (
          <>
            <div className="lrc-toggles">
              {available.map((r) => {
                const on = selected.has(r.driverNumber)
                return (
                  <button
                    key={r.driverNumber}
                    className={`chip lrc-chip ${on ? 'on' : ''}`}
                    onClick={() => toggleDriver(r.driverNumber)}
                  >
                    <span className="swatch" style={{ background: r.colour }} />
                    <span style={{ color: on ? r.colour : undefined, fontWeight: 800 }}>{r.acronym}</span>
                  </button>
                )
              })}
            </div>

            {runs.length === 0 ? (
              <div className="practice-empty">Pick a driver above to compare long-run pace.</div>
            ) : mode === 'graph' ? (
              <CompareChart runs={runs} fastestAvg={fastestAvg} onToggleLap={setLap} />
            ) : (
              <CompareTables runs={runs} onToggleLap={setLap} />
            )}

            <div className="rd-legend">
              <span>
                <i className="dot on" /> counted lap
              </span>
              <span>
                <i className="dot" /> excluded (out / in lap, traffic, or manual)
              </span>
              <span className="rd-avgkey">
                <i className="rd-avgline-key" /> fastest average
              </span>
              <span className="lrc-hint">± toggles a lap in or out — pace recomputes</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Grouped-by-driver bar chart: every selected driver gets a block of per-lap
// bars, all on one shared vertical scale so the blocks read comparatively.
// Clicking a bar counts/discounts that lap, just like the table's ± control.
function CompareChart({
  runs,
  fastestAvg,
  onToggleLap,
}: {
  runs: Run[]
  fastestAvg: number | null
  onToggleLap: (dn: number, lap: number, counted: boolean) => void
}) {
  // Scale to the counted laps across every driver (the meat of the runs); a slow
  // excluded lap then clamps to a short stub rather than crushing the axis.
  const counted = runs.flatMap((r) => r.laps.filter((l) => l.counted).map((l) => l.time))
  const lo = counted.length ? Math.min(...counted) : 0
  const hi = counted.length ? Math.max(...counted) : 1
  const pad = Math.max(0.25, (hi - lo) * 0.18)
  const min = lo - pad
  const max = hi + pad
  const clamp = (v: number) => Math.max(2, Math.min(100, v))
  const height = (t: number) => clamp(12 + ((max - t) / (max - min || 1)) * 88)
  const fastestY = fastestAvg != null ? clamp(12 + ((max - fastestAvg) / (max - min || 1)) * 88) : null

  return (
    <div className="lrc-chart">
      {fastestY != null && (
        <span className="lrc-fastline" style={{ bottom: `${fastestY}%` }} title="Fastest average on track" />
      )}
      <div className="lrc-groups">
        {runs.map((run) => (
          <div key={run.driverNumber} className="lrc-group">
            <div className="lrc-bars">
              {run.laps.map((l) => (
                <button
                  key={l.lap}
                  className={`lrc-bar ${l.counted ? '' : 'excl'}`}
                  style={{
                    height: `${height(l.time)}%`,
                    background: l.counted ? compoundColor(run.compound) : 'rgba(255,255,255,0.1)',
                  }}
                  title={`${lapTitle(run, l)} — click to ${l.counted ? 'exclude' : 'include'}`}
                  onClick={() => onToggleLap(run.driverNumber, l.lap, !l.counted)}
                />
              ))}
            </div>
            <div className="lrc-group-foot">
              <span className="lrc-group-acr" style={{ color: run.colour }}>
                {run.acronym}
              </span>
              <span className="lrc-group-avg">Ø {formatLapTime(run.avg)}</span>
              <span className="lrc-group-deg" title="Degradation per lap">
                {run.degPerLap == null
                  ? '—'
                  : `${run.degPerLap >= 0 ? '+' : '−'}${Math.abs(run.degPerLap).toFixed(2)}/L`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Side-by-side lap tables, one per selected driver, each with a ± control to
// flip a lap in or out of the driver's average.
function CompareTables({
  runs,
  onToggleLap,
}: {
  runs: Run[]
  onToggleLap: (dn: number, lap: number, counted: boolean) => void
}) {
  return (
    <div className="lrc-tables">
      {runs.map((run) => (
        <div key={run.driverNumber} className="lrc-table">
          <div className="lrc-table-head">
            <span className="lrc-table-acr" style={{ color: run.colour }}>
              {run.acronym}
            </span>
            <span className="tyre-pill sm" style={{ ['--tyre' as string]: compoundColor(run.compound) }}>
              {compoundLabel(run.compound)}
            </span>
            <span className="lrc-table-stat">Ø {formatLapTime(run.avg)}</span>
            <span className="lrc-table-stat dim">
              {run.countedLaps}/{run.laps.length}L
            </span>
          </div>
          <table className="rd-table lrc-rd-table">
            <thead>
              <tr>
                <th className="rd-t-lap">Lap</th>
                <th className="rd-t-time">Time</th>
                <th className="rd-t-note">Note</th>
                <th className="lrc-t-act" />
              </tr>
            </thead>
            <tbody>
              {run.laps.map((l) => (
                <tr key={l.lap} className={l.counted ? '' : 'excl'}>
                  <td className="rd-t-lap">{l.lap}</td>
                  <td className="rd-t-time" style={{ color: l.counted ? compoundColor(run.compound) : undefined }}>
                    {formatLapTime(l.time)}
                  </td>
                  <td className="rd-t-note">{l.counted ? 'counted' : excludeLabel(l)}</td>
                  <td className="lrc-t-act">
                    <button
                      className={`lrc-tog ${l.counted ? 'out' : 'in'}`}
                      onClick={() => onToggleLap(run.driverNumber, l.lap, !l.counted)}
                      title={l.counted ? 'Exclude this lap from the average' : 'Include this lap in the average'}
                    >
                      {l.counted ? '−' : '+'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="rd-avg-row">
                <td className="rd-t-lap">Ø</td>
                <td className="rd-t-time">{formatLapTime(run.avg)}</td>
                <td className="rd-t-note" colSpan={2}>
                  over {run.countedLaps} laps
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  )
}

function excludeLabel(l: Run['laps'][number]): string {
  return l.reason === 'out'
    ? 'out-lap'
    : l.reason === 'in'
      ? 'in-lap'
      : l.reason === 'outlier'
        ? 'traffic / outlier'
        : l.reason === 'manual'
          ? 'excluded'
          : 'excluded'
}

function lapTitle(run: Run, l: Run['laps'][number]): string {
  const base = `${run.acronym} · lap ${l.lap}: ${formatLapTime(l.time)}`
  return l.counted ? base : `${base} — excluded (${excludeLabel(l)})`
}
