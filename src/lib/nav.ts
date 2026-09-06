import { bearingDeg, destinationPoint, haversineKm } from './geo'
import type { BoxId, GeoFix, Harbour } from '../types'

/** Cruising speed of a typical 9 m motorised fibre boat, km/h. */
export const CRUISE_KMH = 9

/** Inside this radius the boat is in the basin, not approaching it. */
const IN_BASIN_KM = 1.6

/** How far offshore the navigable channel entrance sits, km. */
const MOUTH_KM = 1.1

export interface NavFix {
  km: number
  bearing: number
  etaMinutes: number
}

export function navigateTo(fix: GeoFix, harbour: Harbour, boxId: BoxId): NavFix {
  const target = harbour.boxes[boxId]
  const km = haversineKm(fix.lat, fix.lon, target.lat, target.lon)
  return {
    km,
    bearing: bearingDeg(fix.lat, fix.lon, target.lat, target.lon),
    etaMinutes: Math.round((km / CRUISE_KMH) * 60),
  }
}

export function distanceToBox(fix: GeoFix, harbour: Harbour, boxId: BoxId): number {
  const target = harbour.boxes[boxId]
  return haversineKm(fix.lat, fix.lon, target.lat, target.lon)
}

export function harbourMouth(harbour: Harbour): { lat: number; lon: number } {
  return destinationPoint(harbour.lat, harbour.lon, MOUTH_KM, harbour.mouthBearing)
}

/**
 * A two-leg approach: open water to the channel entrance, then the entrance
 * to the box. Boats must not cut the sandbar, and a straight line on the
 * chart would tell them to.
 */
export function routeLegs(
  fix: GeoFix,
  harbour: Harbour,
  boxId: BoxId,
): Array<[number, number]> {
  const target = harbour.boxes[boxId]
  const legs: Array<[number, number]> = [[fix.lat, fix.lon]]
  if (haversineKm(fix.lat, fix.lon, harbour.lat, harbour.lon) > IN_BASIN_KM) {
    const mouth = harbourMouth(harbour)
    legs.push([mouth.lat, mouth.lon])
  }
  legs.push([target.lat, target.lon])
  return legs
}

export function formatKm(km: number, lang: 'te' | 'en'): string {
  if (km < 1) {
    const metres = Math.round(km * 1000)
    return lang === 'te' ? `${metres} మీ` : `${metres} m`
  }
  return `${km.toFixed(1)} km`
}

export function formatEta(minutes: number, lang: 'te' | 'en'): string {
  if (minutes < 1) return lang === 'te' ? 'ఇక్కడే' : 'Here'
  if (minutes < 60) return lang === 'te' ? `${minutes} ని` : `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return lang === 'te' ? `${h}గం ${m}ని` : `${h}h ${m}m`
}
