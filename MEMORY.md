# MEMORY.md — session handover

Where the project stands, what is blocked, and what to do next.
Read `AGENTS.md` first for the rules and the vision.

**Last updated:** 7 Sept 2026, after the eighth hostile audit round (two auditors), pushed.

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

**All green:** 78 tests · `tsc` clean · `oxlint` zero warnings · build clean.

**First paint, measured, all of it:**

| | |
| --- | --- |
| Entry JS | 96 kB gz |
| CSS | 12 kB gz |
| Service worker + workbox runtime, first visit | 9 kB gz |
| **Google Fonts** — three families; Noto Sans Telugu alone is 124 kB | **265 kB** |
| **Total before the app can answer "is there room"** | **~382 kB** |

Round 7 called ~110 kB "the honest first-paint figure". It was not: it
counted only our own code and left out the fonts, which are **2.7× the JS
entry**. Do not quote a first-paint number that stops at the bundle. The
fonts are the largest single cost in the app and are not yet fixed —
self-host and subset them to the glyphs `dictionary.ts` actually uses.

Map, Firebase and the admin console are separate lazy chunks, verified in
`dist/`.

**Pushed and deployed.** `240bcd9` is on `main` and the Deploy workflow runs
typecheck, tests, lint and build before publishing.

The three `VITE_FIREBASE_*` repository secrets are set. They are public by
design; `firebase/database.rules.json` is what constrains them.

**The rules now deploy from a shell**, not by hand: `firebase.json` is in the
repo, so `npx firebase-tools deploy --only database --project chill-box-e5d6b`
publishes them. Seven rounds of hand-pasting is how the published rules came
to sit behind the client — see §16.

Commits on `main`, most recent first:

| Commit | What |
| --- | --- |
| `240bcd9` | GPS out of the interface, swipeable toast, hover hints, firebase.json |
| `af506e3` | Round 7: the seams between the per-slot rewrite and everything else |
| `0fbf511` | Per-slot writes: the database enforces whose crate it is |
| `0826f71` | Docs: audit recipe, scale numbers, what is live |
| `25162e6` | Multi-user harbour; audit rounds 3–6 fixed; tests 49 → 67 |
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

### Eight hostile audit rounds were run and acted on

Scores in order: **4.0, 4.5, 3.0, 3.5, 4.5, 4.5**, round 7's pair — **3.5**
(rules/sync/store) and **4.5** (UI/honesty/performance) — and round 8's
**3.5 / 3.5**. Every round found real defects with all four gates green, and
in seven of the eight the *previous round's fixes* caused the next round's
defects. Details in §9–§13, §16 and §17; the recipe is in `AGENTS.md` §5.

Splitting the review in two by concern is worth it: the auditors find
disjoint sets and then converge on the same root cause.

**Assume the ninth will find something too.** That has been true eight times,
and the score has not yet gone up — every round the fixes are real and every
round they open a new seam. The lesson is not "audit harder", it is **make
each round smaller**: round 8's two worst findings were both created by round
7, which changed twenty things at once.

---

## 3. Where we stopped

**Multi-user sync is live and verified against a real Firebase project**
(`chill-box-e5d6b`, Spark, region `asia-southeast1`). The keys are in
`.env.local`, which is gitignored.

Verified in two browser instances against the real database, not by reasoning:

- Both raced the last crate in one box. Exactly one won; the loser was told
  *"Another boat took that space just now. Try another box."*
- A change on one instance reaches the other with no reload.
- The rules refuse, live: rewriting a boat's mobile number, a slot index out
  of range, and a slot claiming a boat that does not exist.
- Killing the database socket raises the dated staleness banner within ~20 s
  and refuses new bookings with a real reason; both recover when it returns.
- **Reset demo** resets this harbour's shared crates, so the demo script still
  works with sync on. It does not reset the roster, the ledger (append-only by
  rule) or the other two harbours' shared copies.
  **With one caveat that was missing here:** it is a multi-path `update`, and
  Firebase applies those atomically. One slot held by a boat a skipper has
  claimed, inside its 6 h window, refuses all thirty — so once a real skipper
  is holding a crate the button stops working and says so. During judging,
  reset before anyone signs in, not after.

Six defects were found and fixed doing this — see §9.

**Scope of that verification, precisely:** booking, the two-phone race,
deposit, release, force-release, the ledger round trip and the offline
refusal were each exercised against the real database. The *bootstrap* path —
an empty database, before anything is published — was not, and round 5 found
it deadlocked (§12). Do not read "verified" as "verified everywhere".

**And "force-release verified" was worth nothing**, because every boat in the
demo roster is unbound, which is the one case where the rule permits it. It
failed for every claimed boat and no rehearsal could have shown that (§16).
When verifying anything the rules touch, **bind a boat first**.

