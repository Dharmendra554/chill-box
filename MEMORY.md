# MEMORY.md — session handover

Where the project stands, what is blocked, and what to do next.
Read `AGENTS.md` first for the rules and the vision.

**Last updated:** 7 Sept 2026, after the seventeenth hostile audit round, pushed.

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

**All green:** 104 tests · `tsc` clean · `oxlint` zero warnings · build clean.

**First paint, measured, all of it:**

| | |
| --- | --- |
| Entry JS | 97 kB gz |
| CSS | 12 kB gz |
| Service worker + workbox runtime + workbox-window, first visit | 11 kB gz |
| **Firebase**, fetched at start-up by `main.tsx` | **88 kB gz** |
| **Google Fonts** — three families; Noto Sans Telugu alone is 124 kB | **265 kB** |
| **Total before the app can answer "is there room"** | **~470 kB** |

Two rounds got this number wrong in the same direction. Round 7 called
~110 kB "honest" and omitted the fonts; round 8 added the fonts and omitted
Firebase, which is *lazy* but not *off the critical path* — the "numbers are
still coming" banner cannot clear until the first snapshot arrives through
it. **Do not quote a first-paint figure that stops at the entry bundle.**

The fonts are the largest single item and are not yet fixed — self-host and
subset them to the glyphs `dictionary.ts` actually uses.

The map and the admin console are genuinely lazy, verified in `dist/`.

**Pushed and deployed.** `4ad1fa8` and later are on `main` and the Deploy workflow runs
typecheck, tests, lint and build before publishing.

The three `VITE_FIREBASE_*` repository secrets are set. They are public by
design; `firebase/database.rules.json` is what constrains them.

**The rules deploy with the client now.** `firebase.json` and `.firebaserc`
are in the repo, and the Deploy workflow publishes the rules alongside the
build — gated on a `FIREBASE_TOKEN` secret, so a fork still builds without
one. Create it with `npx firebase-tools login:ci`.

Until that secret exists the rules still need a human:

```bash
npx -y firebase-tools deploy --only database --project chill-box-e5d6b
bash scripts/verify-rules.sh          # must print: all checks passed
```

Every push has always shipped new client code while the rules moved only
when someone remembered. That asymmetry is not a process problem, it is a
defect generator — it is exactly how the published rules came to refuse a
field the client had started writing, bricking registration and making the
app blame the network (§16).

Commits on `main`, most recent first:

| Commit | What |
| --- | --- |
| `7812fff` | The demo/live toggle, decided once at start-up |
| `0fafed5` | Round 15b: the sea's verdict keeps its own date |
| `8a3681b` | Round 15a: the reporting layer, where the last bugs live |
| `865a183` | Round 14b: the likely findings, before they become certain ones |
| `fb11bbb` | Round 14: the sea called calm at two metres, and a clock nobody could be |
| `c211541` | Sonar: the marks a crate can carry, in one place |
| `21f554e` | Round 13b: a write that never settles, and history reported honestly |
| `92679f5` | Round 13: the rules went live, and a clock wrong in a third direction |
| `05e35f1` | Round 12: a guard that silently never fired |
| `ca716e9` | Round 11: the card that waited for something that was not coming |
| `d08e2d1` | Round 10: the refusal that still read as "already done", and a sea 200 k |
| `5af268b` | A script that asks the database what the rules do |
| `1b34f32` | Round 9: one subsystem at a time, and the score moved |
| `4ad1fa8` | Round 8: two of the worst findings were written by round 7 |
| `7e53b0e` | MEMORY: round 7 recorded, and the three numbers it got wrong corrected |
| `240bcd9` | The skipper never has to know what GPS is |
| `af506e3` | Round 7: the seams between the per-slot rewrite and everything else |
| `6ea8096` | CI: move the Pages workflow off actions pinned to Node 20 |
| `cf8772b` | MEMORY: refresh the current-state block after the per-slot push |
| `0fbf511` | Per-slot writes: the database now knows whose crate it is |
| `0826f71` | Docs: record the audit practice, the scale numbers, and what is now live |
| `25162e6` | Multi-user harbour: shared state, honest failures, four audit rounds fix |
| `806697b` | Correct two doc lines mangled by shell escaping |
| `fef65d2` | Point the docs at the live GitHub Pages URL |
| `1a571f5` | Deploy to GitHub Pages instead of Vercel |
| `176be1f` | Add AGENTS.md and MEMORY.md for session handover |
| `92f259b` | Fix the second audit round, and add optional multi-user sync |
| `9ccacb3` | Add the Supabase schema for real multi-user sync |
| `bb6d8d5` | Fix a CSS cascade trap that squeezed the header on small phones |
| `0958018` | Docs: claims now match behaviour |
| `f0707d0` | Fix the defects a hostile production audit found |
| `508c051` | UI: readout in the top bar, demo tools fenced off, roster shows approved |
| `5af99f0` | Chill-Box: cold-storage slot booking for AP fishing harbours |

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

### Seventeen hostile audit rounds were run and acted on

Scores in order, rules-sync-store side then UI-honesty side once the review
split in two at round 7: **4.0, 4.5, 3.0, 3.5, 4.5, 4.5**, then **3.5/4.5**,
**3.5/3.5**, **4.0/5.0**, **5.0/5.0**, **5.5/6.0**, **5.5/6.0**, **5.5/5.5**,
**6.0/6.0**, **6.5/6.5**, **6.5/6.0**, **6.5/5.5**. Every round found real
defects with all four gates green, and in SEVENTEEN of the seventeen the
*previous round's fixes* caused the next round's defects — twice now, the
fix landed in the same commit as the defect it caused. Details in §9–§13 and
§16–§27; the recipe is `AGENTS.md` §5.

Splitting the review in two by concern is worth it: the auditors find
disjoint sets and then converge on the same root cause.

**Round 9 is the first time the score went up**, and the reason is the most
useful sentence in this file: *the narrowly-scoped claims came back clean and
every claim that touched a seam failed.* Round 8 changed twenty things and
wrote three of round 9's headline defects; round 9 changed four things in the
sync layer and the score rose a point and a half.

**So: one subsystem per round.** Not because it is tidier — because nine
rounds of evidence say a big round buys its own next round's defects.

**Assume the next one will find something too.** That has been true seventeen
times out of seventeen, and the last four rounds found their headline defect on
a seam the round before had just cut — twice on one the SAME commit cut.

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

