// Aligns a clean static circuit outline (from the f1-circuits library, in its
// own projected frame) onto the live coordinate frame used by OpenF1's location
// feed (where the car dots live), so we can draw the nice outline with the cars
// still sitting on it.
//
// Both are the same closed loop, just in different frames (arbitrary rotation,
// scale, translation and possibly a mirror, and a different start point /
// direction). We resample both by arc length and search shift × direction ×
// mirror, solving the best 2D similarity transform (Umeyama) for each, then keep
// the lowest-residual fit. The caller decides whether the residual is good
// enough to trust.

export interface Pt {
  x: number
  y: number
}

function resampleClosed(points: Pt[], count: number): Pt[] {
  const pts = points.slice()
  if (pts.length > 1) {
    const f = pts[0]
    const l = pts[pts.length - 1]
    if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) pts.pop()
  }
  const n = pts.length
  if (n < 2) return points.slice()
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
  let acc = 0
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

interface Xf {
  cos: number // includes scale
  sin: number // includes scale
  tx: number
  ty: number
}

const apply = (xf: Xf, p: Pt): Pt => ({
  x: xf.cos * p.x - xf.sin * p.y + xf.tx,
  y: xf.sin * p.x + xf.cos * p.y + xf.ty,
})

/** Best similarity (rotation + uniform scale + translation) mapping src -> dst. */
function umeyama(src: Pt[], dst: Pt[]): Xf {
  const n = src.length
  let msx = 0, msy = 0, mdx = 0, mdy = 0
  for (let i = 0; i < n; i++) {
    msx += src[i].x; msy += src[i].y; mdx += dst[i].x; mdy += dst[i].y
  }
  msx /= n; msy /= n; mdx /= n; mdy /= n
  let a = 0, b = 0, varS = 0
  for (let i = 0; i < n; i++) {
    const sx = src[i].x - msx, sy = src[i].y - msy
    const dx = dst[i].x - mdx, dy = dst[i].y - mdy
    a += sx * dx + sy * dy // dot
    b += sx * dy - sy * dx // cross
    varS += sx * sx + sy * sy
  }
  const s = Math.hypot(a, b) / (varS || 1)
  const theta = Math.atan2(b, a)
  const cos = Math.cos(theta) * s
  const sin = Math.sin(theta) * s
  return { cos, sin, tx: mdx - (cos * msx - sin * msy), ty: mdy - (sin * msx + cos * msy) }
}

function bboxDiag(pts: Pt[]): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return Math.hypot(maxX - minX, maxY - minY)
}

export interface Aligned {
  points: Pt[] // static outline mapped into the traced frame
  residual: number // RMS fit error as a fraction of the traced bbox diagonal
}

/**
 * Register `staticPts` (clean library outline) onto `tracedPts` (location-feed
 * trace). Returns the transformed static outline and a relative residual; lower
 * is better. Returns null if there isn't enough geometry to align.
 */
export function alignOutline(staticPts: Pt[], tracedPts: Pt[], samples = 120): Aligned | null {
  if (staticPts.length < 8 || tracedPts.length < 8) return null
  const T = resampleClosed(tracedPts, samples)
  const baseS = resampleClosed(staticPts, samples)
  const n = samples

  let best: { res: number; xf: Xf; mirror: boolean } | null = null
  for (const mirror of [false, true]) {
    const S = mirror ? baseS.map((p) => ({ x: p.x, y: -p.y })) : baseS
    for (const dir of [1, -1]) {
      for (let shift = 0; shift < n; shift++) {
        const dst: Pt[] = new Array(n)
        for (let i = 0; i < n; i++) dst[i] = T[(((shift + dir * i) % n) + n) % n]
        const xf = umeyama(S, dst)
        let res = 0
        for (let i = 0; i < n; i++) {
          const q = apply(xf, S[i])
          res += Math.hypot(q.x - dst[i].x, q.y - dst[i].y)
        }
        res /= n
        if (!best || res < best.res) best = { res, xf, mirror }
      }
    }
  }
  if (!best) return null

  const src = best.mirror ? staticPts.map((p) => ({ x: p.x, y: -p.y })) : staticPts
  const points = src.map((p) => apply(best!.xf, p))
  const diag = bboxDiag(T) || 1
  return { points, residual: best.res / diag }
}
