# MEMORY.md — session handover

Where the project stands, what is blocked, and what to do next.
Read `AGENTS.md` first for the rules and the vision.

**Last updated:** 6 Sept 2026, after the second hostile audit round.

---

## 1. What this is

**Chill-Box** — a mobile-first PWA for booking crate slots in the community
solar cold-boxes at three Andhra Pradesh fishing harbours. Telugu by default,
no password, works offline.

Built for a hackathon whose brief is: live capacity per box, one-tap booking
with a 4-hour hold, catch tagging with minimal typing, a checkout that frees
the slot, and an overstay flag — all on free hosting with no paid services.

- **Repo:** https://github.com/Dharmendra554/chill-box (public, `main`)
- **Local:** `F:\fish cold storage booking`
- **Live URL:** https://dharmendra554.github.io/chill-box/ (GitHub Pages, auto-deploys on push to main)
- **Stack:** React 19 · TypeScript · Vite 8 · Tailwind 4 · zustand · Leaflet ·
  vite-plugin-pwa · vitest · oxlint. Firebase is optional and lazy-loaded.

---

## 2. Current state

**All green:** 49 tests · `tsc` clean · `oxlint` zero warnings · build clean.
Entry bundle **93 kB gzipped**; map and Firebase are separate lazy chunks.

Seven commits on `main`, most recent first:

| Commit | What |
| --- | --- |
| `92f259b` | Second audit round fixed; optional Firebase sync added |
| `9ccacb3` | Supabase schema (superseded — see §4) |
| `bb6d8d5` | CSS cascade fix (`@layer components`) |
| `0958018` | Docs corrected to match behaviour |
| `f0707d0` | First audit round fixed |
| `508c051` | Readout to top bar, demo tools fenced, roster cleanup |
| `5af99f0` | Initial commit |

### What works end to end (verified in the browser)

Registration and admin approval · claiming an existing boat with the last 4
digits of its number · map-first booking (tap a pin → catch → crates) ·
booking receipt with a code · 4-hour hold countdown · deposit with a promised
collection time · release with ledger row · overstay flag · harbour list of
who holds what and when it frees · three harbours with separate rosters ·
route, bearing, ETA, compass · safety card with direct-dial numbers, vCard
download and location sharing · admin console at `#admin` (PIN **2468**) with
approvals, live usage, analytics and CSV export · day/night themes · Telugu
and English · offline staleness detection.

### Two hostile audits were run and acted on

Round 1 scored **4/10**, round 2 scored **4.5/10**. Both reports were correct
and the findings are fixed except those listed in §5. Notable: round 2 found
that a *fix from round 1* had deleted one harbour's entire reporting history.
Assume the next audit will find something too.

---

## 3. Where we stopped

Mid-way through wiring **optional multi-user sync**. The code is written,
type-checks, lints clean and is inert without configuration — the app behaves
exactly as before until Firebase env vars are present.

Done:
- `src/lib/harbourSync.ts` — transactions, realtime watch, lazy Firebase load
- `firebase/database.rules.json` — security rules to paste into the console
- `.env.example` — the three variables needed
- Store actions route through sync when `syncEnabled`
- `startHarbourSync()` called once from `main.tsx`

Not done: **never tested against a real Firebase project.** See §4.

---

## 4. Blocked — needs the user

### 4a. Firebase keys (blocks multi-user)

The user's Supabase account was upgraded to a paid plan, which the brief
forbids, so we switched to **Firebase Realtime Database (Spark, free, no
card)**. `supabase/schema.sql` was deleted; commit `9ccacb3` is history only.