**Size:** 9 037 lines of source, 1 448 of tests. The two biggest files are
`useDockStore.ts` (1 258) and `harbourSync.ts` (1 219); both are well past
the point where they should be split by concern rather than left to grow.

**These numbers drift every round and have now gone stale twice** — the
paragraph told the next agent to re-count them and the next agent copied
them forward anyway. Do not quote a line count you have not just measured.

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

---

## 18. Ninth review — 4.0 (rules/sync/store) and 5.0 (UI/honesty) → fixed

**The first round where the score went up**, and the reason is recorded here
because it is the most useful thing this file can say: *the two claims that
were narrowly scoped came back completely clean, and every claim that failed
touched a seam.* Round 8 changed twenty things; three of round 9's headline
findings were written by it. Round 9 changed four things in the sync layer
and eight small ones in the UI, and the auditor that scored 5.0 called it
"genuinely better engineering".

| Defect | Why it mattered |
| --- | --- |
| **A refused write was reported as "That is already done."** Round 8's `allSettled` fix filtered rejections out, so a total refusal became indistinguishable from a lost race and `settle` called it `stale` | Anonymous sign-in not enabled, rules a commit behind, or a phone that lost its Firebase identity — all three are documented failure modes — and the skipper taps **Fish deposited**, is told the harbour has nothing left to change, and walks away from a crate still on a four-hour hold with his catch in it. Exactly the wrong-reason refusal AGENTS §2 names |
| **`mobileLast4` was not immutable, and a boat's required fields could be erased.** A `.validate` is skipped when the value written is null, and never runs on an ancestor of the written path — so `update(boats/04, {mobileLast4: null})` slipped past both the immutability rule and `hasChildren` | Any phone that has opened the app could erase the digits that prove a boat is yours. The roster filter drops a boat without them, so it vanished from every phone that had not already seen it: unapprovable, unclaimable, its crates held by nobody. Now asserted in `.write`, which IS evaluated at every ancestor |
| **A crate could be made permanently unclearable**, by nulling its `depositedAt`: no phone could flag it overdue and the rule could never let anyone else clear it. Nulling `status` was worse — the reader defaults a missing status to `empty`, so the crate read as free while the fish were in it | The rotting-crate scenario round 7 closed, reachable again through a child-path write |
| **The force-release audit row counted this phone's copy, not the harbour's** — and was skipped entirely when a crate really did come out | The hash-chained trail said "2 crates" while the ledger correctly said 1, and a partial release left no record that any admin had touched it. The same units confusion as §17's ledger defect, fixed on one side and left standing on the other |
| **Two ledger-row builders disagreed on `overstay`** — one derived it from `depositedAt`, the other read the local flag alone | A release landing before `applyTick` raised the flag was billed as on-time, in the CSV the society bills from. `isOverdue` is now the one definition |
| **The map overlay was still rebuilt on every position update.** Round 8 removed the `onPick` driver from the dependency array and left `fix` | The same one-tap-in-ten loss on the primary booking path, for every phone whose location works — and round 8 verified the fix on the demo button, which sets a position once and never again. The boat and its route now live on their own layer with their own clock |
| The wave strip rendered a confident band from a stale reading while the safety card said there was no current reading — two answers about the sea in one viewport — and its staleness line told the skipper to "check again at the box", a sentence written for the capacity figures | |
| `CrateRow`'s status chip was colour-alone: the whole Harbour tab and every full box's detail sheet, with `pulse-late` disabled under `prefers-reduced-motion` | Round 8 fixed the crate grid and left the component it had not touched, under a README line claiming "never colour alone" |
| The legend taught four colours and none of the new marks — including `!`, the one that is a convention rather than a picture | |
| Two more unawaited promise-returning store actions, one of them typed `() => void` so `tsc` structurally cannot see it | The same footgun as §17's ship-blocker, in the round that documented it |
| The toast's tap guard latched after a short nudge, leaving it undismissable by keyboard or screen reader | |
| `harbourSync`'s header said Firebase is "~45 kB, loads on demand". It is **88.5 kB** and `main.tsx` fetches it at start-up | The number the README quoted onward |
| The geolocation give-up timer fired during an unanswered permission prompt | The safety card then stated that the phone could not find you while it was simply waiting for an answer. The platform's own timeout excludes prompt time; ours did not. Timer deleted |

**Corrected figures.** First paint is **~470 kB**, not ~382 kB: the earlier
table omitted the 88.5 kB of Firebase that `main.tsx` fetches before the
"numbers are still coming" banner can clear. Everything else in §2's table
survived independent re-measurement to the byte, including the 265 kB of
webfonts and the 124 kB Telugu subset.

**Still open and deliberately untouched:** the 223 kB ledger feed, the
webfonts, and the demo/live toggle. One subsystem per round.

---

## 19. `scripts/verify-rules.sh` — ask the database, do not read the rules

Nine rounds kept producing rules claims that were true in the file and false
in the database, or the reverse. This script signs in **two real anonymous
identities** and puts **45 assertions** to the deployed rules — 17 writes the
app itself must be allowed to make, and 28 the rules header says are refused,
four of them unauthenticated. (Recount these when you change the script; the
first version of this line went stale within one round.)
It writes under `harbours/probe-<timestamp>`, a fresh namespace per run.

Where the app's real write shape differs from a minimal one, the script sends
the real shape: `putBoat`'s whole six-field object, and `slotPaths`' atomic
thirty-path publish. A minimal write that passes proves nothing about the
write the admin actually makes, and the first version made exactly that
mistake on both.

It does **not** cover everything. The rules header's permissive disclosures —
any signed-in phone can set any boat's status, exceed the 2-crate cap, or
append invented ledger rows — have no assertion, and a `[PASS]` means "not
refused", not "read back and correct".

```bash
npx -y firebase-tools deploy --only database --project chill-box-e5d6b
bash scripts/verify-rules.sh          # must print: all checks passed
```

**Run it every time the rules change.** A `FAIL` on a `[PASS]` line means the
harbour is broken for real skippers and the previous rules should go back up.

**Always say which rules a result came from.** The first version of this
section did not, and round 10 caught it: the two results below were obtained
against the rules deployed at the time — the file as of `240bcd9` — and were
written up as facts about "the deployed rules" while the working tree already
contained `1b34f32`'s hardening, under which both writes are refused. A
result with no version attached is a claim, not evidence.

