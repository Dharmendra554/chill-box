# Chill-Box, explained for someone who does not write software

This is a plain-language tour of the project. No code, no jargon that is not
explained on the spot. It answers two questions about everything in here:
**what is it**, and **why does it exist**.

---

## 1. The problem in one paragraph

On the Andhra Pradesh coast, small fishing boats land their catch and need to
get it cold fast, or it spoils. A village harbour has a handful of
solar-powered cold-boxes — think of a big insulated chest with numbered slots
for crates of fish — and far more boats than slots. There is **no harbour
master**: nobody sits at the dock deciding who gets space. Phone signal is
patchy. A skipper who ties up at 4 a.m. with a week's income in the hold needs
one question answered in one glance: **is there room, and where?**

Chill-Box is a phone app that answers that question and lets the skipper claim
a slot.

The concrete setup it models: **twenty boats, three cold-boxes, ten crate
slots each.**

---

## 2. What the app actually is

It is a **website that behaves like an app**. You open a link in the phone's
browser; you can also "install" it to the home screen, after which it opens
like any other app and works even with no signal. There is nothing to download
from an app store.

There is **no login, no password, no sign-up**. You open it and immediately see
the three cold-boxes and how full they are. To book a slot you tell the app
which boat you are — pick the boat from a list and type the last four digits of
the mobile number the fishermen's society has on file for it.

Three screens, and that is the entire app:

| Screen | What you do there |
| --- | --- |
| **Book** | See the three boxes and how full each one is. Tap one to reserve a slot. Also holds emergency phone numbers. |
| **Harbour** | See what is going on across the whole harbour — every crate, whose it is, when it frees up, new boats asking for space. |
| **Record** | The harbour's history and statistics. How busy the boxes are, how long fish sits, who did what. Open to everyone, no password. |

---

## 3. The rules of the harbour, and why each one exists

The app has no boss, so it runs on rules that apply to everyone identically.

- **2 crates per boat, counted across all three boxes.** Stops one big catch
  from swallowing an entire cold-box.
- **A reservation expires after 4 hours.** If you book a slot and never turn
  up, it quietly frees itself. Otherwise a boat that never lands could park a
  slot forever.
- **After 6 hours in the box, the crate turns amber** and is flagged
  harbour-wide with the boat's number. Everyone can see who is holding things
  up. Social pressure, not a penalty.
- **After 8 hours, the harbour takes the slot back** so somebody else can book
  it. The board keeps naming the boat under "Not collected" for 24 hours.
- **When you deposit a crate you name the hour you will collect it**, so other
  boats can plan around a real opening instead of guessing.

Two deliberate choices inside those rules:

**No fines and no lockouts.** Punishing a boat just pushes the next catch into
the open air, which is worse for everyone. The pressure escalates in
visibility, not in penalty.

**The app never claims the fish left the box.** At eight hours it frees the
*slot for booking*, and it says plainly, on the harbour screen and on the box
itself, that the space was reclaimed and whose catch may still physically be
inside. Silently freeing it would be the app lying about capacity — the one
thing it exists to prevent.

---

## 4. "Nobody is in charge" — the central design decision

The natural way to build this is an admin: someone with a password who
approves new boats, blocks bad actors and clears stuck crates.

**That was built, and then deleted on purpose.** In a village of twenty
families, a password that decides who may store fish is a monopoly, and it puts
a person between a skipper at 4 a.m. and a crate for his catch. The brief for
the project says explicitly there is no central harbour master, so inventing
one would be solving a different problem.

So in this app **nobody can**: approve or refuse a boat, block a boat, take
another boat's crate, reset the harbour, edit history, or hide anything from
anyone. Those features do not exist — not hidden behind a PIN, deleted, along
with the database permissions that used to allow them.

There was a second, harder reason. The app has no server of its own (a server
costs money and the brief forbids paid services), so all the decision-making
happens on the phones. That means: **whatever the app is allowed to write to
the shared database, any determined person can write.** With no admin identity
to check against, there was no way to write a rule saying "only the admin may
block a boat" — anyone could have set all twenty boats to "blocked" and stopped
the whole harbour. Deleting the feature is what closed that hole. The general
lesson, and it is the most interesting thing in the project: **a security hole
an app like this cannot close is usually a feature it should not have.**

