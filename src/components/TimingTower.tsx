import { AnimatePresence, motion } from 'framer-motion'
import type { DriverState } from '../api/types'
import { formatGap, formatGapShort, formatLapTime, teamHex } from '../utils/format'
import { TyreBadge } from './TyreBadge'
import { SectorLights } from './SectorLights'
import { RowSparkline } from './RowSparkline'

// Colour the *last lap* only for what it actually is: purple when the last lap
// is (equals) the session's fastest lap — the driver just set the overall best
// on it, not merely owns the fastest from an earlier lap — green when it's the
// driver's own personal best. Anything else stays uncoloured.
function lapClass(d: DriverState, fastestLapTime: number | null): string {
  if (d.lastLap == null) return ''
  if (fastestLapTime != null && d.lastLap <= fastestLapTime + 0.0005) return 'fastest'
  if (d.bestLap != null && d.lastLap <= d.bestLap + 0.0005) return 'personal'
  return ''
}

function Row({
  d,
  fastestLapTime,
  focused,
  onFocus,
}: {
  d: DriverState
  fastestLapTime: number | null
  focused: number | null
  onFocus: (n: number) => void
}) {
  const team = teamHex(d.teamColour)
  const lapCls = lapClass(d, fastestLapTime)
  const lappedLeader = typeof d.gapToLeader === 'string'

  return (
    <motion.div
      layout
      layoutId={`row-${d.driverNumber}`}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className={`tower-row clickable ${d.isLeader ? 'leader' : ''} ${d.inPit ? 'in-pit' : ''} ${
        focused === d.driverNumber ? 'focused' : ''
      }`}
      style={{ ['--team' as string]: team }}
      onClick={() => onFocus(d.driverNumber)}
    >
      <div className="pos">{d.position ?? '–'}</div>

      <div className="driver-cell">
        <div className="driver-meta">
          <span className="driver-acr" style={{ color: team }}>
            {d.acronym}
          </span>
          <span className="driver-name">{d.teamName}</span>
        </div>
      </div>

      <TyreBadge compound={d.compound} age={d.tyreAge} />

      <SectorLights sectors={d.sectors} />

      <div className={`laptime ${lapCls}`}>{formatLapTime(d.lastLap)}</div>

      <div className={`gap mono ${typeof d.interval === 'string' ? 'lapped' : ''}`}>
        {d.isLeader ? <span className="leader-tag">INT</span> : formatGapShort(d.interval)}
      </div>

      <div className={`gap mono ${lappedLeader ? 'lapped' : ''}`}>
        {d.isLeader ? <span className="leader-tag">LEADER</span> : formatGap(d.gapToLeader)}
      </div>

      <RowSparkline points={d.lapTimes} colour={d.teamColour} />
    </motion.div>
  )
}

export function TimingTower({
  drivers,
  fastestLapTime,
  focused,
  onFocus,
}: {
  drivers: DriverState[]
  fastestLapTime: number | null
  focused: number | null
  onFocus: (n: number) => void
}) {
  return (
    <div className="panel tower">
      <div className="panel-title">
        <span className="dot" />
        Live Timing
      </div>

      <div className="tower-head">
        <div>P</div>
        <div className="col-driver">Driver</div>
        <div>Tyre</div>
        <div className="sector-head">
          <span>S1</span>
          <span>S2</span>
          <span>S3</span>
        </div>
        <div>Last Lap</div>
        <div>Interval</div>
        <div>Leader</div>
        <div>Trend</div>
      </div>

      <div className="tower-body">
        <AnimatePresence>
          {drivers.map((d) => (
            <Row
              key={d.driverNumber}
              d={d}
              fastestLapTime={fastestLapTime}
              focused={focused}
              onFocus={onFocus}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
