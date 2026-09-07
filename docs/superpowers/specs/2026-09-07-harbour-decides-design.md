# The harbour decides — admission by majority

**Round 19.** Replaces admin approval of new boats with a vote of the boats
already in the harbour. Written 7 Sept 2026, against `9ffb97a`.

---

## Why

The competition brief opens with the condition the whole product answers:

> Without a central harbor master or reliable connectivity, fishermen arrive
> to find cold-boxes already full…

We shipped a harbour master anyway, and put him on the critical path.
`useDockStore.ts:793` refuses a booking unless `me.status === 'active'`, and a
newly registered boat is seeded `pending` (`data/boats.ts:96`). A skipper who
lands at 4 a.m. with a new boat cannot book a crate until a human opens
`#admin`, types a PIN and presses Approve. In a village whose defining
condition is that nobody is in charge, that is not a perception problem to be
argued away in the README — it is the code contradicting the brief's first
sentence.

It is also a political problem in the real deployment. Whoever holds the PIN
decides who may store fish. Twenty families, one lock, local politics: the
monopoly is the design.

The harbour is twenty boats who all know each other. It can decide for itself.

## What changes, in one sentence

**A new boat is admitted when more than half the active boats in its harbour
have said yes, and no single person can admit or refuse anybody.**

---

## 1. Admission is derived, never written

This is the load-bearing decision and everything else is downstream of it.

The obvious implementation stores a status flip: count the votes, and when the
threshold is crossed, write `status: 'active'`. Do not do that. It reintroduces
every failure mode `MEMORY.md` §16–§29 documents — a write that races, a write
that half-commits, two phones that disagree about whether a boat may book, an
audit row for an action no person took, and a rule the server cannot check.

Instead the tally **is** the status. `selectors.ts` gains:

```
effectiveStatus(boat, votes, activeCount) -> 'active' | 'pending' | 'declined' | 'blocked'
```

- `boat.status === 'blocked'` → `blocked`. Blocking is a separate power and is
  unaffected by this round.
- `boat.status === 'active'` → `active`. The seeded roster is admitted by
  construction; it is the harbour that existed before the app.
- Otherwise tally the votes for this boat:
  - `yes > floor(activeCount / 2)` → `active`
  - `no  > floor(activeCount / 2)` → `declined`
  - otherwise → `pending`

### The denominator, and why it needs an order

`activeCount` is the number of boats in that harbour that may currently vote.
Defining it as "boats whose effective status is `active`" is circular:
admission depends on the count, the count depends on who is admitted, and two
applications can each be the reason the other passes or fails.

So it is a **fold over the applications in a fixed order** — `registeredAt`
ascending, hull number as the tie-break:

1. Start with the boats whose *stored* status is `active`. That is the
   established roster; it depends on nothing.
2. Take each application in order. Settle it against the count as it stands.
3. If it is admitted, add it to the count before settling the next one.

Deterministic, identical on every phone, no recursion, and it matches how a
real roll call works: you join the harbour, and then you get a say in who
joins next. A boat admitted this morning votes this afternoon.

The consequence is that **an earlier application can raise the bar for a later
one** — 10 of 11 becomes 10 of 12 once someone else is admitted. That is
correct, it is what "a majority of the harbour" means, and it looks enough
like a bug that it gets its own test asserting it by identity.

Denominators today: Nizampatnam 20 → **11 needed**. Vizag 12 → **7**.
Kakinada 12 → **7**.

`declined` is a fourth *derived* value with no stored counterpart. It is not
added to `Boat['status']`; the stored type stays
`'active' | 'pending' | 'blocked'`.

### Consequences to check in review

- Nothing writes a boat's status on admission. There is no new store action
  that mutates the roster.
- The fold runs on every render that needs a status. It is twenty boats and at
  most a handful of applications, but it must not allocate per tick —
  `AGENTS.md` §6 records what a 1 Hz re-render cost here. Compute it once per
  `boats`/`votes` change, not once per consumer.

## 2. Storage and rules

One node per vote, mirroring the per-slot ownership shape already proven for
crates:

```
harbours/<harbourId>/applications/<applicantBoatId>/<voterBoatId> = true | false
```

`firebase/database.rules.json` gains one clause on that path:

- the writing device must own `<voterBoatId>` — the same ownership check the
  crate slots use;
