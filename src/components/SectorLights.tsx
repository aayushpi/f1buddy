import type { SectorState } from '../api/types'
import { formatSector } from '../utils/format'
import { miniSectorColour } from './MiniSectorStrip'

// Each sector shown as its mini-sector strip (the marshalling segments — where
// on track the sector is being won on the latest lap), with a bar underneath
// coloured by the sector's overall speed (purple = session best, green =
// personal best, yellow = normal). The sector time stays on hover.
export function SectorLights({ sectors }: { sectors: [SectorState, SectorState, SectorState] }) {
  return (
    <div className="sectors">
      {sectors.map((s, i) => (
        <div key={i} className={`sector ${s.perf ?? 'empty'}`} title={formatSector(s.time)}>
          <span className="sector-mini">
            {s.seg.length === 0 ? (
              <i className="mini-cell mini-empty" />
            ) : (
              s.seg.map((code, ci) => (
                <i key={ci} className="mini-cell" style={{ background: miniSectorColour(code) }} />
              ))
            )}
          </span>
          <span className="bar" />
        </div>
      ))}
    </div>
  )
}