---

## 4. Blocked — needs the user

### 4a. Repository secrets and deploy — DONE

Secrets set, pushed, deployed, live bundle verified to contain the config.

**The rules deploy from a shell now** — `firebase.json` is in the repo:

```bash
npx -y firebase-tools login --no-localhost
npx -y firebase-tools deploy --only database --project chill-box-e5d6b
```

They were hand-pasted for seven rounds, and that is exactly how the published
copy came to sit behind the client — with the client writing a `uid` field
the published rules refused, which bricked registration and blamed the
network for it (§16). **Deploy after any change to that file.** Until it is
deployed, none of the per-slot ownership enforcement and none of the
force-release fix is real.

On a fresh database, open `#admin` once and press **Publish harbour** — it
seeds boxes, roster and history in that order. It is idempotent.

Background: the user's Supabase account was upgraded to a paid plan, which the
brief forbids, so we switched to **Firebase Realtime Database (Spark, free, no
card)**. `supabase/schema.sql` was deleted; commit `9ccacb3` is history only.

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

Not yet fixed. Roughly in priority order. **The accessibility group, the
`touchAdmin` throttle and the `letter-spacing` problem were closed in round 7
(§16); what is left is below.**

**Biggest single win, measured:** the 223 kB ledger feed every phone
downloads at startup to render a 2.6 kB answer. See §14 — this is the top of
the list and it is deliberately its own round.

**Accessibility**
- `BookSheet` species picker: `role="radiogroup"` with `<li>` wrappers breaks
  the ownership relation; no arrow-key roving tabindex. Cosmetic for this
  population — six tab stops instead of one — but still wrong.

**Correctness**
- `nextBoatId` reuses the lowest free hull number. Mostly defused: with a
  shared harbour `claimBoat` allocates by transaction so two phones cannot
  collide, and a rejected boat is now *blocked* rather than deleted, so its
  number is never handed out again. Still true in local-only mode.
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
- The GPS fix is aged against the *server* clock (`SafetyCard`) while
  `position.timestamp` is the *device* clock, so the distress panel's
  staleness warning is wrong on a phone with a wrong clock — the exact bug
  class `useClock` documents fixing for holds.
- `monthInsight`'s "days elapsed" derives from the device timezone, so the
  admin utilisation figure is quietly device-dependent outside IST.
- **The webfonts: 265 kB, measured**, from a third-party origin — Noto Sans
  Telugu's Telugu subset alone is 124 kB, larger than the entire JS entry.
  Round 7 hedged this as "plausibly larger than the whole JS entry"; it is
  2.7× larger. This is the biggest first-paint cost in the app. Self-host,
  subset to the glyphs `dictionary.ts` uses, and cut to two weights.
- `SeaMap` tile handling flaps — `tileload` clears the offline banner, so a
  partial failure blinks it on and off.
- `flushStorage` runs on `visibilitychange` for *show* as well as hide.
- `theme-color` hex literals in `App.tsx` duplicate `tokens.css` and have
  drifted slightly from the night background.
- App vibrates on cold start if a crate is already overdue.

---

## 6. What to do next — suggested order

1. **Deploy the rules** — `npx firebase-tools deploy --only database`. None of
   the per-slot enforcement, and none of the force-release fix, is real until
   the published rules match the file.
2. **Move the ledger feed off the startup path** (§14). The single biggest
   measured win in the app, and the one change worth its own audit round
   because it touches the subscription lifecycle.
3. **Fix `nextBoatId`** — small, and it silently corrupts reports.
4. **Self-host and subset the Telugu webfont**, then re-measure first paint.
5. **Re-audit**, split by concern as in round 7. Worth attacking next: a
   phone that sleeps mid-hold, two admins acting at once, a boat bound to a
   phone that is then wiped, and the half-committed write paths now that
   `settle` exists.
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
7. **Reset demo** — in `#admin` once sync is on. Clears this harbour’s
   crates for everyone and signs you out; roster and ledger are kept.

With sync on, add: open the same link on a second phone, tap the **full**
Ice Plant box to see who is inside and when each crate frees, then book the
last crate in Auction Hall on both at once — one wins, the other is told why.

---

## 9. Defects found while wiring sync — all fixed

Every one of these passed `tsc`, `oxlint`, all tests and the build. Green
tooling remains the floor, not the ceiling.

1. **Nothing ever wrote boats to the database.** The rules refuse a slot whose
   `boatId` names no boat at that harbour, so *every* remote booking would have
   failed and been reported to the skipper as "no signal". `putBoat` now runs
   on registration and approval, and `seedHarbour` publishes the roster.
