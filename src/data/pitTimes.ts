// Per-circuit pit-lane time loss.
//
// `green` is the full time a driver loses by pitting under green-flag racing —
// the "pit-lane delta": time spent crawling through the speed-limited pit lane
// plus the stationary stop, measured against staying out at racing speed. These
// are the figures F1 teams quote as the gap you need to the car behind to pit
// and keep position (e.g. ~27s at Silverstone, ~18s at COTA, ~20s at Monaco).
//
// Sources for the green-flag deltas (cross-checked, rounded to whole seconds):
//   - racesundays.com pit-strategy features (COTA ~18s, Silverstone ~27s,
//     Monaco ~20s, Barcelona/Silverstone 21–25s band, Imola ~30s outlier)
//   - f1chronicle.com / flowracers.com pit-stop explainers
//   - Long-run team strategy notes for the current calendar.
// Values are approximate and circuit resurfacing / pit-lane tweaks shift them a
// little year to year; they are good enough for a what-if strategy simulator.
//
// VSC / SC losses are DERIVED, not separately published: when the whole field
// is slowed the time you give up by pitting shrinks. Under a Virtual Safety Car
// every car runs to a delta roughly 35–40% off the pace, so a stop costs about
// half of the green-flag loss. Under a full Safety Car the pack is bunched and
// even slower, so the relative loss is smaller again (~a third of green). These
// factors are applied uniformly below.

import { findCircuit } from './circuits'

export interface PitLoss {
  /** Full pit-lane time loss under green-flag racing, seconds. */
  green: number
  /** Reduced loss when pitting under a Virtual Safety Car, seconds. */
  vsc: number
  /** Reduced loss when pitting under a full Safety Car, seconds. */
  sc: number
}

// Green-flag pit-lane time loss keyed by the circuit ids in `circuits.ts`.
const GREEN_LOSS: Record<string, number> = {
  // ---- Current / recent calendar (researched) ----
  'au-1953': 20, // Albert Park, Melbourne
  'bh-2002': 23, // Bahrain International Circuit, Sakhir
  'cn-2004': 23, // Shanghai International Circuit
  'es-1991': 22, // Circuit de Barcelona-Catalunya
  'mc-1929': 20, // Monaco — short pit, 60 km/h limit
  'ca-1978': 18, // Circuit Gilles Villeneuve, Montreal
  'at-1969': 20, // Red Bull Ring, Spielberg
  'gb-1948': 27, // Silverstone — long pit lane
  'hu-1986': 21, // Hungaroring
  'be-1925': 19, // Spa-Francorchamps
  'it-1922': 23, // Monza
  'sg-2008': 28, // Marina Bay, Singapore — long pit lane
  'ru-2014': 21, // Sochi Autodrom
  'jp-1962': 22, // Suzuka
  'us-2012': 18, // Circuit of the Americas, Austin
  'mx-1962': 22, // Autódromo Hermanos Rodríguez, Mexico City
  'br-1940': 21, // Interlagos, São Paulo
  'ae-2009': 22, // Yas Marina, Abu Dhabi
  'pt-2008': 21, // Algarve, Portimão
  'my-1999': 21, // Sepang
  'tr-2005': 24, // Istanbul Park
  'nl-1948': 21, // Zandvoort
  'sa-2021': 20, // Jeddah Corniche
  'us-2022': 20, // Miami International Autodrome
  'qa-2004': 24, // Lusail, Qatar
  'es-2026': 22, // Madring, Madrid (new for 2026 — estimate)
  'az-2016': 20, // Baku City Circuit
  'us-2023': 20, // Las Vegas Strip Circuit

  // ---- Historic layouts in the dataset (reasonable estimates) ----
  'fr-1969': 22,
  'de-1932': 23,
  'fr-1960': 22,
  'it-1953': 22,
  'de-1927': 25, // Nürburgring Nordschleife — very long
  'it-1914': 22,
  'pt-1972': 22, // Estoril
  'br-1977': 22, // Jacarepaguá
  'us-1909': 22, // Indianapolis
  'ar-1952': 22, // Buenos Aires
  'za-1961': 22, // Kyalami
  'us-1956': 22, // Watkins Glen
}

// Field-slowdown factors (see header note). Applied to the green-flag loss.
const VSC_FACTOR = 0.5
const SC_FACTOR = 0.34

// Used when a circuit isn't recognised: a sane mid-pack pit-lane delta.
export const DEFAULT_GREEN_LOSS = 22

function lossFromGreen(green: number): PitLoss {
  return {
    green,
    vsc: Math.round(green * VSC_FACTOR),
    sc: Math.round(green * SC_FACTOR),
  }
}

/**
 * Resolve the pit-lane time loss for a circuit from its OpenF1 names
 * (short name / location / meeting name). Falls back to a default delta when
 * the circuit can't be matched.
 */
export function pitLossFor(...names: (string | null | undefined)[]): PitLoss {
  const circuit = findCircuit(...names)
  const green = (circuit && GREEN_LOSS[circuit.id]) ?? DEFAULT_GREEN_LOSS
  return lossFromGreen(green)
}
