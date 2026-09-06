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
    throw new Error('marine missing wave_height')
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
   */
  const measured = data.current?.time ? Date.parse(`${data.current.time}+05:30`) : NaN
  return {
    waveHeight,
    fetchedAt: toHarbourTime(Number.isNaN(measured) ? Date.now() : measured),
  }
}
