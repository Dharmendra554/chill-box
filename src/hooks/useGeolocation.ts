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
 * without ever calling the error handler, which would leave the UI claiming
 * it is "waiting for GPS" for the rest of the tide.
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

    const giveUp = window.setTimeout(() => {
      // Only if nothing has arrived; a later fix still promotes us to ready.
      setStatus((current) => (current === 'locating' ? 'unavailable' : current))
    }, FIRST_FIX_MS)

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

    return () => {
      window.clearTimeout(giveUp)
      navigator.geolocation.clearWatch(id)
    }
  }, [override, supported])

  if (override) return { fix: override, status: 'ready' }
  return { fix, status }
}
