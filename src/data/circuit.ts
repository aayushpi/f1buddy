// A stylized closed circuit used by the simulator to place cars on the track
// map and to derive a realistic speed profile for telemetry. Coordinates live
// in a roughly [-1000, 1000] space to mirror OpenF1's `location` x/y units.

export interface Pt {
  x: number
  y: number
}

// Parametric track: an interesting closed loop with several corners.
export function trackPoint(t: number): Pt {
  const a = t * Math.PI * 2
  const x =
    Math.cos(a) * 820 +
    Math.cos(a * 2) * 180 +
    Math.sin(a * 3) * 120
  const y =
    Math.sin(a) * 560 +
    Math.sin(a * 2) * 240 -
    Math.cos(a * 3) * 90
  return { x, y }
}

const SAMPLES = 600

interface Sample {
  t: number
  p: Pt
  curvature: number
  speed: number // km/h
}

function buildTable(): { samples: Sample[]; path: string } {
  const raw: { t: number; p: Pt }[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLES
    raw.push({ t, p: trackPoint(t) })
  }

  const samples: Sample[] = raw.map((s, i) => {
    const prev = raw[(i - 1 + SAMPLES) % SAMPLES].p
    const next = raw[(i + 1) % SAMPLES].p
    // Discrete curvature via the turning of consecutive segments.
    const v1 = { x: s.p.x - prev.x, y: s.p.y - prev.y }
    const v2 = { x: next.x - s.p.x, y: next.y - s.p.y }
    const cross = v1.x * v2.y - v1.y * v2.x
    const m1 = Math.hypot(v1.x, v1.y) || 1
    const m2 = Math.hypot(v2.x, v2.y) || 1
    const curvature = Math.abs(cross) / (m1 * m2)
    return { t: s.t, p: s.p, curvature, speed: 0 }
  })

  // Smooth curvature so speed transitions look natural, then map to km/h.
  const smooth = samples.map((_, i) => {
    let sum = 0
    const win = 9
    for (let k = -win; k <= win; k++) sum += samples[(i + k + SAMPLES) % SAMPLES].curvature
    return sum / (win * 2 + 1)
  })
  const maxC = Math.max(...smooth) || 1
  samples.forEach((s, i) => {
    const corner = smooth[i] / maxC // 0 straight .. 1 tightest
    s.speed = 330 - corner * 245 // 85 .. 330 km/h
  })

  const path =
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${s.p.x.toFixed(1)},${s.p.y.toFixed(1)}`).join(' ') +
    ' Z'

  return { samples, path }
}

const TABLE = buildTable()

export const trackPath = TABLE.path

export function trackBounds() {
  const xs = TABLE.samples.map((s) => s.p.x)
  const ys = TABLE.samples.map((s) => s.p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

/** Position on track at fractional progress p in [0,1). */
export function positionAt(p: number): Pt {
  const pp = ((p % 1) + 1) % 1
  const idx = Math.floor(pp * SAMPLES) % SAMPLES
  return TABLE.samples[idx].p
}

/** Speed (km/h) at fractional progress p in [0,1). */
export function speedAt(p: number): number {
  const pp = ((p % 1) + 1) % 1
  const idx = Math.floor(pp * SAMPLES) % SAMPLES
  return TABLE.samples[idx].speed
}

// DRS zones (progress ranges along the lap) where the wing may open.
export const DRS_ZONES: [number, number][] = [
  [0.04, 0.16],
  [0.55, 0.66],
]

export function inDrsZone(p: number): boolean {
  const pp = ((p % 1) + 1) % 1
  return DRS_ZONES.some(([a, b]) => pp >= a && pp <= b)
}
