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
    current?: { wave_height?: number }
  }
  const waveHeight = data.current?.wave_height
  if (typeof waveHeight !== 'number' || Number.isNaN(waveHeight)) {
    throw new Error('marine missing wave_height')
  }
  return { waveHeight, fetchedAt: Date.now() }
}
