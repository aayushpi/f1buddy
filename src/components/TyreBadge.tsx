import { compoundColor, compoundLabel } from '../utils/format'

export function TyreBadge({ compound, age }: { compound: string | null; age: number | null }) {
  return (
    <div className="tyre">
      <div
        className="tyre-ring"
        style={{ ['--tyre' as string]: compoundColor(compound) }}
        title={compound ?? 'Unknown compound'}
      >
        {compoundLabel(compound)}
      </div>
      <span className="tyre-age mono">{age == null ? '—' : `${age}L`}</span>
    </div>
  )
}