2. **`seedHarbour` was dead code.** Now reachable as **Publish harbour** in the
   admin console — an admin action, never on start-up, so a phone that has been
   offline all day cannot decide what the harbour looks like.
3. **Reset demo would have looked broken** with sync on: the watcher re-applied
   the shared copy a second later. It now resets the shared copy too.
4. **`registeredAt` was immutable in the rules.** Every device seeds the roster
   with its own timestamps, so a second phone's publish failed on all 20 boats.
   `mobile` is still immutable — the last four digits are the ownership check.
5. **The staleness banner watched the wrong thing.** It keyed off the swell
   API, which can be perfectly reachable while the database is not. It now
   follows the database socket (`.info/connected`), with a 20 s window instead
   of 15 min, because a dropped socket means the figures are wrong *now*.
6. **Booking offline printed a receipt for nothing.** Firebase queues an
   offline transaction and shows it to its own listener immediately, so the app
   said "held for you" for a booking that had reached nobody and might never
   commit. Booking is now refused without a live link, with the real reason.

Also: `.env.local` is loaded by vitest, so the suite's behaviour depended on
whether the developer had keys. `vite.config.ts` now pins the test env to the
local path — unit tests cover one device; the shared paths are verified in a
browser against the real project.

---

## 10. Third hostile audit — scored 3.0/10, all certain findings fixed

The audit is in the session transcript. It was right, and it found things two
rounds of green tooling and a browser pass did not. Fixed:

| Defect | Why it mattered |
| --- | --- |
| `depositRemote` returned `reservedAt: undefined`; the SDK rejects undefined, so the transaction threw, a bare catch ate it, and deposit reported success | The crate stayed a 4 h hold **with fish in it** and was handed to the next boat. `pruneWire` now strips undefined in the one place every mutation passes through, with a test |
| `adminRelease` never called `releaseRemote` | Force-release freed nothing shared; the listener put the crate back while the ledger and audit log both swore it was released |
| Reset demo sat on the main screen for any boat | One tap wiped every live hold in the harbour, for every phone. Now admin-only, behind the PIN, two-tap confirm |
| Ledger and boats were written and never read back | All reporting and CSV froze at the seed data; registration and blocking never crossed devices. `watchRoster` now reads both |
| Receipt was shown before the transaction resolved | "Stored in Auction Hall, **0 crates**" with a code that did not match, and a green Booked panel over a lost-race toast. `reserve` and `deposit` are now awaited |
| Deposit/cancel ignored the box | Depositing at one box marked the boat's crate at another box occupied too — a physically empty crate blocking a real booking |
| Every remote failure reported as "no signal" | A rules refusal told a skipper on full bars to wait for signal. `reasonFor` separates a dead link from a refusal |
| Hull numbers minted from the local roster | Two phones registering at once collided; the loser's crates showed under the other skipper's name. `claimBoat` allocates by transaction |
| `Publish harbour` used `set` for boats | A stale phone reverted every approval and block, while the button's help text promised it could not overwrite anything |
| Client clock drove hold expiry | One fast phone expired the whole harbour's holds. `serverNow()` uses `.info/serverTimeOffset` |
| Full mobile numbers were world-readable | Twenty fishermen's numbers published on the open internet, and the last-4 ownership gate defeated by reading the data. Only `mobileLast4` is stored now |

Not fixed, deliberately, and documented in the README: a signed-in client can
still overwrite a slot it does not own, because booking transacts over the
whole `boxes` node so write is granted there. Per-slot compare-and-set is the
fix and needs no paid plan — it is the top of the post-submission list.

**Re-audit before believing any of this.** The last three rounds each found
real defects after the previous round was declared fixed.

---

## 11. Fourth hostile audit — scored 3.5/10, certain findings fixed

It confirmed round 3's fixes held, then found that those fixes had broken new
things. That is the pattern: **the defects live in the seams between a fix and
the rest of the app.**

