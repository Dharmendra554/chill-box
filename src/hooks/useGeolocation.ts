import { useEffect, useState } from 'react'
import type { GeoFix } from '../types'

/**
 * `locating` — asked, nothing back yet. `ready` — we have a fix.
 * `unavailable` — no fix is coming, whatever the reason.
 */
export type GeoStatus = 'locating' | 'ready' | 'unavailable'

/** How long to wait for a first fix before saying so out loud. */
const FIRST_FIX_MS = 12_000

/**
 * A continuous GPS fix, or an honest admission that there is none.
 *
 * A skipper does not know, and should not have to know, whether location is
 * switched on, whether they granted permission months ago, or whether the
 * shed roof is blocking the sky. So we collapse every failure — no sensor,
 * permission denied, hardware error, and the commonest one of all, *asked
 * and nothing ever arrives* — into a single `unavailable`, and the screen
 * responds to that on its own.
 *
 * The timeout matters: `watchPosition` can sit silently forever indoors
 * without ever calling the error handler, which would leave the screen
 * saying "still working out where you are" for the rest of the tide. It is
 * the PLATFORM's timeout, not a timer of ours, because the spec stops that
 * clock while the permission dialog is open — and a skipper who takes
 * twenty seconds to read an English system prompt must not be told in the
 * meantime that his phone cannot find him.
 *
 * `status` is consumed by `SafetyCard`, which is the reason it exists: on
 * the screen for a boat in trouble, "no position yet" and "no position
 * ever" need different words. It was computed and read by nothing for
 * several rounds, and the card said the first one for ever.
 *
 * Nothing in the app blocks on this hook: booking works with no fix at all.
 */
export function useGeolocation(override: GeoFix | null): {
  fix: GeoFix | null
  status: GeoStatus
} {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [status, setStatus] = useState<GeoStatus>(supported ? 'locating' : 'unavailable')

  useEffect(() => {
    if (override || !supported) return

    // No wall-clock give-up timer. The platform's own `timeout` below is the
    // right signal precisely because the spec excludes time spent waiting
    // for the user's permission answer — a plain setTimeout does not, so a
    // skipper reading an English system dialog for more than twelve seconds
    // was told, on the distress panel, that his phone could not find him.
    // That is a definite false statement about the hardware while the
    // hardware is fine, on the one screen that exists for a boat in trouble.
    // Staying in `locating` until the platform says otherwise is true.
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setFix({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          at: position.timestamp,
        })
        setStatus('ready')
      },
      () => setStatus('unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: FIRST_FIX_MS },
    )

    return () => navigator.geolocation.clearWatch(id)
  }, [override, supported])

  if (override) return { fix: override, status: 'ready' }
  return { fix, status }
}