Two things it settled against **the `240bcd9` rules**, on 7 Sept 2026, that
no amount of reading could:

- **The round-9 auditor was half right about erasing a slot's children.**
  Nulling `depositedAt` really did make a crate permanently unclearable —
  reproduced live, with the very next assertion showing the force-release
  then refused for everyone. Nulling `status`, which the same finding
  claimed would make a stored crate read as free, was **already refused**.
  One was worth fixing and one was not, and only the database could say
  which. Both are now closed in the file, for `reserved` as well as
  `occupied` — and that will not be true of the live harbour until someone
  deploys and re-runs the probe.
- **The probe's own first design was wrong.** Run twice under a fixed
  harbour name it reported fourteen failures that were entirely its own: a
  boat can never be deleted and its `uid` can never be reassigned, so the
  second run met a boat bound to a dead identity and every legitimate write
  was refused. Each run now uses `harbours/probe-<timestamp>`. That residue
  is unavoidable — it is the price of testing rules whose whole purpose is
  refusing to forget. Delete `harbours/probe-*` from the console whenever it
  bothers you; nothing reads it.

---

## 20. Tenth review — 5.0 and 5.0 → fixed

Both auditors landed on 5.0, the joint-highest, and both said the rise was
earned rather than granted: *"the first round where most of what was claimed
is simply true"* and *"six of nine claims substantially hold, which is the
best ratio so far."* Both still said DO NOT SHIP, and both were right.

The pattern §18 named held for the third time: **every claim that failed
failed at a seam, and every narrowly-scoped claim came back clean.** The
measured byte table was re-measured by a second party and survived to the
byte — 265 002 B of fonts against a claimed 265 kB — and it is the first
number in this project's history to do that.

| Defect | Why it mattered |
| --- | --- |
| **A refusal was still reported as "already done" for every rejection that is not a permission denial.** `runTransaction` also rejects with a bare `Error('maxretry')` after 25 re-runs, and with `Error('set')` when a plain write lands on the same path — neither carries a code, so `reasonFor` called them `offline` and the round-9 check, which looked only for `refused`, let them fall through to `stale` | An admin pressing **Reset demo** while a skipper is depositing does exactly this. Nothing is written, the crate is still a four-hour hold with the catch inside it, and the skipper is told the harbour has nothing left to change. The round-9 defect, in the branch round 9 wrote, through a rejection round 9 did not consider |
| **A `reserved` slot needed no `reservedAt`.** The fix that made `depositedAt` mandatory covered `occupied` and left its sibling | A hold with no clock can never expire — `claimable`, `expireHolds` and `applyTick` all skip it — and clause 3 of the rule needs `reservedAt` before anyone else may clear it. A frozen 4:00:00 that never counts down: one of thirty crates gone for the life of the deployment, with no admin remedy, because `forceReleasable` correctly never offers a button for it |
| **`reserveRemote` leaked a live hold when a write was refused mid-loop** — a rejection unwound straight past the giveback into the catch | The skipper is told the write was refused and believes he holds nothing. He holds one crate, and it blocks the box for four hours. In the loop whose own comment says "half a booking is worse than none" |
| **`useMarine` carried a reading across a harbour change.** The catch path did `{...prev, lat, lon}`, re-stamping another harbour's swell with these coordinates — which is exactly what the render-time guard exists to catch, and it satisfied it | Change harbour, let one fetch fail on 2G — which the hook's own comment calls routine — and Nizampatnam's 2.6 m renders under Kakinada's name. If it was rough, the full red breakers card comes with it, describing a sea 200 km away. The strip and the card agreed perfectly, on the wrong harbour |
| The legend taught a crate glyph for a stored crate; the grid draws the **catch's** own icon. And it drew a solid border for the empty state where the grid draws a dashed one | A legend that teaches a mark the grid never uses is worse than no legend: the skipper looks for something that is not there |
| `CrateRow` gave a mark to `overstay` only, so a **hold** and a **stored** crate still differed by hue alone — and that is the distinction that matters most there: a hold is an empty crate someone has claimed | And the `aria-label` added alongside sat on a bare `<span>`, role `generic`, where an author-supplied name is *prohibited* and conforming screen readers drop it. It reached nobody |
| `safetyUnknown` asserted "no current swell reading" for the whole first fetch, while the strip above it said it was still fetching | Two answers in one viewport again, pointing the other way |
| The chart never re-framed when the position arrived **after** the booking — step 3 of the judge's own demo script | Book a box, tap "pretend I am 8 km out", and the map stays on 300 m of quay with the route running off the edge to a boat pin nobody can see |
| `verify-rules.sh`'s own header was false twice: `ruletest` for `probe-<timestamp>`, "three ledger rows" for one. Its `[PASS]` assertions used minimal write shapes, not the app's | In the file whose entire purpose is not lying about the rules. It now sends `putBoat`'s real object and `slotPaths`' real thirty-path publish, and both pass |
| §19 wrote up results obtained against the **`240bcd9`** rules as facts about "the deployed rules", while the working tree already held the hardening that refuses both | A result with no version attached is a claim, not evidence. §19 now names the commit and the date |
| The approve button's guard was global while its `disabled` was per-boat, so every other Approve was enabled and silently dead for a second | |
| Two more promise-returning handlers typed `() => void`; three `void record(...)` with no rejection handler | Third round running for this class |
| Nine dead exports, a 9.6 px collection hour, `aria-live` re-announcing the nav readout once a second | |

**Deleted, not fixed:** `FishIcon`, `boxById`, `overstayCount`, `freeingSoon`,
`maxEmpty`, `findBoat`, `DEFAULT_BOAT_ID`, `MOCK_CLEARED_TODAY`. `oxlint`
cannot see across module boundaries, so all four gates stayed green over all
of them.

**Still open and deliberately untouched:** the 223 kB ledger feed, the 265 kB
of webfonts, the demo/live toggle. One subsystem per round.

---

## 21. Eleventh review — 5.5 and 6.0 → fixed

Highest yet on both sides, and both auditors said so unprompted: *"up from
5.0, and it is earned rather than granted"*, and *"the rise from 5.0 is
earned."* The trend across the paired rounds is now **3.5/3.5 → 4.0/5.0 →
5.0/5.0 → 5.5/6.0**, and §18's rule is the reason: the narrowly-scoped
claims keep coming back clean.

