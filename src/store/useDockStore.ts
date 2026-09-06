import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  isValidMobile,
  nextBoatId,
  normaliseMobile,
  seedBoats,
  seedPending,
} from '../data/boats'
import { DEFAULT_HARBOUR_ID, harbour } from '../data/harbours'
import { seedAllBoxes, seedAllLedgers } from '../data/mock'
import { t } from '../i18n/dictionary'
import { ADMIN_IDLE_MS, appendAudit, lockoutMs, verifyPin, type PinResult } from '../lib/adminAuth'
import {
  cancelRemote,
  claimBoat,
  claimForThisDevice,
  depositRemote,
  putBoat,
  releaseRemote,
  reserveRemote,
  resetRemoteBoxes,
  seedHarbour,
  serverNow,
  syncEnabled,
  watchConnection,
  watchHarbour,
  watchRoster,
  type RemoteResult,
} from '../lib/harbourSync'
import { HOUR_MS } from '../lib/time'
import type {
  AuditEntry,
  Boat,
  BoxId,
  ColdBox,
  Harbour,
  HarbourId,
  Lang,
  LedgerEntry,
  Species,
  Tab,
  Theme,
  ToastMessage,
  ToastTone,
} from '../types'
import {
  activeBoxId,
  applyTick,
  emptyCount,
  emptySlot,
  isOverdue,
  LEDGER_LIMIT,
  QUOTA,
  remainingQuota,
  slotsForBoat,
} from './selectors'

const STORAGE_KEY = 'ap-chill-box'
const STORAGE_VERSION = 4

/**
 * Storage that cannot hurt us. Two hazards, both real on a dock phone.
 *
 * 1. `localStorage` THROWS in private mode and when the quota is full.
 *    Persistence is a convenience, never a dependency — but a failed write
 *    must be *announced*, because silently losing a booking is worse than
 *    erroring. `setStorageErrorHandler` is how the UI hears about it.
 *
 * 2. zustand's persist middleware serialises the WHOLE store on every
 *    `set`, not just on the disk write. Two things keep that off the hot
 *    path: the clock lives outside this store entirely (hooks/useClock.ts),
 *    so a quiet second causes no `set` at all; and the write itself is
 *    coalesced, then flushed on the events that mean "there may be no
 *    later". Throttling only the write was not enough — the expensive half
 *    runs before it.
 */

/** Coalesce persist writes to at most one per this interval. */
const WRITE_EVERY_MS = 5_000

/** Refresh the admin's idle timer at most this often. See touchAdmin. */
const TOUCH_EVERY_MS = 10_000

/**
 * The ledger only grows and the persisted store shares a ~5 MB quota, so it
 * has to be bounded — PER HARBOUR, not overall. The rows arrive grouped by
 * harbour, so a global `slice(-N)` silently deleted the FIRST harbour's
 * entire history, and its admin console then reported, with a straight face,
 * that the harbour had never stored a crate. `LEDGER_LIMIT` lives in
 * selectors, shared with the feed that follows it.
 */

/**
 * How long to wait before resubscribing after the harbour listener dies.
 *
 * Long enough not to hammer a database that is refusing us, short enough that
 * a skipper who walked back into signal is not left staring at a booking
 * screen that refuses everything.
 */
const RESUBSCRIBE_MS = 10_000

function capLedger(rows: LedgerEntry[]): LedgerEntry[] {
  const kept = new Map<HarbourId, LedgerEntry[]>()
  for (const row of rows) {
    const list = kept.get(row.harbourId) ?? []
    list.push(row)
    kept.set(row.harbourId, list)
  }
  return [...kept.values()].flatMap((list) =>
    list.length > LEDGER_LIMIT
      ? [...list].sort((a, b) => a.releasedAt - b.releasedAt).slice(-LEDGER_LIMIT)
      : list,
  )
}

let pendingWrite: { key: string; value: string } | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let onStorageError: (() => void) | null = null

/** Let the app show a warning when the disk refuses a write. */
export function setStorageErrorHandler(fn: () => void): void {
  onStorageError = fn
}

let storageFailed = false

/** Set by `resetStorage`, so nothing can write the store back afterwards. */
let wiped = false

function commitWrite(): void {
  writeTimer = null
  if (wiped) return
  const write = pendingWrite
  pendingWrite = null
  if (!write) return
  try {
    localStorage.setItem(write.key, write.value)
    storageFailed = false
  } catch {
    // Report the first failure only. Telling the user costs a state
    // change, which schedules another doomed write — an unlatched handler
    // here spams a toast every 5 s for the rest of the session.
    if (!storageFailed) {
      storageFailed = true
      onStorageError?.()
    }
  }
}

/** Write immediately — for `pagehide`, where there is no next timer tick. */
export function flushStorage(): void {
  if (writeTimer !== null) {
    clearTimeout(writeTimer)
    commitWrite()
  }
}

/**
 * Wipe the persisted store and stop this page ever writing it again.
 *
 * The escape hatch on the crash screen. `localStorage.clear()` followed by a
 * reload does NOT reset this app — AGENTS.md §6 has said so for four rounds
 * — because the clock keeps ticking after React unmounts, the next `set()`
 * queues a write, and the old page puts everything back before the new one
 * loads. Latching the writer shut is what makes the clear stick.
 */