- the value must be a boolean;
- `<voterBoatId>` must be a boat in this harbour with stored status `active`;
- `<applicantBoatId>` must be a boat in this harbour with stored status
  `pending`;
- `<voterBoatId> !== <applicantBoatId>`.

A voter may overwrite their own vote — changing your mind is legitimate and
forbidding it buys nothing. Nobody may write anybody else's.

In demo and local-only mode the same shape lives in the store under
`applicationVotes`, so one selector serves both and there is no second copy of
the rule. `AGENTS.md` §2: one concept, one place.

**Deploy the rules.** `MEMORY.md` §16 records how the published rules once sat
behind the client and bricked registration while the app blamed the network.
This round changes the rules file; it is not real until
`npx firebase-tools deploy --only database` has run and
`scripts/verify-rules.sh` prints *all checks passed*.

## 3. Store

**Added.** `voteOnApplication(applicantId: string, yes: boolean): Promise<boolean>`

Writes the one node and records an audit row (`boat.vote`, carrying the
harbour — `MEMORY.md` §27 records the round where an audit row without a
harbour made three boats answer to `#04`). It refuses, with the real reason in
a toast, when: no boat is held, the held boat's effective status is not
`active`, the applicant is the voter, or the applicant is not currently
asking. Resolves only once the shared copy has taken it, like every other
write in this store.

**Deleted.** `approveBoat`, `rejectBoat`, and the approvals queue in
`AdminScreen.tsx`. Not moved elsewhere — deleted. `AGENTS.md` §2 prefers
deleting to abstracting, and leaving a second route to admission would defeat
the point of the round.

**Kept.** `setBoatBlocked`. Blocking a boat that is overstaying is a different
power from deciding who joins, it is already audited, and the brief's
anti-hoarding requirement leans on it.

**Changed.** The booking gate at `useDockStore.ts:793` reads the derived
status rather than `me.status`. Same for the deposit and release gates noted
at `useDockStore.ts:607`.

## 4. The banner

Every active boat that has not yet voted sees, on every screen:

> **A new boat is asking to join** — 7 of 11 have said yes.

One tap goes to the Harbour tab. It is inside the sticky header, next to the
demo caveat — `MEMORY.md` §28 records what happened to a banner that was a
sibling of the header instead: on screen for 2% of the page and absent
exactly where the controls are.

**Only one banner shows, and the order is fixed:**

1. stale figures / no signal
2. demo mode
3. applications

A warning that the numbers on screen may be wrong always outranks an
invitation. Auditor B measured 157 px of sticky chrome at 320 px already; a
fourth line stacked on the other three is how the 320 px Telugu layout breaks.
Measure the header at 320 px in Telugu before and after.

The banner is suppressed for: the applicant, blocked boats, boats that have
voted, and any screen where no application is open.

## 5. The Harbour tab

`HarbourScreen.tsx:22` today filters pending boats out with the comment *"a
pending registration is between that skipper and the admin"*. There is no
admin. That comment and that filter both go.

Applications render **above** the crate rows, because an unanswered
application is the only thing on that screen that needs an action rather than
a glance. Each card carries:

- boat name and hull number, owner name, **and the applicant's mobile
  number**, with when they applied;
- the tally — *"7 of 11 boats have said yes"* — as text and as a filled
  progress bar, colour never alone (`AGENTS.md` §4);
- a 60 px **Yes** / **No** pair.

After you vote the pair is disabled and says which way you went. Never a dead
button (`AGENTS.md` §2).

**The mobile number is a deliberate exception.** `HarbourScreen.tsx:80` keeps
numbers out of the public roster and that rule stays for the roster. You
cannot vouch for a neighbour you cannot identify, so an *application* card
shows the number; an admitted boat's row does not. The comment must say this,
or a future round will "fix" it back.

The applicant's own screen (`App.tsx:258`) stops saying the harbour master
will approve them — no code path can produce that any more — and says
*"11 of 20 boats must say yes — 7 so far."* A declined applicant is told
plainly that the harbour said no, with the count. Declined applications
disappear from everyone else's list.

## 6. Seed data

The brief requires realistic data that works the moment it opens, and this
feature is invisible without a live application.

- Deepika **#21** at Nizampatnam: **10 of 11** yes votes already cast, by ten
  named boats. A judge's single tap admits her, on screen, with no admin
  console anywhere in the flow.
