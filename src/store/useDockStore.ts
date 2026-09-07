import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  isValidMobile,
  nextBoatId,
  normaliseMobile,
  seedBoats,
  seedRecent,
} from '../data/boats'
import { DEFAULT_HARBOUR_ID, harbour } from '../data/harbours'
import { createMockBoxes, seedAllBoxes, seedAllLedgers } from '../data/mock'
import { t } from '../i18n/dictionary'
import {
  ADMIN_IDLE_MS,
  appendAudit,
  AUDIT_LIMIT,
  lockoutMs,
  verifyPin,
  type PinResult,
} from '../lib/adminAuth'
import {
  cancelRemote,
  claimBoat,
  claimForThisDevice,
  depositRemote,
  releaseRemote,
  reserveRemote,
  seedHarbour,
  serverNow,
  watchConnection,
  watchHarbour,
  watchRoster,
  type RemoteResult,
} from '../lib/harbourSync'
import { SYNC_STALE_MS } from '../hooks/useConnectivity'
import { demoMode, sharedActive } from '../lib/mode'
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
  reclaimable,
  remainingQuota,
  slotsForBoat,
} from './selectors'

/**
 * One store per mode, and they must never meet.
 *
 * Demo and live shared a single key, so everything invented in a demo was
 * still there in the real harbour — and the roster is the sharp end of that.
 * `watchRoster` deliberately keeps a local boat the shared copy has not heard
 * of, because that is how a fresh registration survives until it is
 * published. So a boat invented while playing appeared in the LIVE admin
 * console's approvals queue with nothing to mark it, and one tap on Approve
 * wrote it into the real society's roster — where the rules make it
 * permanent, because a boat can never be deleted. A society would be left
 * with a fisherman who does not exist and a second two-crate allowance no
 * control can remove.
 *
 * The audit log crossed the same way: demo blocks and force-releases went
 * into the same hash chain as real ones, unmarked, and `verifyAudit` called
 * the mixture intact — in the artefact the README offers to settle a dispute
 * with.
 *
 * Namespacing is what makes `mode.ts`'s promise — "a copy of the harbour that
 * lives on this phone alone" — true rather than aspirational.
 *
 * Neither name may collide with `mode.ts`'s flag key. The first attempt used
 * `ap-chill-box.demo` for both, so the store overwrote the flag on the first
 * `set` and the app quietly went back to the live harbour on the next
 * reload. The flag now lives under `.mode`; these two own `.store`.
 */
export const STORAGE_KEY = demoMode ? 'ap-chill-box.store.demo' : 'ap-chill-box'
/**
 * A store written under the key round 16 briefly shared with the mode flag.
 * It is unreadable garbage to both modes and would otherwise sit in a 5 MB
 * budget for ever, so the crash-screen reset takes it as it goes past.
 */
const LEGACY_DEMO_KEY = 'ap-chill-box.demo'

const STORAGE_VERSION = 5

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

/**
 * The tail of the audit-log write chain. See `record`: appending is
 * read-digest-write, and two of those interleaved lose a row silently.
 */
let auditChain: Promise<void> = Promise.resolve()

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
    // THIS mode's store, and the orphan an earlier key scheme left behind.
    // Not `localStorage.clear()`, which took three things it had no business
    // touching:
    //
    //  · the mode flag, so a judge who chose the demo came back on the REAL
    //    harbour and the next crate they touched was somebody else's;
    //  · the OTHER mode's store — including the live harbour's audit chain,
    //    which is local-only and is the artefact the README offers to settle
    //    a quay dispute with;
    //  · Firebase Auth's anonymous session. On a phone where IndexedDB is
    //    unavailable — cheap Androids and WebViews, which is the target — it
    //    persists in localStorage. A new `uid` can never be reassigned to a
    //    boat (`database.rules.json`), so the skipper could never sign in as
    //    his own boat again, on any device, with no admin remedy, and could
    //    not release the crate his catch was already in until it aged past
    //    the overstay line and the whole harbour could take it.
    //
    // The caption under that button says "clears what is saved on this
    // phone". This is now what it does.
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_DEMO_KEY)
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
    writeTimer ??= setTimeout(commitWrite, WRITE_EVERY_MS)
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