| Defect | Why it mattered |
| --- | --- |
| The clock fix only reached the sync layer. `applyTick`, every countdown and every overstay still ran on `Date.now()` | A phone 20 min fast told its owner "your hold ended" early, then refused to deposit — while the shared harbour kept that crate locked for everyone. `useClock` now reads `serverNow()` |
| `rejectBoat` never reached the database | The shared roster put the rejected boat straight back as `pending` on the next snapshot. Rejection now **blocks** — the state that survives, since the rules rightly forbid deleting a boat |
| The roster merge overwrote the full mobile number on the phone that owned it | Killed the duplicate-number guard, the admin's ability to ring an applicant, and the CSV's Mobile column. The merge now keeps the longer number |
| No busy guard on booking, deposit or register | Double-tap on 2G booked **two** crates, or registered one person twice and burned a hull number for ever |
| One listener error set `syncLive` false for ever; a socket reconnect cleared the banner over frozen data | Either bricked every write until the app was killed, or showed stale figures as live. The listener now resubscribes, and only *data arriving* proves the link is up |
| `return current` on an unseeded harbour | `null` asks Firebase to **delete** the node; only a rule stopped it. Now returns `undefined`, which is what "abort" actually means |
| "No signal" reported when nothing needed changing | New `stale` and `unseeded` reasons, so an expired hold is not reported as a dead link |
| Audit row written before force-release resolved | The hash-chained log asserted a release that had failed |
| `void putBoat(...)` | Approve/block could diverge silently from the database |
| A signed-in client could wipe every crate | `$box` now requires all ten slots; three boxes of one empty slot each used to pass every check |
| PWA icons used absolute `/icon.svg` | 404 on the GitHub Pages path — the exact URL judges open |
| Ledger subscribed to the whole node | Every append re-downloaded the entire history to every phone, for ever, on 2G. Now `limitToLast` |

