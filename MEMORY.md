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

**All green:** 66 tests · `tsc` clean · `oxlint` zero warnings · build clean.
Entry bundle **93 kB gzipped**; map and Firebase are separate lazy chunks.

> **The working tree is ahead of `main`.** Everything in §10 and §11 — and the
> round-5 fixes in §12 — is uncommitted, so the live GitHub Pages link is still
> serving `806697b`, which predates all of it. **Commit and push is the single
> highest-value action in this repository.**

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

Six defects were found and fixed doing this — see §9.

**Scope of that verification, precisely:** booking, the two-phone race,
deposit, release, force-release, the ledger round trip and the offline
refusal were each exercised against the real database. The *bootstrap* path —
an empty database, before anything is published — was not, and round 5 found
it deadlocked (§12). Do not read "verified" as "verified everywhere".

---

## 4. Blocked — needs the user

### 4a. Repository secrets — the live site is still local-only

Local dev is shared; **the published site is not, until this is done.** The
workflow reads the three names, but the repo has no secrets set, so the Pages
build ships with sync off. Only the account owner can set them:

```
gh secret set VITE_FIREBASE_API_KEY --body "…"
gh secret set VITE_FIREBASE_DATABASE_URL --body "…"
gh secret set VITE_FIREBASE_PROJECT_ID --body "…"
```

Values are in `.env.local`. They are public by design — a Firebase web config
always ships in the client; `firebase/database.rules.json` is what constrains
it. Push after setting them, then open the live URL in two phones and book the
same crate.

Also: after publishing rules, open `#admin` once on a fresh database and press
**Publish harbour** to seed the boxes and roster. Without the roster the rules
refuse every booking, because a slot may not name a boat the database has
never heard of.

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

1. **Set the repository secrets and push** (§4a). Until then the *live* link —
   the thing being judged — runs local-only while local dev is shared.
2. **One accessibility pass** — the four items above are quick together and
   close a README claim that is currently untrue.
3. **Fix `nextBoatId`** — small, and it silently corrupts reports.
4. **Re-audit** with a fresh hostile subagent, then act on it. Sync is new and
   has never been audited; the failure modes worth attacking are a phone that
   sleeps mid-hold, two admins force-releasing at once, and a clock skewed far
   enough to expire holds early.
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
