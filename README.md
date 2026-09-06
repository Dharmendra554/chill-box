# Chill-Box · చిల్-బాక్స్

Slot reservation and catch checkout for the community solar chill-boxes at
Andhra Pradesh fishing harbours. No harbour master, patchy signal, twenty
boats to a society. Mobile-first, Telugu by default, no password.

**Live demo:** _deploy to Vercel/Netlify (below) and paste the URL here_

---

## Run

```bash
npm install
npm run dev
```

```bash
npm test        # 39 rule, edge-case, analytics and security tests
npm run build   # typecheck, bundle, generate service worker
npm run lint    # zero warnings
```

## Deploy (free tier, no environment variables)

Static SPA — `vercel.json` already rewrites all routes to `index.html`. Push
the repo and import it on Vercel or Netlify: build command `npm run build`,
output directory `dist`. Nothing to configure — no API keys, no database, no
auth provider.

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
  bearing, ETA and compass appear on the same screen. Below: the spoken
  capacity readout, the box cards, and the safety card.
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
shared secret is painted on a hull within a week.

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
- a **hash-chained audit log**: every admin action records who, what, when and
  a SHA-256 over the previous entry, so an edited or deleted record shows as a
  broken link instead of vanishing. The console verifies the chain live.

**What it is not:** enforcement. Authorisation runs on the client, so anyone
with developer tools can edit this device's own state. Real enforcement needs a
server — moving `verifyPin` and `appendAudit` behind an API route is the only
change required. Claiming client-side security is unbreakable would be false,
so we don't.

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
- The map is a lazy chunk — the booking flow ships in ~87 kB gzipped — and
  tiles are cached first-hit, so a route drawn once redraws with no signal.
- Browser storage is wrapped: private mode and a full quota both throw, and the
  app falls back to memory rather than white-screening. Corrupt or truncated
  saved state is detected on load and reseeded.

## Edge cases handled

| Case | Behaviour |
| --- | --- |
| Two boats want the last slot | Capacity is re-checked at commit, not at render — the loser is told another boat just took it |
| Hold expires while the deposit sheet is open | Deposit is refused and the expiry explained, not silently dropped |
| Wet-screen phantom taps | Release, cancel-hold, reject and force-release are two-tap and disarm after four seconds |
| Device clock jumps backwards | A future timestamp never reads as an elapsed hold or an overstay |
| Promised collection lands on the overstay line | The picker offers 2/4/5 h only — never a time that flags on arrival |
| Box fills between opening the sheet and tapping | Crate buttons are bounded by the box's real free count, and the commit re-checks |
| **No GPS at all** | A card says so and points at the box list; **booking never needs a fix** |
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
- 60–72 px tap targets, one primary action per screen, bottom tab bar.
- Every status is colour **and** shape **and** text — never colour alone.
- Times are 12-hour with am/pm, the way the dock reads a clock.
- Hand-drawn SVG marine and species icons, not emoji: emoji render differently
  on every Android build in the harbour and cannot be recoloured for contrast.
- Night theme for pre-dawn landings; a full-width **Read free space** button
  with a speaker icon, because the skippers who need a spoken readout most are
  the least likely to hunt for a hidden control. It always speaks Telugu,
  whatever the screen language is set to.
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
7. **Reset demo** restores every harbour in one tap.

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
trade-offs.
