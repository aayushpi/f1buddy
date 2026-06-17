// Formatting helpers for lap times, gaps and tyre labels.

/** Format a lap time in seconds as "m:ss.mmm" (e.g. 92.345 -> "1:32.345"). */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  const ss = s.toFixed(3).padStart(6, '0')
  return m > 0 ? `${m}:${ss}` : ss
}

/** Format a sector time in seconds as "ss.mmm". */
export function formatSector(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  return seconds.toFixed(3)
}

/**
 * Format a gap value. Numbers render as "+1.234"; the API sometimes returns a
 * string like "1 LAP" / "2 LAPS" for lapped cars which we pass through.
 */
export function formatGap(value: number | string | null | undefined): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return 'LEADER'
  return `+${value.toFixed(3)}`
}

/** Compact gap for tight columns: "+1.2" with one decimal, strings passed through. */
export function formatGapShort(value: number | string | null | undefined): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '—'
  return `+${value.toFixed(1)}`
}

/** Signed delta between two lap times, e.g. "-0.214" / "+0.502". */
export function formatDelta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : ''
  return `${sign}${Math.abs(seconds).toFixed(3)}`
}

const COMPOUND_LABEL: Record<string, string> = {
  SOFT: 'S',
  MEDIUM: 'M',
  HARD: 'H',
  INTERMEDIATE: 'I',
  WET: 'W',
}

export function compoundLabel(compound: string | null | undefined): string {
  if (!compound) return '?'
  return COMPOUND_LABEL[compound.toUpperCase()] ?? compound[0].toUpperCase()
}

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: '#ff3b3b',
  MEDIUM: '#ffd23f',
  HARD: '#e9eef5',
  INTERMEDIATE: '#39d353',
  WET: '#2f8fff',
}

export function compoundColor(compound: string | null | undefined): string {
  if (!compound) return '#7a8699'
  return COMPOUND_COLOR[compound.toUpperCase()] ?? '#7a8699'
}

/** Normalise a possibly-'#'-prefixed team colour into a CSS hex string. */
export function teamHex(colour: string | null | undefined): string {
  if (!colour) return '#8a93a6'
  const c = colour.replace(/^#/, '').trim()
  return c.length === 6 ? `#${c}` : '#8a93a6'
}
