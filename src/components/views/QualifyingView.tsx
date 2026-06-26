import { Fragment, useMemo, useState } from 'react'
import type { DriverState, QualifyingClassification, StintRow } from '../../api/types'
import { compoundColor, compoundLabel, formatDelta, formatLapTime, formatSector } from '../../utils/format'
import { buildQualifying, teammatePairs, type QualiRow, type Zone } from '../../utils/qualifying'

interface Props {
  drivers: DriverState[]
  stints: StintRow[]
  sessionName: string
  // Official FIA classification (Q1/Q2/Q3 times) once known; when present the
  // grid is the real final order rather than a clock-evolving timesheet.
  qualifyingResult: QualifyingClassification[] | null
}

type Sub = 'knockout' | 'sectors'

/**
 * The Qualifying view. Two sub-tabs matching how a quali session reads:
 *   - Knockout: the provisional grid with the elimination lines drawn through
 *     it, the drop zone, and the gap-to-the-cut bubble.
 *   - Sectors & H2H: where the lap time lives (sector kings, time left on the
 *     table) and the intra-team qualifying head-to-head.
 * Shown only for Qualifying sessions (gated by the caller).
 */
export function QualifyingView({ drivers, stints, sessionName, qualifyingResult }: Props) {
  const [sub, setSub] = useState<Sub>('knockout')

  return (
    <div className="practice quali">
      <div className="practice-head">
        <div className="seg practice-subtabs">
          <button className={sub === 'knockout' ? 'active' : ''} onClick={() => setSub('knockout')}>
            Knockout
          </button>
          <button className={sub === 'sectors' ? 'active' : ''} onClick={() => setSub('sectors')}>
            Sectors &amp; H2H
          </button>
        </div>
        <span className="practice-session">{sessionName}</span>
      </div>

      {sub === 'knockout' ? (
        <Knockout drivers={drivers} stints={stints} official={qualifyingResult} />
      ) : (
        <Sectors drivers={drivers} stints={stints} official={qualifyingResult} />
      )}
    </div>
  )
}

// ---- Knockout: provisional grid with the elimination lines ----

const ZONE_LABEL: Record<Zone, string> = {
  pole: 'Pole shootout',
  q2: 'Q2 zone',
  out: 'Drop zone — out in Q1',
}

