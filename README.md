# Chill-Box · చిల్-బాక్స్

Slot reservation and catch checkout for the community solar chill-boxes at
Andhra Pradesh fishing harbours. No harbour master, patchy signal, twenty
boats to a society. Mobile-first, Telugu by default, no password.

**Source:** https://github.com/Dharmendra554/chill-box
**Live demo:** https://dharmendra554.github.io/chill-box/

---

## Run

```bash
npm install
npm run dev
```

```bash
npm test        # rule, sync, edge-case, analytics and security tests
npm run build   # typecheck, bundle, generate service worker
npm run lint    # zero warnings
```

## Deploy

**Live on GitHub Pages**, published by `.github/workflows/deploy.yml` on every
push to `main`. The workflow runs the same four gates as local — typecheck,
tests, lint, build — so a red build never publishes. Free, and with no
fair-use ceiling.

Pages serves from `/<repo>/`, so the workflow passes `BASE_PATH` to Vite and
the PWA `scope` and `start_url` follow it. Unset, everything stays at `/` for
local dev and any root-served host.

Other hosts work with no changes: Netlify and Cloudflare Pages both build with
`npm run build` and publish `dist`. `vercel.json` is kept for Vercel, where it
pins the SPA rewrite, cache headers and security headers.

The only environment variables are the optional Firebase config below; without
them the app builds and runs in local mode.

---

## What it does

| Requirement | How |
| --- | --- |
| Live capacity gauge per box | Fill bar + 10-cell grid; each cell shows the boat number, its catch tag and the hour it frees up |
| One-tap reservation, 4 h hold | Tap a box on the chart → tap catch → tap crate count, then a receipt with a booking code. A live countdown runs; the slot returns to the pool at 4 h |
| Catch tagging, minimal typing | Six-icon grid, `Mixed` preselected — booking needs zero decisions |
| Checkout | **Sold — release the slot** frees the space and writes a ledger row |
| Overstay flag | Past 6 h a crate turns amber and pulses harbour-wide with the boat number |

## Harbours and societies

Three harbours ship: **Visakhapatnam**, **Kakinada** and **Nizampatnam**. Each
is an independent co-operative with its own boat roster, its own three boxes
and its own reporting — nothing crosses between them, and hull numbers repeat,
so Nizampatnam's `#04` is a different boat from Visakhapatnam's `#04`.

The harbour is chosen **once**, on first run, and then remembered. It is not
permanent chrome: a skipper works out of one harbour and does not need that
choice on screen for the rest of their life. "Change harbour" sits at the
bottom of the booking screen for the rare day it matters.

## Boxes are named after landmarks

Not "Box 1, 2, 3" — the **Auction Hall box**, the **Ice Plant box**, the
**Diesel Bunk box**. Each stands at the landmark it is named after, so the pin
on the chart and the name in the list are the same fact, and nobody has to
remember that "box 2" means "the one by the ice plant".

## Screens

Two tabs. That is the whole app.

- **Book** (front page) — my boat's status, then a live chart of this
  harbour's boxes with free-crate counts. **Tapping a pin books that box.**
  Distance to each box is shown before you choose; once booked, the route,
  bearing, ETA and compass appear on the same screen. Below: the box cards
  and the safety card. The spoken readout is a button in the top bar, which
  every screen shares.
- **Harbour** — every crate ordered by soonest to free up, then the roster.

The harbour-master console is **not a tab**. It lives at `#admin`, behind a
PIN, so skippers never see a door they have no reason to open.

## Safety

Always on screen, never behind a menu, because the moment the numbers are
needed is the moment nobody goes looking:

- **1554** Indian Coast Guard marine distress, **112** national emergency,
  **108** ambulance, **1077** district disaster control, plus the harbour
  office. Every row is a direct-dial link.
- **Save numbers to phone** downloads a vCard, so they survive outside the app
  — distress numbers that live only in an app are in the wrong place.
