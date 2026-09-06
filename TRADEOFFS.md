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

**Map first, never required.** Booking starts on the chart, because the real
question is which box you can reach on this swell. But every box is equally
bookable by name: GPS fails under a shed roof, and a booking flow needing a fix
is one that fails.

**No login.** Boat, owner, mobile; the admin approves once and the phone
remembers. A password on a shared dock phone ends up painted on the hull.

**Client-only state.** No database, so it works offline — the right trade for
patchy signal, and why capacity is eventually consistent between phones. We
never trust `navigator.onLine`: figures are dated from the last request that
succeeded, and booking re-checks capacity at commit, so a race is
refused, not double-sold.

**Admin.** Only a salted PBKDF2 hash ships, with lockout, idle expiry and a
hash-chained audit log. Authorisation still runs client-side, so it is a lock
and a receipt, not enforcement. Export is CSV; Excel opens it.

**Sunlight and salt.** Near-white ground, black ink, 60 px targets, drawn
icons over emoji, am/pm clocks, two taps for anything irreversible.