function Knockout({
  drivers,
  stints,
  official,
}: {
  drivers: DriverState[]
  stints: StintRow[]
  official: QualifyingClassification[] | null
}) {
  const report = useMemo(() => buildQualifying(drivers, stints, official), [drivers, stints, official])
  const hasLap = report.rows.some((r) => r.bestLap != null)

  // The two cars on each bubble, for the banner battle lines.
  const q3Battle = report.rows.filter((r) => r.position === report.q3Cut || r.position === report.q3Cut + 1)
  const q1Battle = report.rows.filter((r) => r.position === report.q1Cut || r.position === report.q1Cut + 1)

  let prevZone: Zone | null = null

  return (
    <div className="panel practice-panel">
      <div className="practice-banner">
        <div className="pb-item">
          <span className="pb-k">
            {report.official ? 'Pole' : 'Provisional pole'}
            {report.official && <span className="q-official" title="Official FIA classification">FINAL</span>}
          </span>
          <span className="pb-v">
            {report.pole ? (
              <>
                <span style={{ color: report.pole.colour }}>{report.pole.acronym}</span>{' '}
                {formatLapTime(report.pole.time)}
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="pb-item">
          <span className="pb-k">Theoretical pole</span>
          <span className="pb-v sb">{formatLapTime(report.theoreticalBest)}</span>
        </div>
        {report.eliminatedPerSegment > 0 && (
          <>
            <BubbleBattle label="Q3 bubble" cars={q3Battle} />
            <BubbleBattle label="Q1 bubble" cars={q1Battle} />
          </>
        )}
        <div className="pb-item q-cuts" title="Derived from the entry list — 22 cars cut 6, 20 cars cut 5">
          <span className="pb-k">Cuts</span>
          <span className="pb-v mono">
            top {report.q3Cut} · {report.fieldSize} cars · −{report.eliminatedPerSegment}/seg
          </span>
        </div>
      </div>

      <div className="ts-scroll">
        <table className="ts-table q-table">
          <thead>
            <tr>
              <th className="ts-pos">#</th>
              <th className="ts-drv">Driver</th>
              <th>Tyre</th>
              <th className="ts-num">Best Lap</th>
              <th className="ts-num">Gap</th>
              <th className="ts-num">Int</th>
              <th className="ts-num">To line</th>
              <th className="ts-num" title="Theoretical best — sum of this driver's own best sectors">Theo</th>
              <th className="ts-num">Trap</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => {
              const showDivider = report.eliminatedPerSegment > 0 && r.zone !== prevZone && r.bestLap != null
              prevZone = r.bestLap != null ? r.zone : prevZone
              return (
                <Fragment key={r.driverNumber}>
                  {showDivider && (
                    <tr className={`q-divider q-divider-${r.zone}`}>
                      <td colSpan={9}>{ZONE_LABEL[r.zone]}</td>
                    </tr>
                  )}
                  <tr className={`q-row q-${r.zone} ${r.onBubble ? 'q-bubble' : ''} ${r.bestLap == null ? 'ts-empty' : ''}`}>
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
                    <td className="ts-num">
                      <ToLine value={r.toLine} zone={r.zone} />
                    </td>
                    <td className="ts-num dim" title="Theoretical best — sum of this driver's own best sectors">
                      {formatLapTime(r.idealLap)}
                    </td>
                    <td className="ts-num dim">{r.speedTrap == null ? '—' : `${Math.round(r.speedTrap)}`}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {!hasLap && <div className="practice-empty">No timed laps yet this session.</div>}
      </div>
    </div>
  )
}

// Gap to the elimination line: negative ⇒ safe cushion (green ▲), positive ⇒
// must find that much (red ▼).
function ToLine({ value, zone }: { value: number | null; zone: Zone }) {
  if (value == null) return <span className="dim">—</span>
  if (Math.abs(value) < 1e-6) return <span className="dim">0.000</span>
  const safe = value < 0
  // A pole-zone car's cushion is always "safe"; a drop-zone car's is a deficit.
  const cls = safe ? 'q-safe' : 'q-deficit'
  const arrow = safe ? '▲' : '▼'
  const title =
    zone === 'out'
      ? 'Gap to the last car safe from the Q1 cut'
      : zone === 'q2'
        ? 'Gap to the top-10 (Q3) line'
        : 'Cushion to the first car out of the top 10'
  return (
    <span className={cls} title={title}>
      {arrow} {Math.abs(value).toFixed(3)}
    </span>
  )
}

function BubbleBattle({ label, cars }: { label: string; cars: QualiRow[] }) {
  const withLap = cars.filter((c) => c.bestLap != null)
  if (withLap.length < 2) return null
  return (
    <div className="pb-item">
      <span className="pb-k">{label}</span>
      <span className="pb-v q-battle">
        {withLap.map((c, i) => (
          <Fragment key={c.driverNumber}>
            {i > 0 && <span className="q-battle-sep">▸</span>}
            <span style={{ color: c.colour }}>{c.acronym}</span>
          </Fragment>
        ))}
      </span>
    </div>
  )
}

// ---- Sectors & teammate head-to-head ----

function Sectors({
  drivers,
  stints,
  official,
}: {
  drivers: DriverState[]
  stints: StintRow[]
  official: QualifyingClassification[] | null
}) {
  const report = useMemo(() => buildQualifying(drivers, stints, official), [drivers, stints, official])
  const pairs = useMemo(() => teammatePairs(report), [report])

  // Sector kings: the driver who owns each session-best sector.
  const kingOf = (pick: (r: QualiRow) => number | null, best: number | null) =>
    best == null ? null : report.rows.find((r) => pick(r) != null && Math.abs(pick(r)! - best) < 1e-6) ?? null
  const kings = [
    { tag: 'S1', best: report.sessionBest.s1, king: kingOf((r) => r.bestSectors.s1, report.sessionBest.s1) },
    { tag: 'S2', best: report.sessionBest.s2, king: kingOf((r) => r.bestSectors.s2, report.sessionBest.s2) },
    { tag: 'S3', best: report.sessionBest.s3, king: kingOf((r) => r.bestSectors.s3, report.sessionBest.s3) },
  ]

  const maxDelta = Math.max(0.001, ...pairs.map((p) => p.delta ?? 0))

  return (
    <div className="q-sectors">
      <div className="panel practice-panel q-kings-panel">
        <div className="q-kings">
          {kings.map((k) => (
            <div key={k.tag} className="q-king">
              <span className="q-king-tag">{k.tag}</span>
              <span className="q-king-time sb">{formatSector(k.best)}</span>
              <span className="q-king-drv" style={{ color: k.king?.colour }}>
                {k.king ? k.king.acronym : '—'}
              </span>
            </div>
          ))}
          <div className="q-king q-king-ideal">
            <span className="q-king-tag">Theoretical pole</span>
            <span className="q-king-time sb">{formatLapTime(report.theoreticalBest)}</span>
            <span className="q-king-drv dim">sum of best sectors</span>
          </div>
        </div>
      </div>

      <div className="panel practice-panel q-h2h">
        <div className="lr-head">
          <span className="lr-title">Teammate head-to-head</span>
          <span className="lr-thresh">qualifying gap · faster car left</span>
        </div>
        {pairs.length === 0 ? (
          <div className="practice-empty">No teammate pairs with a timed lap yet.</div>
        ) : (
          <div className="q-h2h-rows">
            {pairs.map((p) => (
              <div key={p.teamName} className="q-h2h-row">
                <span className="swatch" style={{ background: p.colour }} />
                <span className="q-h2h-faster" style={{ color: p.colour }}>
                  {p.faster.acronym}
                </span>
                <span className="q-h2h-bar">
                  <span
                    className="q-h2h-fill"
                    style={{ width: `${((p.delta ?? 0) / maxDelta) * 100}%`, background: p.colour }}
                  />
                </span>
                <span className="q-h2h-slower">{p.slower.acronym}</span>
                <span className="q-h2h-delta mono">
                  {p.delta == null ? '—' : `+${p.delta.toFixed(3)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel practice-panel">
        <div className="ts-scroll">
          <table className="ts-table">
            <thead>
              <tr>
                <th className="ts-pos">#</th>
                <th className="ts-drv">Driver</th>
                <th className="ts-num">S1</th>
                <th className="ts-num">S2</th>
                <th className="ts-num">S3</th>
                <th className="ts-num">Ideal</th>
                <th className="ts-num">On table</th>
                <th className="ts-num">vs Mate</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => {
                const onTable = r.bestLap != null && r.idealLap != null ? r.bestLap - r.idealLap : null
                const sb = (val: number | null, best: number | null) =>
                  val != null && best != null && Math.abs(val - best) < 1e-6 ? 'sb' : ''
                return (
                  <tr key={r.driverNumber} className={r.bestLap == null ? 'ts-empty' : ''}>
                    <td className="ts-pos">{r.position}</td>
                    <td className="ts-drv">
                      <span className="ts-drv-inner">
                        <span className="swatch" style={{ background: r.colour }} />
                        <span style={{ color: r.colour, fontWeight: 800 }}>{r.acronym}</span>
                      </span>
                    </td>
                    <td className={`ts-num ${sb(r.bestSectors.s1, report.sessionBest.s1)}`}>{formatSector(r.bestSectors.s1)}</td>
                    <td className={`ts-num ${sb(r.bestSectors.s2, report.sessionBest.s2)}`}>{formatSector(r.bestSectors.s2)}</td>
                    <td className={`ts-num ${sb(r.bestSectors.s3, report.sessionBest.s3)}`}>{formatSector(r.bestSectors.s3)}</td>
                    <td className="ts-num dim">{formatLapTime(r.idealLap)}</td>
                    <td className="ts-num dim" title="Best lap minus ideal lap — time left on the table">
                      {onTable == null ? '—' : `+${onTable.toFixed(3)}`}
                    </td>
                    <td className="ts-num">
                      {r.teammateDelta == null ? (
                        <span className="dim">—</span>
                      ) : (
                        <span className={r.teammateAhead ? 'q-safe' : 'q-deficit'}>
                          {formatDelta(r.teammateDelta)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
