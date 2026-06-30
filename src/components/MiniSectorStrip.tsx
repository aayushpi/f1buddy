// A driver's lap drawn as coloured marshalling segments (mini-sectors), shared
// by the Qualifying "Mini Sectors" tab and the practice Quali Sims timesheet.
//
// OpenF1 exposes the segment *status colours*, not per-mini-sector times. Per
// OpenF1's legend: 2048 yellow (down on personal best), 2049 green (personal
// best), 2051 purple (track best), 2064 pit lane, 0 / unknown not available.

export function miniSectorColour(code: number): string {
  switch (code) {
    case 2051:
      return 'var(--purple)' // track (session) best
    case 2049:
      return 'var(--green)' // personal best
    case 2048:
      return '#ffce3a' // yellow: down on personal best
    case 2064:
      return 'rgba(120, 134, 153, 0.45)' // pit lane
    default:
      return 'rgba(255, 255, 255, 0.08)' // 0 / unknown: not available
  }
}

export function MiniSectorStrip({ s1, s2, s3 }: { s1: number[]; s2: number[]; s3: number[] }) {
  return (
    <span className="qm-strip">
      {[s1, s2, s3].map((seg, si) => (
        <span key={si} className="qm-seg">
          {seg.map((code, ci) => (
            <i key={ci} className="qm-cell" style={{ background: miniSectorColour(code) }} />
          ))}
        </span>
      ))}
    </span>
  )
}
