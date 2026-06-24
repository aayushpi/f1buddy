// Tiny diagnostic endpoint. If GET /api/ping returns {"ok":true} on the
// deployment, Vercel IS building functions for this project — so any /api/v1
// 404 is a routing/proxy issue. If /api/ping itself 404s, functions aren't
// being built at all (a project-level config problem).
export default function handler(_req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: true, ts: Date.now() }))
}
