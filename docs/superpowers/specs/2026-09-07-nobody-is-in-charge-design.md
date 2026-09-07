# Nobody is in charge

**Rounds 19–21.** Removes every human authority from the app, turns the admin
console into an open harbour record on a third tab, and closes the remaining
gaps against the competition brief. Written 7 Sept 2026, against `9ffb97a`.

Supersedes the admission-by-majority spec, which was deleted unbuilt: voting
added a subsystem to an app whose own history says subsystems are where the
defects are, and eleven neighbours tapping yes is a worse experience than the
brief deserves.

---

## Why

The brief's first sentence is the condition the whole product answers:

> Without a central harbor master or reliable connectivity, fishermen arrive
> to find cold-boxes already full…

We shipped a harbour master anyway. `useDockStore.ts:793` refuses a booking
unless `me.status === 'active'`, and a new boat is seeded `pending`
(`data/boats.ts:96`), so a skipper who lands at 4 a.m. cannot book until
somebody opens `#admin`, types PIN 2468 and presses Approve. The console also
carries a **Block** button beside every one of the twenty boats.

In a real village those two controls are a monopoly: whoever holds the PIN
decides who may store fish. In the competition they are a visible
contradiction of the premise a judge reads first.

Everything else in that console — live usage, utilisation, dwell time,
overstay rate, arrivals by hour, the per-boat table, the CSV export, the
hash-chained action log — is not authority at all. It is exactly the
transparency the harbour should have, hidden behind a PIN nobody has.

**So: delete the two powers, publish the rest, and let the rules do the
policing.**

## What changes, in one sentence

**No person in this app can admit, refuse, block or release anybody; the
rules do it, and every skipper can watch them do it.**

---

# Round 19 — authority out

Deletion and one reorder. No new subsystem.

## 1. Admission is deleted

`Boat['status']` goes away entirely. Not narrowed — removed. With no approval
and no blocking there is no third state for a boat to be in: a boat on the
roster is a boat that may book.

Deleted with it:

- `approveBoat`, `rejectBoat`, `setBoatStatus`, `setBoatBlocked`,
  `logStatusChange` in `useDockStore.ts`
- the "Waiting for approval" card and the twenty **Block** buttons in
  `AdminScreen.tsx:309`, `:321`, `:551`
- the pending / blocked banner at `App.tsx:258` and its strings
  `pendingTitle`, `pendingBody`, `pendingDemo`, `blockedTitle`, `blockedBody`
- the status chips in `RegisterScreen.tsx:186`
- the `status === 'active'` filter and its comment at `HarbourScreen.tsx:22`
- the `errNotApproved` refusal at `useDockStore.ts:793` and the same gate on
  deposit and release (`useDockStore.ts:607`)
- `seedPending` — its two boats join the ordinary roster instead

**Registration is instant.** A boat exists and books in the same minute.

### Two migrations this cannot skip

- **Persisted local stores.** Phones and browsers in the wild hold a zustand
  store whose boats carry `status`. Bump the persist version and drop the
  field in `migrate`. Without it a stale `status: 'pending'` survives as dead
  data that a later selector could read.
- **The shared roster.** Boats already in Firebase carry `status`.
  `firebase/database.rules.json` constrains it on write. The rules must stop
  requiring it and the client must ignore it on read. `MEMORY.md` §16 records
  what happened last time the published rules and the client disagreed about
  one field: registration bricked, and the app blamed the network.

## 2. New boats are visible, not gated

`joinedRecently(boat, now)` — registered within 7 days — is a derived helper
in `selectors.ts`, not a stored flag. A recently joined boat carries a
**New** chip in the harbour list and in the record.

Nobody has power over it. The twenty simply see who turned up, which is what
they would see on the quay anyway. The 2-crate cap and the overstay rules do
the policing, exactly as `TRADEOFFS.md` already argues.

**Two consequences to state rather than hide.** Nothing now stops someone
registering several boats and taking several allowances; the defences are the
per-boat cap, the public record, and twenty people who know each other. Say
so in `TRADEOFFS.md` — the brief forbids the tool that would fix it properly
("no paid external APIs, authentication services"), and an honest limit reads
better than a claim the code cannot keep. And with no rejection, no boat ever
leaves the roster, so `nextBoatId`'s reuse of the lowest free hull number
(`MEMORY.md` §5) becomes unreachable in shared mode — check whether it is now
dead code before leaving it there.

## 3. The record becomes a third tab

`MEMORY.md` §7 says *"Admin is not a tab. It lives at `#admin` only."*
**This spec deliberately reverses that**, and the reason must go in §7 rather
than be left to look like drift: that rule was written for a PIN-gated
authority console, and hiding one is correct. An open, read-only record of
the harbour's own activity is a different object, and hiding it defeats its
only purpose.

