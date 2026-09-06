import { useEffect, useState } from 'react'
import { fetchWaveHeight } from '../lib/marine'
import type { MarineReading } from '../types'

/** Refresh interval for the swell reading. */
const EVERY_MS = 10 * 60 * 1000

interface Cached {
  lat: number
  lon: number
  reading: MarineReading | null
  error: boolean
}

const EMPTY: Cached = { lat: NaN, lon: NaN, reading: null, error: false }

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

    const load = (signal?: AbortSignal) =>
      fetchWaveHeight(lat, lon, signal)
        .then((reading) => setCache({ lat, lon, reading, error: false }))
        .catch(() => {
          if (!ac.signal.aborted) {
            setCache((prev) => ({ ...prev, lat, lon, error: true }))
          }
        })

    void load(ac.signal)
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
