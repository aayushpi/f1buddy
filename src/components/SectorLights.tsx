import type { SectorState } from '../api/types'
import { formatSector } from '../utils/format'

export function SectorLights({ sectors }: { sectors: [SectorState, SectorState, SectorState] }) {
  return (
    <div className="sectors">
      {sectors.map((s, i) => (
        <div key={i} className={`sector ${s.perf ?? 'empty'}`}>
          <span className="bar" />
          <span className="t mono">{formatSector(s.time)}</span>
        </div>
      ))}
    </div>
  )
}