Two of the round's own claims were falsified, both at seams:

| Defect | Why it mattered |
| --- | --- |
| **The safety card said "Getting the swell reading…" when the fetch had already failed** — while the strip directly above it said "Swell data offline" | The card asked only whether a reading had ever landed, which is false while waiting AND after the first attempt fails. On a cold start on 2G where the swell API does not answer — the default on this coast, not the edge case — a skipper reads that the sea state is on its way, and waits for something that is not coming, on the one screen that exists for a boat in trouble. This card has now got the same split wrong twice in opposite directions; it takes both questions |
| **The `finally` that gives a crate back could mask the error that caused it** | A throw inside a `finally` REPLACES the pending exception, and the causes that make a claim throw — an admin's Reset demo landing on the same path — make the giveback throw too. The comment said the outer catch would report the original failure. It would have reported the giveback's. Now caught locally, and there is a test that forces a mid-loop failure and asserts the crate came back |
| **A test that could not fail**, in the file that tests the clock the whole harbour depends on | It reserved at `Date.now()` and passed a clock six hours earlier — a direction where a `Date.now()` implementation and the correct one agree. It now reserves five hours ago and passes a clock one minute after that, which is the only arrangement that separates them. Mutation-checked against a `Date.now()` implementation |
| **No age gate on the swell reading** — freshness rested entirely on a 10-minute interval, and Android freezes timers in a backgrounded tab | Pocket the phone in calm water at 02:00, reopen it on the approach at 04:00: a green "Safe landing" off a two-hour-old figure, with no date on it. The strip now always carries the reading's time, and a non-rough band older than 25 minutes is no band at all |
| **The booking receipt was a bare `<div>`** — no dialog, no focus, no Escape, and the page behind it still tabbable | It is the last step of the primary flow and it carries the code a skipper reads out at the box. Its whole purpose is to make him certain the slot is his so he does not hedge by taking a second one. A screen-reader user was never told it had appeared |
| **Claiming an existing boat rendered the PIN form ~600 px off the top of the screen** | It sits above a twenty-one-button roster. Tap boat #18 and the viewport does not move: as far as the skipper can see, the button did nothing. This is the only path an already-registered skipper takes, and it is the same path whose *other* defect hid for eight rounds because every rehearsal tapped boat #01, which is at the top |
| Two `void record(...)` calls with no rejection handler — and a missing row does not break a hash chain, only an altered one does | So the console reported **"Audit intact"** in green over a log with a hole in it: a receipt that vouches for itself. Caught inside `record` now, once, for every call site |
| The GPS fix was aged against the harbour clock while `position.timestamp` comes from the device clock | A phone twenty minutes slow showed a permanent "this position is 20 minutes old" over a fix one second old; one twenty minutes fast never warned at all. `toHarbourTime` normalises it |
| The approve button's guard and its `disabled` disagreed — round 10 fixed the pair by inverting it rather than aligning it, so approving one boat disabled every other Approve in the queue | Both are per-boat now, and Reject on the same row is held with them |
| Leaflet markers were keyboard-focusable inside a `role="img"` subtree | Three tab stops that announce nothing |
| The interval swell fetch carried no abort signal | A request started at harbour A that resolved after a switch to B blanked B's sea state for ten minutes — including, if it was rough, the red breakers card |
| One dead export survived the round that claimed nine were gone; the round's own table said nine and named eight | |
| `App.tsx` said the admin console is "619 lines". It is 659 | |

**The probe audited itself again.** Its `[PASS]` publish assertion emitted
32 keys with three duplicated, so which values the server kept was undefined
— it may have been testing thirty empty slots and passing for the wrong
reason. One assertion was labelled "B cannot empty the boxes node" while what
it actually proved was "that crate is A's"; the rules header says in capitals
that a client *can* empty a harbour of unclaimed boats. And in eleven rounds
nothing had ever tested the rules header's **first** claim — that the public
web config alone grants no writes. Four unauthenticated assertions now do,
and they pass.

**The deploy asymmetry is closed.** Every push has always shipped new client
code while the rules moved only when a human remembered — which is exactly
how the published rules came to refuse a field the client had started
writing. `.firebaserc` is in the repo and the Deploy workflow now publishes
the rules alongside the build, gated on a `FIREBASE_TOKEN` secret so a fork
still builds without one.

**Still open and deliberately untouched:** the 223 kB ledger feed, the 265 kB
of webfonts, the demo/live toggle. One subsystem per round.

---

## 22. Twelfth review — 5.5 and 6.0 → fixed

Both auditors held their scores rather than raising them, and both said why
in the same words: the round led with a claim that was false. One of them
called this *"the strongest state this codebase has been in"* and still
refused to ship it, which is the right instinct.

**The finding that matters most is a lesson about fixes, not about code.**

Round 11 closed the deploy asymmetry with a workflow step gated on
`if: ${{ secrets.FIREBASE_TOKEN != '' }}`. **The `secrets` context is not
available in a step `if:`.** GitHub resolves it to an empty context rather
than erroring, so the condition is always false and the step is skipped on
every run — *including runs where the secret exists*. The build goes green.
Nothing anywhere says the rules did not move. A guard that silently never
fires is worse than no guard, because it also stops anyone looking.

`env` is available in a step `if:`; the secret is hoisted there now.