export type RegistrationError = 'boatName' | 'owner' | 'mobile' | 'mobileTaken' | 'offline' | 'pending'

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

  /**
   * The PIN survives on two controls only — Publish harbour and Reset demo —
   * and they are deployment and demonstration tools, not harbour policy.
   * Everything a skipper might want to look at is open to every skipper.
   */
  unlockAdmin: (pin: string) => Promise<PinResult | 'locked'>
  touchAdmin: () => void
  lockAdmin: () => void
  /**
   * Take back the crates a boat has left past the eight-hour line.
   *
   * No caller passes a decision to this: `tick` finds them with
   * `reclaimable` and hands them over. `indexes` are the exact slots, because
   * a box row can hold one crate the harbour has given up on and another
   * stored an hour ago, and the database will refuse the pair.
   */
  reclaimCrates: (boatId: string, boxId: BoxId, indexes: number[]) => Promise<boolean>
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
    boats: [...seedBoats(), ...seedRecent(now)],
    boxesByHarbour: seedAllBoxes(now),
    ledger: capLedger(seedAllLedgers(now)),
    toast: null,
  }
}

/**
 * Free every stored slot a boat holds in `onlyBoxId` (or across the whole
 * harbour when omitted) and return the ledger rows the release earned.
 *
 * Shared by the skipper's own "sold and clear" and by the harbour taking a
 * space back at eight hours, so the two paths can never drift apart on what
 * gets recorded.
 *
 * `reclaimed` marks the second one. It cannot be derived here: a skipper who
 * collects eight hours and one minute after depositing writes a row that is
 * identical in every timestamp, and the Harbour page must not tell the
 * harbour he abandoned his catch when he turned up for it.
 */
export function releaseSlots(
  boxes: ColdBox[],
  harbourId: HarbourId,
  boatId: string,
  now: number,
  onlyBoxId?: BoxId,
  onlyIndexes?: number[],
  reclaimed = false,
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
      reclaimed,
    })
    return { ...box, slots }
  })

  return { boxes: next, entries }
}

/**
 * v4 → v5: drop `status` from every boat.
 *
 * Exported for the suite. A migration is exactly the kind of code that is
 * only ever run once per phone, in the field, months after it was written —
 * so the alternative to testing the real function is a test that copies it
 * and proves nothing.
 *
 * Anything older than v4 predates multi-harbour support and cannot be
 * half-migrated: `undefined` tells persist to fall back to the fresh seed.
 */