- Bhavani **#13** at Vizag: **3 of 7**, so the queue does not look staged.

Seeded votes must obey the app's own rules — `AGENTS.md` §6 records the round
where seeded occupancy exceeded the cap the app advertises. Ten distinct
active voters, none of them the applicant.

## 7. Tests

`src/store/rules.test.ts`, or a new `admission.test.ts` if that file is
already carrying too much:

1. Threshold arithmetic at 20, 12 and 11 active boats — off-by-one at exactly
   half, which is the failure this whole round rests on.
2. The denominator changing between votes: a boat at 10-of-11 that becomes
   10-of-12 when another application settles is still pending, asserted by
   identity.
3. One vote per boat; a second write from the same voter replaces rather than
   adds.
4. An applicant cannot vote for itself.
5. A blocked boat cannot vote and is not in the denominator.
6. A pending boat cannot vote.
7. The decline path: No past half yields `declined`, and a declined boat
   cannot book.
8. The booking gate: a pending applicant is refused with the not-approved
   reason, and the same boat books the moment the majority lands.
9. The seeded 10-of-11 case is exactly one vote from admitted.

**Mutation-check items 1, 2 and 7** — break the fix, watch the test fail,
restore. `AGENTS.md` §5.

## 8. Strings

Roughly ten new keys in `i18n/dictionary.ts`, both languages on one line. The
dead-key check stays at zero. Telugu plurals: `1 బోటు` not `1 బోట్లు` — the
same defect auditor B logged at `dictionary.ts:79/88/98` for crates.

## 9. Docs

- `README.md`: the judge script rewritten around this flow. That also closes
  auditor B's **C4** (it sends judges to a toggle round 17 removed) and **C5**
  (no step enters demo, so all seven steps run against the live harbour,
  including the one that clears every phone's crates).
- `TRADEOFFS.md`: the admin paragraph is now wrong. Replace it with the
  anti-monopoly argument. **The file is at 297 of 300 words** — something must
  be cut. Check with
  `sed '1,2d' TRADEOFFS.md | sed 's/\*\*//g' | wc -w`.
- `MEMORY.md` §2: re-measure. Auditor B's **C6** says it has been stale for
  four rounds — 104 tests where there are 115, a commit table stopping at
  `7812fff`, an entry-JS figure matching no basis, and a total that should be
  ~478 kB. Re-measure; do not nudge. `README.md:330` carries a different wrong
  figure for the same measurement.

## 10. Explicitly out of scope

Deferring these is the point, not an oversight. `MEMORY.md` §2 records that in
eighteen rounds out of eighteen the previous round's fixes wrote the next
round's defects, and that the one round which changed four things instead of
twenty is the one where the score rose a point and a half.

- **Round 20 — identity.** The full ten-digit mobile replaces the last-four
  check; a claim works in any browser on any phone rather than binding to one
  device; seed mobiles stop encoding the hull number (`boats.ts:19` —
  `#04` → `2004`, so the check is decorative in the demo);
  `TRADEOFFS.md` states that this is the OTP flow with the paid SMS step
  removed.
- **Round 21 — gauges before identity.** `App.tsx:255` shows a registration
  form to a first-time visitor before any capacity gauge, which fails the
  brief's *pre-populated for immediate testing* constraint and undercuts its
  first judging criterion.
- Auditor B's remaining list: the 320 px Telugu banner clip under `BookSheet`,
  the stale-figures banner that still scrolls away, `ModeSwitch` discarding a
  typed form, and the two-store storage budget in `adminAuth.ts`.

## 11. Definition of done

- `npm test`, `npx tsc -b`, `npx oxlint`, `npm run build` — all four green.
- Rules deployed; `scripts/verify-rules.sh` prints *all checks passed*.
- Verified in a browser at **320 px in Telugu**, not by reasoning: the banner
  visible at three scroll positions, the card legible, the chrome not
  overlapping the sheets, and a vote on one instance reaching a second
  instance with no reload.
- Verified with a **bound** boat, not an unbound one. `MEMORY.md` §3 records
  that "force-release verified" was worth nothing because every demo boat was
  unbound, which is the one case the rule permits.
- Two hostile auditors dispatched per `AGENTS.md` §5, given this document and
  the fix list, and told to falsify every claim in it.