- `Chrome.tsx:299` — `grid-cols-2` becomes `grid-cols-3`.
- **The 320 px risk is real and must be measured, not reasoned about.** Three
  tabs at 320 px is 106 px each, and every label is Telugu.
  `AGENTS.md` §4 forbids `letter-spacing` on anything holding Telugu, so the
  label cannot be squeezed that way. If the Telugu word does not fit, the word
  changes — the tab does not get smaller.
- Keep `#admin` working as it does today. It is in the README and in muscle
  memory.

## 4. The PIN comes off the record

Every skipper opens the record and sees: live usage, the month picker, totals,
insights, all four charts, the per-boat table, and the action log.

**The PIN survives on exactly two controls** — *Publish harbour* and
*Reset demo* — because those are deployment and demonstration tools, not
harbour data. `adminAuth.ts` keeps its lockout and idle expiry for them.
`publishHarbour`'s store-level guard from round 18 (`publishGuard.test.ts`)
stays; the JSX was never what protected it.

**Mobile numbers leave the record.** The approval card shows
`Mandava Srinivas · 9848012021` today; that card is deleted, and no other
part of the record may reintroduce a number. `HarbourScreen.tsx:80` already
argues this for the public roster and the argument now applies here too. The
number stays in the store — the safety card dials it — it is simply not
displayed on a screen anyone can open.

## 5. Docs

- `MEMORY.md` §7: record the reversal of "admin is not a tab", with the
  reason.
- `TRADEOFFS.md`: the **Admin** paragraph is now false. Replace it with the
  anti-monopoly argument — no approval, no blocking, no force-release by a
  person, and an open record. **The file is at 297 of 300 words**, so
  something must be cut. Check with
  `sed '1,2d' TRADEOFFS.md | sed 's/\*\*//g' | wc -w`.