- **Send my location** shows the last fix in plain dictatable degrees and hands
  it to the phone's share sheet, falling back to SMS, which goes through on a
  bar of signal that will not carry data.
- When the swell reads rough the card leads with what to do — hold off the
  mouth, life jackets on, call early — before it lists who to call.

## Registration, not login

Boat name, owner name and mobile number. The admin approves once; after that
the phone remembers the boat forever. A pending boat can watch every box but
cannot book. No password anywhere in the skipper's product — on this dock a
shared secret is painted on a hull within a week. Claiming a boat that is
already on the roster needs the last four digits of its registered number, so
the list is not a one-tap "become anyone".

## Admin console

Open `/#admin`. Demo PIN: **2468**.

Approvals, live usage with force-release, monthly reporting, per-boat and
per-catch breakdowns, an **insight strip** (utilisation, average dwell,
overstay rate, month-on-month trend and the hour boats actually land — the
number that staffs the quay), and **Download for Excel** — the raw ledger for the
selected month as CSV with a UTF-8 BOM, so Telugu names survive the trip into
Excel on Windows. It copies the controls a government portal uses:

- the PIN is **not in the source** — only a PBKDF2-SHA-256 hash (150 000
  iterations, salted), verified with Web Crypto
- **lockout with exponential backoff** after three wrong attempts, to 15 min
- **idle auto-lock** after 5 minutes
- **two-tap confirmation** on every irreversible action
- a **hash-chained action log**: every admin action records who, what, when and
  a SHA-256 over the previous entry, and the console verifies the chain live.
  This catches accidental corruption and a casual edit. It does **not** stop a
  determined tamperer, who can delete a row and recompute every hash after it —
  an unkeyed chain cannot, and an HMAC would not help because the key would
  ship in the same bundle. Only a server-held log is tamper-proof.

  **And it lives only on the phone that wrote it.** Unlike the crates, the
  roster and the ledger, the action log is never shared. Two officials with
  two phones build two separate chains, each of which verifies as intact,
  and neither can see the other's entries — so "who took my crate out?" has
  two partial answers and the console vouches for both. That is a real limit
  of a client-only design and the reason the log is a receipt for honest
  mistakes rather than an audit trail. Moving it behind the same API route
  as `verifyPin` fixes it and nothing else in the app would move.

**What it is not:** enforcement. Authorisation runs on the client, so anyone
with developer tools can edit this device's own state. Real enforcement needs a
server — moving `verifyPin` and `appendAudit` behind an API route is the only
change required. Claiming client-side security is unbreakable would be false,
so we don't.

**One more limit, stated because it is easy to miss.** Registration refuses a
mobile number that is already on the roster, and on a shared harbour that
check only sees the numbers *this* phone registered: the shared roster carries
only the last four digits of everyone else's, deliberately, so a ten-digit
comparison never matches them. So the duplicate-number refusal is reliable on
one device and best-effort across the fleet, and a determined skipper could
register a second boat to get past the two-crate cap. The admin approves every
registration, which is where that is actually caught — the check is a
convenience, not a control.

## Multi-user: shared, or local

The app runs in one of two modes, decided by whether a Firebase config is
present at build time.

**Shared (set `VITE_FIREBASE_*`).** Every phone reads and writes one copy of
the harbour, and changes arrive live. Each crate is claimed by a Firebase
transaction on its own slot, so when two boats tap the last crate at the same
moment the server settles it: exactly one wins and the other is told why.
Two crates are two writes and either can lose, so a booking that cannot win
both gives back the one it took rather than leaving you holding half a
booking — and if that giveback is itself refused, the app says you are still
holding a crate rather than telling you the box filled up. The 2-crate cap is checked on the client — no rule can count across
boxes. Free Spark plan, no card. Setup:

