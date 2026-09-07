export type Lang = 'te' | 'en'
export type Theme = 'day' | 'night'

export type SlotStatus = 'empty' | 'reserved' | 'occupied' | 'overstay'
export type BoxId = 'box1' | 'box2' | 'box3'
export type HarbourId = 'vizag' | 'kakinada' | 'nizampatnam'
export type BoatState = 'idle' | 'hold' | 'stored' | 'overstay'

/** A boat is unusable until the harbour admin approves the registration. */
export type BoatStatus = 'pending' | 'active' | 'blocked'

/** Admin is reachable only via the #admin URL, never from the tab bar. */
export type Tab = 'dock' | 'harbour' | 'admin'

export interface Slot {
  index: number
  status: SlotStatus
  boatId: string | null
  reservedAt: number | null
  depositedAt: number | null
  /** What is in the crate, tagged by icon at deposit time. */
  species: Species | null
  /** Collection time the boat committed to, so others can plan around it. */
  plannedOutAt: number | null
}

export interface ColdBox {
  id: BoxId
  slots: Slot[]
}

export interface Boat {
  id: string
  /** A boat belongs to exactly one harbour co-operative. */
  harbourId: HarbourId
  nameEn: string
  nameTe: string
  owner: string
  mobile: string
  status: BoatStatus
  registeredAt: number
}

/** One completed storage cycle. The only source for monthly reporting. */
export interface LedgerEntry {
  id: string
  harbourId: HarbourId
  boatId: string
  boxId: BoxId
  crates: number
  depositedAt: number
  releasedAt: number
  species: Species | null
  overstay: boolean
}

export interface GeoFix {
  lat: number
  lon: number
  accuracy: number
  /** When the sensor produced this fix — NOT when it was read. */
  at: number
}

export interface MarineReading {
  waveHeight: number
  /** When the SEA was measured, in harbour time — Open-Meteo's own instant. */
  fetchedAt: number
}

export type ToastTone = 'error' | 'warn' | 'ok'

export interface ToastMessage {
  id: number
  tone: ToastTone
  text: string
}

export interface BoxSite {
  id: BoxId
  lat: number
  lon: number
}

export interface Landmark {
  /** i18n key for the landmark's name. */
  key: string
  lat: number
  lon: number
}

/**
 * A harbour is one co-operative society, its own boat roster, its own three
 * chill-boxes and its own shore landmarks. Nothing crosses between them.
 */
export interface Harbour {
  id: HarbourId
  nameEn: string
  nameTe: string
  unionEn: string
  unionTe: string
  /** Basin centre, used to frame the chart before any GPS fix. */
  lat: number
  lon: number
  /** Bearing of the navigable channel entrance from the basin, degrees. */
  mouthBearing: number
  boxes: Record<BoxId, BoxSite>
  landmarks: Landmark[]
  /** Harbour office landline shown on the safety card. */
  office: string
}

/**
 * Catch categories offered by the tagging grid. `mixed` is the default so
 * a skipper in a hurry never has to make a decision to finish a booking.
 */
export const SPECIES = ['prawn', 'crab', 'sardine', 'mackerel', 'pomfret', 'mixed'] as const
export type Species = (typeof SPECIES)[number]

/**
 * One admin action, chained to the previous entry by `prevHash` so that
 * editing or deleting history is detectable. See `lib/adminAuth.ts`.
 */
export interface AuditEntry {
  id: string
  at: number
  actor: string
  action: string
  target: string
  detail: string
  prevHash: string
  hash: string
}