| Defect | Why it mattered |
| --- | --- |
| **The swell staleness gate was inert on a fast-clocked phone, and permanent on a slow one.** `fetchedAt` was `Date.now()` (device) and the age was computed against `serverNow()` (harbour) | The identical defect this project fixed for `position.timestamp` **in the previous round**, one file away, with the helper already written and imported next door. Forty minutes fast and the 25-minute gate never fires: a green "Safe landing" off a two-hour-old figure. Forty minutes slow and every reading is stale the moment it lands |
| **And the service worker served it stale-while-revalidate for thirty minutes**, so a repeat visit resolved from cache and `Date.now()` stamped a half-hour-old body as brand new. The gate could never fire against a cache hit, because the cache hit reset the clock the gate measures | That one affected *every* phone, not only mis-clocked ones. `fetchedAt` is now Open-Meteo's own `current.time` — when the sea was like this, not when we asked — converted into harbour time |
| **The admin console showed a fabricated +291% month-on-month trend** | The ledger is capped per harbour, so the oldest month in the window is truncated to whatever survived the cap. Nine days of July against all of August reads as +291% when the honest answer from the same data is −2%. Three taps from a cold start. `monthInsight` guarded the *selected* month being complete and never asked whether the *previous* one was |
| **A skipper on full bars was still told "No signal."** A transaction that aborts with `maxretry` or `set` carries no error code, so `reasonFor` called it `offline` | An admin pressing Reset demo mid-deposit does exactly this. `unsettled` is its own reason now — nothing was written, the link is fine, tap again — and **the test asserts it positively**. The old test asserted `not stale`, which passes for every other value in the union and could never pin the right one |
| **A total ledger-write failure was reported as success, silently** | The crates are free, the skipper walks away, and the row the society bills from does not exist — permanently, because nothing retries it. Round 11 gave the *audit* row a message and left the *billing* row mute |
| **`verifyAudit` was a floating promise**, so a `crypto.subtle` rejection left the integrity panel rendering nothing at all | A panel that says nothing is read as a panel that found nothing wrong. It now says it could not check |
| **A failed giveback still reported "the box filled up"** | Which tells the skipper he holds nothing and should try elsewhere — while a crate of his blocks that box for four hours with nobody looking for it |
| The booking receipt called `showModal()` unguarded, alone among the four dialogs | On an old Android WebView that throws — one frame after the booking succeeded. The crate is claimed in the database and the phone shows the crash screen and a **Reset this phone** button |
| The rough-breakers card carried no age at any age | Being conservative about staleness is a reason to date a warning, not a reason not to |
| Landmark and boat markers were still keyboard-focusable inside a `role="img"` subtree — round 11 fixed the box pins only | |
| `toWireBoat` could send `nameTe: undefined`, which the SDK rejects — the `pruneWire` defect in a third wire shape | |
| `mock.ts` said "90 days of completed cycles"; after `capLedger` the console sees ~45 | |
| §19's assertion counts were stale within one round of being written; §14's line counts had gone stale a second time, in the paragraph that tells the reader to re-count them | |

**What both auditors verified and could not break**, recorded because it is
the first time this has been said twice in one round: every write the app
makes was walked against the rules file and **none is refused**; the byte
table re-measured to the byte; the 320 px arithmetic re-derived for calm,
moderate and rough in Telugu with nothing overlapping; the four-state sea
logic correct in all six reachable combinations; no dead exports left; the
per-slot security property genuinely holds.

**Still open and deliberately untouched:** the 223 kB ledger feed, the 265 kB
of webfonts, the demo/live toggle. One subsystem per round.

---

## 23. Thirteenth review — 5.5 and 5.5 → fixed, and the rules finally went live

**The database rules are deployed.** Rounds 8–12 hardened a file the server
was not running; `verify-rules.sh` now prints *all checks passed against the
deployed rules* — 45 assertions, including the four unauthenticated ones.
Every claim this project makes about who may write what is, for the first
time, a claim about the server.

Both auditors held at 5.5. Both led with the same defect, found
independently, and it is the same defect for the third round running:

**The swell reading's clock, wrong in a third direction.** Round 11 aged it
against the wrong clock, round 12 fixed that and wrapped `measured` — an
absolute instant off Open-Meteo's wire — in `toHarbourTime`, which exists to
add the device's clock error to a *device* instant. So the error came back,
mirrored: forty minutes slow and the 25-minute staleness gate could not fire
until a reading was 65 minutes old, while the strip printed a reading time in
the future. `toHarbourTime` now wraps the fallback only, and `marine.test.ts`
stubs a 40-minute skew and asserts the wire instant survives it untouched.
Mutation-checked against the round-12 line.

| Defect | Why it mattered |
| --- | --- |
| **A partial release that also lost its ledger row reported only the missing bill.** The `catch` returned before `settle`, so `partial` was discarded | The skipper is told "the crate is free, the trip was not recorded" while a second crate of his fish is still in the box. A missing bill is an argument next month; an unattended crate is a spoiled catch tonight. `settle` runs first now, and `ledgerLost` had no test at all — the ledger is written with `set`, which nothing in the suite could fail |
| **The breakers card captioned a live 3.4 m warning "Nothing current."** Round 12 dated the card by reusing `waveStale`, which is the strip's *too-old-to-trust* sentence, at every age | Third time this card has got the same split wrong, in three directions, on the one screen that exists for a boat in trouble. It has its own `waveTaken` key now |
| **A harbour rule lived in a `.tsx` and its test could not fail.** `PLAN_HOURS` was a private const in `DockScreen`; `rules.test.ts` asserted `5 h < 6 h` against hand-copied literals | Change the picker to offer 8 h and the test stays green while the crate it promised flags `overstay` two hours early — at which point any phone in the harbour may clear it. Exported from `selectors.ts`, read by the test, mutation-checked |
| **The admin console still fabricated one number.** Round 12 guarded the *trend* against a cap-truncated month and left *utilisation*, which divides the surviving crate-hours by the whole month's capacity: 8 % against an honest ~27 % | The guarded number was correctly hidden and the unguarded one sat one line above it. Now null — rendered `—` — but only when the ledger is actually at the cap, so a harbour that opened on the 12th still gets a real figure |
| **`#admin` spent roughly half of every second in `Intl`.** `months` was keyed on `now`, so `monthKeys` walked 1 500 rows at 1 Hz, each row constructing a fresh `Intl.DateTimeFormat` | Measured at 224 ms per pass. Every Approve and Force-release queued behind it. The formatter is a module constant now and the memo no longer sees the clock |
| **Two overlapping `record()` calls silently deleted an audit row**, and a hole does not break a hash chain — only an alteration does — so the console printed "Audit intact" in green over it | Block and Unblock have no busy guard, so two quick taps did it. Serialised behind one promise chain, with a test that fires two concurrently |
| **Three keyboard-focusable links inside the `role="img"` chart** — Leaflet's own zoom and attribution controls. Rounds 11 and 12 each fixed a marker type and neither looked at the chrome | Silent tab stops, and the attribution one navigates a `standalone` PWA to leafletjs.com with no way back. Both controls are off; the tile credit moved to the caption |
| **The roster rendered in `Object.entries` order: #10–#21, then #01–#09** | The claim grid is the only path a registered skipper takes, and the demo's own boat #04 was sixteenth of twenty-one. Local mode was sorted and shared mode was not, so no rehearsal without a live database could see it. Sorted in `boatsAt`, once |
| The Google-Fonts service-worker rule had no `cacheableResponse`, so it cached nothing: the stylesheet is opaque and `CacheFirst` drops it | An offline cold start lost the Telugu webfont once the 24 h HTTP cache lapsed |
| A toast was a `<button role="alert">` — a control announced as a line of text, with no hint it could be dismissed | And a refusal never fades on its own. `role="alert"` is on a wrapper now |
| `aria-pressed` on the box card was permanently false and announced a one-shot action as a toggle | |
| README described a layout `508c051` removed, and contradicted itself 265 lines later | |

