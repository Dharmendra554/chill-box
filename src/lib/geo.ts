const EARTH_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Initial bearing from point 1 toward point 2, 0–360 clockwise from north. */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function cardinal(bearing: number, lang: 'te' | 'en'): string {
  const labelsEn = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
  const labelsTe = ['ఉ', 'ఈఉ', 'తూ', 'ఆతూ', 'ద', 'నైద', 'ప', 'వాయు'] as const
  const idx = Math.round(bearing / 45) % 8
  return lang === 'te' ? labelsTe[idx] : labelsEn[idx]
}

/** Destination from a start point given distance km and bearing deg. */
export function destinationPoint(
  lat: number,
  lon: number,
  distanceKm: number,
  bearing: number,
): { lat: number; lon: number } {
  const δ = distanceKm / EARTH_KM
  const θ = toRad(bearing)
  const φ1 = toRad(lat)
  const λ1 = toRad(lon)
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 }
}

/** A fix 8 km offshore of a harbour, for demonstrating the approach. */
export function simulateApproachFix(
  lat: number,
  lon: number,
  bearing: number,
): { lat: number; lon: number } {
  return destinationPoint(lat, lon, 8, bearing)
}