1. Create a project at [firebase.google.com](https://firebase.google.com) →
   **Realtime Database** → start in **locked mode**.
2. **Authentication → Sign-in method → Anonymous → Enable.** Do this *before*
   step 3. The rules require a signed-in writer, and anonymous sign-in is off
   by default — without it every booking in the harbour is refused.
3. Deploy the rules — they are what constrain the public web config, and the
   header comment in the file says exactly what they do and do not stop:

   ```bash
   npx -y firebase-tools login --no-localhost
   npx -y firebase-tools deploy --only database --project <your-project-id>
   ```

   `firebase.json` at the repo root points at `firebase/database.rules.json`.
   Deploy after **every** change to that file: a client that has started
   writing a field the published rules do not know about fails, and fails in
   a way that looks like a dead network.
4. Copy the web app config into `.env.local` (see `.env.example`), and add the
   same three as repository secrets — the deploy workflow reads them by those
   names.
5. Open `#admin` once and press **Publish harbour**. That seeds the empty
   database with this harbour's boxes, roster and history. Every write yields
   to anything already there, so it cannot flatten a harbour that is in use.

Every phone is signed in anonymously, so each write carries a server-issued
identity the client cannot forge and the public web config alone no longer
grants anyone write access. Nothing changes for the skipper: no account, no
password, no extra tap.

Only the **last four digits** of a mobile number are ever stored in the
shared copy. That node has to be world-readable so any phone can name the
boat holding a crate, and four digits is exactly what the ownership check
compares — publishing twenty fishermen's full numbers would be a privacy
breach with no upside. The full number stays on the phone that registered it.

Shared times are written and compared against the *database's* clock, not the
device's, so one phone with a wrong clock cannot expire the harbour's holds.

When the link drops, every write that moves a crate — booking, depositing,
cancelling, releasing — is refused with the real reason, and the figures on
screen are dated rather than left looking live. A dead link and a rejected
write say different things, because they need different actions. A hold that
is not in the shared copy is not a hold, so it is never shown as one:
Firebase would otherwise display a queued offline booking immediately, and a
skipper would walk to the box on a promise that reached nobody.

**Your crate is yours, and the database is what says so.** Every write names a
single slot, and a boat is bound to the phone that claimed it — first claim
wins, and the binding can never be reassigned. The rules then refuse any write
to a slot held by a boat that is not yours. Two phones racing the last crate is
settled by the server: the loser's transaction re-runs against the winner's
commit and aborts.

A boat nobody has claimed yet is open to anyone. That is the seeded demo
roster, and it is deliberate — it keeps the app testable from a cold start.
The moment a skipper signs in on their phone, that boat's crates are theirs.

**What the rules still cannot do.** Named here rather than implied to be
covered:

- **Any signed-in phone can set any boat's status.** There is no admin
  identity, so a client could approve its own boat — or block all twenty and
  stop the whole harbour booking. This is the largest remaining gap.
- **The 2-crate cap is counted on the client.** No rule can count a boat's
  crates in boxes it is not writing to.
- **A crate the harbour has given up on — an expired hold, or a stored crate
  past its overstay hour — can be cleared by anyone.** That is how
  force-release works without an admin account, and it is a deliberate
  community rule rather than an oversight. The rule reads the crate's
  `depositedAt`, the same timestamp the screen counts from.
- **Ledger rows can be added, never edited.** A padded report is still a
  problem for a society billing off the CSV.

These need a server-held identity, which needs a paid plan. Everything that
could be closed on the free tier has been.

**And the cost of binding a boat to a phone: it can never be undone.** That
is what makes crate ownership enforceable, and it means a skipper who clears
their browser, reinstalls the app, or loses the phone gets a new anonymous
identity and **can never sign in as their own boat again, on any device**.
No admin control can release it, because a rule an admin could override
would not be a rule. On a real deployment this needs an out-of-band answer —
a harbour master who can retire a hull number and issue a new one — and the
app does not have one yet.

**Local (no config).** Exactly the old behaviour: one device, no sync, useful
for an offline demo. The booking rules still hold on that device, but two
phones will disagree, and the app says so rather than pretending.

Either way, the harbour's *policy* is the client's word — the cap, the
approval queue, the hold length. What the database now enforces on its own is
who owns a crate: the rules refuse a write to a slot held by a boat bound to
another phone, and there is no path that writes more than one crate without
being checked against that crate's owner.

**The limit of that**, stated here rather than implied away: the check is per
crate, so it protects a crate whose boat someone has claimed. In the seeded
demo roster nobody has, which is what keeps the app usable from a cold start
— and until skippers sign in, a signed-in client could still empty a harbour
of unclaimed boats one slot at a time. Policy enforcement needs a server-held
identity, which needs a paid plan; crate ownership did not, and has been done.

## Free, no-account services

| Feature | Source |
| --- | --- |
| Sea chart + coastline | OpenStreetMap raster tiles |
| Buoys, beacons, depth marks | OpenSeaMap seamark overlay |
| Distance, bearing, ETA | Haversine on `navigator.geolocation`, no network |
| Swell traffic light | Open-Meteo Marine |
| Telugu spoken readout | `window.speechSynthesis` |
| Overstay buzz | `navigator.vibrate` |
| Offline shell + tile cache | PWA service worker |

## Low connectivity, and never showing wrong information

The skipper is never asked whether they have signal — the app works it out:

- `navigator.onLine` is not trusted. It only reports that an interface exists,
  and a phone on one bar of 2G reports "online" while nothing completes. We
  judge by **evidence**: when a real request last succeeded (the swell poll,
  which we already make). The `offline` event is used only as an instant
  negative, and the first few seconds are "checking", not "offline".
- When the figures stop being trustworthy the sea-state strip is replaced by a
  dated notice: *these figures are from 6:12 pm, check again at the box*. A
  confidently wrong "2 free" is worse than an honest "possibly stale".
- Nothing blocks on the network. Bearing, distance, ETA and every harbour rule
  are local maths.
- The map, the database client and the admin console are separate chunks —
  though only the map and the console are genuinely off the critical path.
  Measured, gzipped: entry **95 kB**, CSS **12 kB**, service worker **11 kB**,
  and **88 kB of Firebase**, which is fetched at start-up because the
  "numbers are still coming" banner cannot clear until the first snapshot
  arrives through it. That is **~205 kB of our own code** before the app can
  stand behind a figure, plus **265 kB of webfonts** on a cold visit — Noto
  Sans Telugu alone is 124 kB. **~470 kB in total**, and the fonts are the
  largest single item. Self-hosting and subsetting them is the next real
  win, and it has not been done. And
  tiles are cached first-hit, so a route drawn once redraws with no signal.
- Browser storage is wrapped: private mode and a full quota both throw, and the
  app falls back to memory rather than white-screening — and *says so*, once,
  rather than losing a booking in silence. Saved state is schema-checked on
  load and reseeded if it does not hold up.

## Edge cases handled

| Case | Behaviour |
| --- | --- |
| Two boats want the last slot | Capacity is re-checked at commit, not at render — the loser is told another boat just took it |
| Hold expires while the deposit sheet is open | Deposit is refused and the expiry explained, not silently dropped |
| Wet-screen phantom taps | Release, cancel-hold, reject and force-release are two-tap and disarm after four seconds |
| Device clock jumps backwards | A future timestamp never reads as an elapsed hold or an overstay |
| Promised collection lands on the overstay line | The picker offers 2/4/5 h only — never a time that flags on arrival |
| Box fills between opening the sheet and tapping | Crate buttons are bounded by the box's real free count, and the commit re-checks |
| **No position at all** | Distance, route and compass simply do not appear — no jargon, no prompt to fix anything. **Booking never needs a position**: the map and the named box list are equal paths in. The safety card says plainly that the phone cannot find you, rather than "still looking" for ever |
| Map tiles unreachable | Compass, bearing and ETA carry on, with a notice on the chart |
| Pins overlap when zoomed out | The idle chart frames the harbour, not the boat, so the three pins stay tappable |
| No Telugu voice on the phone | Speaks Telugu words in Latin script through an Indian voice, so the readout stays Telugu instead of switching language or going silent |
| A part-elapsed month | Utilisation divides by days elapsed, and the month-on-month trend is hidden until the month is complete |
| A crash in the UI | An error boundary offers reload, then reset — never a white screen on a dock |
| Same hull number at two harbours | Switching harbour always re-asks who you are |
| App closed for days | Holds expire and overstays flag correctly on reopen |

## Sunlight, salt and low literacy

- Warm near-white ground, near-black ink, 3 px borders. In direct sun the
  border survives when fills and shadows wash out.
- 60–72 px targets for every primary action, 44 px for top-bar utilities, one
  primary action per screen, bottom tab bar.
- No status is ever colour alone. Each of the four carries a **mark** as well
  as a fill — an empty slot is a dot in a dashed border, a hold carries a
  clock, a stored crate carries its catch, an overdue one carries `!` — and
  the legend above the boxes is drawn by the same function as the cells, so
  it cannot drift from them. Three of its four marks are exact; the stored
  chip shows the *mixed* catch icon as an example, because a stored crate
  carries whichever of the six species it was booked with and one chip
  cannot show six. In the crate
  grid the status *word* is on the cell's accessible label rather than on the
  cell itself, because a 48 px square already carries a hull number and a
  collection hour; the word is on every row of the Harbour tab, where there
  is room for it.
- Times are 12-hour with am/pm, the way the dock reads a clock.
- Hand-drawn SVG marine and species icons, not emoji: emoji render differently
  on every Android build in the harbour and cannot be recoloured for contrast.
- Night theme for pre-dawn landings; a speaker button in the top bar, which
  every screen shares, so the spoken readout is reachable without scrolling
  to wherever the boxes are. It always speaks Telugu, whatever the screen
  language is set to, and it says first if the figures are not current.
- Mobile numbers are visible only in the admin console, never on the public
  roster.

## Rules

- 4-hour hold, then the slot returns to the pool
- Max 2 crates per boat at a time, counted across all three boxes
- Occupied > 6 h flags as an overstay, visible to the whole harbour
- Releasing on time is credited; an overstay release is not
- Capacity is crates only — species is a tag, never a constraint

## Judge demo

1. Pick **Nizampatnam**, then boat **Ramu #04**.
2. Tap the **Diesel Bunk** pin on the chart → **Prawn → 1 crate**. A receipt
   appears with a booking code to read out at the box.
3. Tap **Simulate 8 km out** — distance, bearing, ETA and the compass appear.
4. **Fish deposited** → promise a collection time. It shows up instantly in the
   box grid and in the Harbour list.
5. The **Ice Plant box** is full and cannot be picked; the **Auction Hall box**
   carries #11's overstay, pulsing amber.
6. Open **`/#admin`** (PIN 2468): approvals, live usage with force-release,
   three months of reporting, **Download for Excel**, and the verified audit
   log.
7. **Reset demo** (in `#admin` when the harbour is shared) clears this
   harbour’s crates for every phone and signs you out. The roster and past
   records are kept — the ledger is append-only by rule, even for an admin.

## Layout

```
src/
  components/   screens and chrome, one concern each
  data/         harbours, rosters, and the pre-populated harbour state
  hooks/        clock, geolocation, marine, connectivity, haptics
  i18n/         one line per string, both languages side by side
  icons/        hand-drawn marine and species SVGs
  lib/          pure logic: geo, nav, time, stats, speech, adminAuth, download
  store/        zustand store + selectors (all harbour rules live here)
```

Rules live in `store/selectors.ts` and `store/useDockStore.ts` and are covered
by `npm test`. Components render; they never decide. Harbour positions live in
`data/harbours.ts` and nowhere else.

See [TRADEOFFS.md](TRADEOFFS.md) for the anti-hoarding logic and the design
trade-offs, [AGENTS.md](AGENTS.md) for the vision and the rules any
contributor works to, and [MEMORY.md](MEMORY.md) for where the work stands
and what is next.
