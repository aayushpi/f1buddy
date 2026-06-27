# Qualifying page — design handoff

Status: **Implemented (first pass)** · branch `feature/free-practice-page`
Related: `src/components/views/QualifyingView.tsx`, `src/utils/qualifying.ts`,
`src/components/ViewTabs.tsx`, `src/App.tsx`, gating on `RaceState.sessionType`.

This is the sibling of [`free-practice.md`](./free-practice.md) and follows the
same split: the **data layer and analysis maths are settled** (`qualifying.ts`),
and a design pass (`prototype` / Claude-design skill) should reuse it unchanged
and only re-skin / re-lay-out `QualifyingView.tsx` and the `Qualifying view`
block in `src/styles/global.css`.

## Why this page exists

A qualifying session is read differently from a race *and* from a practice.
There is no race result and no long-run pace — there is a **grid being built by
elimination**. The two things people actually watch for:

1. **The knockout** — the provisional order with the elimination lines drawn
   through it: who is into the pole shootout, who is in the drop zone, and above
   all who is sitting **on the bubble** (the gap to the cut line). This is the
   live drama and it exists in no other session type.
2. **Sectors & teammates** — where the lap time is being found (the sector
   "kings", each car's ideal lap and the time **left on the table**), and the
   sport's purest yardstick, the **intra-team qualifying delta**.

Sources that informed the model:
[2026 qualifying format / 22-car grid (Motorsport.com)](https://www.motorsport.com/f1/news/2026-f1-qualifying-format-explained-as-cadillac-expands-the-grid-to-22-cars/10788081/),
[How F1 qualifying works in 2026 (The Race)](https://www.the-race.com/formula-1/how-does-f1-qualifying-work-2026/),
[Qualifying deep dive — Q1/Q2/Q3 (thef1db)](https://thef1db.com/blog/f1-qualifying-deep-dive).

## Where it appears

- The **Qualifying** tab leads the tab bar, **only** when `sessionType`
  contains "qualifying". Hidden for Race / Practice / Sprint-race. All the normal
  tabs stay (same product decision as Free Practice).
- Entering a qualifying session **auto-opens** this page once (seeded per
  session, same pattern as Gap-to-Leader and Free Practice). A leftover
  `qualifying` view is reset to Timing when a non-qualifying session loads. The
  seeding logic for both special pages now lives in one effect in `App.tsx`.
- Replay-/live-/simlive-safe automatically: it reads `lapHistory` + `stints`
  straight off the snapshot, already cut to the replay clock.

## Data contract (do not break)

Everything derives client-side from the existing snapshot — **no new API calls,
no new types.** `qualifying.ts` **reuses `buildTimesheet` from `practice.ts`
unchanged** for the one-lap maths (best lap, gap, per-driver best sectors, ideal
lap, session-best sectors, theoretical best, compound, trap) and layers the
knockout + teammate reads on top:

- `buildQualifying(drivers, stints) → QualifyingReport` — the timesheet rows
  enriched with `zone` (`pole` / `q2` / `out`), `toLine`, `onBubble`,
  `teammateDelta`; plus the derived field/cut numbers and provisional pole.
- `teammatePairs(report) → TeammatePair[]` — one row per team, faster car first,
  with the intra-team gap; closest battles first.

### The adaptive elimination lines

The whole knockout is **derived from the entry list size** — no season's car
count is hardcoded (the user's standing preference: adaptive thresholds, not
constants). `deriveCuts(fieldSize)`:

- Q3 always holds the top 10 → `q3Cut = min(10, fieldSize)`.
- The rest are split evenly between the two cuts →
  `eliminatedPerSegment = round((fieldSize − q3Cut) / 2)`.
- `q1Cut = fieldSize − eliminatedPerSegment`.

So **22 cars → 6 out per cut** (top 16, then top 10); **20 cars → 5 out**; a
short test field degrades gracefully (≤10 cars ⇒ no cuts, everyone in the
shootout). The computed numbers are surfaced in the banner
(`top 10 · 22 cars · −6/seg`) so the cut-off is transparent.

`toLine` is the signed gap to the line that matters to each car, with a single
consistent sign — **negative = safe by |x|, positive = must find x**:

- drop-zone car → gap to the last car safe from the Q1 cut;
- Q2-zone car → gap to the top-10 (Q3) line;
- pole-zone car → cushion to the first car currently out.

## Current layout (the thing to critique)

```
[ Knockout | Sectors & H2H ]                         <session name>

KNOCKOUT
  ┌ banner: Provisional pole · Theoretical pole · Q3 bubble · Q1 bubble · Cuts ┐
  └ table (zone-tinted left edge, bubble rows highlighted, divider rows):
      # | Driver | Tyre | Best Lap | Gap | Int | To line | Trap
      ── Q2 zone ──            (divider at the top-10 cut)
      ── Drop zone — out in Q1 ──  (divider at the Q1 cut)

SECTORS & H2H
  ┌ Sector kings: S1 / S2 / S3 owner + time · Theoretical pole ┐
  ┌ Teammate head-to-head: swatch FASTER [bar] slower  +0.123  ┐
  └ table: # | Driver | S1 S2 S3 | Ideal | On table | vs Mate  ┘
```

## Known first-pass limitations (fair game for a redesign)

- **No Q1/Q2/Q3 segment awareness.** The snapshot's `lapHistory` carries no
  per-lap timestamp, so we can't reliably tell which segment is live. The page
  therefore shows the **provisional grid as-it-stands** with the knockout zones
  drawn positionally (exactly how TV graphics frame it) rather than "who is
  actually still in this segment". A future pass could infer segments by
  clustering flying-lap times into the two pit-lull gaps and labelling each by
  participant count — but that needs lap timestamps plumbed through `LapDetail`.
- **Tyre on the best lap** is matched by lap-time equality (inherited from the
  practice timesheet); fine in practice, a tolerance match if it ever drifts.
- **No track-evolution / fuel context** — late Q3 laps are simply faster as the
  track rubbers in; the page shows raw times.
- A **deleted lap** (track limits) still counts until the feed drops it; race
  control deletions aren't cross-referenced yet.
- Mobile/iPad-portrait: the knockout table scrolls horizontally like the
  practice timesheet; worth a dedicated narrow layout.

## Redesign checklist

- [ ] Keep `qualifying.ts` (and the `buildTimesheet` reuse) as the single source
      of truth; only restyle.
- [ ] Preserve the Qualifying-only tab gating and the auto-open-once behaviour.
- [ ] Keep the elimination lines **derived from field size**, and keep the
      computed cut numbers visible.
- [ ] Keep the bubble cars visibly called out — they are the whole story.
- [ ] Verify against a real session via simlive (see `simlive.md`) — pick a
      Qualifying `session_key`.