export function migrateStore(persisted: unknown, version: number): unknown {
  if (version !== 4) return undefined
  const state = persisted as { boats?: Record<string, unknown>[] }
  if (!Array.isArray(state.boats)) return undefined
  return {
    ...state,
    boats: state.boats.map(({ status: _status, ...boat }) => boat),
  }
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
        if (!sharedActive || get().syncLive) return true
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
      /**
       * Crates this device has already asked the harbour to take back.
       *
       * `tick` fires once a second and `reclaimCrates` is a round trip, so
       * without this the same crate is submitted sixty times a minute for as
       * long as the write is in flight — and on a 2G tether that is the
       * whole minute. Keyed per crate rather than per boat: a boat can have
       * one crate reaching eight hours while another is still fresh.
       *
       * Never cleared on success, because success removes the crate from
       * `reclaimable` anyway. It is cleared when the attempt did NOT take the
       * crate, so a link that comes back can try again.
       *
       * That used to be a `.catch()` on the promise, and the comment claimed
       * it was a recovery path. `reclaimCrates` has no throwing path: a dead
       * link, a refusal, a lost race, a deadline and a partial write all
       * RESOLVE, carrying their outcome in a `RemoteResult`. So the catch
       * could never fire, and the first failure took that crate out of the
       * eight-hour rule for the rest of the session — on a 2G tether, where
       * `pending` is the ordinary outcome, that is every crate, once. It
       * reads the outcome now.
       */
      const reclaiming = new Set<string>()

      /**
       * The eight-hour rule, run by the clock instead of by a person.
       *
       * THE ACTIVE HARBOUR ONLY. `applyTick` above ages all three because a
       * hold at a harbour you switched away from must still expire in this
       * device's own copy — but that is arithmetic on local state, and this
       * is a WRITE to somebody else's shared harbour. A phone idling on a
       * Nizampatnam screen has no business reclaiming crates at Kakinada on
       * the strength of a snapshot it stopped listening to.
       *
       * And never while the figures are stale. A phone that has been asleep,
       * or in a shed with no signal, wakes holding an hour-old picture; every
       * crate in it looks eight hours old, and acting on that empties a
       * harbour that has been quietly working the whole time.
       *
       * `syncLive` alone is NOT enough for that, and the README claimed it
       * was. It says a listener has not reported an error; it carries no age,
       * and it is still `true` over a pre-sleep snapshot for as long as the
       * transport takes to notice the socket died — which is exactly the
       * window a waking phone runs in. So the SNAPSHOT'S AGE decides, using
       * the same threshold the staleness banner shows the skipper. The
       * transaction re-checks `depositedAt` server-side as well, because a
       * clock is not a substitute for asking.
       */
      const reclaimOverdue = (now: number): void => {
        const { boxesByHarbour, harbourId, syncLive, syncedAt } = get()
        if (sharedActive && (!syncLive || now - (syncedAt ?? 0) > SYNC_STALE_MS)) return
        for (const row of reclaimable(boxesByHarbour[harbourId], now)) {
          const key = `${harbourId}:${row.boxId}:${row.boatId}:${row.since}`
          if (reclaiming.has(key)) continue
          reclaiming.add(key)
          void get()
            .reclaimCrates(row.boatId, row.boxId, row.indexes)
            .then((took) => {
              if (!took) reclaiming.delete(key)
            })
            .catch(() => reclaiming.delete(key))
        }
      }

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
        if (result.error === 'ledgerLost') {
          // The crates ARE free — this is not a failed release. What was
          // lost is the row the society bills from, and nothing retries it.
          set({ toast: toast('warn', t(lang, 'syncLedgerLost')) })
          return
        }
        if (result.error === 'pending') {
          // We stopped waiting; the write did not. It may still commit, so
          // this must not read as a failure — the box is the only place that
          // can answer, and booking again first is how a boat ends up over
          // its cap with a crate nobody is looking for.
          set({ toast: toast('warn', t(lang, 'syncPending')) })
          return
        }
        if (result.error === 'unsettled') {
          // Nothing was written and the link is fine. Trying again is the
          // right move, and "no signal" on full bars is not.
          set({ toast: toast('warn', t(lang, 'syncBusy')) })
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
       * The signed-in boat, if this harbour still has one by that number.
       *
       * Every action that moves a crate goes through this. It used to also
       * ask whether the boat was approved and not blocked, because an admin
       * could change either while its owner had a sheet open. Nobody can now:
       * a boat on the roster may book, full stop. What survives is the
       * roster check itself, which is not ceremony — switching harbours
       * clears `myBoatId`, and a hull number means a different boat at each
       * of the three societies.
       */
      const activeBoatId = (): string | null => {
        const { boats, harbourId, myBoatId } = get()
        const me = boats.find((b) => b.harbourId === harbourId && b.id === myBoatId)
        return me?.id ?? null
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

          /*
           * AFTER the `set`, and this line's position is the whole feature.
           *
           * It ran before it, and on the local path `reclaimCrates` reaches
           * its own `set` synchronously — so the reclaim emptied the slot and
           * then `set(patch)` put the crate straight back from `next`, which
           * was computed from PRE-tick boxes. The ledger row is not in
           * `patch`, so it survived: the harbour published "not collected",
           * named the boat, billed the cycle, and the crate never moved.
           *
           * It only bit when `applyTick` had also moved something, because
           * `patch.boxesByHarbour` is set only when `changed` — so a quiet
           * second reclaimed correctly and the browser check that verified
           * this feature happened to land on one. A cold start moves plenty.
           */
          reclaimOverdue(now)
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
          // Compare what the roster actually holds.
          //
          // A boat registered on ANOTHER phone arrives from the shared
          // roster with only the last four digits of its number — by design,
          // so a stranger cannot read a fleet's phone book off the wire. A
          // ten-digit equality test therefore matched nothing but this
          // phone's own registrations, and the duplicate check was silently
          // inert for the entire rest of the harbour.
          //
          // Ten digits are compared in full where we have them, and only the
          // shared four otherwise. Four digits can collide by chance — about
          // one boat in ten thousand — so this refuses a legitimate number
          // occasionally; the admin approves every registration and can wave
          // it through. Missing every real duplicate is the worse trade,
          // because a second boat is a second 2-crate allowance and a boat
          // can never be deleted.
          const taken = boats.some(
            (b) =>
              b.harbourId === harbourId &&
              (b.mobile.length >= 10 ? b.mobile === digits : b.mobile.slice(-4) === digits.slice(-4)),
          )
          if (taken) {
            return { ok: false, error: 'mobileTaken' }
          }

          const boat: Boat = {
            id: nextBoatId(boats, harbourId),
            harbourId,
            nameEn: name,
            nameTe: name,
            owner: person,
            mobile: digits,
            registeredAt: serverNow(),
          }

          // The database decides the hull number, because only it can see
          // every phone's registrations. It also refuses a slot booked by a
          // boat it has never heard of, so this must land before booking.
          if (sharedActive) {
            if (!requireLink()) return { ok: false, error: 'offline' }
            const id = await claimBoat(harbourId, boat)
            // Distinct from `null`. `null` is the harbour refusing us and
            // nothing was written; `pending` is us giving up on the wait
            // while a hull number may still be claimed for this boat. Saying
            // "nothing was saved" there invites a second registration, and a
            // boat can never be deleted once it exists.
            if (id === 'pending') return { ok: false, error: 'pending' }
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

          if (sharedActive) {
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

          // No approval gate. A boat registered ten seconds ago books the
          // same crate as a boat registered ten years ago — the roster check
          // is only that this harbour has a boat by that number, because
          // hull numbers repeat across the three societies.
          const me = boats.find((b) => b.harbourId === harbourId && b.id === myBoatId)
          if (!me) return false

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
          if (sharedActive) {
            const result = await reserveRemote(harbourId, boxId, myBoatId, crates, species)
            if (result.ok) return true
            // Every refusal gets its own reason. None of them is about who
            // the skipper is: there is no state a boat can be in that refuses
            // a booking, and no approval to be waiting on.
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
          if (sharedActive) {
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
          if (sharedActive) {
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
          if (sharedActive) {
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
        /*
         * Serialised, because two overlapping calls used to delete a row.
         *
         * `appendAudit` awaits a digest between reading the tip of the chain
         * and writing the new one, so two calls that overlap on that await
         * both read the same tip and the second `set` overwrites the first.
         * The surviving chain is perfectly well-formed — a hole is not a
         * break — so `verifyAudit` still painted "Audit intact" in green.
         * Blocking and Unblocking two boats in quick succession does it: the
         * Block button has no busy guard, unlike Approve and Reject.
         */
        record: (action, target, detail = '') => {
          auditChain = auditChain
            .then(async () => {
              const next = await appendAudit(get().audit, action, target, detail)
              // Capped, like the ledger. `verifyAudit` anchors to the first
              // surviving row's own `prevHash` rather than to `genesis`, so
              // trimming the head does not read as tampering.
              set({ audit: next.length > AUDIT_LIMIT ? next.slice(-AUDIT_LIMIT) : next })
            })
            .catch(() => {
              set({ toast: toast('warn', t(get().lang, 'auditFailed')) })
            })
          return auditChain
        },

        reclaimCrates: async (boatId, boxId, indexes) => {
          const { boxesByHarbour, harbourId, ledger } = get()
          // Only the crates the harbour has actually given up on. A box row
          // aggregates every crate a boat holds there, so a boat with one
          // crate past eight hours and one stored an hour ago must not be
          // handed over as a pair — the rules would rightly refuse the fresh
          // crate and fail the whole write. `reclaimable` picks the indexes.
          const result = releaseSlots(
            boxesByHarbour[harbourId],
            harbourId,
            boatId,
            serverNow(),
            boxId,
            indexes,
            true,
          )
          // `false` everywhere means "the crate is still there, try again".
          // The caller latches a crate out of the eight-hour rule on `true`,
          // so anything short of the crate actually leaving the box has to
          // report it — silence here is a crate nobody comes back for.
          if (result.entries.length === 0) return false

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
          const logIt = (crates: number, confirmed = true) =>
            void get().record(
              'slot.reclaim',
              `#${boatId}`,
              `${harbourId} ${boxId} · ${crates} crates${confirmed ? '' : ' · outcome not confirmed'}`,
            )

          if (sharedActive) {
            if (!requireLink()) return false
            const outcome = await releaseRemote(harbourId, boatId, boxId, indexes, true)
            // NOT `reportFailure`. Nobody tapped anything: this is a clock
            // firing in the background, and two phones reaching eight hours
            // in the same second is the DESIGNED case — the loser gets
            // `stale`, which would pop "that is already done" on the screen of
            // a skipper looking at a capacity gauge, about a crate that is not
            // his. A refusal or a dead link is equally not his business. The
            // outcome decides whether we retry; it does not decide what to
            // say to a bystander.
            // Recorded whenever a crate actually came out, including a
            // partial release. Logging only on `ok` meant a crate was
            // freed, billed in the ledger, and left with no record of why
            // it came out.
            if (outcome.freed) {
              logIt(outcome.freed)
              return true
            } else if (!outcome.ok && outcome.error === 'pending') {
              // The deadline fired; the write did not stop. It very likely
              // lands, freeing crates and writing the billing rows, and
              // logging nothing here would recreate the hole this branch was
              // written to close — a crate taken back over a skipper's head
              // and billed, with no record of it. So the row goes in, marked
              // for what it is: an action taken, with an outcome nobody
              // confirmed.
              logIt(indexes.length, false)
              // Latched: the write may still land, and retrying it would take
              // a crate the harbour has already taken and bill it twice.
              return true
            }
            return false
          }

          putBoxes(result.boxes, { ledger: capLedger([...ledger, ...result.entries]) })
          logIt(result.entries[0].crates)
          return true
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
          // The store refuses this, not just the screen. `requireLink()`
          // returns true when there is no shared harbour — it guards the
          // link, not the mode — so the only thing standing between a demo
          // session and a real publish was a `{sharedActive ? …}` in
          // AdminScreen's JSX. That is one refactor away from seeding the
          // society's live database with invented boats and pretend crates,
          // and no rule can delete a boat once it is written.
          if (!sharedActive) return
          if (!requireLink()) return
          try {
            const { failed, boxesOk, historyLost, historyVerified, timedOut } = await seedHarbour(
              harbourId,
              boxesByHarbour[harbourId],
              boats.filter((b) => b.harbourId === harbourId),
              ledger.filter((e) => e.harbourId === harbourId),
            )
            // Some through and some refused is neither success nor failure,
            // and reporting it as either would be a lie. The boxes failing is
            // its own case: the roster landed, and pressing this again is all
            // that is needed.
            // Nothing is known after a timeout, so nothing is claimed. The
            // counts above are all zero because they were never taken, and
            // reporting them as measurements — "no boats refused, the boxes
            // were refused, no history lost" — put three untrue statements
            // on screen and a fourth into the audit log.
            if (timedOut) {
              set({ toast: toast('warn', t(lang, 'adminPublishPending')) })
              void get().record('harbour.publish', harbourId, 'outcome not confirmed')
              return
            }

            // History is its own case for the same reason. It only counts
            // when the harbour had none before — a refusal on a second
            // publish is the append-only rule working — and when it does
            // count, the months the console bills from are the thing that
            // did not arrive, which is not something to report as "done".
            set({
              toast: !boxesOk
                ? toast('warn', t(lang, 'adminPublishRetry'))
                : failed > 0
                  ? toast('warn', t(lang, 'adminPublishPartial', failed))
                  : historyLost > 0
                    ? toast(
                        'warn',
                        t(
                          lang,
                          // "may not have been written" when the count is a
                          // refusal count rather than a verified absence —
                          // too many rows to check one at a time. Reporting
                          // an unverified number as a measurement is the
                          // same class of lie as reporting zero for one.
                          historyVerified === false
                            ? 'adminPublishHistoryUnsure'
                            : 'adminPublishNoHistory',
                          historyLost,
                        ),
                      )
                    : toast('ok', t(lang, 'adminPublishDone')),
            })
            void get().record(
              'harbour.publish',
              harbourId,
              `${failed} refused · ${historyLost} history rows ${
                historyVerified === false ? 'possibly lost' : 'lost'
              }`,
            )
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
          /*
           * DEMO ONLY. This is the last power that was left, and it was a
           * bigger one than the four this round deleted.
           *
           * It used to reset the SHARED harbour: behind PIN 2468, it wiped
           * every stored crate and every hold belonging to every phone in the
           * society — strictly more than the Force release it outlived, which
           * could only take a crate the harbour had already given up on. So
           * "nobody clears anyone's crate by hand" was on the Harbour tab,
           * "nobody can edit this" was on the record, and the trade-offs note
           * said a clock rather than a person frees a crate, while one PIN
           * could still empty three boxes. Four honest-sounding sentences and
           * one control that made all four false.
           *
           * The demonstration it exists for is served by demo mode, which is
           * a copy of the harbour on this phone alone. There is no longer any
           * reason for a live society's crates to be resettable by anybody,
           * and now there is no way.
           */
          if (sharedActive) return
          const fresh = seed(serverNow())

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
      /**
       * v4 → v5 drops `status` from every boat.
       *
       * Not a reseed, which is what this used to do for every old version
       * and what the one-line version of this change would have done again.
       * A reseed here would destroy the local audit chain — the hash-chained
       * record the README offers to settle a quay dispute with, which lives
       * on this phone and nowhere else — along with any ledger rows not yet
       * published. Round 18 fixed exactly this hazard on the crash screen's
       * Reset; shipping it back through the migration path two rounds later
       * would be the same bug through a different door.
       *
       * Anything older than v4 predates multi-harbour support and still
       * reseeds: that shape cannot be half-migrated.
       */
      migrate: (persisted, version) => migrateStore(persisted, version),
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
 * Wake a demo harbour that has slept through its own overstay window.
 *
 * The seeded occupancy is anchored to the moment it was created — crates
 * deposited half an hour to seven hours ago, one of them deliberately late.
 * That is a plausible harbour when you make it and a harbour in total
 * violation six hours later, because nothing in a demo ever collects its
 * fish. Open the app the next morning and every crate is red, MyStatusCard
 * tells your own boat to clear its slot, and the one flag that is supposed
 * to mean something means nothing because everything has it.
 *
 * So on a COLD START only, in demo mode only, and only when EVERY crate in
 * the harbour is past the overstay line — which cannot happen in normal use,
 * because a demo that is being used has fresh crates in it — the boxes are
 * reseeded to now. A judge always gets a live-looking harbour; a skipper
 * mid-flow never loses one, because mid-flow is exactly the state this
 * refuses to touch.
 *
 * The shared harbour is deliberately NOT included. There the crates are real
 * data belonging to other people, and an app that quietly rewrites those
 * because they look stale is the opposite of this one's first rule. The
 * admin's Reset demo is how a shared harbour is refreshed, by a person, on
 * purpose.
 */
export function freshenDemoHarbour(): void {
  // `demoMode`, NOT `!sharedActive`. Those differ for a build with no
  // Firebase config, which is a local DEPLOYMENT and not a sandbox: one
  // device, no sync, and real crates belonging to a real harbour master. It
  // used to qualify here, so two skippers' fish deposited at 22:00 were
  // deleted at the 05:00 cold start and replaced with fabricated occupancy —
  // silently, with no ledger row to bill from and no audit row to explain
  // it. One crate six hours and one minute old was enough.
  if (!demoMode) return
  const { boxesByHarbour, harbourId } = useDockStore.getState()
  const now = serverNow()
  const held = boxesByHarbour[harbourId]
    .flatMap((box) => box.slots)
    .filter((s) => s.status !== 'empty')
  if (held.length === 0 || !held.every((slot) => isOverdue(slot, now))) return
  // THE HARBOUR THAT WAS CHECKED, and only that one.
  //
  // The first version tested the active harbour and then wrote
  // `seedAllBoxes(now)`, which returns a fresh record for all three. So
  // looking around Kakinada — whose seeded crates had aged out, and whose
  // seed contains no hold for the guard to catch on — reseeded Nizampatnam
  // too, and the two crates a skipper deposited an hour ago were gone: no
  // ledger row, no audit row, no toast, and the catch simply not in the app.
  // A guard that inspects one thing and a write that changes three is not a
  // guard at all.
  useDockStore.setState({
    boxesByHarbour: { ...boxesByHarbour, [harbourId]: createMockBoxes(harbourId, now) },
  })
}

/**
 * Follow the shared harbour, if this session is on one.
 *
 * Called once at startup and again whenever the harbour changes. The
 * listener overwrites this device's boxes with the shared copy, which is
 * what makes two phones agree. It does nothing at all when `sharedActive` is
 * false — either no Firebase is configured, or this session is in demo mode
 * — and the app then stays local, exactly as it did before either existed.
 */
export function startHarbourSync(): () => void {
  if (!sharedActive) return () => {}
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