**The CI guard that never fires, third version.** Round 12 found
`if: secrets.X != ''` could never be true and replaced it with
`if: env.X != ''` — and a step's own `env:` block is not visible to that
step's `if:` either. Skipped on every run, including runs where the secret
exists, still green, still silent. There is no `if:` now: the step always
runs and the check is in the shell, where a skip emits a `::warning`.

**Sonar, and what was refused.** Security findings closed properly rather
than silenced: `npm ci --ignore-scripts` (verified in a clean-room install —
tsc, the whole suite and the build all pass without lifecycle scripts),
`--no-install` on every `npx` so a gate cannot silently become a stranger's
package, `firebase-tools` pinned exactly, and workflow permissions scoped per
job so the build job cannot publish Pages. Not taken: `<img alt>` in place of
`role="img"` on the chart and the SVG icons — that rule is wrong for a live
map and for inline SVG, and following it would cost accessibility rather than
buy it.

**Product.** Map pins now name the thing rather than the place — "Auction
box", "Ice plant box", "Diesel box" — verified at 320 px in both
languages with no overflow and no collisions. The line under the chart is the
ODbL tile credit and nothing else; the "free, no account needed" half was
about our hosting bill, not about anything a skipper needs.

---

## 24. Fourteenth review — 6.0 and 6.0 → fixed

Both sides moved up half a point for the first time in the same round, and
both said the same thing about why: five of nine checked claims survived
falsification with tests that bite under mutation. Both still said DO NOT
SHIP, and both blockers were written by round 13's own fixes. Fourteen
rounds out of fourteen.

**The blocker was a sentence introduced while tidying.** Extracting the
safety card's decision into `seaAdvice` collapsed `moderate` into `calm`, so
the card said **"Conditions are calm"** at a 2.0 m swell while the strip four
lines above it was amber and said "come in careful". 1-2 m is the ordinary
state of that coast, not an edge case — and the test written to stop this
card drifting was asserting the drift. `safetyModerate` is its own sentence
now, and the test says so.

| Defect | Why it mattered |
| --- | --- |
| **The swell freshness budget was spent by the fix that made it honest.** `MARINE_STALE_MS` was calibrated when `fetchedAt` was `Date.now()`; once it became Open-Meteo's own instant, two lags moved underneath it — the API buckets `current.time` to 15 minutes (`interval: 900` on the wire) and the poll runs every 10 | 15 + 10 consumed the entire 25-minute gate, so roughly once a cycle a phone on full bars, having missed nothing, watched the strip fall to "Nothing current" and the landing-safety card say it could not tell you about the sea. Forty minutes now, derived in the comment rather than chosen |
| **A false "No signal", in red, on a phone with full bars.** `useConnectivity` asks "when did a request last succeed"; it was still fed `marine.reading.fetchedAt`, which had become the instant the SEA was measured | Local-only builds — the zero-setup demo path — dropped past `STALE_MS` before the next poll could land. In local mode there is nothing to be behind at all: the box figures ARE this phone's own. That banner no longer speaks for the weather poll |
| **`pending` punched a hole in the audit trail** — `withDeadline` resolves with no `freed`, so the force-release row was never written while the release itself went on to succeed | A crate taken back over a skipper's head, billed in the ledger, with nothing in the integrity trail saying an admin touched it — three lines above the comment describing that exact defect. The row is written now, marked "outcome not confirmed". `setBoatStatus` also stopped rolling the roster back on `pending`, which was acting on "nothing was saved" |
| **Four remote entry points had no deadline**, under a comment claiming the list was complete: `resetRemoteBoxes`, `seedHarbour`, `claimBoat`, `claimForThisDevice`. And **Reset demo had no `requireLink()`** | Tap Reset demo with the socket down and nothing happened — no toast, no spinner, no reason — for the rest of the session. Registration walks up to fifty candidate hull numbers, each a round trip, behind a button a new skipper is staring at. All wrapped, and `hangAll` in the tests now hangs `set` and `update` too, so the next omission is a red test rather than a code review |
| **Escape stopped closing a fallback dialog one second after it opened.** Every caller passed an inline `onClose` into an effect keyed on it, and `App` re-renders at 1 Hz — so the effect tore down, removed the key listener, and the re-run early-returned without re-adding it | On the old Android WebViews the fallback exists for. `useModal` takes no reactive dependencies and reads `onClose` through a ref |
| **206 `Intl.DateTimeFormat` constructions per second in `#admin`**, measured — one per audit row per tick — and 17/s on the dock screen. Round 13 hoisted the formatter `monthKey` used and declared the class closed; five call sites were still building one per call | Every Approve and Force-release queued behind it. All seven formatters are module constants now; re-measured in the live page at **0 per second** on both screens |
| **The audit log had no cap.** The ledger has had one since AGENTS.md §6 was written | At ~50 admin actions a day it reaches the localStorage quota inside a year, and when it does NOTHING persists any more — boxes, roster and ledger included. Capped at 2 000, ids continue from the tip rather than restarting at A1, and `verifyAudit` anchors to the first surviving row instead of `genesis` so a trimmed log does not read as tampering |
| **`claimable(?? 0)` — round 13's own fix — made the client disagree with the deployed rules.** Clause 3 requires `data.hasChild('reservedAt')` before anyone may clear a `reserved` slot | So a malformed hold rendered as a free crate, the server refused the claim, and the rejection escaped the loop as `refused`: one bad slot would have made the WHOLE box unbookable. Stranding one crate is the smaller failure and it is the one the server already chose. `expiredHold` mirrors the rule now, and the test that asserted the opposite says why it was wrong |
| The `role="img"` chart was itself a tab stop — Leaflet gives the container `tabindex="0"`. Rounds 11, 12 and 13 each removed one focusable *child* | Verified in the live DOM: zero focusable elements inside the chart |
| The Coast Guard and harbour-office labels truncated at 320 px in Telugu — 21 px and 25 px cut — under a comment saying they were short enough not to | On the one screen that exists for a boat in trouble. They wrap now; re-measured at zero |
| A map label covered 25 x 23 px of a 56 px booking pin, at every harbour, in both languages | Labels now sit above the northern pins and below the southern one, split by the pin's own latitude so surveyed coordinates cannot break it. Re-measured: zero label-on-pin and zero label-on-label overlap at 320 px in both languages |
| The species picker was `<li>`s inside a `role="radiogroup"` with six tab stops and dead arrow keys; `ChoiceSheet`'s dialog had no accessible name | |
| The legend hard-coded its own copy of the marks and taught the mixed glyph for a status the grid draws with six | Drawn by `crateMark` now, and the README says plainly that the stored chip is an example rather than an exact mark |

