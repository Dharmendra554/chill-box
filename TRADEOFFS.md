# Trade-offs and anti-hoarding logic

**Anti-hoarding.** Three pressures, no punishment. A **2-crate cap per boat**,
counted across all three boxes rather than per box, stops one haul taking a
whole chill-box. A **4-hour hold** expires by itself, so a boat that never
lands cannot park a slot. Past **6 hours** a crate flags as an overstay and
pulses amber harbour-wide with the boat number. No fine, no lockout: that only
pushes the next catch into open air. The cost is visibility — at deposit you
promise a collection hour, so others plan around real openings.

**Landmarks, not numbers.** Auction Hall, Ice Plant, Diesel Bunk: "box 2" must
be memorised, a building you can see need not. Booking starts on the chart —
which box can you reach on this swell — but every box is bookable by name too,
because GPS fails under a shed roof.

**No login.** Boat, owner, mobile; the admin approves. Claiming a boat needs
the last four digits of its number — those identify it, the device binding
protects it. Only those four reach the shared copy.

**One shared harbour, and what it costs.** Every phone reads and writes one
copy on a free Firebase tier. Each crate is claimed by a transaction on its own
slot, so the server settles races and the rules refuse a write to someone
else's crate: a boat belongs to the phone that claimed it. With no link we
refuse and say so, rather than show a hold nobody kept. What no rule can do
without a paid server: count the cap across boxes, or know who the admin is.
Both stay client-side, and we say so.


**Admin.** Only a salted PBKDF2 hash ships, with lockout and idle expiry. It is
a lock and a receipt, not enforcement. The hash-chained log catches accidents,
not a re-chainer.
