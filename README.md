# Chill-Box · చిల్-బాక్స్

**Twenty fishing boats share three solar cold-boxes. Nobody is in charge. This
app is the harbour master.**

A skipper lands at 4 a.m. with a catch worth a week's income and needs one
question answered in one glance: *is there room, and where?* If the app is
slow, wrong or confusing, the fish spoil. That is the whole product.

**Live app:** https://dharmendra554.github.io/chill-box/
**Source:** https://github.com/Dharmendra554/chill-box

---

## Try it in thirty seconds

The link opens straight onto the three capacity gauges. No sign-up, no login,
nothing to install.

To book something, tap **Which boat I am…** and pick a boat:

| | |
| --- | --- |
| Harbour | **Nizampatnam** |
| Boat | **Ramu #04** |
| Last four digits | **2004** |

The digits follow the hull number, so #11 is 2011, #17 is 2017, and so on.

That is a real account on the real shared harbour — what you book appears on
every other phone. If you would rather not touch anyone else's crates, tap
**Go demo** in the coloured bar at the top first. Same app, your phone only.

**The coloured bar always tells you which one you are in.** Blue *Demo* means
this phone only. Green *Real* means everyone sees it. The button in that bar
switches between them.

---

## The idea

Three cold-boxes, ten crate slots each, twenty boats and no harbour master.
The brief's own first sentence is the hardest constraint in it:

> Without a central harbor master or reliable connectivity…

Most apps solve that by inventing one — an admin who approves people, blocks
people and clears crates. **We built that, and then deleted it**, because in a
village of twenty families a password that decides who may store fish is a
monopoly, and it stands between a skipper at 4 a.m. and a crate for his catch.

So: **there is no login, no approval and no password anywhere in this app.**
Not hidden, not behind a PIN — gone, along with the code that checked it.

What replaces authority is three things:

1. **Rules that run themselves.** A hold expires. A crate flags. A space comes
   back. No one decides.
2. **Everything visible to everyone.** Every crate carries a boat number. The
   whole harbour record — usage, dwell time, overstay rate, every action ever
   taken — is one tab, open, no password.
3. **The harbour speaks for itself.** When a stranger turns up, the twenty
   decide how much space he may hold. Not whether he may use the boxes at all.

---

## Every boat has the same rights, and here is exactly what that means

There is no account that can do more than yours. To be precise about it:

| Nobody in this app can… | Because |
| --- | --- |
| Approve or refuse a registration | There is no approval step. A boat books the second it registers |
| Block a boat | The feature is deleted. So is the database rule that used to allow it |
| Take another boat's crate | The database refuses a write to a crate held by another phone |
| Reset the harbour | The only reset touches your own demo copy |
| Edit or delete history | The ledger is append-only by rule, for everybody |
| Hide anything from anyone | The record has no password |

**The last one has teeth.** The database rules used to carry this warning
about themselves, in capitals: *any signed-in phone can set any boat's status
— including setting all twenty to 'blocked', which stops the whole harbour
from booking.* No clever rule could fix it, because with no admin identity to
check against, whatever the app may write, anyone may write.

Deleting the feature is what closed it. There is nothing left to write. That
is the general lesson of this build: **the security hole a client-only app
cannot close is usually a feature it should not have.**

---

## When a new boat turns up: the harbour backs it

This is the one place where twenty people decide something together, and its
shape matters more than its existence.

**A new boat books immediately — with one crate.** Once more than half the
harbour has backed it, it gets the full two.

- A vouch can only ever **raise** an allowance. There is no "no".
- Nobody can be blocked, removed or reduced. The worst anyone can do is back a
  boat they should not have.
- The tally is public and **every backer is named**, on the Harbour tab, to
  everyone.
- One boat, one vouch — enforced by the database, not by the screen.

**We designed the obvious version first and threw it away.** The first draft
had the harbour *vote a boat in*: a majority admits it, and until then it
cannot book at all. It was specced, committed, and deleted before a line of it
was written, because it is the same harbour master the brief says does not
exist — just with eleven hands on it instead of one. A fisherman standing at a
cold-box at 4 a.m. with a crate of prawn cannot wait for eleven neighbours to
wake up.

So the vote never decides *whether* you may use the boxes. It decides *how
much* of a shared space a stranger may take before the people who share it
have said they know him. That is the question a village actually asks, and it
is safe to get wrong in only one direction.

---

## Anti-hoarding: an escalation, not a punishment

Four pressures, and not one of them is a fine or a lockout — those only push
the next catch into open air.

