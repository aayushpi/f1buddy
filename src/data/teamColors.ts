// Team colour palette.
//
// OpenF1's `team_colour` field gives F1's broadcast accent colours, but several
// 2026 teams are near-indistinguishable in it: Ferrari vs Audi (both red) and
// Red Bull vs Racing Bulls (both blue). We override with a hand-tuned palette
// keyed by team name, chosen to (a) match each team's real 2026 identity and
// (b) stay visually separable on the dark UI. Unknown teams fall back to the
// (normalised) OpenF1 colour, so historical replays of older grids still work.
//
// Sources: F1 2026 livery reveals + team brand guidelines. Notable choices:
//  - Audi: titanium silver (their real primary), NOT a red — removes the
//    Ferrari clash entirely (Audi's red is only an accent).
//  - Red Bull: deep navy / Racing Bulls: light azure — pulled apart in both
//    hue and lightness.
//  - Alpine: BWT pink (their secondary) instead of yet another blue, which
//    keeps it clear of the Williams/Red Bull/Racing Bulls blues.
//  - Cadillac: a crest-derived gold, since their livery is monochrome
//    (white/black/chrome) and needs a distinct hue for timing readability.

/** Canonical 2026 grid plus recent legacy teams (for replays). Values are CSS hex. */
const TEAM_COLOURS: Record<string, string> = {
  // ---- 2026 grid ----
  ferrari: '#E8002D', // scarlet
  mclaren: '#FF8000', // papaya orange
  mercedes: '#00D7B6', // petronas teal
  redBull: '#143C8C', // deep navy
  racingBulls: '#7FA8FF', // light azure
  williams: '#2D9BE0', // bright azure-blue
  astonMartin: '#0E8A5F', // racing green
  alpine: '#FF4FA3', // BWT pink
  haas: '#D5D9DB', // near-white steel
  audi: '#8E9BA4', // titanium silver
  cadillac: '#C9A227', // crest gold
  // ---- recent legacy (older replays) ----
  kickSauber: '#52E252', // 2024 Kick Sauber neon green (→ Audi in 2026)
  alfaRomeo: '#B12039', // 2022–23 dark red
  alphaTauri: '#2B4562', // 2023 navy
  racingPoint: '#F596C8', // pink (also Force India era)
  renault: '#FDF000', // yellow
}

/**
 * Resolve a team name to a CSS hex colour. Falls back to the supplied OpenF1
 * colour (normalised to `#RRGGBB`) when the team isn't in our palette, and to a
 * neutral grey when there's nothing usable.
 */
export function teamColourFor(teamName: string | null | undefined, fallback?: string | null): string {
  const key = matchTeam(teamName)
  if (key) return TEAM_COLOURS[key]
  return normaliseHex(fallback)
}

/** Map a (messy, season-varying) OpenF1 team name to a palette key. */
function matchTeam(name: string | null | undefined): keyof typeof TEAM_COLOURS | null {
  if (!name) return null
  const n = name.toLowerCase()
  // Order matters: disambiguate the look-alike pairs first.
  if (n.includes('racing bull') || n === 'rb' || n.includes('visa cash')) return 'racingBulls'
  if (n.includes('red bull')) return 'redBull' // "Red Bull Racing" (never contains "racing bull")
  if (n.includes('ferrari')) return 'ferrari'
  if (n.includes('mclaren')) return 'mclaren'
  if (n.includes('mercedes')) return 'mercedes'
  if (n.includes('aston')) return 'astonMartin'
  if (n.includes('alpine')) return 'alpine'
  if (n.includes('williams')) return 'williams'
  if (n.includes('haas')) return 'haas'
  if (n.includes('audi')) return 'audi'
  if (n.includes('cadillac')) return 'cadillac'
  // Legacy
  if (n.includes('sauber') || n.includes('kick')) return 'kickSauber'
  if (n.includes('alfa')) return 'alfaRomeo'
  if (n.includes('alphatauri') || n.includes('toro rosso')) return 'alphaTauri'
  if (n.includes('racing point') || n.includes('force india')) return 'racingPoint'
  if (n.includes('renault')) return 'renault'
  return null
}

/** Normalise a possibly-'#'-prefixed / bare 6-char hex to `#RRGGBB`. */
function normaliseHex(colour: string | null | undefined): string {
  if (!colour) return '#8a93a6'
  const c = colour.replace(/^#/, '').trim()
  return /^[0-9a-fA-F]{6}$/.test(c) ? `#${c}` : '#8a93a6'
}
