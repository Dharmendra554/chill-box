import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  DEFAULT_BOAT_ID,
  isValidMobile,
  nextBoatId,
  normaliseMobile,
  seedBoats,
  seedPending,
} from '../data/boats'
import { DEFAULT_HARBOUR_ID, harbour } from '../data/harbours'
import { MOCK_CLEARED_TODAY, seedAllBoxes, seedAllLedgers } from '../data/mock'
import { t } from '../i18n/dictionary'
import { ADMIN_IDLE_MS, appendAudit, lockoutMs, verifyPin, type PinResult } from '../lib/adminAuth'
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
 * localStorage throws outright in private mode and when the quota is full,
 * and a dockside phone hits both. Persistence is a convenience here, never
 * a dependency: if the disk refuses, the app runs from memory for the
 * session rather than showing a white screen.
 */
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
    try {
      localStorage.setItem(key, value)
    } catch {
      /* full or blocked — this session simply is not persisted */
    }
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

/** Persisted state can be hand-edited or half-written. Trust nothing. */
function looksValid(byHarbour: unknown): boolean {
  if (!byHarbour || typeof byHarbour !== 'object') return false
  const groups = Object.values(byHarbour as Record<string, ColdBox[]>)
  if (groups.length === 0) return false
  return groups.every(
    (boxes) =>
      Array.isArray(boxes) &&
      boxes.length === 3 &&
      boxes.every((box) => Array.isArray(box.slots) && box.slots.length === 10),
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
  clearedOnTimeToday: number

  // ui
  toast: ToastMessage | null
  now: number

  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setTab: (tab: Tab) => void
  setHarbour: (id: HarbourId) => void
  tick: (now: number) => void
  notify: (tone: ToastTone, text: string) => void
  dismissToast: () => void

  register: (input: RegistrationInput) => RegistrationResult
  signInAs: (boatId: string) => void
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
    ledger: seedAllLedgers(now),
    clearedOnTimeToday: MOCK_CLEARED_TODAY,
    toast: null,
    now,
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
): { boxes: ColdBox[]; entries: LedgerEntry[]; onTime: number } {
  const entries: LedgerEntry[] = []
  let onTime = 0

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
    if (!late) onTime += crates
    return { ...box, slots }
  })

  return { boxes: next, entries, onTime }
}

export const useDockStore = create<DockState>()(
  persist(
    (set, get) => {
      /** Replace the active harbour's boxes, leaving the others untouched. */
      const putBoxes = (boxes: ColdBox[], extra: Partial<DockState> = {}) => {
        const { harbourId, boxesByHarbour } = get()
        set({ boxesByHarbour: { ...boxesByHarbour, [harbourId]: boxes }, ...extra })
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
          const boxes = prev.boxesByHarbour[prev.harbourId]
          const result = applyTick(boxes, now)
          const patch: Partial<DockState> = { now }

          if (result.expiredHolds > 0 && prev.myBoatId) {
            const had = slotsForBoat(boxes, prev.myBoatId).some(
              (s) => s.status === 'reserved',
            )
            const still = slotsForBoat(result.boxes, prev.myBoatId).some(
              (s) => s.status === 'reserved',
            )
            if (had && !still) patch.toast = toast('warn', t(prev.lang, 'holdExpired'))
          }
          patch.boxesByHarbour = {
            ...prev.boxesByHarbour,
            [prev.harbourId]: result.boxes,
          }

          // Idle auto-lock, the way a portal session expires.
          if (prev.adminUnlocked && now - prev.adminTouchedAt > ADMIN_IDLE_MS) {
            patch.adminUnlocked = false
          }
          set(patch)
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

        signInAs: (boatId) => set({ myBoatId: boatId, tab: 'dock', toast: null }),

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
          const { boxesByHarbour, harbourId, myBoatId } = get()
          if (!myBoatId) return
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
          const { boxesByHarbour, harbourId, myBoatId } = get()
          if (!myBoatId) return false
          const boxes = boxesByHarbour[harbourId]

          // The hold may have expired between opening the sheet and tapping.
          if (!slotsForBoat(boxes, myBoatId).some((s) => s.status === 'reserved')) {
            return false
          }

          const now = Date.now()
          const plannedOutAt = now + plannedHours * HOUR_MS
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
          const { boxesByHarbour, harbourId, myBoatId, ledger, clearedOnTimeToday } =
            get()
          if (!myBoatId) return
          const result = releaseSlots(
            boxesByHarbour[harbourId],
            harbourId,
            myBoatId,
            Date.now(),
          )
          if (result.entries.length === 0) return
          putBoxes(result.boxes, {
            ledger: [...ledger, ...result.entries],
            clearedOnTimeToday: clearedOnTimeToday + result.onTime,
          })
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
          putBoxes(result.boxes, { ledger: [...ledger, ...result.entries] })
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
            myBoatId: DEFAULT_BOAT_ID,
            adminUnlocked: false,
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
        clearedOnTimeToday: s.clearedOnTimeToday,
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
        if (!looksValid(state.boxesByHarbour)) Object.assign(state, seed(Date.now()))
        state.tick(Date.now())
      },
    },
  ),
)

/* -- Derived reads ----------------------------------------------------- */

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