**What replaces authority:** rules that run themselves on a clock, everything
visible to everyone with no password, and — for the one genuinely collective
decision — a vouch.

---

## 5. When a stranger turns up: the vouch

A boat nobody knows registers. What should happen?

**It can book immediately, with one crate instead of two.** Once more than half
the harbour has "backed" it, it gets the full two.

- A vouch can only ever *raise* an allowance. There is no "no" button.
- Nobody can be blocked or reduced. The worst that can happen is that people
  back a boat they should not have.
- The tally is public and every backer is named.
- One boat, one vouch — enforced by the database, not just by the screen.

The first version of this had the harbour **vote a boat in**: no booking at all
until a majority admits you. It was designed, written down, and thrown away
before it was built, because it is the same harbour master with eleven hands on
it instead of one — and a fisherman standing at a cold-box at 4 a.m. cannot
wait for eleven neighbours to wake up.

So the vote never decides *whether* you may use the boxes. It decides *how
much* of a shared space a stranger may take before the neighbours have said
they know him. That is a question that is only dangerous to get wrong in one
direction.

---

## 6. Why "last four digits" instead of a real login

The login the team wanted is the one every Indian bank and ration shop uses:
type your mobile number, get a code by SMS, done. No password to forget,
nothing to install, and fishermen already understand it.

**It could not be built** — every SMS service charges per message, and the
brief bans paid services. A Google sign-in was never an alternative either:
many skippers have no Gmail, and an email-and-password screen is exactly the
wall that keeps this crowd off an app.

So the app ships **the same flow with the paid step removed**: pick your boat,
type the last four digits of its registered number, and the phone checks them
locally. Nothing is sent anywhere.

This is honestly weaker, and the project says so out loud: anyone who knows a
boat's number can claim that boat. What partly protects a crate is the second
step — **the first phone to claim a boat is bound to it**, and from then on the
shared database refuses any other phone's attempt to move that boat's crates.
Those four digits *identify* a boat; they do not *authenticate* one. A real
deployment adds the SMS step and changes nothing else.

---

## 7. Designed for a wet dock, not a desk

Every visual choice here is a response to a physical condition:

- **Telugu is the default language**, not a translation buried in settings.
  English is one tap away.
- **Sunlight:** warm near-white background, near-black text, thick 3-pixel
  borders. In direct sun, colour fills and shadows wash out; a heavy border
  survives.
- **Gloves and wet hands:** every main button is 60–72 pixels tall — roughly a
  fingertip and a half.
- **No status is ever colour alone.** Each one also has a shape and a word, so
  it reads in glare and works for colour-blind users: an empty slot is a dot in
  a dashed outline, a reservation carries a clock, a stored crate shows what is
  in it, an overdue one carries an exclamation mark.
- **Boxes are named after landmarks** — the Auction Hall box, the Ice Plant
  box, the Diesel Bunk box — because "Box 2" has to be memorised and a building
  you can see does not.
- **12-hour clocks.** A dock does not read "22:30".
- **A spoken readout** at the top of every screen, always in Telugu whatever
  the screen language, for people who cannot read either one. It says first if
  the numbers are out of date.
- **Hand-drawn icons, never emoji**, because emoji look different on every
  Android phone and cannot be recoloured for contrast.
- **A night theme** for pre-dawn landings.
- **A safety card on the main screen**, never behind a menu: coast guard 1554,
  emergency 112, ambulance 108, disaster control 1077, and the harbour office —
  all one tap to dial, downloadable as a contact so the numbers survive outside
  the app. When the sea is rough it leads with what to do before who to call.

---

## 8. Bad signal, which is the normal case

The app never asks "do you have signal?" — it works it out, and it never lies
about what it knows.

