import { HOUR_MS, monthKey } from './time'
import { SPECIES } from '../types'
import type { BoxId, HarbourId, LedgerEntry, Species } from '../types'

export interface MonthTotals {
  key: string
  trips: number
  crates: number
  crateHours: number
  overstays: number
  boats: number
}

export interface BoatUsage {
  boatId: string
  trips: number
  crates: number
  crateHours: number
  overstays: number
}

const EMPTY_BOX_SPLIT: Record<BoxId, number> = { box1: 0, box2: 0, box3: 0 }

function crateHours(e: LedgerEntry): number {
  return (e.crates * (e.releasedAt - e.depositedAt)) / HOUR_MS
}

/** Only this harbour's rows. Societies never see each other's figures. */
export function ledgerFor(ledger: LedgerEntry[], harbourId: HarbourId): LedgerEntry[] {
  return ledger.filter((e) => e.harbourId === harbourId)
}

/** Month buckets present in the ledger, newest first. */
export function monthKeys(ledger: LedgerEntry[]): string[] {
  const keys = new Set(ledger.map((e) => monthKey(e.releasedAt)))
  return [...keys].sort().reverse()
}

export function entriesForMonth(ledger: LedgerEntry[], key: string): LedgerEntry[] {
  return ledger.filter((e) => monthKey(e.releasedAt) === key)
}

export function monthTotals(ledger: LedgerEntry[], key: string): MonthTotals {
  const rows = entriesForMonth(ledger, key)
  return {
    key,
    trips: rows.length,
    crates: rows.reduce((n, e) => n + e.crates, 0),
    crateHours: Math.round(rows.reduce((n, e) => n + crateHours(e), 0)),
    overstays: rows.filter((e) => e.overstay).length,
    boats: new Set(rows.map((e) => e.boatId)).size,
  }
}

export function boxSplit(ledger: LedgerEntry[], key: string): Record<BoxId, number> {
  const split = { ...EMPTY_BOX_SPLIT }
  for (const e of entriesForMonth(ledger, key)) split[e.boxId] += e.crates
  return split
}

export function boatUsage(ledger: LedgerEntry[], key: string): BoatUsage[] {
  const map = new Map<string, BoatUsage>()
  for (const e of entriesForMonth(ledger, key)) {
    const row = map.get(e.boatId) ?? {
      boatId: e.boatId,
      trips: 0,
      crates: 0,
      crateHours: 0,
      overstays: 0,
    }
    row.trips += 1
    row.crates += e.crates
    row.crateHours += crateHours(e)
    if (e.overstay) row.overstays += 1
    map.set(e.boatId, row)
  }
  return [...map.values()]
    .map((r) => ({ ...r, crateHours: Math.round(r.crateHours) }))
    .sort((a, b) => b.crates - a.crates || a.boatId.localeCompare(b.boatId))
}

/** Crates per day for the month, padded so the bar chart has no gaps. */
export function dailyCrates(
  ledger: LedgerEntry[],
  key: string,
): Array<{ day: number; crates: number }> {
  const [y, m] = key.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const series = Array.from({ length: days }, (_, i) => ({ day: i + 1, crates: 0 }))
  for (const e of entriesForMonth(ledger, key)) {
    const d = Number(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
      }).format(new Date(e.releasedAt)),
    )
    const bucket = series[d - 1]
    if (bucket) bucket.crates += e.crates
  }
  return series
}

/** Crates per catch category, descending — what the harbour actually chills. */
export function speciesSplit(
  ledger: LedgerEntry[],
  key: string,
): Array<{ species: Species; crates: number }> {
  const totals = new Map<Species, number>(SPECIES.map((s) => [s, 0]))
  for (const e of entriesForMonth(ledger, key)) {
    if (e.species) totals.set(e.species, (totals.get(e.species) ?? 0) + e.crates)
  }
  return [...totals]
    .map(([species, crates]) => ({ species, crates }))
    .sort((a, b) => b.crates - a.crates)
}

/** Slots across the three boxes — the denominator for utilisation. */
const HARBOUR_CAPACITY = 30

function daysIn(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Days of the month that have actually happened. The current month is only
 * part-elapsed, and dividing its crate-hours by a full 31 days reported a
 * busy harbour as 6%% utilised.
 */
function daysElapsed(key: string, now: number): number {
  if (key !== monthKey(now)) return daysIn(key)
  const day = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(
      new Date(now),
    ),
  )
  return Math.max(1, day)
}

export interface MonthInsight {
  /** Share of the harbour's crate-hours actually used, 0–100. */
  utilisation: number
  /** Mean hours a crate sat in a box. */
  dwellHours: number
  /** Share of trips that ran past the 6 h line, 0–100. */
  overstayRate: number
  /** Crate change against the previous month, in per cent, or null. */
  cratesDelta: number | null
  /** Busiest deposit hour, 0–23, or null when the month is empty. */
  peakHour: number | null
}

/**
 * The four numbers a harbour master can act on: how full the boxes really
 * run, how long a crate sits, how often the 6 h rule is broken, and whether
 * demand is rising. Totals alone say what happened; these say what to do.
 */
export function monthInsight(
  ledger: LedgerEntry[],
  key: string,
  previousKey?: string,
  now: number = Date.now(),
): MonthInsight {
  const rows = entriesForMonth(ledger, key)
  const totals = monthTotals(ledger, key)
  const capacityHours = HARBOUR_CAPACITY * 24 * daysElapsed(key, now)
  const hours = hourHistogram(ledger, key)
  const busiest = hours.reduce((best, n, i) => (n > hours[best] ? i : best), 0)

  // Only compare complete months. Six days of September against all of
  // August reads as a -83% collapse and means nothing.
  const complete = key !== monthKey(now)
  const previous = previousKey && complete ? monthTotals(ledger, previousKey) : null
  const cratesDelta =
    previous && previous.crates > 0
      ? Math.round(((totals.crates - previous.crates) / previous.crates) * 100)
      : null

  return {
    utilisation: Math.round((totals.crateHours / capacityHours) * 100),
    dwellHours: rows.length ? Number((totals.crateHours / totals.crates).toFixed(1)) : 0,
    overstayRate: rows.length ? Math.round((totals.overstays / rows.length) * 100) : 0,
    cratesDelta,
    peakHour: rows.length ? busiest : null,
  }
}

/**
 * Deposits per hour of the day. This is the one chart that changes rosters:
 * it shows when boats actually land, so the society knows when the boxes
 * need someone standing at them.
 */
export function hourHistogram(ledger: LedgerEntry[], key: string): number[] {
  const hours = new Array<number>(24).fill(0)
  for (const e of entriesForMonth(ledger, key)) {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        hour12: false,
      }).format(new Date(e.depositedAt)),
    )
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) hours[hour] += 1
  }
  return hours
}

/** "3 pm" for an hour index — the dock does not read 24-hour time. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${suffix}`
}
