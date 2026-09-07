export type Lang = 'te' | 'en'
export type Theme = 'day' | 'night'

export type SlotStatus = 'empty' | 'reserved' | 'occupied' | 'overstay'
export type BoxId = 'box1' | 'box2' | 'box3'
export type HarbourId = 'vizag' | 'kakinada' | 'nizampatnam'
export type BoatState = 'idle' | 'hold' | 'stored' | 'overstay'

/**
 * The three screens, all equal.
 *
 * `record` used to be `admin`: a PIN-gated console at the `#admin` URL, kept
 * off the tab bar so twenty skippers never saw a door they had no reason to
 * open. That was right while it held power. It holds none now — no approval,
 * no blocking, no force release — so what is left is the harbour's own
 * activity, and hiding a harbour's activity from the harbour is the opposite
 * of the point. See MEMORY.md §7, where the old rule and this reversal are
 * both recorded.
 */
export type Tab = 'dock' | 'harbour' | 'record'

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
  /**
   * There is no `status`, and that is the product.
   *
   * A boat used to be `pending` until someone with the admin PIN pressed
   * Approve, and could be set `blocked` from the same screen. Those two
   * controls were the only authority in an app whose brief opens with
   * "without a central harbour master" — and in a real village they are a
   * monopoly: whoever holds the PIN decides who may store fish.
   *
   * They are gone, not moved. A boat on the roster is a boat that may book,
   * from the second it registers. The 2-crate cap, the 4-hour hold and the
   * overstay clock do the policing, and every one of them is a rule rather
   * than a person.
   *
   * Deleting the field also closed the largest hole the database rules
   * document about themselves: with no admin identity, any signed-in phone
   * could write any boat's status — approving itself, or blocking all twenty
   * and stopping the harbour. There is now no such field to write.
   */
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
  /**
   * True when the harbour took this space back at the eight-hour line rather
   * than the boat collecting its catch.
   *
   * Recorded rather than derived, because the two cannot be told apart from
   * the timestamps: a skipper who collects eight hours and one minute after
   * depositing produces exactly the same row. The Harbour page says
   * "not collected" over these, naming the boat, and it must never say it
   * over someone who simply ran late and then turned up.
   *
   * Optional on read: rows written before the rule existed have no such
   * field, and a missing value means the same thing as `false`.
   */
  reclaimed?: boolean
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