| Situation | What the app does |
| --- | --- |
| Phone claims it is online but nothing loads | It does not trust the phone. Only data actually arriving counts as connected. |
| Nothing has arrived for 20 seconds | A banner at the top says how old the numbers are. Bookings are refused with the real reason. |
| A booking is taking too long | After 12 seconds you are told *we do not know yet, check at the box* — never "failed", because the booking may still land and trying again could double-book you. |
| Signal dies mid-booking | The booking stays open until it is settled. No receipt appears for a crate you do not hold. |
| Opened with no signal at all | It opens anyway, showing last night's figures with their age stamped on them. |
| No GPS | Distance, route and compass simply do not appear. **Booking never needs your position** — a phone under a shed roof has no sky. |
| Two boats want the last slot at once | Settled by the shared database, not by whichever screen drew first. One wins; the other is told another boat took it just now. |
| The phone's clock is wrong | Deadlines run on harbour time, so a wrong clock never fakes an expiry. |
| The app crashes | An error screen with a reset that keeps your history intact. |

There is also a **Demo mode**: a coloured bar at the top always tells you
whether you are in the real shared harbour (green — everyone sees what you do)
or a private copy on your phone only (blue). One button switches.

---

## 9. What is in the folders

For orientation, not for editing:

- **`src/components/`** — the screens and the pieces on them: the box cards,
  the booking sheet, the map, the harbour list, the record screen.
- **`src/store/`** — the harbour's brain. All the rules live here: what is
  full, what has expired, who may book. Kept separate on purpose so the rules
  can be tested without a browser. *The screens draw; they never decide.*
- **`src/lib/`** — the plumbing: talking to the shared database, distances and
  bearings, time handling, statistics, the spoken readout, downloads.
- **`src/i18n/dictionary.ts`** — every word the user ever sees, Telugu and
  English side by side on one line, so a translation cannot silently go
  missing.
- **`src/data/`** — the boat rosters and the real map positions of the three
  harbours. A real deployment replaces this one file with the societies' own
  positions; nothing else in the app knows where anything is.
- **`firebase/database.rules.json`** — the permissions on the shared database:
  anyone may read (the boxes are public information, that is the point), and a
  crate can only be moved by the phone that holds the boat.
- **files ending `.test.ts`** — 132 automated checks that re-run the rules
  after every change.
- **`README.md`** — the developer-facing version of this document.
- **`MEMORY.md`** — the project's own long diary of decisions and mistakes.

**Free tools only.** Firebase's free tier stores the shared harbour; GitHub
publishes the site at no cost. No paid service anywhere, which was a hard
requirement.

---

## 10. How it was checked, and what it admits

After every substantial change, two reviewers were pointed at the code and told
to prove it wrong — a polite review counted as a failed review. Twenty rounds.
**Every round found real defects even when all the automated checks were
green**, and in nineteen of the twenty, the previous round's *fixes* caused the
next round's problems.

The clearest example: a reviewer proved that the eight-hour reclaim — which had
been clicked through in a browser and declared working — **actually freed
nothing**. One line was in the wrong place, and the manual check had happened
to land on the single case where it worked anyway.

The project is equally direct about what it cannot do:

- **It is not enforcement.** With no server, the rules run on the phones. The
  database checks the *shape* of the data and who owns a crate; it is not
  harbour policy.
- **The 2-crate cap is counted on the phone**, because no database rule can
  count one boat's crates across three boxes.
- **Anyone who knows a boat's number can claim it**, and nothing stops one
  person registering two boats to get two allowances. The defences are the cap,
  the public board, and twenty people who know each other.
- **The history log is a receipt, not proof.** It catches accidental damage and
  a casual edit; a determined tamperer could still rewrite it.
- **Binding a boat to a phone cannot be undone.** That is what makes crate
  ownership enforceable, and it means someone who loses their phone cannot sign
  in as that boat again. There is no override — deliberately, since a rule
  anyone could override is not a rule. In practice the society would retire the
  hull number and issue a new one.
- **A crate the harbour has given up on can be cleared by anyone.** That is how
  a space is reclaimed with no admin. It is a community rule, not an oversight.

---

## 11. The one-paragraph version

Twenty boats share three solar cold-boxes with no harbour master and no
reliable signal. Chill-Box shows, in one glance, whether there is room and
where, and lets a skipper claim a slot without an account, a password, or
anyone's permission. Fairness comes from rules that run on a clock — two crates
a boat, a four-hour hold, an eight-hour reclaim — and from making everything
visible to everyone rather than from putting somebody in charge. Every
authority feature that was built got deleted, because in a village of twenty
families the person holding the password is the problem, and because an app
with no server of its own cannot honestly enforce one anyway.
