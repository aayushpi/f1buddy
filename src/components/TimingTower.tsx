import { AnimatePresence, motion } from 'framer-motion'
import type { DriverState } from '../api/types'
import { formatGap, formatGapShort, formatLapTime, teamHex } from '../utils/format'
import { TyreBadge } from './TyreBadge'
import { SectorLights } from './SectorLights'
import { RowSparkline } from './RowSparkline'

function lapClass(d: DriverState): string {
  if (d.lastLap == null) return ''
  if (d.bestLap != null && d.lastLap <= d.bestLap + 0.0005) return 'personal'
  return ''
}

function Row({ d, fastestDriver }: { d: DriverState; fastestDriver: number | null }) {
  const team = teamHex(d.teamColour)
  const isFastLap = fastestDriver === d.driverNumber && d.lastLap != null
  const lapCls = isFastLap ? 'fastest' : lapClass(d)
  const lappedLeader = typeof d.gapToLeader === 'string'

  return (
    <motion.div
      layout
      layoutId={`row-${d.driverNumber}`}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className={`tower-row ${d.isLeader ? 'leader' : ''} ${d.inPit ? 'in-pit' : ''}`}
      style={{ ['--team' as string]: team }}
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

      <div className="stint-cell">
        {d.stintLaps ?? '—'}
        <span className="unit">L</span>
      </div>

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
  fastestDriver,
}: {
  drivers: DriverState[]
  fastestDriver: number | null
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
        <div>Stint</div>
        <div>S1 · S2 · S3</div>
        <div>Last Lap</div>
        <div>Interval</div>
        <div>Leader</div>
        <div>Trend</div>
      </div>

      <div className="tower-body">
        <AnimatePresence>
          {drivers.map((d) => (
            <Row key={d.driverNumber} d={d} fastestDriver={fastestDriver} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