export function resetStorage(): void {
  wiped = true
  if (writeTimer !== null) clearTimeout(writeTimer)
  writeTimer = null
  pendingWrite = null
  try {
    localStorage.clear()
  } catch {
    /* nothing left to do; the reload is still worth attempting */
  }
}

const safeStorage: Storage = {
  get length() {
    try {
      return localStorage.length
    } catch {
      return 0
    }
  },
  key: (i) => {
    try {
      return localStorage.key(i)
    } catch {
      return null
    }
  },
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    if (wiped) return
    pendingWrite = { key, value }
    if (writeTimer === null) writeTimer = setTimeout(commitWrite, WRITE_EVERY_MS)
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* nothing to do */
    }
  },
  clear: () => {
    try {
      localStorage.clear()
    } catch {
      /* nothing to do */
    }
  },
}

/**
 * Persisted state can be hand-edited, truncated by a full disk, or written
 * by an older build. Trust nothing: check every collection the app will
 * immediately index into, and that the harbour we are about to render
 * actually has boxes. Anything short of that surfaces as a crash on the
 * first render instead of a clean reseed.
 */
function looksValid(state: Partial<DockState>): boolean {
  const { boxesByHarbour, harbourId, boats, ledger, audit } = state
  if (!boxesByHarbour || typeof boxesByHarbour !== 'object') return false
  if (!Array.isArray(boats) || !Array.isArray(ledger) || !Array.isArray(audit)) return false

  const groups = Object.entries(boxesByHarbour)
  if (groups.length === 0) return false
  if (harbourId && !boxesByHarbour[harbourId]) return false

  return groups.every(
    ([, boxes]) =>
      Array.isArray(boxes) &&
      boxes.length === 3 &&
      boxes.every(
        (box) =>
          box &&
          Array.isArray(box.slots) &&
          box.slots.length === 10 &&
          box.slots.every((slot) => typeof slot?.status === 'string'),
      ),
  )
}

export interface RegistrationInput {
  boatName: string
  owner: string
  mobile: string
}

export type RegistrationError = 'boatName' | 'owner' | 'mobile' | 'mobileTaken' | 'offline'

export type RegistrationResult =
  | { ok: true; id: string }
  | { ok: false; error: RegistrationError }

export interface DockState {
  // session
  lang: Lang
  theme: Theme
  tab: Tab
  harbourId: HarbourId
  myBoatId: string | null
  adminUnlocked: boolean
  /** Last admin interaction; drives the idle auto-lock. */
  adminTouchedAt: number
  adminFailures: number
  adminLockedUntil: number
  audit: AuditEntry[]

  // harbour data
  boats: Boat[]
  boxesByHarbour: Record<HarbourId, ColdBox[]>
  ledger: LedgerEntry[]

  /**
   * Link to the shared harbour. Not persisted: on a cold start this phone
   * has proved nothing yet, and claiming otherwise would date the figures
   * from a session that ended yesterday.
   */
  syncLive: boolean
  syncedAt: number | null

  // ui
  toast: ToastMessage | null

  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setTab: (tab: Tab) => void
  setHarbour: (id: HarbourId) => void
  tick: (now: number) => void
  notify: (tone: ToastTone, text: string) => void
  dismissToast: () => void

  register: (input: RegistrationInput) => Promise<RegistrationResult>
  signInAs: (boatId: string, last4: string) => Promise<boolean>
  signOut: () => void

  /**
   * Resolves only once the claim is settled — in shared mode that means the
   * transaction committed. The receipt must never appear before the crate is
   * really held.
   */
  reserve: (boxId: BoxId, crates: 1 | 2, species: Species) => Promise<boolean>
  cancelHold: () => Promise<void>
  /** Resolves once the shared copy has recorded it — never before. */
  deposit: (plannedHours: number) => Promise<boolean>
  release: () => Promise<void>

  unlockAdmin: (pin: string) => Promise<PinResult | 'locked'>
  touchAdmin: () => void
  lockAdmin: () => void
  approveBoat: (id: string) => Promise<void>
  rejectBoat: (id: string) => Promise<void>
  setBoatStatus: (id: string, status: Boat['status']) => Promise<boolean>
  /** `indexes` are the crates the harbour may take back — see forceReleasable. */
  adminRelease: (boatId: string, boxId: BoxId, indexes: number[]) => Promise<void>
  publishHarbour: () => Promise<void>
  record: (action: string, target: string, detail?: string) => Promise<void>

  resetDemo: () => Promise<void>
}

let toastSeq = 1
let ledgerSeq = 1

function toast(tone: ToastTone, text: string): ToastMessage {
  return { id: toastSeq++, tone, text }
}

/**
 * A whole demo harbour, from nothing.
 *
 * Exported for the tests, which need a store that is genuinely fresh
 * between cases. They used to call `resetDemo` for this, and that quietly
 * became the reason `resetDemo` replaced the roster and the ledger for all
 * three harbours — a demo button doing a factory reset because a test
 * needed one. The button now clears the crates it says it clears; the tests
 * reset the store directly.
 */
