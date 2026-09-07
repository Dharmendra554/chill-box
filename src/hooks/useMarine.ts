import { useEffect, useState } from 'react'
import { fetchWaveHeight } from '../lib/marine'
import type { MarineReading } from '../types'

/** Refresh interval for the swell reading. */
const EVERY_MS = 10 * 60 * 1000

/**
 * Older than this and the reading is not a current sea state any more.
 *
 * Freshness used to rest entirely on the interval above, and Android freezes
 * timers in a backgrounded tab. Pocket the phone in calm water at 02:00 and
 * reopen it on the approach at 04:00, and the strip still painted a green
 * "Safe landing" off a two-hour-old figure with no date on it.
 *
 * Forty minutes, and the number is derived rather than chosen. It is now
 * measured from when the SEA was measured, not from when we asked, and two
 * lags sit under that instant before the app has done anything:
 *
 *   • Open-Meteo buckets `current.time` to its own 15-minute step
 *     (`interval: 900` on the wire), so a brand-new reading is 0–15 minutes
 *     old on arrival;
 *   • the poll runs every 10 minutes.
 *
 * 15 + 10 leaves 15 minutes of slack for a missed cycle. At 25 minutes the
 * budget was entirely consumed by the two lags, so once per cycle a phone on
 * full bars, having missed nothing, watched the strip fall back to "Nothing
 * current" and the landing-safety card — the one screen that exists for a
 * boat in trouble — say it could not tell you about the sea.
 *
 * A `rough` band is exempt from this gate anyway (see App): warning about
 * breakers that may have passed is the safe direction. What this bounds is
 * how old a CALM reading may be before we stop calling it calm.
 */
export const MARINE_STALE_MS = 40 * 60 * 1000

interface Cached {
  lat: number
  lon: number
  reading: MarineReading | null
  error: boolean
}

const EMPTY: Cached = { lat: Number.NaN, lon: Number.NaN, reading: null, error: false }

/**
 * Swell at one harbour, from Open-Meteo Marine.
 *
 * The reading is stored together with the coordinates it came from, and
 * discarded during render when they no longer match. That is deliberate:
 * clearing it from an effect would briefly show one harbour's swell under
 * another harbour's name, which is exactly the class of wrong-but-confident
 * information this app is built to avoid.
 *
 * Failure is expected on this coast, so the hook reports `error` and keeps
 * the last good reading rather than blanking the strip.
 */
export function useMarine(
  lat: number,
  lon: number,
): { reading: MarineReading | null; error: boolean } {
  const [cache, setCache] = useState<Cached>(EMPTY)

  useEffect(() => {
    const ac = new AbortController()

    // Every fetch carries the SAME signal, including the interval's. Without
    // it, a request started at harbour A that resolved after the switch to B
    // wrote A's reading back under A's coordinates — the render guard then
    // correctly refused to show it, so nothing wrong appeared, but B's sea
    // state vanished until the next ten-minute tick. If B's was rough, the
    // red breakers card and its three landing steps went with it.
    const load = () =>
      fetchWaveHeight(lat, lon, ac.signal)
        .then((reading) => {
          if (!ac.signal.aborted) setCache({ lat, lon, reading, error: false })
        })
        .catch(() => {
          if (ac.signal.aborted) return
          // KEEP the last reading only if it came from HERE. `{...prev, lat,
          // lon}` re-stamped another harbour's swell with these coordinates,
          // which is precisely what the render-time guard below exists to
          // catch — and it satisfied it. Change harbour, let one fetch fail
          // on 2G, and Nizampatnam's 2.6 m rendered under Kakinada's name,
          // with the full red rough-breakers landing card beneath it,
          // describing a sea 200 km away.
          setCache((prev) =>
            prev.lat === lat && prev.lon === lon
              ? { ...prev, error: true }
              : { lat, lon, reading: null, error: true },
          )
        })

    void load()
    const id = window.setInterval(() => void load(), EVERY_MS)

    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [lat, lon])

  // Never hand back a reading taken somewhere else.
  const current = cache.lat === lat && cache.lon === lon
  return {
    reading: current ? cache.reading : null,
    error: current ? cache.error : false,
  }
}
