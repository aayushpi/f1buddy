// The simulator drives cars around a *real* circuit — the Red Bull Ring, home
// of the demo's Austrian Grand Prix — so the track map, speed map and telemetry
// speed profile all match a genuine layout instead of a synthetic loop. The
// outline geometry comes from the shared circuit library (see ./circuits) and
// lives in a roughly [-1000, 1000] space mirroring OpenF1's `location` x/y units.

import type { ChannelPoint } from '../api/types'
import { CIRCUITS } from './circuits'

export interface Pt {
  x: number
  y: number
}

// The circuit the demo runs on. Its raw outline is a closed lon/lat-derived
// polyline; we resample it by arc length so corners get even sampling density.
const DEMO_CIRCUIT = CIRCUITS['at-1969'] // Red Bull Ring, Spielberg

const SAMPLES = 600

interface Sample {
  t: number
  p: Pt
  curvature: number
  speed: number // km/h
}

/** Resample a closed polyline to `count` points spaced evenly by arc length. */
function resampleClosed(points: readonly [number, number][], count: number): Pt[] {
  const pts: Pt[] = points.map(([x, y]) => ({ x, y }))
  // Drop a duplicated closing vertex if present; we re-close via wrap-around.
  if (pts.length > 1) {
    const f = pts[0]
    const l = pts[pts.length - 1]
    if (Math.hypot(f.x - l.x, f.y - l.y) < 1) pts.pop()
  }
  const n = pts.length
  const seg: number[] = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    seg.push(d)
    total += d
  }
  const out: Pt[] = []
  let i = 0
  let acc = 0 // arc length at the start of segment i
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total
    while (i < n - 1 && acc + seg[i] < target) {
      acc += seg[i]
      i++
    }
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const f = seg[i] > 0 ? (target - acc) / seg[i] : 0
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })
  }
  return out
}

const OUTLINE = resampleClosed(DEMO_CIRCUIT.points as [number, number][], SAMPLES)

function buildTable(): { samples: Sample[]; path: string } {
  const raw: { t: number; p: Pt }[] = OUTLINE.map((p, i) => ({ t: i / SAMPLES, p }))

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

/** Circuit outline enriched with speed / gear / DRS for the demo speed map. */
export function simChannels(): ChannelPoint[] {
  const out: ChannelPoint[] = []
  for (let i = 0; i < SAMPLES; i += 2) {
    const s = TABLE.samples[i]
    const gear = Math.max(1, Math.min(8, Math.round(s.speed / 42) + 1))
    out.push({ x: s.p.x, y: s.p.y, speed: s.speed, gear, drs: inDrsZone(s.t) })
  }
  return out
}