export function seed(now: number) {
  return {
    boats: [...seedBoats(), ...seedPending(now)],
    boxesByHarbour: seedAllBoxes(now),
    ledger: capLedger(seedAllLedgers(now)),
    toast: null,
  }
}

/**
 * Free every stored slot a boat holds in `onlyBoxId` (or across the whole
 * harbour when omitted) and return the ledger rows the release earned.
 *
 * Shared by the skipper's own "sold and clear" and by the admin override,
 * so the two paths can never drift apart on what gets recorded.
 */
export function releaseSlots(
  boxes: ColdBox[],
  harbourId: HarbourId,
  boatId: string,
  now: number,
  onlyBoxId?: BoxId,
  onlyIndexes?: number[],
): { boxes: ColdBox[]; entries: LedgerEntry[] } {
  const entries: LedgerEntry[] = []

  const next = boxes.map((box) => {
    if (onlyBoxId && box.id !== onlyBoxId) return box

    let crates = 0
    let earliest = now
    let late = false
    let species: Species | null = null

    const slots = box.slots.map((slot) => {
      const mine =
        slot.boatId === boatId &&
        (slot.status === 'occupied' || slot.status === 'overstay') &&
        (!onlyIndexes || onlyIndexes.includes(slot.index))
      if (!mine) return slot

      crates += 1
      if (isOverdue(slot, now)) late = true
      species ??= slot.species
      if (slot.depositedAt !== null && slot.depositedAt < earliest) {
        earliest = slot.depositedAt
      }
      return emptySlot(slot.index)
    })

    if (crates === 0) return box

    entries.push({
      id: `L-${now}-${ledgerSeq++}`,
      harbourId,
      boatId,
      boxId: box.id,
      crates,
      species,
      depositedAt: earliest,
      releasedAt: now,
      overstay: late,
    })
    return { ...box, slots }
  })

  return { boxes: next, entries }
}

