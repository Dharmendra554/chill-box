export const HOLD_MS = 4 * 60 * 60 * 1000
export const OVERSTAY_MS = 6 * 60 * 60 * 1000
export const HOUR_MS = 60 * 60 * 1000
export const MINUTE_MS = 60 * 1000
export const DAY_MS = 24 * HOUR_MS

const TZ = 'Asia/Kolkata'

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms)
  const h = Math.floor(clamped / HOUR_MS)
  const m = Math.floor((clamped % HOUR_MS) / MINUTE_MS)
  const s = Math.floor((clamped % MINUTE_MS) / 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

export function formatElapsed(ms: number, lang: 'te' | 'en'): string {
  const clamped = Math.max(0, ms)
  const h = Math.floor(clamped / HOUR_MS)
  const m = Math.floor((clamped % HOUR_MS) / MINUTE_MS)
  if (lang === 'te') return `${h}గం ${m}ని`
  return `${h}h ${m}m`
}

/** Signed gap: "in 2h 10m" / "2h 10m late". */
export function formatGap(ms: number, lang: 'te' | 'en'): string {
  const late = ms < 0
  const body = formatElapsed(Math.abs(ms), lang)
  if (lang === 'te') return late ? `${body} ఆలస్యం` : `${body}లో`
  return late ? `${body} late` : `in ${body}`
}

/** 12-hour wall clock. A dock reads "10:30 pm", never "22:30". */
export function formatClock(ts: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ts))
}

/**
 * Compact 12-hour time for the crate grid, e.g. `10:11p`.
 *
 * A slot cell is about 55 px wide on a small phone and "10:11 pm" clips in
 * it. A single-letter suffix keeps the am/pm distinction — 4 am and 4 pm are
 * very different tides — while fitting the cell.
 */
export function formatClockShort(ts: number): string {
  // `\s?`, not `\s*`. Intl emits exactly one separator — a narrow no-break
  // space on newer ICU, which `\s` covers — and an unbounded quantifier in
  // front of a literal backtracks over every whitespace run on a failed
  // match for nothing.
  return formatClock(ts).replace(/\s?([ap])m$/i, '$1')
}

export function formatDayClock(ts: number, lang: 'te' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'te' ? 'te-IN' : 'en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ts))
}

/** Midnight IST on the day containing `ts`. */
export function startOfLocalDay(ts: number): number {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ts))
  // IST is a fixed +05:30 offset with no daylight saving, so this is exact.
  return Date.parse(`${day}T00:00:00+05:30`)
}

/**
 * Built once, not per call.
 *
 * `monthKey` runs once per ledger row — 1 500 of them on the admin console —
 * and constructing an `Intl.DateTimeFormat` is the expensive half of it. A
 * fresh one per row cost 224 ms per pass on a desktop, several times that on
 * the target phone. The formatter is stateless, so one is enough.
 */
const MONTH_KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
})

/** `2026-09` in harbour local time — the bucket key for monthly reports. */
export function monthKey(ts: number): string {
  const parts = MONTH_KEY_FORMAT.formatToParts(new Date(ts))
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const m = parts.find((p) => p.type === 'month')?.value ?? '00'
  return `${y}-${m}`
}

export function monthLabel(key: string, lang: 'te' | 'en'): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return new Intl.DateTimeFormat(lang === 'te' ? 'te-IN' : 'en-IN', {
    timeZone: TZ,
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, 15)))
}