Ask the user for, from Firebase console → Project settings → web app config:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
```

Then:
1. Put them in `.env.local` for local dev, and add them as **repository
   secrets** (`gh secret set VITE_FIREBASE_API_KEY`, etc.) — the deploy
   workflow already reads them under those names.
2. Have the user paste `firebase/database.rules.json` into the database's
   **Rules** tab.
3. Seed the shared copy once — `seedHarbour()` exists but **is not called
   anywhere yet**. Decide where: probably a one-time admin action, not on app
   start, so a fresh phone cannot overwrite a live harbour.
4. **Test with two browsers side by side.** Book the last crate in both at the
   same moment and confirm exactly one wins and the loser is told why. This
   path has never been exercised against a real database.

### 4b. Deployment — DONE

Vercel blocked the Hobby team on fair-use limits, so the live link moved to
GitHub Pages: https://dharmendra554.github.io/chill-box/

It redeploys itself on every push to `main` via
`.github/workflows/deploy.yml`, which runs typecheck, tests, lint and build
first — a red build never publishes. Nothing manual is needed.

If a custom domain is ever wanted, Cloudflare Pages and Netlify both build
this repo unchanged (`npm run build` → `dist`); only `BASE_PATH` is
Pages-specific.

---

## 5. Known outstanding issues

From the second audit, not yet fixed. Roughly in priority order.

**Accessibility (a group worth one focused pass)**
- `DockScreen` `Stat` renders `<dt>`/`<dd>` outside any `<dl>` — invalid HTML.
- `BookSheet` species picker: `role="radiogroup"` with `<li>` wrappers breaks
  the ownership relation; no arrow-key roving tabindex.
- `AdminScreen` `Bars` compact charts have no accessible text — this
  contradicts the README's "never colour alone" claim.
- `SeaMap` uses `role="application"` with a hardcoded English `aria-label`.

**Correctness**
- `nextBoatId` reuses the lowest free hull number, so a rejected boat's number
  can be handed to a new registration and inherit its ledger history. Use a
  monotonic counter.
- `hourHistogram` uses `en-GB`/`hour12:false`, which can yield `"24"` on older
  ICU; the guard silently drops those rows rather than reporting.
- `bookingCode` repeats for the same boat+box roughly every 17 h. Harmless
  (longer than a 4 h hold) and the comment now says so, but if it ever becomes
  an identifier this must change.

**Polish**
- `formatClock` / `hourLabel` always render Latin `am`/`pm` inside the Telugu
  UI; `formatKm` localises metres but not km; admin dwell shows a bare `h`.
- `useMarine`'s interval reload passes no `AbortSignal`; on a stalled link
  requests can accumulate.
- `<dialog>.showModal()` has no feature detection; an ancient WebView would
  throw into the ErrorBoundary.
- `SeaMap` tile handling flaps — `tileload` clears the offline banner, so a
  partial failure blinks it on and off.
- `flushStorage` runs on `visibilitychange` for *show* as well as hide.
- `theme-color` hex literals in `App.tsx` duplicate `tokens.css` and have
  drifted slightly from the night background.
- App vibrates on cold start if a crate is already overdue.

---

## 6. What to do next — suggested order

1. **Finish Firebase** (§4a) once keys arrive, including the two-browser race
   test. This is the single biggest gap: without it the app cannot actually
   coordinate two fishermen, which is the problem the brief poses.
2. **One accessibility pass** — the four items above are quick together and
   close a README claim that is currently untrue.
3. **Fix `nextBoatId`** — small, and it silently corrupts reports.
4. **Re-audit** with a fresh hostile subagent, then act on it.
5. Polish list, as time allows.

### Deliverables the brief asks for

- [x] Public source repo with a concise README
- [x] Trade-offs note under 300 words (`TRADEOFFS.md` — currently 297)
- [x] Live published prototype link — https://dharmendra554.github.io/chill-box/

---

## 7. Decisions already made — do not silently reverse

Each of these was deliberate. Change them only with a reason.

- **No login, ever.** A shared secret on a dock phone is painted on a hull
  within a week. Registration plus admin approval is the gate; claiming an
  existing boat needs the last 4 digits of its registered number.
- **Admin is not a tab.** It lives at `#admin` only.
- **Booking is skipper-led.** We label the emptiest box "most room" but never
  auto-assign — the box you can reach matters more than the box with space.
- **Booking never requires GPS.** The map is the primary path, the named box
  list is the equal fallback.
- **The clock lives outside the zustand store** (`hooks/useClock.ts`). See
  `AGENTS.md` §6 for why. Do not undo this.
- **Boxes are named after landmarks**, not numbers.
- **Speech is always Telugu**, whatever the screen language. With no Telugu
  voice we speak transliterated Telugu through an Indian English voice rather
  than switching language.
- **Demo tools are fenced and labelled** as demonstration only.
- Harbour coordinates: Nizampatnam and Kakinada came from OpenStreetMap;
  Visakhapatnam's fishing harbour is not indexed there and is approximate.
  This is disclosed in `data/harbours.ts`.

---

## 8. Demo script (for judging)

1. Pick **Nizampatnam**, boat **Ramu #04**, last 4 digits **2004**.
2. Tap the **Diesel Bunk** pin → **Prawn** → **1 crate**. A receipt appears
   with a code to read out at the box.
3. Tap **Pretend I am 8 km out at sea** — distance, bearing, ETA and compass.
4. **Fish deposited** → promise a collection time; it appears instantly in the
   grid and in the Harbour list.
5. **Ice Plant box** is full and cannot be picked; **Auction Hall** carries
   #11's overstay, pulsing amber.
6. Open **`/#admin`**, PIN **2468**: approvals, live usage with force-release,
   three months of reporting, Download for Excel, verified action log.
7. **Reset demo** restores every harbour and signs you out.
