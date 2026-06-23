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

// Vivid variants for tyres that started (near-)fresh, so a new set pops next to
// a scrubbed/used one.
const COMPOUND_COLOR_BRIGHT: Record<string, string> = {
  SOFT: '#ff5d6c',
  MEDIUM: '#ffe24d',
  HARD: '#ffffff',
  INTERMEDIATE: '#5ff07a',
  WET: '#5aa9ff',
}

export function compoundColor(compound: string | null | undefined, bright = false): string {
  if (!compound) return bright ? '#9aa6bd' : '#7a8699'
  const table = bright ? COMPOUND_COLOR_BRIGHT : COMPOUND_COLOR
  return table[compound.toUpperCase()] ?? (bright ? '#9aa6bd' : '#7a8699')
}

/** "HH:MM:SS" from an ISO date string. */
export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-GB', { hour12: false })
}

/** Signed places-gained string, e.g. "▲3" / "▼2" / "—". */
export function formatPlaces(value: number | null | undefined): string {
  if (value == null || value === 0) return '—'
  return value > 0 ? `▲${value}` : `▼${Math.abs(value)}`
}

// Tokens that should stay upper-case when normalising race-control text.
const RC_KEEP_UPPER = new Set(['drs', 'vsc', 'sc', 'fia', 'f1', 'tv', 'gps', 'kers', 'ers'])

/**
 * Race-control messages arrive SHOUTING IN ALL CAPS. Render them in sentence
 * case so they're easier to read, while preserving the bits that are meant to
 * stay upper-case: known acronyms (DRS, VSC…), driver codes in parentheses
 * "(VER)", and position references like "P4".
 */
export function formatRaceMessage(raw: string | null | undefined): string {
  if (!raw) return ''
  let out = raw.toLowerCase()
  // Re-upper standalone acronyms (before sentence-casing, so a leading acronym
  // like "DRS ENABLED" isn't left as "Drs enabled").
  out = out.replace(/\b[a-z0-9]+\b/g, (w) => (RC_KEEP_UPPER.has(w) ? w.toUpperCase() : w))
  // Driver codes in parentheses, e.g. "(ver)" -> "(VER)".
  out = out.replace(/\(([a-z]{2,3})\)/g, (_, c: string) => `(${c.toUpperCase()})`)
  // Position references, e.g. "p4" -> "P4".
  out = out.replace(/\bp(\d{1,2})\b/g, (_, n: string) => `P${n}`)
  // Capitalise the first letter of the message (skip if it's already upper).
  out = out.replace(/^([^a-zA-Z]*)([a-z])/, (_, pre: string, c: string) => pre + c.toUpperCase())
  return out
}

/** Normalise a possibly-'#'-prefixed team colour into a CSS hex string. */
export function teamHex(colour: string | null | undefined): string {
  if (!colour) return '#8a93a6'
  const c = colour.replace(/^#/, '').trim()
  return c.length === 6 ? `#${c}` : '#8a93a6'
}

/**
 * Teammates share a colour, so distinguish them by line style: within each
 * team the lower car number draws solid, the other dashed. Returns a map of
 * driverNumber → SVG stroke-dasharray ('' = solid).
 */
export function teamLineDash(
  drivers: { driverNumber: number; teamName: string }[],
): Map<number, string> {
  const byTeam = new Map<string, number[]>()
  for (const d of drivers) {
    const arr = byTeam.get(d.teamName) ?? []
    arr.push(d.driverNumber)
    byTeam.set(d.teamName, arr)
  }
  const out = new Map<number, string>()
  for (const nums of byTeam.values()) {
    nums.sort((a, b) => a - b)
    nums.forEach((n, i) => out.set(n, i === 0 ? '' : '7 5'))
  }
  return out
}