| | |
| --- | --- |
| **2 crates per boat** | Counted across all three boxes, not per box, so one haul cannot take a chill-box |
| **4-hour hold** | An unfilled reservation expires by itself. A boat that never lands cannot park a slot |
| **6 hours — amber** | The crate flags harbour-wide with the boat number. Everyone can see who is blocking a box |
| **8 hours — the space comes back** | The harbour reclaims the slot automatically. The board names the boat under **Not collected** for 24 hours |

The cost of the space is one promise: at deposit you name the hour you will
collect, so everyone else can plan around a real opening rather than a guess.

**And the app never claims the fish left the box.** At eight hours the *slot*
is freed for booking, and a standing notice — on the Harbour tab and on the
box itself — says the space was taken back and whose catch may still be
inside. Freeing a slot silently would be a lie, and lying to a skipper about
capacity is the one thing this app exists to prevent.

---

## Why the last four digits, and not an OTP or a Google sign-in

**The login we wanted is a mobile OTP.** Type the number the society already
has on file, a code arrives by SMS, done. It is the one form of authentication
a fisherman on this coast already understands, because every bank and every
ration shop uses it. No password to forget, no email, nothing to install.

**We could not build it, and not because of budget.** Every SMS gateway —
Firebase Phone Auth included — bills per message, and the brief is explicit:
*"No paid external APIs, authentication services, or paid databases."* The OTP
is out on the rules.

**A Google sign-in was never the answer either.** Many skippers here have no
Gmail account. The ones who do share the phone, or have the password written
down by whoever set it up for them. An email-and-password screen is exactly
the wall that keeps this crowd off an app, and it would be the very first
thing they meet.

**So we ship the OTP flow with the paid step removed.** You pick your boat and
type the last four digits of the mobile number the society registered for it.
Nothing is sent; the app compares them on the phone.

That is honestly weaker — anyone who knows a boat's number can claim it — but
it costs nothing, needs no account, works with no signal, and is one number a
skipper knows by heart. **A real deployment adds the SMS step and changes
nothing else in the app:** same field, same roster, same check.

Those digits *identify* a boat. They do not *authenticate* one, and this
README will not pretend otherwise.

What does protect a crate is the second step: the first phone to claim a boat
is bound to it in the shared database, and the rules then refuse any other
phone's attempt to move that boat's crates.

---

## Built for a dock, not a desk

- **Telugu first.** Not a translation — the default. English is one tap away.
- **Sunlight.** Warm near-white ground, near-black ink, 3 px borders. In
  direct sun the border survives when fills and shadows wash out.
- **Gloves and wet hands.** 60–72 px targets for every primary action.
- **No status is ever colour alone.** Each carries a shape and a word as well:
  an empty slot is a dot in a dashed border, a hold carries a clock, a stored
  crate carries its catch, an overdue one carries `!`.
- **Landmarks, not numbers.** The Auction Hall box, the Ice Plant box, the
  Diesel Bunk box. "Box 2" has to be memorised; a building you can see does
  not.
- **12-hour clocks.** A dock does not read 22:30.
- **A spoken readout** in the top bar of every screen, always in Telugu
  whatever the screen language — for the people who cannot read either one. It
  says first if the figures are not current.
- **Hand-drawn icons, never emoji.** Emoji render differently on every Android
  build in the harbour and cannot be recoloured for contrast.
- **Night theme** for pre-dawn landings.

---

## The screens

Three tabs. That is the whole app.

- **Book** — the three gauges and a chart of the harbour. Tapping a box books
  it. Booking never needs GPS: every box is bookable by name, because a phone
  under a shed roof has no sky. Once booked, distance, bearing, ETA and a
  compass appear.
- **Harbour** — new boats waiting to be backed, spaces the harbour took back,
  then every crate ordered by which frees soonest, then the roster.
- **Record** — the harbour's record of itself. Live usage, three months of
  reporting, utilisation, average dwell, overstay rate, the hour boats
  actually land, Download for Excel, and a hash-chained log of every action.
  **No password.** Nothing on it can stop a boat or move a crate.

A **safety card** sits on the Book screen, never behind a menu: coast guard
**1554**, emergency **112**, ambulance **108**, disaster control **1077** and
the harbour office, all direct-dial, with a vCard download so the numbers
survive outside the app. When the swell reads rough it leads with what to do
before it lists who to call.

---

## Bad signal, no signal, no GPS

The skipper is never asked whether they have signal. The app works it out.

