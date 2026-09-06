# Trade-offs and anti-hoarding logic

**Anti-hoarding.** Three pressures, no punishment. A **2-crate cap per boat**,
counted across all three boxes rather than per box, stops one haul taking a
whole chill-box. A **4-hour hold** expires by itself, so a boat that never
lands cannot park a slot. Past **6 hours** a crate flags as an overstay and
pulses amber harbour-wide with the boat number. No fine, no lockout: that only
pushes the next catch into open air. The cost is visibility — at deposit the
skipper promises a collection hour, so others plan around real openings.

**Landmarks, not numbers.** Auction Hall, Ice Plant, Diesel Bunk: "box 2" must
be memorised, a building you can see need not. Booking starts on the chart —
which box can you reach on this swell — but every box is equally bookable by
name, because GPS fails under a shed roof.

**No login.** Boat, owner, mobile; the admin approves. Claiming an
existing boat needs the last four digits of its number — not authentication,
but enough to stop casual impersonation. Only those four reach the shared copy.
Phones sign in anonymously, so a write carries an identity.

**One shared harbour, and what it costs.** Every phone reads and writes one
copy on a free Firebase tier, and booking runs in a transaction, so two boats
racing the last crate give exactly one winner. With no link we refuse the write
and say so, rather than show a hold nobody kept. But booking transacts over
the whole box node, so the rules cannot bind a slot to its boat: a signed-in
user could overwrite one. Per-slot writes fix that, free — the next build.

**Admin.** Only a salted PBKDF2 hash ships, with lockout and idle expiry.
Authorisation is client-side: a lock and a receipt, not enforcement. The
hash-chained log catches accidents, not a re-chainer.