export const useDockStore = create<DockState>()(
  persist(
    (set, get) => {
      /** Replace the active harbour's boxes, leaving the others untouched. */
      const putBoxes = (boxes: ColdBox[], extra: Partial<DockState> = {}) => {
        const { harbourId, boxesByHarbour } = get()
        set({ boxesByHarbour: { ...boxesByHarbour, [harbourId]: boxes }, ...extra })
      }

      /**
       * Refuse a shared write when there is no link, and say so.
       *
       * Every operation that moves a crate goes through here, not just
       * booking. Firebase queues an offline write and shows it to its own
       * listener immediately, so without this a release into a dead socket
       * frees nothing, records nothing, and looks exactly like success.
       */
      const requireLink = (): boolean => {
        if (!syncEnabled || get().syncLive) return true
        set({ toast: toast('error', t(get().lang, 'syncOffline')) })
        return false
      }

      /**
       * Say what actually went wrong with a shared write.
       *
       * 'offline' used to be the answer to everything — a rules refusal, a
       * deleted project, a revoked key — so a skipper on full bars was told
       * to wait for a signal. The two need different actions from them.
       */
      const reportFailure = (result: RemoteResult) => {
        if (result.ok) return
        const lang = get().lang
        if (result.error === 'stale') {
          // The shared copy held nothing to change. That covers an expired
          // hold, a crate someone else already freed, and a second tap that
          // arrived after the first one committed — so it must NOT say "your
          // hold ended", which was being shown to skippers whose release had
          // just succeeded.
          set({ toast: toast('warn', t(lang, 'syncNoChange')) })
          return
        }
        if (result.error === 'unseeded') {
          set({ toast: toast('error', t(lang, 'syncUnseeded')) })
          return
        }
        if (result.error === 'partial') {
          // Some of this boat's crates moved and some did not. Silence here
          // is the dangerous one: the skipper walks away believing both
          // crates are dealt with, and the other is still holding fish.
          set({ toast: toast('error', t(lang, 'syncPartial')) })
          return
        }
        set({
          toast: toast(
            'error',
            t(lang, result.error === 'refused' ? 'syncRefused' : 'syncOffline'),
          ),
        })
      }

      /**
       * The signed-in boat, but only if it is approved right now.
       *
       * Every action that moves a crate goes through this. An admin can
       * block a boat while its owner has a sheet open, and without a single
       * gate here the blocked boat could still deposit and release — which
       * would contradict both the admin and the banner on their own screen.
       */
      const activeBoatId = (): string | null => {
        const { boats, harbourId, myBoatId } = get()
        const me = boats.find((b) => b.harbourId === harbourId && b.id === myBoatId)
        return me?.status === 'active' ? me.id : null
      }

      return {
        lang: 'te',
        theme: 'day',
        tab: 'dock',
        harbourId: DEFAULT_HARBOUR_ID,
        myBoatId: null,
        adminUnlocked: false,
        adminTouchedAt: 0,
        adminFailures: 0,
        adminLockedUntil: 0,
        audit: [],
        syncLive: false,
        syncedAt: null,
        ...seed(serverNow()),

        setLang: (lang) => set({ lang }),
        setTheme: (theme) => set({ theme }),
        setTab: (tab) => set({ tab }),
        notify: (tone, text) => set({ toast: toast(tone, text) }),
        dismissToast: () => set({ toast: null }),

        // Every harbour is a separate society with its own roster, and hull
        // numbers repeat across them — Nizampatnam's #04 is a different boat
        // from Visakhapatnam's #04. Switching therefore always asks who you
        // are at the new harbour rather than carrying an identity across.
        setHarbour: (id) => {
          if (id === get().harbourId) return
          set({ harbourId: id, myBoatId: null, tab: 'dock', toast: null })
        },

        tick: (now) => {
          const prev = get()
          const patch: Partial<DockState> = {}

          // Every harbour ages, not just the one on screen. Otherwise a hold
          // at the harbour you switched away from never expires and keeps
          // blocking a slot in this device's copy.
          let changed = false
          const next: Record<string, ColdBox[]> = {}
          for (const [id, boxes] of Object.entries(prev.boxesByHarbour)) {
            const result = applyTick(boxes, now)
            next[id] = result.boxes
            if (result.boxes !== boxes) changed = true

            if (result.expiredHolds > 0 && prev.myBoatId && id === prev.harbourId) {
              const had = slotsForBoat(boxes, prev.myBoatId).some((s) => s.status === 'reserved')
              const still = slotsForBoat(result.boxes, prev.myBoatId).some(
                (s) => s.status === 'reserved',
              )
              if (had && !still) patch.toast = toast('warn', t(prev.lang, 'holdExpired'))
            }
          }
          // Only replace the map when something actually moved, so a quiet
          // second does not invalidate every box-derived render.
          if (changed) patch.boxesByHarbour = next as Record<HarbourId, ColdBox[]>

          // Idle auto-lock, the way a portal session expires.
          if (prev.adminUnlocked && now - prev.adminTouchedAt > ADMIN_IDLE_MS) {
            patch.adminUnlocked = false
          }
          if (Object.keys(patch).length > 0) set(patch)
        },

        register: async ({ boatName, owner, mobile }) => {
          const name = boatName.trim()
          const person = owner.trim()
          const digits = normaliseMobile(mobile)

          // The upper bounds match the database rules exactly. Without them a
          // long name was accepted here and refused there, the boat never
          // reached the shared roster, and its first booking came back as
          // "no signal" on full bars.
          if (name.length < 2 || name.length > 40) return { ok: false, error: 'boatName' }
          if (person.length < 2 || person.length > 60) return { ok: false, error: 'owner' }
          if (!isValidMobile(digits)) return { ok: false, error: 'mobile' }

          const { boats, harbourId } = get()
          if (boats.some((b) => b.mobile === digits)) {
            return { ok: false, error: 'mobileTaken' }
          }

          const boat: Boat = {
            id: nextBoatId(boats, harbourId),
            harbourId,
            nameEn: name,
            nameTe: name,
            owner: person,
            mobile: digits,
            status: 'pending',
            registeredAt: serverNow(),
          }

          // The database decides the hull number, because only it can see
          // every phone's registrations. It also refuses a slot booked by a
          // boat it has never heard of, so this must land before booking.
          if (syncEnabled) {
            if (!requireLink()) return { ok: false, error: 'offline' }
            const id = await claimBoat(harbourId, boat)
            if (!id) return { ok: false, error: 'offline' }
            boat.id = id
          }

          set({ boats: [...boats, boat], myBoatId: boat.id, tab: 'dock' })
          return { ok: true, id: boat.id }
        },

        /**
         * Claim an existing boat by proving you know its registered number.
         *
         * Without this the roster is a one-tap "become anyone" list, and on
         * a shared dock phone that means releasing another skipper's crates.
         * Four digits is not authentication — they are readable by anyone
         * with the link — but they identify the boat you mean.
         *
         * What actually protects the crates is the second step: the boat is
         * bound to this device in the shared roster, first claim wins, and
         * the database then refuses to let any other phone move its crates.
         * A boat already held by another device cannot be signed into here,
         * and saying so plainly is better than letting someone in and having
         * every action they take refused.
         */
        signInAs: async (boatId, last4) => {
          const { boats, harbourId, lang } = get()
          const boat = boats.find((b) => b.harbourId === harbourId && b.id === boatId)
          if (!boat || boat.mobile.slice(-4) !== last4.trim()) return false

          if (syncEnabled) {
            if (!requireLink()) return false
            // Only a boat genuinely held by another device is refused. A boat
            // the database would not let us bind stays unbound — the harbour
            // then behaves as it did before binding existed, rather than
            // locking a skipper out over a rules deployment.
            if ((await claimForThisDevice(harbourId, boatId)) === 'taken') {
              set({ toast: toast('error', t(lang, 'errClaimedElsewhere')) })
              return false
            }
          }

          set({ myBoatId: boatId, tab: 'dock', toast: null })
          return true
        },

        signOut: () => set({ myBoatId: null, adminUnlocked: false, tab: 'dock' }),

        reserve: async (boxId, crates, species) => {
          const { boxesByHarbour, harbourId, myBoatId, boats, lang } = get()
          if (!myBoatId) return false
          const boxes = boxesByHarbour[harbourId]

          const me = boats.find((b) => b.harbourId === harbourId && b.id === myBoatId)
          if (!me || me.status !== 'active') {
            set({ toast: toast('error', t(lang, 'errNotApproved')) })
            return false
          }

          const quota = remainingQuota(boxes, myBoatId)
          if (crates > quota) {
            set({ toast: toast('error', t(lang, 'errQuota', QUOTA, quota)) })
            return false
          }

          // Re-check capacity at commit time, not at render time: another
          // boat may have taken the last slot while this sheet was open.
          const box = boxes.find((b) => b.id === boxId)
          if (!box || emptyCount(box) < crates) {
            set({ toast: toast('error', t(lang, 'raceLost')) })
            return false
          }

          // No link, no claim: a hold that is not in the shared copy is not
          // a hold, and must never be shown as one.
          if (!requireLink()) return false

          // With a shared database the claim is settled there, atomically,
          // and the realtime listener brings the result back. The checks
          // above still run first so an obvious refusal is instant and free.
          //
          // We wait for the commit before answering. Returning early printed
          // a receipt built from local state the sync path never writes —
          // "Stored in Auction Hall, 0 crates", a booking code that did not
          // match the one recorded, and on a lost race a green Booked panel
          // sitting on top of the toast explaining it was refused.
          if (syncEnabled) {
            const result = await reserveRemote(harbourId, boxId, myBoatId, crates, species)
            if (result.ok) return true
            // Every refusal gets its own reason. 'notActive' cannot reach
            // here — the guard above already refused an unapproved boat
            // before we touched the network.
            if (result.error === 'quota') {
              set({ toast: toast('error', t(get().lang, 'errQuota', QUOTA, quota)) })
            } else if (result.error === 'boxFull') {
              set({ toast: toast('error', t(get().lang, 'raceLost')) })
            } else {
              reportFailure(result)
            }
            return false
          }

          let left: number = crates
          const now = serverNow()
          putBoxes(
            boxes.map((b) => {
              if (b.id !== boxId) return b
              return {
                ...b,
                slots: b.slots.map((slot) => {
                  if (left > 0 && slot.status === 'empty') {
                    left -= 1
                    return {
                      ...slot,
                      status: 'reserved' as const,
                      boatId: myBoatId,
                      reservedAt: now,
                      depositedAt: null,
                      plannedOutAt: null,
                      species,
                    }
                  }
                  return slot
                }),
              }
            }),
            { toast: null },
          )
          return true
        },

        cancelHold: async () => {
          const myBoatId = activeBoatId()
          if (!myBoatId) return
          const { boxesByHarbour, harbourId } = get()
          if (syncEnabled) {
            if (!requireLink()) return
            const boxId = activeBoxId(boxesByHarbour[harbourId], myBoatId) ?? undefined
            reportFailure(await cancelRemote(harbourId, myBoatId, boxId))
            return
          }
          putBoxes(
            boxesByHarbour[harbourId].map((box) => ({
              ...box,
              slots: box.slots.map((slot) =>
                slot.boatId === myBoatId && slot.status === 'reserved'
                  ? emptySlot(slot.index)
                  : slot,
              ),
            })),
          )
        },

        deposit: async (plannedHours) => {
          const myBoatId = activeBoatId()
          if (!myBoatId) return false
          const { boxesByHarbour, harbourId } = get()
          const boxes = boxesByHarbour[harbourId]

          // The hold may have expired between opening the sheet and tapping.
          if (!slotsForBoat(boxes, myBoatId).some((s) => s.status === 'reserved')) {
            set({ toast: toast('warn', t(get().lang, 'holdExpired')) })
            return false
          }

          const now = serverNow()
          const plannedOutAt = now + plannedHours * HOUR_MS
          // Awaited: "Fish deposited" is the promise a skipper walks away on,
          // and it must not appear until the shared copy actually says so.
          if (syncEnabled) {
            if (!requireLink()) return false
            const boxId = activeBoxId(boxes, myBoatId) ?? undefined
            const result = await depositRemote(harbourId, myBoatId, plannedOutAt, boxId)
            reportFailure(result)
            return result.ok
          }
          putBoxes(
            boxes.map((box) => ({
              ...box,
              slots: box.slots.map((slot) =>
                slot.boatId === myBoatId && slot.status === 'reserved'
                  ? {
                      ...slot,
                      status: 'occupied' as const,
                      depositedAt: now,
                      reservedAt: null,
                      plannedOutAt,
                    }
                  : slot,
              ),
            })),
          )
          return true
        },

        release: async () => {
          const myBoatId = activeBoatId()
          if (!myBoatId) return
          const { boxesByHarbour, harbourId, ledger } = get()
          const result = releaseSlots(
            boxesByHarbour[harbourId],
            harbourId,
            myBoatId,
            serverNow(),
          )
          if (result.entries.length === 0) return
          if (syncEnabled) {
            if (!requireLink()) return
            // No rows are passed in: the shared path writes one row per crate
            // it actually freed, which is not knowable from here. Handing it
            // rows built from this phone's view billed a fisherman for crates
            // that never came out of the box.
            reportFailure(await releaseRemote(harbourId, myBoatId))
            return
          }
          putBoxes(result.boxes, { ledger: capLedger([...ledger, ...result.entries]) })
        },

        unlockAdmin: async (pin) => {
          // One clock in this store. `tick` compares adminTouchedAt against
          // serverNow(), so stamping it with the device clock idle-locked a
          // slow phone out of the admin console on the very next tick — and
          // stopped a fast phone from ever locking at all.
          const now = serverNow()
          if (now < get().adminLockedUntil) return 'locked'

          const result = await verifyPin(pin)
          if (result !== 'ok') {
            const failures = get().adminFailures + 1
            set({ adminFailures: failures, adminLockedUntil: now + lockoutMs(failures) })
            return result
          }

          set({
            adminUnlocked: true,
            adminTouchedAt: now,
            adminFailures: 0,
            adminLockedUntil: 0,
          })
          void get().record('session.unlock', get().harbourId)
          return 'ok'
        },

        /**
         * Keep the admin's idle timer alive while they are working.
         *
         * Bound to pointer-down and key-down on the whole console, so it
         * used to fire a `set()` on every tap — each one re-rendering every
         * subscriber and queueing a re-serialisation of the persisted store.
         * The idle lock is measured in minutes; refreshing it more than once
         * every few seconds buys nothing at all.
         */
        touchAdmin: () => {
          const now = serverNow()
          if (now - get().adminTouchedAt < TOUCH_EVERY_MS) return
          set({ adminTouchedAt: now })
        },

        lockAdmin: () => set({ adminUnlocked: false, tab: 'dock' }),

        /**
         * Append to the action log, and say so if it fails.
         *
         * Caught HERE rather than at each call site, because every caller
         * writes `void record(...)` — the log must never block an admin
         * action — and a rejected `crypto.subtle` digest was therefore
         * silent. A MISSING row does not break the hash chain; only an
         * altered one does. So the console went on reporting "Audit intact"
         * in green over a log with a hole in it, which is worse than an
         * obviously broken log: it is a receipt that vouches for itself.
         */
        record: async (action, target, detail = '') => {
          try {
            set({ audit: await appendAudit(get().audit, action, target, detail) })
          } catch {
            set({ toast: toast('warn', t(get().lang, 'auditFailed')) })
          }
        },

        approveBoat: async (id) => {
          // Logged only if it landed — see setBoatStatus.
          if (await get().setBoatStatus(id, 'active')) {
            void get().record('boat.approve', `#${id}`, get().harbourId)
          }
        },

        /**
         * Refuse a registration.
         *
         * Blocked, not deleted. A hull number can never be reused — the rules
         * forbid removing a boat, because slots point at boats — and deleting
         * it only locally was worse than useless: the shared roster put it
         * straight back as `pending` on the next snapshot, so rejection was a
         * no-op that still wrote a "rejected" line into the audit log.
         * Blocking is the state that actually survives and actually stops the
         * boat booking.
         */
        rejectBoat: async (id) => {
          const { harbourId, myBoatId } = get()
          const landed = await get().setBoatStatus(id, 'blocked')
          if (myBoatId === id) set({ myBoatId: null })
          if (landed) void get().record('boat.reject', `#${id}`, harbourId)
        },

        /**
         * Resolves once the change has reached the shared roster, so the
         * caller can log what actually happened. Writing the audit row first
         * left the chain asserting an approval the database had refused, and
         * the next snapshot then reverted the boat to pending.
         */
        setBoatStatus: async (id, status) => {
          const { boats, harbourId } = get()
          const updated = boats.map((b) =>
            b.harbourId === harbourId && b.id === id ? { ...b, status } : b,
          )
          set({ boats: updated })
          const boat = updated.find((b) => b.harbourId === harbourId && b.id === id)
          if (!syncEnabled || !boat) return true
          const result = await putBoat(harbourId, boat)
          if (!result.ok) {
            // Put the roster back. Leaving the optimistic change on screen
            // told the harbour master a boat was blocked while the shared
            // copy still said active — so the "blocked" skipper went on
            // booking, and nothing on the admin's screen disagreed.
            const was = boats.find((b) => b.harbourId === harbourId && b.id === id)?.status
            if (was) {
              set({
                boats: get().boats.map((b) =>
                  b.harbourId === harbourId && b.id === id ? { ...b, status: was } : b,
                ),
              })
            }
            reportFailure(result)
          }
          return result.ok
        },

        adminRelease: async (boatId, boxId, indexes) => {
          const { boxesByHarbour, harbourId, ledger } = get()
          // Only the crates the harbour has actually given up on. A box row
          // in the console aggregates every crate a boat holds there, so a
          // boat with one overdue crate and one stored an hour ago showed a
          // single live Force release button — and the rules rightly refused
          // the fresh crate, failing the whole action.
          const result = releaseSlots(
            boxesByHarbour[harbourId],
            harbourId,
            boatId,
            serverNow(),
            boxId,
            indexes,
          )
          if (result.entries.length === 0) return

          // The shared copy first, or nothing happened. Freeing this only
          // locally left the crate occupied for every other phone and the
          // listener put it straight back — while the ledger row and the
          // audit entry both swore it had been released.
          // The log records what happened, not what was attempted. Writing
          // the audit row before the release resolved left the hash-chained
          // record — the thing the README sells as the integrity trail —
          // permanently asserting a release that had failed.
          //
          // The COUNT comes from the harbour, not from this phone's copy.
          // `result.entries[0].crates` is what we could see before the
          // write; another phone may have released one of them a moment
          // earlier, and the audit log then claimed two crates while the
          // ledger correctly recorded one — the integrity trail disagreeing
          // with the billing record, with the trail being the wrong one.
          const logIt = (crates: number) =>
            void get().record(
              'slot.forceRelease',
              `#${boatId}`,
              `${harbourId} ${boxId} · ${crates} crates`,
            )

          if (syncEnabled) {
            if (!requireLink()) return
            const outcome = await releaseRemote(harbourId, boatId, boxId, indexes)
            reportFailure(outcome)
            // Recorded whenever a crate actually came out, including a
            // partial release. Logging only on `ok` meant a crate was
            // freed, billed in the ledger, and left with no record that any
            // admin had touched it.
            if (outcome.freed) logIt(outcome.freed)
            return
          }

          putBoxes(result.boxes, { ledger: capLedger([...ledger, ...result.entries]) })
          logIt(result.entries[0].crates)
        },

        /**
         * Push this harbour's boxes and roster into the shared database once.
         *
         * An admin action, not something on start-up: every write yields to
         * whatever is already there, so it fills an empty database and
         * touches nothing in a live one. Safe to press twice.
         */
        publishHarbour: async () => {
          const { harbourId, boxesByHarbour, boats, ledger, lang } = get()
          if (!requireLink()) return
          try {
            const { failed, boxesOk } = await seedHarbour(
              harbourId,
              boxesByHarbour[harbourId],
              boats.filter((b) => b.harbourId === harbourId),
              ledger.filter((e) => e.harbourId === harbourId),
            )
            // Some through and some refused is neither success nor failure,
            // and reporting it as either would be a lie. The boxes failing is
            // its own case: the roster landed, and pressing this again is all
            // that is needed.
            set({
              toast: !boxesOk
                ? toast('warn', t(lang, 'adminPublishRetry'))
                : failed === 0
                  ? toast('ok', t(lang, 'adminPublishDone'))
                  : toast('warn', t(lang, 'adminPublishPartial', failed)),
            })
            void get().record('harbour.publish', harbourId, `${failed} refused`)
          } catch {
            // Say it failed. A silent failure here looks identical to success
            // and the harbour would go on believing it is synced.
            set({ toast: toast('error', t(lang, 'adminPublishFailed')) })
          }
        },

        resetDemo: async () => {
          // THE harbour being looked at, never a hard-coded one. This reset
          // clears live holds for every phone in that harbour, and it used to
          // always target Nizampatnam — so an admin at Kakinada emptied
          // another society's boxes, with fish in them, and was told they had
          // cleared the one on screen.
          const { harbourId, boxesByHarbour } = get()
          const fresh = seed(serverNow())

          // A local-only reset would be undone by the watcher a second later,
          // so the shared copy has to be reset too or the button lies.
          //
          // The roster goes first, because the seeded crates name boats and
          // the rules refuse a slot naming a boat the database has not heard
          // of. On an unpublished harbour that made this button fail with a
          // refusal the admin could do nothing about — so it now seeds what
          // it needs. Both writes yield to anything already there.
          // The shared copy first, and only mirror it locally if it landed.
          // A multi-path update is atomic: one refused slot — which is what
          // happens the moment a real skipper has claimed a boat — refuses
          // all thirty. Setting the local copy first showed the admin an
          // empty harbour, then a refusal toast, then the watcher putting
          // every crate back. Say no, or do it; never both.
          if (syncEnabled) {
            await seedHarbour(
              harbourId,
              fresh.boxesByHarbour[harbourId],
              fresh.boats.filter((b) => b.harbourId === harbourId),
              fresh.ledger.filter((e) => e.harbourId === harbourId),
            )
            const outcome = await resetRemoteBoxes(harbourId, fresh.boxesByHarbour[harbourId])
            if (!outcome.ok) {
              reportFailure(outcome)
              return
            }
          }

          set({
            // ONLY this harbour's crates. `...fresh` replaced the roster and
            // the ledger for all three harbours, so a registration that had
            // not reached the shared copy yet was destroyed without a word —
            // while the button's own text promised both were kept. The audit
            // log survives for the same reason: it is the integrity trail
            // the console advertises, and this reset is recorded in it.
            boxesByHarbour: {
              ...boxesByHarbour,
              [harbourId]: fresh.boxesByHarbour[harbourId],
            },
            // Signed out, not signed in as #04: handing out an approved boat
            // here would make the last-4 check pointless.
            myBoatId: null,
            adminFailures: 0,
            adminLockedUntil: 0,
          })
          void get().record('demo.reset', harbourId)
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        lang: s.lang,
        theme: s.theme,
        harbourId: s.harbourId,
        myBoatId: s.myBoatId,
        boats: s.boats,
        boxesByHarbour: s.boxesByHarbour,
        ledger: s.ledger,
        audit: s.audit,
        adminFailures: s.adminFailures,
        adminLockedUntil: s.adminLockedUntil,
      }),
      // The shape changed with multi-harbour support in v4. Anything older
      // is reseeded rather than half-migrated.
      migrate: () => undefined,
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // A corrupt or truncated write must not brick the app on a dock.
        if (!looksValid(state)) Object.assign(state, seed(serverNow()))
        state.tick(serverNow())
      },
    },
  ),
)