- `README.md`: the judge script. This also closes auditor B's **C4** (it sends
  judges to a demo toggle round 17 removed, and never mentions the
  registration-screen one that replaced it) and **C5** (no step enters demo,
  so all seven steps run against the live shared harbour — including step 7,
  which clears every phone's crates).
- `MEMORY.md` §2 and `README.md:330`: re-measure. Auditor B's **C6** says §2
  has been stale four rounds running — 104 tests where there are 115, a commit
  table stopping at `7812fff`, an entry-JS figure matching no basis, and a
  total that should be ~478 kB. `README:330` carries a *different* wrong
  figure for the same measurement. Re-measure; do not nudge.

## 6. Tests

1. A boat registered this second can reserve, deposit and release — the whole
   crate lifecycle with no approval anywhere.
2. No code path can refuse a booking for a reason of identity. The
   `errNotApproved` string is gone and the dead-key check stays at zero.
3. The persist migration drops `status` from a v-previous store and the boats
   still book.
4. A shared roster entry carrying a legacy `status` field is read without
   error and books.
5. `joinedRecently` at the 7-day boundary, both sides.
6. The record renders with no PIN; *Publish harbour* and *Reset demo* still
   demand one and still refuse when locked.

Mutation-check 3 and 6.

## 7. Definition of done

- `npm test`, `npx tsc -b`, `npx oxlint`, `npm run build` — all four green.
- Rules deployed, `scripts/verify-rules.sh` prints *all checks passed*.
  Nothing in this round is real until it does.
- Verified in a browser at **320 px in Telugu**: three tabs legible and not
  wrapping, the record opening with no PIN, registration to booked crate with
  no wait.
- Verified with a **bound** boat. `MEMORY.md` §3 records that
  "force-release verified" was worth nothing because every demo boat was
  unbound, the one case the rule permits.
- Two hostile auditors per `AGENTS.md` §5, given this document and told to
  falsify every claim in it.

---

# Round 20 — the eight-hour rule

Its own round because it is the only part that writes to the shared harbour,
and `MEMORY.md` §2 records that in eighteen rounds out of eighteen the
previous round's fixes wrote the next round's defects.

## The escalation

- **6 h** — the crate flags amber harbour-wide with the boat number.
  Unchanged.
- **8 h** — the app takes the space back by itself. No person decides.

Today the second stage is a **Force release** button that a PIN-holder
presses (`AdminScreen.tsx:355`). That button is deleted.

## The honesty problem, and how it is answered

At 8 h the fish is usually still physically in the box. An app that frees the
slot and says nothing has told the harbour a box is empty when it is not,
which `AGENTS.md` §2 makes the first thing this project may not do.

So the release is **two facts, not one**:

1. the slot is free to book, and
2. a standing **not collected** row naming the boat and the hour, on the
   Harbour page and in the record, kept 24 h.

The app never claims the fish vanished. It says the space was taken back and
who left it there — which is also the anti-hoarding pressure, since the row is
public.

## Where it runs

Alongside hold expiry in `applyTick`, which already returns the same array
when nothing changed — `AGENTS.md` §6 records what breaking that costs.

**In shared mode every phone will see the same overdue crate at the same
second.** The release is a transaction on that slot, guarded on the crate
still being the same crate and still past 8 h; the first phone wins and the
rest no-op. It must not fire at all while the snapshot is stale, or a phone
that has been asleep will release crates on evidence from an hour ago. This
is the seam; it is where the defects will be.

A ledger row is written with reason `uncollected`, so the history and the
billing export stay honest about what happened.

## The Late list

The boats currently overstaying, named, with how late, and the recent
not-collected rows — at the top of the **Harbour** page and in the record.
Ordered worst first.

## Tests

Threshold at exactly 8 h both sides; idempotency when two phones tick
together; no release while stale; the ledger row; the not-collected row
appearing and expiring at 24 h; `applyTick` still returning the same array
when nothing is due. Mutate the threshold, the staleness guard and the
idempotency.

---

# Round 21 — the first ninety seconds

## Gauges before identity

`App.tsx:255` — `!boat ? <RegisterScreen />`. A first-time visitor gets a
harbour picker, three form fields and a grid of twenty hull buttons **before
any capacity gauge**.

That fails a stated constraint of the brief — *"Must come pre-populated with
realistic dummy data for immediate testing"* — because nothing testable is on
screen, and it undercuts the first judging criterion, *"interface simplicity
for low-literacy users in bright sunlight dock conditions"*.

**The landing screen becomes the three boxes.** Anyone opening the link sees
live capacity, the Harbour page and the record with no identification at all.
Identity is asked for at the moment it is needed — the first tap on Book —
and not before.

## Auditor B's outstanding list

Reported against `679360a` after round 18 closed, still unanswered:

- **C1** — at 320 px in Telugu, `BookSheet` (`BookSheet.tsx:60`, `m-0 mt-auto`)
  covers 20.3 px of the demo banner and clips its second line through the
  glyphs. Cap the sheet at `calc(100dvh - <header>)`, or publish the header
  height as a CSS variable and offset the sheets by it.
- **C3** — the stale-figures banner is still the one that scrolls away:
  `{banner}` at `App.tsx:243` is a sibling of `<header>`, gone by scrollY 120.
  Round 17 pinned the session-constant demo caveat and left the live, changing
  warning unpinned. Move it into the header, or write down in `Chrome.tsx` why
  the weaker case got the pin.
- **L1** — Telugu plurals: `dictionary.ts:79/88/98` render "1 క్రేట్లు" —
  plural noun, singular count — on the receipt, the hold card and the quota
  line. `crate1: '1 క్రేట్'` already exists two lines away.
- **L3** — `ModeSwitch` at `RegisterScreen.tsx:106` is a full-width button
  between the intro and the Boat-name field with no "demo tools" fence.
  Tapping it reloads and discards the typed form and the harbour just chosen.
- **L2** — two namespaced stores now, ~1.64 MB measured on a phone that has
  used both modes, roughly a third of a 5 MB quota. The budget arithmetic in
  `adminAuth.ts` was written for one store and is stale.

Carried from auditor A as scope, not defects: no tests for `speakCapacity`,
`stats.ts` or `setBoatBlocked` — the last of which round 19 deletes.

---

## Scorecard this closes

| Brief requirement | Before | After |
| --- | --- | --- |
| Live capacity gauge ×3 | met | met |
| One-tap reservation, 4 h hold | met (`BookSheet.tsx:47` defaults the species) | met |
| Catch tagging, minimal typing | met | met |
| Checkout frees the slot | met | met |
| Overstay flag | met | two-stage: amber at 6 h, space reclaimed at 8 h |
| Free hosting, no paid services | met | met |
| Touch-friendly on low-end mobile | met | met |
| **Pre-populated data, immediately testable** | **failed** — landing is a form | met, round 21 |
| Simplicity for low-literacy users | strong | stronger |
| Expiry / no-show / over-capacity | strongest thing in the app | plus automatic reclaim |
| Clean state, instant updates | met | met |
| Trade-offs note | met | rewritten around anti-monopoly |
| **"Without a central harbor master"** | **contradicted by the code** | no authority anywhere |

## Blocked on the user, carried forward

- The `FIREBASE_TOKEN` repo secret does not exist — `gh secret list` shows
  only the three `VITE_FIREBASE_*` — so CI skips the rules deploy with a
  warning, and every round's rules still need a human.
- `harbours/probe-*` residue left in the database by
  `scripts/verify-rules.sh`.

Deliberately open and documented: the 223 kB ledger feed, 265 kB of webfonts.
