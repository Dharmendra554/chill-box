import { toHarbourTime } from './harbourSync'
import type { MarineReading } from '../types'


export type WaveBand = 'calm' | 'moderate' | 'rough'

export function waveBand(meters: number): WaveBand {
  if (meters < 1) return 'calm'
  if (meters <= 2) return 'moderate'
  return 'rough'
}

/** Open-Meteo Marine: free, keyless, and per-harbour. */
function url(lat: number, lon: number): string {
  return (
    'https://marine-api.open-meteo.com/v1/marine' +
    `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&current=wave_height&timezone=Asia%2FKolkata'
  )
}

export async function fetchWaveHeight(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<MarineReading> {
  const res = await fetch(url(lat, lon), { signal })
  if (!res.ok) throw new Error(`marine ${res.status}`)
  const data = (await res.json()) as {
    current?: { wave_height?: number; time?: string }
  }
  const waveHeight = data.current?.wave_height
  if (typeof waveHeight !== 'number' || Number.isNaN(waveHeight)) {
    throw new TypeError('marine missing wave_height')
  }

  /**
   * When the SEA was like this, in harbour time — not when we asked.
   *
   * Two separate lies were being told by `Date.now()` here.
   *
   * The service worker serves this route stale-while-revalidate for thirty
   * minutes, so a repeat visit resolves instantly from cache and this line
   * stamped a half-hour-old body as having just arrived. The 25-minute
   * staleness gate could therefore never fire against a cache hit, because
   * the cache hit reset the clock that gate measures. That affected every
   * phone, not only mis-clocked ones.
   *
   * And the device clock is the wrong clock: the age is computed against
   * `serverNow()`, so a phone forty minutes fast produced a negative age
   * that never expires, and one forty minutes slow declared every reading
   * stale the moment it landed. That is the same defect this app fixed for
   * `position.timestamp` one file away, in the same round.
   *
   * `current.time` is Open-Meteo's own instant for the reading, in the
   * timezone we asked for. Falling back to the fetch time is no worse than
   * before when the field is missing.
   *
   * `toHarbourTime` goes on the FALLBACK ONLY, and that distinction is the
   * whole of this line. It adds the device's clock error to convert a
   * device instant into harbour time — so applying it to `measured`, which
   * is already an absolute instant off the wire and owes nothing to this
   * phone's clock, re-injects exactly the error the round-12 fix removed.
   * A phone forty minutes slow then stamped a 4:00 reading as 4:40: the age
   * came out forty minutes short, the 25-minute gate could not fire until
   * the reading was 65 minutes old, and the strip printed a reading time in
   * the future. Third round for this class, second direction.
   */
  const measured = data.current?.time ? Date.parse(`${data.current.time}+05:30`) : Number.NaN
  return {
    waveHeight,
    fetchedAt: Number.isNaN(measured) ? toHarbourTime(Date.now()) : measured,
  }
}