/* -- Derived reads ----------------------------------------------------- */

/**
 * Follow the shared harbour, if there is one.
 *
 * Called once at startup and again whenever the harbour changes. The
 * listener overwrites this device's boxes with the shared copy, which is
 * what makes two phones agree; with no Firebase configured it does nothing
 * and the app stays local, exactly as before.
 */
export function startHarbourSync(): () => void {
  if (!syncEnabled) return () => {}
  let stop: (() => void) | null = null

  let stopRoster: (() => void) | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let following: HarbourId | null = null

  const follow = (harbourId: HarbourId) => {
    stop?.()
    stopRoster?.()
    if (retry) clearTimeout(retry)
    following = harbourId

    stop = watchHarbour(
      harbourId,
      (boxes) => {
        // A snapshot arriving is the proof the listener is alive — including
        // the empty one an unseeded harbour sends. The socket alone is not
        // proof: it can reconnect while this subscription stays dead, and the
        // staleness banner would then clear over frozen figures.
        //
        // `null` means "connected, nothing published yet": stay live so the
        // admin can actually press Publish harbour, and leave this device's
        // seeded boxes alone so there is something to publish.
        const { boxesByHarbour } = useDockStore.getState()
        useDockStore.setState({
          syncLive: true,
          syncedAt: serverNow(),
          ...(boxes ? { boxesByHarbour: { ...boxesByHarbour, [harbourId]: boxes } } : {}),
        })
      },
      // The socket can be up while the rules refuse us. Treating that as a
      // dead link stops the app accepting writes that all fail — and we
      // resubscribe, because nothing else ever would and the app would sit
      // there refusing every booking until it was killed and reopened.
      () => {
        useDockStore.setState({ syncLive: false })
        if (retry) clearTimeout(retry)
        retry = setTimeout(() => {
          if (following === harbourId) follow(harbourId)
        }, RESUBSCRIBE_MS)
      },
    )

    stopRoster = watchRoster(
      harbourId,
      (boats) => {
        // Merge, never replace. The shared copy wins for every boat it knows
        // about, but a boat it has not heard of yet is still real — a fresh
        // registration waiting to be published, or the seeded roster before
        // anyone has pressed Publish harbour. Replacing wiped all twenty on
        // an empty database, which left nothing to publish and no boat for
        // the seeded crates to belong to.
        const state = useDockStore.getState()
        const mine = new Map(
          state.boats.filter((b) => b.harbourId === harbourId).map((b) => [b.id, b]),
        )
        const merged = boats.map((shared) => {
          // The shared copy carries only the last four digits, by design. If
          // THIS phone is the one that registered the boat it still holds the
          // whole number, and overwriting it lost the admin's ability to ring
          // the applicant, the CSV's Mobile column, and the duplicate-number
          // check. Keep the longer of the two: it always agrees on the last
          // four, which is all the ownership check reads.
          const local = mine.get(shared.id)
          const keepLocal = local && local.mobile.length > shared.mobile.length
          return keepLocal ? { ...shared, mobile: local.mobile } : shared
        })
        const shared = new Set(boats.map((b) => b.id))
        const kept = state.boats.filter((b) => b.harbourId !== harbourId || !shared.has(b.id))
        useDockStore.setState({ boats: [...kept, ...merged] })
      },
      (entries) => {
        const others = useDockStore.getState().ledger.filter((e) => e.harbourId !== harbourId)
        useDockStore.setState({ ledger: capLedger([...others, ...entries]) })
      },
    )
  }

  follow(useDockStore.getState().harbourId)
  const unsubscribe = useDockStore.subscribe((state, previous) => {
    if (state.harbourId !== previous.harbourId) follow(state.harbourId)
  })

  /**
   * A dropped socket is instant, reliable proof the figures have stopped
   * arriving, so it takes the link down at once. It is NOT proof the link is
   * back: the socket can reconnect while this app's subscriptions stay dead.
   * Coming back up is proven only by data arriving, above — so on reconnect
   * we resubscribe rather than declare ourselves live.
   */
  let wasLive = true
  const stopConnection = watchConnection((live) => {
    // Only on a real drop-and-return. `.info/connected` also fires `true` on
    // the first connect, and resubscribing there re-fetched the whole
    // harbour, roster and ledger a second time before the first screen had
    // even settled — on the 2G phone this is built for.
    const reconnected = live && !wasLive
    wasLive = live
    if (live) {
      if (reconnected && following) follow(following)
      return
    }
    useDockStore.setState({ syncLive: false })
  })

  return () => {
    stop?.()
    stopRoster?.()
    stopConnection()
    if (retry) clearTimeout(retry)
    following = null
    unsubscribe()
  }
}

export function selectHarbour(state: DockState): Harbour {
  return harbour(state.harbourId)
}

export function selectBoxes(state: DockState): ColdBox[] {
  return state.boxesByHarbour[state.harbourId]
}

export function selectMyBoat(state: DockState): Boat | null {
  if (!state.myBoatId) return null
  return (
    state.boats.find(
      (b) => b.harbourId === state.harbourId && b.id === state.myBoatId,
    ) ?? null
  )
}