**Still open and deliberately untouched:** the 223 kB ledger feed, the 265 kB
of webfonts, the demo/live toggle. The seeded harbour ageing into
all-overstay belongs to the demo toggle and is recorded there, not patched
here.

---

## 25. Fifteenth review — 6.5 and 6.5 → fixed

Both sides up half a point again, and both said the same thing: **every
certain finding was in what the app SAYS, not in what it does.** The
crate-moving core — the part where fish spoil — held under deliberate attack
for the first time in fifteen rounds. Nine of ten UI claims and five of ten
sync claims survived falsification, measured live rather than read.

Both still said DO NOT SHIP, and every finding sat on a seam round 14 cut.

| Defect | Why it mattered |
| --- | --- |
| **Block and Approve lost their audit row on a timed-out write.** Force-release got that fixed one function away in round 14 — and the same round taught `setBoatStatus` to KEEP the optimistic change on `pending`, which made logging *more* important here, not less | A boat blocked on every phone in the harbour, unable to book, deposit or release the crate his catch is already in, and the hash-chained log the README offers to settle disputes with contains no row saying an admin touched him. `setBoatStatus` returns three outcomes now, not a boolean |
| **The publish deadline invented its own result** — `{failed: 0, boxesOk: false, historyLost: 0}` — so the admin was told the BOXES were refused when they were still in flight, and two unmeasured numbers went into the audit log as fact | And 12 s for a roster, a thirty-path update and up to 1 500 ledger writes on 2G is not a deadline, it is a certainty. Publishing has its own 60 s deadline now and reports `timedOut` rather than zeroes |
| **`countMissing`'s bound discarded exactly the loss it existed to catch.** Above 25 refusals it reported 0 — and a flaky first publish loses rows in the hundreds | The society's billing history, gone, under a green "Published". It now combines the bound with whether the harbour had any history at all, and an unverified count is reported as unverified |
| **A timed-out registration could create a permanently undeletable duplicate boat.** The Register button stayed live, and the duplicate-mobile check compared ten digits against the four the shared roster carries — so it was inert for every boat registered on another phone | A second boat is a second two-crate allowance, and no rule can ever delete one. The button latches; the check compares what the roster actually holds |
| **The safety card dated only its WARNING, never its reassurance** — and the age lived on the strip, which is replaced by the offline banner the moment the phone loses signal | So "the sea is calm, come in" stood alone and undated for up to forty minutes, on the screen that exists for a boat in trouble. Round 14 widened that window from 25 minutes and moved the age off the card in the same breath. Every band carries its own age now |
| **The admin console derived "today" from the DEVICE timezone** — `Date.parse(new Date(now).toDateString())` | A laptop on New York time at 03:00 IST on the 1st believes the month is over, compares one day against a whole month, and divides a busy day by 31. Exactly the −83% collapse `stats.ts` documents at length as prevented. `startOfLocalDay` already existed, exported, doing it right. The device *clock* was removed three rounds ago; this was the device *calendar* |
| **Round 14 explained the missing utilisation and left the missing trend silently absent** — and in the seeded demo the trend never appears at all | An absent comparison reads as "no change". It has four separate reasons and now says which |
| `verifyAudit` anchored to the surviving head unconditionally, so deleting the oldest row of a THREE-row log became undetectable — the check was surrendered for logs that cannot have been trimmed | Genesis is demanded again below the cap. What is genuinely lost after trimming is still stated, rather than the comment's "nothing could" |
| The audit panel re-formatted and reconciled 2 000 rows every second. Round 14 removed the formatter *constructions* here and left the *calls* | Memoised and paged to 50, with the rest one tap away. The integrity check still runs over every row |
| The crate chip's content measured 41 px inside a 39 px box, bleeding onto its own border on every stored row in both languages | Reproduced at 2 px, fixed by stacking, re-measured at 12 px of headroom |
| Escape died under StrictMode — the dev build could not exercise the fallback dialog at all, so the project's one manual test for it reported broken in dev and fixed in prod | |
| README described the connectivity mechanism round 14 deleted, and quoted an offline notice the default build cannot produce. MEMORY §2 was ten commits and three rounds stale | |

**Still open and deliberately untouched:** the 223 kB ledger feed and the
265 kB of webfonts.

---

## 26. The demo/live toggle

The last item on the open list, and the fix for the thing that made the
deployed link look broken: a seeded harbour published once and then left
overnight is thirty overdue crates by morning, because nothing in a demo ever
collects its fish.

**The mode is decided once, at start-up, and switching reloads.** That is the
whole design. A live switch would have to tear down two Firebase
subscriptions, a reconnect timer and a store subscription, reseed the boxes,
and leave every in-flight write to land in a mode that no longer exists —
four seams, in an app where fifteen rounds of evidence say the seams are
where the defects are. A reload has none: `sharedActive` stays a module
constant, exactly as `syncEnabled` was, so no code anywhere has to cope with
it changing under them. The cost is one second on a control nobody touches
twice.

- `lib/mode.ts` owns it. `syncEnabled` still answers "is a database
  configured" — which is only good for deciding whether to OFFER the toggle —
  and `sharedActive` answers "do writes go to the shared harbour", which is
  what everything else should branch on. All 24 call sites moved.
- Demo is opt-in, never given quietly: a first visit to a configured build is
  live, and storage that cannot be read falls back to live too.