Also corrected: the rules header and README no longer overstate what is
enforced — they now enumerate exactly what a signed-in client can still do
(overwrite another boat's slot, append invented ledger rows, self-approve).
Test count corrected to 57. `currentUid` deleted (dead code with a false
comment). README now says to enable **Anonymous sign-in** — without it every
write in the harbour is refused, and the old steps never mentioned it.

---

## 12. Fifth review — strict CTO, scored 4.5/10, DO NOT SHIP → fixed

The first reviewer to say the engineering underneath was sound and still
refuse to ship it. Both of its ship-blockers were real.

| Defect | Why it mattered |
| --- | --- |
| **Bootstrap deadlock.** `syncLive` was set only from the boxes snapshot, and that callback returned early on the `null` an empty database sends | A fresh project could never be published, registered into or booked in — every refusal said "no signal" while the socket was live. The app was unusable end to end on any new database, following its own README |
| **The judged artifact was `806697b`** | Two rounds of fixes sat uncommitted; the live link still served the silent-deposit build |
| `stale` mapped to "your 4-hour hold ended" | Shown to skippers whose release had just succeeded. Now a neutral, true message |
| `syncOffline` was a booking sentence | Shown when approving a boat or force-releasing a crate. Now generic |
| Rules header claimed no slot could be removed | A signed-in client can delete an individual slot: write cascades from `boxes`, and validate does not run on a delete. Now disclosed instead of denied |
| `adminTouchedAt` stamped with `Date.now()`, compared against `serverNow()` | A slow phone was idle-locked out of the admin console permanently; a fast one never locked at all. One clock now |
| Seeded demo data stamped in device time, judged in server time | A slow phone expired every seeded hold seconds after connecting |
| `seedHarbour` pushed history under fresh keys after an emptiness check | Two admins pressing Publish at once duplicated every row, unremovably. Rows now keep their own id, so the append-only rule makes a second publish a no-op |

New: `src/store/sync.test.ts` covers the shared-harbour branch the other 57
tests cannot reach — the gap that hid the deadlock.

Still open, deliberately, and disclosed in the rules header and README: a
signed-in client can overwrite another boat's slot, delete an individual
slot, append invented ledger rows and self-approve. All four close with
per-slot compare-and-set writes bound to the boat's `uid`. That is the first
thing to build after submission and it needs no paid plan.

### Round 5, second pass — the remaining state-management deductions

- **Reset demo now seeds what it needs.** On an unpublished harbour it was
  refused by the `boatId` rule with nothing the admin could do about it. It
  publishes the roster first, then forces the boxes. Either button now works
  from an empty database.
- **Busy guards on release, cancel hold and force release.** `ConfirmButton`
  awaits and disables while the write is in flight. Verified live: three taps
  on Sold & clear produced exactly one ledger row (1500 → 1501).
- **No double subscribe at startup.** `.info/connected` fires `true` on the
  first connect too, so resubscribing there re-fetched the whole harbour,
  roster and ledger a second time before the first screen settled. Only a
  genuine drop-and-return re-follows now.
- **Publish is idempotent for history**, so two admins pressing it at the same
  moment cannot duplicate rows the rules can never delete.
- Dead third clause removed from the roster merge.

Verified against an empty database, which is the case that used to deadlock:
Publish harbour → 21 boats, 1 500 seeded ledger rows, occupancy 8/10/3 matching
the demo script. Then book → deposit → release end to end.

---

## 13. Sixth review — 4.5/10, DO NOT SHIP → fixed

The reviewer that caught the thing five rounds and one browser verification
missed, because the verification measured the wrong side of the query.

| Defect | Why it mattered |
| --- | --- |
| **Every real release was invisible to every phone.** The ledger feed used `limitToLast(1500)` ordered by KEY. Seeded history is keyed `nizampatnam-90-0`; a release gets a Firebase push key `-Oab…`; `-` sorts below `n`. The window was 100% seed, so no release could ever enter it | Reporting, the insight strip and the billing CSV froze on fabricated data the moment sync came on, with nothing on screen looking wrong. Proven live: `orderBy "$key"&limitToLast=3` returns three seeded rows, no push keys. Now ordered by `releasedAt`, with `.indexOn` in the rules |
| `LEDGER_LIMIT` was declared twice, in two files | The two being equal is what made the above total instead of partial. One constant now, in `selectors.ts` |
| **Reset demo always targeted Nizampatnam** | An admin at Kakinada wiped another society's live holds — with fish in them — and was told they had cleared the harbour on screen. It now uses the harbour being viewed |
| Reset demo silently wiped the audit log | The integrity trail the console advertises, destroyed with no mention. It survives, and the reset is itself recorded |
| `seedHarbour` reported "21 boats were refused" when all 21 landed and only the boxes failed | The comment directly above it claimed the code did not do that. Now reports which half failed and that pressing again is enough |
| Rules header claimed the ten-slot rule stopped a harbour wipe | It stops a malformed write only. Three boxes of ten *empty* slots is perfectly valid and empties the harbour. Now disclosed at the top of the list, in both the rules and the README |
| Rules header contradicted itself about removing slots | One sentence said impossible, another explained how. The false one is gone |
| Audit rows stamped with `Date.now()` | Every other timestamp is harbour time; the one artefact that exists to be trusted disagreed with the console around it |
| Approve/reject logged before the write resolved | The chain asserted approvals the database had refused — the same defect §11 fixed for force-release, applied at one call site and not generalised |
| `TRADEOFFS.md` — a mandated deliverable — described a client-only app with no database and "a sync server is the next build" | Flatly contradicted the shipped architecture. Rewritten; 299 words |
| Three documents quoted three different test counts | They now describe the gates instead of a number that drifts |

**Standing lesson, now three rounds old:** verify the side of the system the
user experiences, not the side that is easy to query.

---

## 14. Scale and efficiency — measured, not assumed

**What travels.** The node every booking transacts over is the harbour's three
boxes: **3.5 kB**. It is fixed at 30 slots and does **not** grow with the
number of boats. The roster is 2.7 kB at 20 boats, 27 kB at 200. The ledger
feed is capped at `LEDGER_LIMIT` rows and Firebase sends only the changed child
after the first load.

**At 10× users (200 boats per harbour), what actually bites, in order:**

1. **The ledger feed, by a distance.** 223 kB to every phone on every cold
   start; see the measured table below. This paragraph used to rank write
   contention first and describe booking as "one transaction over the whole
   `boxes` node" — the pre-rewrite design, superseded by `0fbf511` and
   described as done in §15 of this same file. Per-slot writes removed that
   contention; a reader of §14 alone was told the opposite.
2. **The Spark plan's 100 simultaneous connections.** 200 phones with the app
   open exceeds it. That is a plan limit, not a code one — but it is the first
   hard wall, and it arrives before anything in this repo does.
3. **Roster download** at 27 kB is still nothing on 2G, once.

**What is already efficient, and why:** the clock lives outside the persisted
store (a tick in it cost ~11 ms of `JSON.stringify` per second); `applyTick`
returns the same array when nothing changed, so no re-render; Firebase, the map
and (since round 7) the admin console are separate lazy chunks; the ledger is
capped per harbour in both the store and the feed. All four were re-verified
against `dist/` in round 7 and hold.

**Corrected in round 7, because three of the claims above were wrong:**

- The admin console was **not** a lazy chunk — it was a static import in
  `App.tsx`, so every skipper on 2G downloaded the reporting maths, the CSV
  writer and the PBKDF2 path. It is lazy now (4.6 kB gz of its own).
- "96 kB gzipped" counted only the JS. First paint is ~110 kB with CSS and
  workbox. Quote the honest number or none.
- `touchAdmin` was described as re-serialising the whole store on every
  keystroke. Persist writes were already coalesced to one per 5 s, and the
  console has no text field — it was every *tap*, and it cost a render, not a
  serialisation. Now throttled to once per 10 s. Overstating a defect is the
  same class of error as understating one.

**The real bottleneck, measured against the live database on 7 Sept 2026:**

| Node | Bytes |
| --- | --- |
| Ledger feed, `limitToLast(LEDGER_LIMIT)` | **228 370** |
| `boxes` — the answer to "is there room" | 2 666 |
| `boats` | 2 974 |

`watchRoster` subscribes that ledger feed at startup **for every phone**
(`useDockStore.ts`), not just in the admin console. So a skipper downloads
223 kB of ninety days of other people's release history to render a 2.6 kB
answer about thirty crates — an 84× ratio, roughly a minute of a 2G link, and
real money on a prepaid pack. Only `#admin` reads that history.

§14 previously ranked write contention as the number-one scale problem. On
measured evidence it is not; this is, by about eighty times. "Firebase sends
only the changed child after the first load" is true and does not help: the
web SDK has no disk persistence, so **every cold start is a first load**.

Fix: subscribe the ledger when the admin console mounts, not at startup, and
give the skipper-side window the size the UI actually renders. Deliberately
NOT done in round 7 — it is a change to the subscription lifecycle, which is
the exact seam five of six rounds broke, so it gets its own round and its own
audit.

**Size:** 8 572 lines of source, 1 292 of tests. The two biggest files are
`useDockStore.ts` (1 224) and `harbourSync.ts` (1 119); both are past the
point where they should be split by concern rather than left to grow. (These
numbers drift every round. Re-count them; do not copy them forward.)

---

## 15. Per-slot writes — the security rewrite, done

The item that sat at the top of "next build" through four audit rounds. It
closed four gaps and a scaling bottleneck with one change.

**What changed.** Booking used to run one transaction over the harbour's whole
`boxes` node. That forced the rules to grant write permission at the node, and
a rule that can write the node can write every slot in it — it could not tell
one boat's crate from another's. Now:

- each crate is claimed by a transaction on its own slot (`boxes/$box/$slot`)
- a boat is bound to the phone that claims it (`boats/$id/uid`), first claim
  wins, and the binding can never be reassigned or dropped — a whole-object
  write that omits `uid` is refused by rule
- `.write` moved off `boxes` entirely and onto `$slot`, where the rule asks the
  only question that matters: **is this your boat?**
- seeding and Reset demo use multi-path `update()`, so each slot path is
  checked on its own
- `putBoat` uses `update` not `set`, so approving a boat cannot drop its `uid`

**Now enforced by the server, not the client:** you cannot claim a slot for a
boat that is not yours, and you cannot touch a crate held by someone else's
boat. The harbour-wipe write is gone with it — there is no path that writes
more than one slot without being checked against that slot's owner.

**Still not enforced, and stated in the rules header, README and TRADEOFFS:**
the 2-crate cap (no rule can count across boxes), admin approval (no admin
identity), and clearing a crate the harbour has given up on — an expired hold
or a flagged overstay — which anyone may do. That last one is how force-release
works without an admin account; it is a deliberate community rule.

**A boat nobody has claimed is open to anyone.** That is the seeded demo
roster, and it is what keeps the app testable from a cold start.

**Verified live, against the real database:** two crates claimed as two
independent slot writes; deposit and release across both; and the race — two
instances, one free slot, A won it, zero empty slots left, B told *"Another
boat took that space just now."*

**Degrades rather than bricks.** If the database refuses the `uid` write —
older rules still published, say — the boat stays unbound and the harbour
behaves exactly as it did before binding existed. A rules deployment lagging a
code deployment must never lock a skipper out.

**The rules must be deployed for any of the enforcement to be real.**

**That last sentence used to read "the new client runs correctly under the old
rules". It was false, and round 7 proved it** — see §16. Registration wrote
`uid`, the old rules refused the unknown child, and the skipper was told "No
signal" on full bars. It degrades correctly now, and the rules deploy from a
shell rather than by hand.

---

## 16. Seventh review — two auditors, 3.5 and 4.5, both DO NOT SHIP → fixed

Split by concern this time: one on the rules, the sync layer and the store;
one on UI, honesty, accessibility and performance. Both landed on the same
wound from opposite sides — **the per-slot rewrite changed the code and left
every document describing it untouched.**

| Defect | Why it mattered |
| --- | --- |
| **Force release could never work against a claimed boat.** The rule cleared a crate only when its stored status was `overstay`, and nothing ever writes that: `applyTick` raises the flag on each phone's own copy, and the watcher overwrites it from the wire on the next snapshot | A skipper claims a boat, stores a crate, loses the phone. Six hours later the crate is flagged, the harbour master taps Force release, and the write is refused. That crate — with a catch rotting in it — is unclearable by **every phone in the harbour, the harbour master included**, for the life of the deployment. Every rehearsal passed because every seeded boat is unbound. The rule now derives the overstay from `depositedAt`, the same timestamp the screen counts from |
| The Force release button was offered on every stored crate | A dead button whose failure only ever appears in production. `forceReleasable` now gates it, and the row says why when it is not offered |
| **Registration was bricked under the published rules and blamed the network** | `claimBoat` wrote `uid` unconditionally; rules predating that field refuse the unknown child, a bare catch ate the throw, and a new skipper on full bars was told "No signal. Nothing was saved". It falls back to registering unbound now — `claimForThisDevice` already did, and the fix had been generalised to one call site and not the other |
| **A two-crate deposit reported success when one crate committed** | `mutateOwnSlots` returned ok on `some`. The skipper walks away believing both crates are stored; the second sits on a four-hour hold with fish in it and is handed to the next boat. Verbatim the round-3 defect, reintroduced by per-slot writes through a different door. `settle` now refuses to call a partial change a success. **The ledger half of this claim was false and round 8 caught it — see §17**  |
| **Twenty seconds of every cold start showed fabricated capacity** | `reach === 'checking'` rendered the wave strip, so the boxes showed the last snapshot or, on a fresh install, `mock.ts`'s hand-tuned demo occupancy — pixel-identical to live data, undated. It fails in the dangerous direction: crates that do not exist, not "0 free". A third banner state now says the numbers are still coming |
| **The spoken readout never carried the staleness warning** | The one channel a non-reading skipper has, and the whole staleness contract was on-screen text. He taps the speaker on a frozen snapshot and hears a flat, confident "four crates" |
| **The rules file's 49-line header was byte-identical to its pre-rewrite version** | It denied protections that now exist and claimed a ten-slot shape rule that had been deleted — in the file the README tells an operator to read before publishing. Rewritten from the rules underneath it |
| README described the whole-node transaction and claimed an atomicity per-slot writes cannot give; `harbourSync.ts` contradicted itself 660 lines apart | The judge-facing document described the wrong architecture |
| `$box`'s `.validate` never runs — Firebase evaluates validate on the written node and its descendants, never its ancestors | The comment claimed `box9` was refused; it was quietly stored. The box name is checked in the slot's `.write` now |
| **AGENTS.md asserted a dead-key check that did not exist** | A rule nothing enforces has already drifted. It is a test now, in the gate |
| Reset demo replaced roster and ledger for **all three harbours** while its own text promised both were kept, and applied locally before a shared write it could not know had failed | A registration not yet in the shared copy, destroyed silently. Multi-path `update()` is atomic, so one claimed boat makes the whole reset fail — the admin saw an empty harbour, then a refusal, then the watcher putting it back |
| The compass told a screen reader "You are at the box" from 8 km out | |
| Map pins ignored taps on a full box, and every pin for an unapproved boat, under copy telling the skipper to tap them | The box cards fixed this and the map did not. A new skipper taps every pin, nothing happens, and concludes the app is broken |
| The 2-crate button was disabled at ~2:1 contrast with no reason — and one crate available is the *common* case | |
| Slot status was fill colour plus an inert `title`; `STATUS_LABEL` sat unused | "Colour AND shape AND text" is stated in the README and AGENTS. `title` never renders on a dock phone |
| `SeaMap` was `role="application"` with `aria-label="chart"` | The one hardcoded English string in a Telugu-first app, on an element that blackboxes itself to a screen reader |
| `letter-spacing` on Telugu in 16 places | Tracking detaches matras from their consonant, for low-literacy readers |
| The crash screen's Reset walked into AGENTS §6's own documented trap | `localStorage.clear()` plus reload does not reset this app — the running page writes back first. `resetStorage` latches the writer shut |

**Three tests could not fail**, including the one guarding the security
property. The Firebase stub refused every read, so `reserve`, `deposit` and
`release` returned at their first guard and the assertions ran over writes
that came entirely from `publishHarbour` — every slot function could have
been deleted. Replaced with a small in-memory database. Its auth stub then
called `onAuthStateChanged` **synchronously**, which the real SDK never does,
so `signIn` threw into its own catch and every test in the file had been
running with no identity at all. Both fixed; each new regression test was
mutation-checked by breaking the fix and watching it fail.

**Standing lesson, now four rounds old, and it keeps arriving in a new
costume:** verify the side of the system the user experiences. Round 5
counted rows instead of running the query. Round 6 measured the wrong side of
the ledger feed. Round 7 verified force-release against a roster where every
boat was unbound, which is the only case where it works.

---

## 17. Eighth review — two auditors, 3.5 and 3.5, both DO NOT SHIP → fixed

The round that proved the standing lesson twice over: **two of the worst
findings were created by round 7's own fixes**, and one of them was a money
bug written by the commit whose message promised the opposite.

| Defect | Why it mattered |
| --- | --- |
| **The claim-your-boat form did nothing on a wrong PIN.** `if (!signInAs(...))` — `signInAs` is `async`, so `!Promise` is always false and `setWrong(true)` was unreachable. The "that does not match" panel could never render | A returning skipper — the only path an existing boat ever takes, and step 1 of the demo script — mistypes one digit at 4 a.m. and gets a button that does nothing, with no reason, for ever. Eight rounds walked past it because every rehearsal typed the right digits, and `oxlint` has no `no-misused-promises` rule |
| **The ledger over-billed on a partial release.** `entries.slice(0, freed.changed)` — `changed` counts SLOTS, `entries` is one row PER BOX carrying an aggregated crate count. Releasing two crates and winning one wrote a single row saying `crates: 2` | The society bills off that row and no rule can ever delete it, so a fisherman was charged for a crate still sitting in the box. Written by round 7, under a comment that said "one row per crate ACTUALLY freed, never per crate we aimed at". Rows are now built inside `releaseRemote` from the slots that actually came out |
| **`Promise.all` threw away committed slots.** A rules refusal *rejects*; `Promise.all` discards the siblings that already committed and jumps to the catch | A crate came out of the box with no ledger row, no audit row, and the harbour master was told "the harbour record refused that". `settle` fixed partial-reported-as-success; this was the mirror — partial reported as total failure, losing the billing record. `Promise.allSettled` now |
| **Force release was still offered where the rules refuse it.** `forceReleasable` asked a per-slot question of an aggregated row: any overdue crate lit the button for every crate in that box | A boat with a crate from 04:00 and another from 09:00 showed one live button at 10:00; the rules refused the younger crate and the whole action failed. Now `overdueIndexes`, and the admin write is aimed only at the crates the rules will accept |
| **`writeNewBoat` could not tell a dead link from a refusal** | A registration that timed out on 2G fell through to the unbound retry and landed on the reconnect — registering a boat *any* phone in the harbour can move crates for, permanently and silently, because a `uid` can only be written while absent and nothing ever tries again. `reasonFor` now gates the fallback |
| **`geo.status` was computed, documented, and read by nothing** | The safety card could not tell "no position yet" from "no position ever", so a skipper in breakers read "still working out where you are" for ever and waited for a fix that was never coming. On the one screen that exists for a boat in trouble |
| **A stale wave height rendered as a confident current reading** | `error` was consulted only when there was NO reading, so once one landed every later failure was invisible: a six-hour-old "calm · 0.6 m", undated, driving the landing-safety advice. It now carries its time, and a stale reading only keeps its band if that band is `rough` — the conservative direction |
| **The map overlay was rebuilt every second**, because an inline `onPick` was in the redraw effect's dependencies while the parent re-renders at 1 Hz | It defeated the memoisation put there for exactly this, and a rebuild landing between thumb-down and thumb-up destroyed the marker — roughly one tap in ten silently lost. Round 7 fixed dead pins in the source and left them dead on the device |
| `letter-spacing` survived in `.btn` — more Telugu than the sixteen sites round 7 fixed | |
| The toast's "only a real tap dismisses" guard read state React had already cleared, so every nudge dismissed the message | |
| `ChoiceSheet`'s three columns still overflowed at 320 px — ~40 px of content box for an unbreakable ~45 px Telugu cluster | On the sheet where a skipper promises the collection hour the whole harbour plans around |
| Block/unblock wrote the audit row before the write resolved and left the optimistic change on screen | The roster said "blocked" while the shared copy said active, and the audit chain asserted it |
| Admin console's `Suspense fallback={null}` | A blank page with no tab bar on 2G, then a crash screen if the chunk failed |
| Four README lines describing code that no longer exists — three of them created by round 7 | |
| The rules header claimed absolutely that "a client cannot empty the harbour", contradicted thirty lines later by "a boat nobody has claimed is open to anyone" | In the shipped demo state no boat is claimed, so the absolute sentence is false exactly when it matters |
| `$slot`'s index check lived only in `.validate`, which does not run for a child-path write | `boxes/box1/47/status` was accepted. Same class as round 7's `$box` fix, one level down. Both checks are in `.write` now, which IS evaluated at every ancestor |
| A slot could be written `occupied` with no `boatId` — invisible to the harbour list and the console, permanently unbookable | |

**And three tests that could not fail**, two of them asserting on a local
guard they never got past, one asserting a row count where the defect was in
the row's contents. The stub modelled a rules refusal as a lost race, which
is the one branch Firebase does not take — so the `Promise.all` bug was
untestable by construction. Every fix above now has a test that fails
without it; the two ledger ones were mutation-checked.

**What is still open and deliberately not done here:** the 223 kB ledger feed
(§14), self-hosting the fonts (§5), and the demo/live toggle. Each is a
change to a different subsystem and each gets its own round — piling fixes
together is demonstrably how this codebase generates the next round's
defects, and round 8 is the second consecutive proof.