| Situation | What happens |
| --- | --- |
| **Phone says "online" but nothing loads** | `navigator.onLine` is not trusted — it only reports that an interface exists. Freshness is proven by data actually arriving |
| **Nothing has arrived for 20 s** | A dated banner says how old the figures are, pinned to the top of every screen. Bookings are refused with the real reason, not a guess |
| **A write takes too long** | Every shared write has a 12-second deadline. Past it you are told *we do not know yet, check at the box* — never "failed", because the write may still land and booking again would double-book you |
| **Signal dies mid-booking** | The sheet stays open until the claim is settled. No receipt appears for a crate you do not hold |
| **App opened with no signal at all** | It opens. Installed as a PWA, the shell and the map tiles are cached; you see last night's figures with their age on them |
| **No GPS, or none yet** | Distance, route and compass simply do not appear — no error, no prompt to fix anything. **Booking never needs a position** |
| **Two boats want the last crate** | Settled by the database, not the screen. One wins; the loser is told another boat took it just now |
| **Phone clock is wrong** | Deadlines run on harbour time. A clock that jumps backwards never reads as an elapsed hold or an overstay |
| **Phone sleeps for an hour** | The eight-hour reclaim will not fire on a stale snapshot, and the write re-checks the crate's age on the server before taking it |
| **Storage full or private mode** | Persistence is a convenience, never a dependency. A refused write is announced, not swallowed |
| **The app crashes** | An error screen with a reset that keeps your audit log and the other mode's data |

---

## Running it

```bash
npm install
npm run dev
```

Works with no configuration at all — one device, no sync, full booking rules.
To share a harbour between phones, add a free Firebase Realtime Database
(Spark tier, no card) in `.env.local`:

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_DATABASE_URL=…
VITE_FIREBASE_PROJECT_ID=…
```

Then open the Record tab once and press **Publish harbour** to seed it.

```bash
npm test        # 132 tests
npx tsc -b
npx oxlint
npm run build
```

Deploys itself to GitHub Pages on every push to `main`, and a red build never
publishes.

---

## What this is not

Every claim here is one the code can keep. These are the ones it cannot.

- **It is not enforcement.** Authorisation runs on the client, because the
  brief rules out a paid server. The database rules check the shape of the
  data, who is writing, and who owns a crate. They are not harbour policy.
- **The 2-crate cap is counted on the phone.** No database rule can count a
  boat's crates across three boxes.
- **Anyone who knows a boat's number can claim it**, and nothing stops one
  person registering two boats to get two allowances. The defences are the
  cap, the public board, and twenty people who know each other. Closing it
  properly needs the SMS step the brief forbids.
- **The audit log is a receipt, not an audit trail.** It catches accidental
  corruption and a casual edit. A determined tamperer can delete a row and
  recompute every hash after it; an unkeyed chain cannot stop that, and an
  HMAC would not help because the key would ship in the same bundle.
- **Binding a boat to a phone cannot be undone.** That is what makes crate
  ownership enforceable, and it means a skipper who clears their browser or
  loses the phone cannot sign in as that boat again. There is no control that
  can release it — deliberately, because a rule someone could override would
  not be a rule. A real deployment answers this out of band: the society
  retires a hull number and issues a new one.
- **A crate the harbour has given up on can be cleared by anyone.** That is
  how a space is reclaimed with no admin account. It is a community rule, not
  a hole.

---

## What it costs to open

Measured, gzipped, against a real build:

| | |
| --- | --- |
| App | 100 kB |
| CSS | 13 kB |
| Service worker | 11 kB |
| Firebase | 90 kB |
| Webfonts | 265 kB |
| **Total, first visit** | **~478 kB** |

The fonts are the largest single item and are not yet fixed — Noto Sans Telugu
alone is 124 kB, larger than the entire app. Self-hosting and subsetting them
to the glyphs actually used is the next real win, and it has not been done.
The map and the record are separate chunks, loaded only when opened.

---

## How it was built

Twenty rounds of hostile self-review. After every substantial change, two
adversarial reviewers were pointed at the code with instructions to prove it
wrong, and told that a polite review is a failed review. **Every single round
found real defects with all four quality gates green** — and in nineteen of
twenty, the previous round's *fixes* caused the next round's defects.

The most recent round is the reason it is worth mentioning here: a reviewer
proved that the eight-hour reclaim, which had been checked in a browser and
declared working, **freed nothing**. One line was in the wrong place. The
browser check had happened to land on the one case where it worked.

Everything in this README that sounds like a claim was checked that way.

**Stack:** React 19 · TypeScript · Vite · Tailwind 4 · zustand · Leaflet ·
vite-plugin-pwa · vitest · oxlint · Firebase Realtime Database (free tier).

**Layout:** rules live in `src/store/selectors.ts` and
`src/store/useDockStore.ts` and are covered by tests. Components render; they
never decide. Harbour positions live in `src/data/harbours.ts` and nowhere
else. Every user-visible string is in `src/i18n/dictionary.ts`, both languages
on one line, so a translation cannot silently go missing.
