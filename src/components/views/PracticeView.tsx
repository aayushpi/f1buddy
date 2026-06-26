import { useMemo, useState } from 'react'
import type { DriverState, StintRow } from '../../api/types'
import { compoundColor, compoundLabel, formatDelta, formatLapTime, formatSector } from '../../utils/format'
import { buildLongRuns, buildTimesheet, type Run } from '../../utils/practice'
import { SessionClock } from '../SessionClock'

interface Props {
  drivers: DriverState[]
  stints: StintRow[]
  sessionName: string
  // Session end + current replay-clock time, for the countdown.
  endMs: number | null
  nowMs: number | null
  live: boolean
}

type Sub = 'quali' | 'long'

/**
 * The Free Practice view. Two sub-tabs matching how a session reads:
 *   - Quali Sims: the one-lap timesheet with sector splits + ideal lap.
 *   - Long Runs:  clean race-pace averages and tyre degradation per stint.
 * Shown only for Practice sessions (gated by the caller).
 */
export function PracticeView({ drivers, stints, sessionName, endMs, nowMs, live }: Props) {
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
        <SessionClock endMs={endMs} nowMs={nowMs} live={live} />
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

function LongRuns({ drivers, stints }: { drivers: DriverState[]; stints: StintRow[] }) {
  const report = useMemo(() => buildLongRuns(drivers, stints), [drivers, stints])
  const longRuns = report.runs.filter((r) => r.isLongRun)
  const shown = longRuns.length ? longRuns : report.runs.filter((r) => r.countedLaps >= 2)

  const [selected, setSelected] = useState<string | null>(null)
  const key = (r: Run) => `${r.driverNumber}:${r.laps[0]?.lap ?? 0}`
  const active = shown.find((r) => key(r) === selected) ?? shown[0] ?? null

  const fastestAvg = useMemo(() => {
    const avgs = shown.map((r) => r.avg).filter((a): a is number => a != null)
    return avgs.length ? Math.min(...avgs) : null
  }, [shown])
  const slowestAvg = useMemo(() => {
    const avgs = shown.map((r) => r.avg).filter((a): a is number => a != null)
    return avgs.length ? Math.max(...avgs) : null
  }, [shown])

  return (
    <div className="lr">
      <div className="panel practice-panel lr-list">
        <div className="lr-head">
          <span className="lr-title">Race-pace ranking</span>
          <span className="lr-thresh" title="Adapts to this session — rain or red flags shorten runs">
            long run ≥ {report.threshold} laps · longest {report.sessionMaxLen}
          </span>
        </div>

        {shown.length === 0 ? (
          <div className="practice-empty">No multi-lap runs yet — long-run pace appears once cars string laps together.</div>
        ) : (
          <div className="lr-rows">
            {shown.map((r) => {
              const span = (slowestAvg ?? 0) - (fastestAvg ?? 0) || 1
              const pct = r.avg != null ? 30 + (1 - (r.avg - (fastestAvg ?? 0)) / span) * 70 : 0
              const isBest = r.avg != null && fastestAvg != null && r.avg <= fastestAvg + 5e-4
              const k = key(r)
              return (
                <button
                  key={k}
                  className={`lr-row ${active && key(active) === k ? 'on' : ''}`}
                  onClick={() => setSelected(k)}
                >
                  <span className="swatch" style={{ background: r.colour }} />
                  <span className="lr-acr" style={{ color: r.colour }}>
                    {r.acronym}
                  </span>
                  <span className="tyre-pill sm" style={{ ['--tyre' as string]: compoundColor(r.compound) }}>
                    {compoundLabel(r.compound)}
                  </span>
                  <span className="barwrap">
                    <span className="barfill" style={{ width: `${pct}%`, background: r.colour }} />
                  </span>
                  <span className={`lr-avg ${isBest ? 'best' : ''}`}>Ø {formatLapTime(r.avg)}</span>
                  <span className="lr-deg" title="Degradation per lap">
                    {r.degPerLap == null ? '—' : `${r.degPerLap >= 0 ? '+' : '−'}${Math.abs(r.degPerLap).toFixed(2)}/L`}
                  </span>
                  <span className="lr-n">{r.countedLaps}L</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {active && <RunDetail run={active} />}
    </div>
  )
}

function RunDetail({ run }: { run: Run }) {
  // Default to the new per-lap table; the bar chart is one toggle away.
  const [mode, setMode] = useState<'table' | 'graph'>('table')

  return (
    <div className="panel practice-panel run-detail">
      <div className="rd-head">
        <span className="rd-acr" style={{ color: run.colour }}>
          {run.acronym}
        </span>
        <span className="tyre-pill" style={{ ['--tyre' as string]: compoundColor(run.compound) }}>
          {compoundLabel(run.compound)}
        </span>
        <div className="rd-stats">
          <Stat k="Avg" v={formatLapTime(run.avg)} />
          <Stat k="Best" v={formatLapTime(run.best)} />
          <Stat
            k="Deg"
            v={run.degPerLap == null ? '—' : `${run.degPerLap >= 0 ? '+' : '−'}${Math.abs(run.degPerLap).toFixed(2)} s/L`}
          />
          <Stat k="Consistency" v={run.consistency == null ? '—' : `±${run.consistency.toFixed(2)}s`} />
          <Stat k="Counted" v={`${run.countedLaps} / ${run.laps.length}`} />
        </div>
        <div className="seg rd-toggle">
          <button className={mode === 'table' ? 'active' : ''} onClick={() => setMode('table')}>
            Table
          </button>
          <button className={mode === 'graph' ? 'active' : ''} onClick={() => setMode('graph')}>
            Graph
          </button>
        </div>
      </div>

      {mode === 'table' ? <RunTable run={run} /> : <RunChart run={run} />}

      <div className="rd-legend">
        <span><i className="dot on" style={{ background: compoundColor(run.compound) }} /> counted lap</span>
        <span><i className="dot" /> excluded (out / in lap or traffic)</span>
        <span className="rd-avgkey"><i className="rd-avgline-key" /> average pace</span>
      </div>
    </div>
  )
}

// Per-lap table (default): every lap the driver ran in this run, with the same
// colour coding as the chart (counted = compound colour, excluded = greyed),
// and the average pace spelled out in a footer row.
function RunTable({ run }: { run: Run }) {
  return (
    <div className="rd-scroll">
      <table className="rd-table">
        <thead>
          <tr>
            <th className="rd-t-lap">Lap</th>
            <th className="rd-t-time">Lap time</th>
            <th className="rd-t-note">Note</th>
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
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rd-avg-row">
            <td className="rd-t-lap">Ø</td>
            <td className="rd-t-time">{formatLapTime(run.avg)}</td>
            <td className="rd-t-note">average over {run.countedLaps} laps</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function RunChart({ run }: { run: Run }) {
  const lo = Math.min(...run.laps.map((l) => l.time))
  const hi = Math.max(...run.laps.map((l) => l.time))
  const pad = Math.max(0.25, (hi - lo) * 0.15)
  const min = lo - pad
  const max = hi + pad
  const height = (t: number) => 12 + ((max - t) / (max - min || 1)) * 88
  const avgY = run.avg != null ? 12 + ((max - run.avg) / (max - min || 1)) * 88 : null

  return (
    <div className="rd-chart">
      {avgY != null && (
        <>
          <span className="rd-avgline" style={{ bottom: `${avgY}%` }} />
          {/* Spell the average pace out just above the dotted line. */}
          <span className="rd-avglabel" style={{ bottom: `${avgY}%` }}>Ø {formatLapTime(run.avg)}</span>
        </>
      )}
      <div className="rd-bars">
        {run.laps.map((l) => (
          <div key={l.lap} className="rd-col" title={reasonTitle(l)}>
            <span className="rd-time">{l.counted ? l.time.toFixed(1) : ''}</span>
            <span
              className={`rd-bar ${l.counted ? '' : 'excl'}`}
              style={{
                height: `${height(l.time)}%`,
                background: l.counted ? compoundColor(run.compound) : 'rgba(255,255,255,0.12)',
              }}
            />
            <span className="rd-lap">{l.lap}</span>
          </div>
        ))}
      </div>
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
        : 'excluded'
}

function reasonTitle(l: Run['laps'][number]): string {
  if (l.counted) return `Lap ${l.lap}: ${formatLapTime(l.time)}`
  return `Lap ${l.lap}: ${formatLapTime(l.time)} — excluded (${excludeLabel(l)})`
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rd-stat">
      <span className="rd-k">{k}</span>
      <span className="rd-v">{v}</span>
    </div>
  )
}
