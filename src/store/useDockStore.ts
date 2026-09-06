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
  depositRemote,
  releaseRemote,
  reserveRemote,
  syncEnabled,
  watchHarbour,
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

/**
 * Newest ledger rows to keep, PER HARBOUR.
 *
 * The ledger only grows and the persisted store shares a ~5 MB quota, so it
 * has to be bounded. Per harbour, not overall: the rows arrive grouped by
 * harbour, so a global `slice(-N)` silently deleted the FIRST harbour's
 * entire history, and its admin console then reported — with a straight
 * face — that the harbour had never stored a crate. Each society keeps its
 * own months.
 */
const LEDGER_LIMIT_PER_HARBOUR = 1_500

function capLedger(rows: LedgerEntry[]): LedgerEntry[] {
  const kept = new Map<HarbourId, LedgerEntry[]>()
  for (const row of rows) {
    const list = kept.get(row.harbourId) ?? []
    list.push(row)
    kept.set(row.harbourId, list)
  }
  return [...kept.values()].flatMap((list) =>
    list.length > LEDGER_LIMIT_PER_HARBOUR
      ? [...list].sort((a, b) => a.releasedAt - b.releasedAt).slice(-LEDGER_LIMIT_PER_HARBOUR)
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

function commitWrite(): void {
  writeTimer = null
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

export type RegistrationError = 'boatName' | 'owner' | 'mobile' | 'mobileTaken'

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

  // ui
  toast: ToastMessage | null

  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setTab: (tab: Tab) => void
  setHarbour: (id: HarbourId) => void
  tick: (now: number) => void
  notify: (tone: ToastTone, text: string) => void
  dismissToast: () => void

  register: (input: RegistrationInput) => RegistrationResult
  signInAs: (boatId: string, last4: string) => boolean
  signOut: () => void

  reserve: (boxId: BoxId, crates: 1 | 2, species: Species) => boolean
  cancelHold: () => void
  deposit: (plannedHours: number) => boolean
  release: () => void

  unlockAdmin: (pin: string) => Promise<PinResult | 'locked'>
  touchAdmin: () => void
  lockAdmin: () => void
  approveBoat: (id: string) => void
  rejectBoat: (id: string) => void
  setBoatStatus: (id: string, status: Boat['status']) => void
  adminRelease: (boatId: string, boxId: BoxId) => void
  record: (action: string, target: string, detail?: string) => Promise<void>

  resetDemo: () => void
}

let toastSeq = 1
let ledgerSeq = 1

function toast(tone: ToastTone, text: string): ToastMessage {
  return { id: toastSeq++, tone, text }
}

function seed(now: number) {
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
        (slot.status === 'occupied' || slot.status === 'overstay')
      if (!mine) return slot

      crates += 1
      if (slot.status === 'overstay') late = true
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
        ...seed(Date.now()),

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

        register: ({ boatName, owner, mobile }) => {
          const name = boatName.trim()
          const person = owner.trim()
          const digits = normaliseMobile(mobile)

          if (name.length < 2) return { ok: false, error: 'boatName' }
          if (person.length < 2) return { ok: false, error: 'owner' }
          if (!isValidMobile(digits)) return { ok: false, error: 'mobile' }

          const { boats, harbourId } = get()
          if (boats.some((b) => b.mobile === digits)) {
            return { ok: false, error: 'mobileTaken' }
          }

          const id = nextBoatId(boats, harbourId)
          const boat: Boat = {
            id,
            harbourId,
            nameEn: name,
            nameTe: name,
            owner: person,
            mobile: digits,
            status: 'pending',
            registeredAt: Date.now(),
          }
          set({ boats: [...boats, boat], myBoatId: id, tab: 'dock' })
          return { ok: true, id }
        },

        /**
         * Claim an existing boat by proving you know its registered number.
         *
         * Without this the roster is a one-tap "become anyone" list, and on
         * a shared dock phone that means releasing another skipper's crates.
         * Four digits is not authentication — a client-only app cannot do
         * authentication — but it stops casual impersonation, which is the
         * threat that actually exists here.
         */
        signInAs: (boatId, last4) => {
          const { boats, harbourId } = get()
          const boat = boats.find((b) => b.harbourId === harbourId && b.id === boatId)
          if (!boat || boat.mobile.slice(-4) !== last4.trim()) return false
          set({ myBoatId: boatId, tab: 'dock', toast: null })
          return true
        },

        signOut: () => set({ myBoatId: null, adminUnlocked: false, tab: 'dock' }),

        reserve: (boxId, crates, species) => {
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

          // With a shared database the claim is settled there, atomically,
          // and the realtime listener brings the result back. The checks
          // above still run first so an obvious refusal is instant and free.
          if (syncEnabled) {
            void reserveRemote(harbourId, boxId, myBoatId, crates, species).then((result) => {
              if (result.ok) return
              // 'notActive' cannot reach here — the guard above already
              // refused an unapproved boat before we touched the network.
              const key =
                result.error === 'quota'
                  ? 'errQuota'
                  : result.error === 'boxFull'
                    ? 'raceLost'
                    : 'syncOffline'
              set({
                toast: toast(
                  'error',
                  key === 'errQuota'
                    ? t(get().lang, 'errQuota', QUOTA, quota)
                    : t(get().lang, key),
                ),
              })
            })
            return true
          }

          let left: number = crates
          const now = Date.now()
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

        cancelHold: () => {
          const myBoatId = activeBoatId()
          if (!myBoatId) return
          const { boxesByHarbour, harbourId } = get()
          if (syncEnabled) {
            void cancelRemote(harbourId, myBoatId)
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

        deposit: (plannedHours) => {
          const myBoatId = activeBoatId()
          if (!myBoatId) return false
          const { boxesByHarbour, harbourId } = get()
          const boxes = boxesByHarbour[harbourId]

          // The hold may have expired between opening the sheet and tapping.
          if (!slotsForBoat(boxes, myBoatId).some((s) => s.status === 'reserved')) {
            return false
          }

          const now = Date.now()
          const plannedOutAt = now + plannedHours * HOUR_MS
          if (syncEnabled) {
            void depositRemote(harbourId, myBoatId, plannedOutAt)
            return true
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

        release: () => {
          const myBoatId = activeBoatId()
          if (!myBoatId) return
          const { boxesByHarbour, harbourId, ledger } = get()
          const result = releaseSlots(
            boxesByHarbour[harbourId],
            harbourId,
            myBoatId,
            Date.now(),
          )
          if (result.entries.length === 0) return
          if (syncEnabled) {
            // The ledger rows are computed from what we can see, then the
            // shared copy frees the slots and appends them together.
            void releaseRemote(
              harbourId,
              myBoatId,
              result.entries.map(({ id: _id, harbourId: _h, ...row }) => row),
            )
            return
          }
          putBoxes(result.boxes, { ledger: capLedger([...ledger, ...result.entries]) })
        },

        unlockAdmin: async (pin) => {
          const now = Date.now()
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

        touchAdmin: () => set({ adminTouchedAt: Date.now() }),

        lockAdmin: () => set({ adminUnlocked: false, tab: 'dock' }),

        record: async (action, target, detail = '') => {
          set({ audit: await appendAudit(get().audit, action, target, detail) })
        },

        approveBoat: (id) => {
          get().setBoatStatus(id, 'active')
          void get().record('boat.approve', `#${id}`, get().harbourId)
        },

        rejectBoat: (id) => {
          const { boats, harbourId, myBoatId } = get()
          void get().record('boat.reject', `#${id}`, harbourId)
          set({
            boats: boats.filter((b) => !(b.harbourId === harbourId && b.id === id)),
            myBoatId: myBoatId === id ? null : myBoatId,
          })
        },

        setBoatStatus: (id, status) => {
          const { boats, harbourId } = get()
          set({
            boats: boats.map((b) =>
              b.harbourId === harbourId && b.id === id ? { ...b, status } : b,
            ),
          })
        },

        adminRelease: (boatId, boxId) => {
          const { boxesByHarbour, harbourId, ledger } = get()
          const result = releaseSlots(
            boxesByHarbour[harbourId],
            harbourId,
            boatId,
            Date.now(),
            boxId,
          )
          if (result.entries.length === 0) return
          putBoxes(result.boxes, { ledger: capLedger([...ledger, ...result.entries]) })
          void get().record(
            'slot.forceRelease',
            `#${boatId}`,
            `${harbourId} ${boxId} · ${result.entries[0].crates} crates`,
          )
        },

        resetDemo: () => {
          set({
            ...seed(Date.now()),
            harbourId: DEFAULT_HARBOUR_ID,
            // Signed out, not signed in as #04: this button sits on the
            // ordinary booking screen, and handing out an approved boat
            // here would make the last-4 check pointless.
            myBoatId: null,
            adminUnlocked: false,
            audit: [],
            adminFailures: 0,
            adminLockedUntil: 0,
            tab: 'dock',
          })
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
        if (!looksValid(state)) Object.assign(state, seed(Date.now()))
        state.tick(Date.now())
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

  const follow = (harbourId: HarbourId) => {
    stop?.()
    stop = watchHarbour(harbourId, (boxes) => {
      const { boxesByHarbour } = useDockStore.getState()
      useDockStore.setState({ boxesByHarbour: { ...boxesByHarbour, [harbourId]: boxes } })
    })
  }

  follow(useDockStore.getState().harbourId)
  const unsubscribe = useDockStore.subscribe((state, previous) => {
    if (state.harbourId !== previous.harbourId) follow(state.harbourId)
  })

  return () => {
    stop?.()
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

export function selectMyBoxId(state: DockState): BoxId | null {
  if (!state.myBoatId) return null
  return activeBoxId(selectBoxes(state), state.myBoatId)
}