- `freshenDemoHarbour()` reseeds on a COLD START, in demo only, and only when
  EVERY held crate is past the overstay line. A demo in use has fresh crates
  in it, so it cannot fire mid-flow. The shared harbour is deliberately
  excluded — those crates are other people's data, and an app that rewrites
  them because they look stale is the opposite of its own first rule.

Verified in the browser rather than reasoned about: registered a boat in demo
mode (local only, nothing reached the live database), toggled to live and
back, and confirmed the mode line and button text on both sides.

---

## 27. Sixteenth review — 6.5 and 6.0 → fixed

**The toggle scored 3.0 on its own terms and both auditors led with the same
defect in it.** Sixteen of sixteen: the headline was written by the newest
change, and this time the newest change was the feature added that hour.

| Defect | Why it mattered |
| --- | --- |
| **`freshenDemoHarbour` decided on one harbour and reseeded all three.** The guard read `boxesByHarbour[harbourId]`; the write was `seedAllBoxes(now)` | Measured by both auditors: a ten-minute-old crate in another harbour destroyed on evidence gathered from the one on screen. No ledger row, no toast — the catch simply not in the app. And the seed of the other two harbours contains no hold, so the "a live hold means the demo is in use" safety had nothing to catch on. Three documents said it could not happen. It reseeds the harbour it checked now, and the test asserts the OTHER harbour by identity |
| **Demo and live shared one persisted store.** A boat invented while playing appeared in the LIVE approvals queue, unmarked, and one tap on Approve wrote it into the real society's roster — permanently, because no rule can delete a boat | The audit log crossed the same way: demo blocks and force-releases in the same hash chain as real ones, and `verifyAudit` called the mixture intact. The store is namespaced by mode now, which is what makes "a copy that lives on this phone alone" true rather than aspirational — and it takes the identity and the un-revalidated `myBoatId` with it |
| **The mode was stated in exactly one place, 2 672 px down the Book screen**, inside a panel headed "these do not appear in real use" — and was unreachable before registration, because that panel lives on a screen you only see once you have a boat | So a skipper could register in a demo, be told the harbour master would approve him, and wait at 4 a.m. for a message no code path can produce. There is a line in the chrome now, on every screen including registration, and the pending card names the admin as you |
| **The crash screen's Reset silently moved a demo user to live.** `localStorage.clear()` took the mode flag with it | The next thing they touched was somebody else's crate. The flag is re-asserted after the clear |
| **The toggle was a dead button when storage refused the write** — swallowed and reloaded anyway, coming back in the mode you had just left, saying nothing | It reads the value back and reports failure |
| `countMissing` returned `verified: true` when every verification read had failed — the same dead link that refused the writes | A green "Published" and a `0 history rows lost` audit row over up to 25 billing rows that were genuinely gone |
| Block and Unblock wrote an audit row with no harbour, in an app where hull numbers repeat across harbours | Three boats answer to `boat.block · #04` |
| "Show the rest" in the audit panel was one-way: an unlabelled tap restored 2 000 rows a second, permanently, on the screen carrying Approve | |
| The offline banner told a shared harbour with no snapshot yet that its figures were "from this phone only" | On a cold start with no signal they are last night's SHARED copy. Its own line now |
| A JSDoc block was orphaned onto the wrong function, and MEMORY §2 was stale again on three of four facts | |

**What both auditors could not break, again:** the crate-moving core, the
deadlines, the rules file and its probe, and every one of round 15's
reporting-layer fixes — four of six verified under instrumentation rather
than by reading.

---

## 28. Seventeenth review — 6.5 and 5.5 → fixed

Both auditors found the same headline, independently, and it was the worst
kind: **round 16 introduced the mode flag and the demo store's name in the
same commit, and gave them the same string.** `ap-chill-box.demo` was both.

So the first `set` of any demo session — a tab tap, a language toggle, a
hold expiring — serialised the whole store over the flag. The next cold
start compared 800 kB of JSON to `'1'`, got false, and booted LIVE. Demo
mode did not survive one interaction, and it failed toward the shared
harbour: the next crate the user tapped was a real one. Both auditors
reproduced it end to end. The comment three lines away said "the flag lives
under its own key", which was false as it was written.

The flag is `ap-chill-box.mode`; the stores are `ap-chill-box` and
`ap-chill-box.store.demo`. And `src/lib/mode.test.ts` now exists — the whole
feature had **no test that touched it**, because `vite.config.ts` forces the
Firebase env empty and `demoMode` is then an unconditional `true`, so the one
build shape where the flag decides anything was the shape the suite could not
construct. The harness stubs a configured env and a fake `localStorage` and
simulates page loads with `vi.resetModules()`; the collision test fails on
the old key and passes on the new one, verified both ways.

| Defect | Why it mattered |
| --- | --- |
| **The voice readout did not know it was a demo.** The entire disclaimer was text | AGENTS §1 says the users are people who will not read, and the speaker button is the accommodation built for exactly them. `speech.ts` already carries this argument for staleness — "the app's own primary failure mode, delivered through its own accessibility feature" — and the mode reintroduced it. Whichever caveat applies is spoken first now, before any number |
| **The demo banner scrolled away.** It was a sibling of the sticky header, `position: static` — on screen for 2% of the Harbour page, and absent exactly where the booking and deposit controls are | Its own JSDoc claimed "every scroll position". It is inside the sticky header now; re-measured visible at scrollY 0, 900 and 1781 |
| **The only route to demo ran through registering in the REAL roster.** The toggle lived at the bottom of the Book screen, which does not exist until you have a boat | So a judge wanting the safe sandbox had to first put a fictitious boat on a society's permanent record — where no rule can ever delete it. `ModeSwitch` is on the registration screen too |
| Demo plus flight mode stacked two "this phone only" strips, the second titled **"No signal"** in the amber alarm style — about a link the mode does not use | A warning that fires when nothing is wrong stops being read, which is the app's own argument elsewhere |
| The block/unblock audit rule was built by hand in JSX, duplicating the store's | Two copies of one rule, neither tested, on the action the file's own comment calls the one that most needs to be attributable. `setBoatBlocked` is a store action now |
| MEMORY §2 was stale for the third round running, and the audit-paging comment claimed a tick "costs nothing" when it costs 57 `Intl.format` calls a second | Both corrected against measurement |

**What neither auditor could break, for the third round running:** the
crate-moving core, the caps and deadlines, the rules file and its probe, the
deploy workflow, and every reporting-layer fix from rounds 14 and 15.
