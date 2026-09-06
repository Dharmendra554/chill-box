# Trade-offs and anti-hoarding logic

**Anti-hoarding.** Three pressures, no punishment. A **2-crate cap per boat**,
counted across all three boxes rather than per box, stops one haul taking a
whole chill-box. A **4-hour hold** expires by itself, so a boat that never
lands cannot park a slot. Past **6 hours** a crate flags as an overstay and
pulses amber with the boat number harbour-wide. No fine, no lockout: that only
pushes the next catch into open air. The cost is visibility. At deposit the
skipper also promises a collection hour, so others plan around real openings.

**Landmarks, not numbers.** Boxes are named for where they stand — Auction
Hall, Ice Plant, Diesel Bunk. "Box 2" must be memorised; the ice plant is a
building you can see.

**Map first, never required.** Booking starts on the chart: the real question
is which box you can reach on this swell. But every box is equally bookable by
name, because GPS fails under a shed roof.

**No login.** Boat, owner, mobile; the admin approves once and the phone
remembers. Claiming an existing boat needs the last four digits of its number —
not authentication, but enough to stop casual impersonation on a shared phone.

**Client-only state, and what it costs.** No database, so it works offline —
right for patchy signal, but each phone holds its own copy and they never
merge. Two skippers on two phones can hold the same slot. We say so rather than
hide it: figures are dated from the last request that succeeded, and the
commit-time re-check protects one device only. A sync server is the next build.

**Admin.** Only a salted PBKDF2 hash ships, with lockout and idle expiry.
Authorisation runs client-side, so it is a lock and a receipt, not enforcement;
the hash-chained log catches accidents, not someone who re-chains it.
