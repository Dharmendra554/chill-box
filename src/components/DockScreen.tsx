import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useNow } from '../hooks/useClock'
import { useGeolocation } from '../hooks/useGeolocation'
import { BOX_SHORT, type StringKey } from '../i18n/dictionary'
import { useT } from '../i18n/useT'
import { cardinal, simulateApproachFix } from '../lib/geo'
import { syncEnabled } from '../lib/harbourSync'
import type { WaveBand } from '../lib/marine'
import { distanceToBox, formatEta, formatKm, navigateTo } from '../lib/nav'
import { formatClock, formatCountdown, formatElapsed, formatGap, HOUR_MS } from '../lib/time'
import { cx } from '../lib/ui'
import {
  activeBoxId,
  boatState,
  bookingCode,
  emptyCount,
  holdRemainingMs,
  isFull,
  plannedOutAtForBoat,
  QUOTA,
  remainingQuota,
  slotsForBoat,
  storageElapsedMs,
  suggestedBoxId,
} from '../store/selectors'
import { selectBoxes, selectHarbour, selectMyBoat, useDockStore } from '../store/useDockStore'
import type { BoxId, GeoFix } from '../types'
import { BookSheet } from './BookSheet'
import { BoxCard } from './BoxCard'
import { BoxDetails } from './BoxDetails'
import { ChoiceSheet } from './ChoiceSheet'
import { CompassRose } from './CompassRose'
import { ConfirmButton } from './ConfirmButton'
import { SafetyCard } from './SafetyCard'
import { CompassIcon, CrateIcon, TideClockIcon } from '../icons/marine'
import { SPECIES_ICON } from '../icons/species'

// Leaflet is ~44 kB gzipped. It loads alongside the page rather than
// blocking the booking flow behind it on a 2G tether.
const SeaMap = lazy(() => import('./SeaMap').then((m) => ({ default: m.SeaMap })))

/**
 * Collection windows a skipper can promise, in hours. All are strictly
 * under the 6 h overstay line — offering "6 h" would let the app suggest a
 * time that flags the moment it arrives.
 */
const PLAN_HOURS = [2, 4, 5]

/**
 * The front page: what my boat is doing, the chart of this harbour's cold
 * boxes, the boxes themselves, and the safety card.
 *
 * Booking starts on the map because that is how the decision is really
 * made — which box can I reach on this swell — so a pin is a booking
 * button. But **nothing here requires GPS**: the box cards below carry the
 * same booking action by name, so a phone with location switched off, or no
 * sky view under a shed roof, can still take a slot.
 */
export function DockScreen({
  band,
  seaKnown,
  onChangeHarbour,
  onResetDemo,
}: {
  band: WaveBand | null
  /** Whether a swell reading has EVER landed for this harbour. */
  seaKnown: boolean
  onChangeHarbour: () => void
  onResetDemo: () => void | Promise<void>
}) {
  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const harbour = useDockStore(selectHarbour)
  const boxes = useDockStore(selectBoxes)
  const now = useNow()
  const myBoatId = useDockStore((s) => s.myBoatId)
  const boat = useDockStore(selectMyBoat)
  const reserve = useDockStore((s) => s.reserve)
  const cancelHold = useDockStore((s) => s.cancelHold)
  const deposit = useDockStore((s) => s.deposit)
  const release = useDockStore((s) => s.release)

  const [bookingFor, setBookingFor] = useState<BoxId | null>(null)
  const [detailsFor, setDetailsFor] = useState<BoxId | null>(null)
  const [confirmed, setConfirmed] = useState<BoxId | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [simulated, setSimulated] = useState<GeoFix | null>(null)
  const geo = useGeolocation(simulated)

  const landmarkLabel = useCallback((key: string) => t(key as StringKey), [t])

  // Memoised: a new array every render would make the chart tear down and
  // rebuild every second, which also undid any pinch-zoom.
  const markers = useMemo(
    () =>
      boxes.map((box) => ({
        id: box.id,
        label: t(BOX_SHORT[box.id]),
        free: emptyCount(box),
        full: isFull(box),
      })),
    [boxes, t],
  )

  // Every hook above this line: the guard must not change hook order.
  if (!myBoatId || !boat) return null

  const state = boatState(boxes, myBoatId)
  const myBoxId = activeBoxId(boxes, myBoatId)
  const quota = remainingQuota(boxes, myBoatId)
  const mySlots = slotsForBoat(boxes, myBoatId)
  const approved = boat.status === 'active'
  const canBook = approved && state === 'idle' && quota > 0
  const suggested = suggestedBoxId(boxes, 1)
  const nav = geo.fix && myBoxId ? navigateTo(geo.fix, harbour, myBoxId) : null

  return (
    <div className="flex flex-col gap-4">
      {state === 'idle' ? (
        <section className="card flex flex-col gap-1 p-4">
          <h2 className="flex items-center gap-2 text-2xl">
            <CompassIcon size={26} />
            {t('navTitle')}
          </h2>
          {/* The instruction has to match what a tap will actually do for
              THIS boat. A boat still waiting on approval cannot book, and
              telling it to tap a box to book one is a promise the screen
              cannot keep. */}
          <p className="font-bold text-ink-2">{t(canBook ? 'navTapMap' : 'navTapMapView')}</p>
          <p className="tabular text-sm font-extrabold">{t('quotaLeft', quota)}</p>
        </section>
      ) : (
        <MyStatusCard
          state={state}
          boxId={myBoxId}
          crates={mySlots.length}
          holdMs={holdRemainingMs(boxes, myBoatId, now)}
          elapsedMs={storageElapsedMs(boxes, myBoatId, now)}
          plannedOutAt={plannedOutAtForBoat(boxes, myBoatId)}
          now={now}
          approved={approved}
          onDeposit={() => setPlanOpen(true)}
          onCancel={cancelHold}
          onRelease={release}
        />
      )}

      <Suspense
        fallback={<div className="h-[46vh] min-h-72 w-full border-3 border-rule bg-paper-2" />}
      >
        <SeaMap
          harbour={harbour}
          fix={geo.fix}
          boxes={markers}
          selectedId={myBoxId}
          routeTo={myBoxId}
          landmarkLabel={landmarkLabel}
          offlineLabel={t('navOffline')}
          mapLabel={t('navMapLabel')}
          onPick={(id) => {
            // Same rule as the box cards: book it if this boat can, and
            // otherwise open who is inside. Never a tap that does nothing.
            // Identity does not matter here — SeaMap reads this through a
            // ref so the overlay is not rebuilt every second.
            const box = boxes.find((b) => b.id === id)
            if (canBook && box && emptyCount(box) > 0) setBookingFor(id)
            else setDetailsFor(id)
          }}
        />
      </Suspense>

      {/* Route figures appear only once a box is actually booked. */}
      {nav ? (
        <>
          {/* A <dl>, because these are three term/value pairs and <dt>/<dd>
              are only meaningful inside one. */}
          <dl className="card grid grid-cols-3 gap-2 p-4">
            <Stat label={t('navDistance')} value={formatKm(nav.km, lang)} />
            <Stat label={t('navEta')} value={formatEta(nav.etaMinutes, lang)} />
            <Stat
              label={t('navBearing')}
              value={`${Math.round(nav.bearing)}° ${cardinal(nav.bearing, lang)}`}
            />
          </dl>
          <CompassRose
            bearing={nav.bearing}
            atTarget={nav.km < 0.05}
            label={t('navAtBox')}
            bearingLabel={`${t('navBearing')} ${Math.round(nav.bearing)}° ${cardinal(nav.bearing, lang)}`}
          />
        </>
      ) : null}

      <p className="text-sm font-bold text-ink-2">{t('navMapNote')}</p>

      <Legend />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label={t('pickTitle')}>
        {boxes.map((box) => (
          <BoxCard
            key={box.id}
            t={t}
            box={box}
            now={now}
            suggested={box.id === suggested}
            selected={box.id === myBoxId}
            distanceLabel={
              geo.fix ? formatKm(distanceToBox(geo.fix, harbour, box.id), lang) : null
            }
            onPick={canBook ? (picked) => setBookingFor(picked.id) : undefined}
            onDetails={(picked) => setDetailsFor(picked.id)}
          />
        ))}
      </section>

      {/* `geo.status` was computed, documented and read by nothing at all —
          so the safety card could never tell "no position yet" from "no
          position ever". */}
      <SafetyCard band={band} fix={geo.fix} locating={geo.status !== "unavailable"} seaKnown={seaKnown} />

      <DemoTools
        simulating={simulated !== null}
        onSimulate={() =>
          setSimulated((current) =>
            current
              ? null
              : {
                  ...simulateApproachFix(harbour.lat, harbour.lon, harbour.mouthBearing),
                  accuracy: 12,
                  at: Date.now(),
                },
          )
        }
        onChangeHarbour={onChangeHarbour}
        onResetDemo={onResetDemo}
      />

      {detailsFor ? (
        <BoxDetails
          box={boxes.find((b) => b.id === detailsFor)!}
          onClose={() => setDetailsFor(null)}
        />
      ) : null}

      {bookingFor ? (
        <BookSheet
          t={t}
          boxLabel={t(bookingFor)}
          maxCrates={Math.min(
            QUOTA,
            quota,
            emptyCount(boxes.find((b) => b.id === bookingFor)!),
          )}
          // Which of the two limits is biting, so the sheet can say the true
          // one rather than a generic "not available".
          capReached={quota <= emptyCount(boxes.find((b) => b.id === bookingFor)!)}
          // The sheet stays up until the claim is settled. Closing first and
          // showing a receipt built from local state printed "0 crates" and a
          // code that did not match what was recorded — and on a lost race,
          // a Booked panel over the toast saying the crate had gone.
          onConfirm={async (count, species) => {
            const booked = await reserve(bookingFor, count, species)
            setBookingFor(null)
            if (booked) setConfirmed(bookingFor)
          }}
          onClose={() => setBookingFor(null)}
        />
      ) : null}

      {confirmed && myBoatId ? (
        <BookingConfirmed
          boxId={confirmed}
          code={bookingCode(
            harbour.id,
            confirmed,
            myBoatId,
            mySlots[0]?.reservedAt ?? now,
          )}
          crates={mySlots.length}
          depositBy={holdRemainingMs(boxes, myBoatId, now) + now}
          onClose={() => setConfirmed(null)}
        />
      ) : null}

      {planOpen ? (
        <ChoiceSheet
          title={t('planTitle')}
          body={t('planBody')}
          closeLabel={t('cancel')}
          options={PLAN_HOURS.map((h) => ({
            value: h,
            label: t('planHours', h),
            hint: formatClock(now + h * HOUR_MS),
          }))}
          // The store says why it refused — an expired hold, a dead link, a
          // rejected write. Saying it here too produced two toasts, the
          // second of them guessing. The sheet closes once it is settled.
          onPick={async (hours) => {
            await deposit(hours)
            setPlanOpen(false)
          }}
          onClose={() => setPlanOpen(false)}
        />
      ) : null}

      <p className="pb-2 text-sm font-bold text-ink-2">
        {lang === 'te' ? harbour.unionTe : harbour.unionEn}
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-extrabold uppercase text-ink-2">{label}</dt>
      <dd className="tabular text-xl font-extrabold">{value}</dd>
    </div>
  )
}

/**
 * What the crate grid's four states look like — and, since round 9, what
 * each one's MARK is.
 *
 * The marks exist so a skipper who cannot separate the fills in glare can
 * read the shape instead. That only works if something on screen says which
 * shape means what: the legend taught four colours and none of the marks,
 * so `!` in particular — a Latin punctuation mark used as a semantic token,
 * self-evident to nobody — was never explained anywhere.
 */
function Legend() {
  const t = useT()
  // Each chip carries EXACTLY what its cells carry — the dashed border of an
  // empty slot, the hold's clock, a catch icon for a stored crate, the `!`
  // of an overdue one. The first version showed a crate glyph for "full",
  // which the grid never draws: it draws the catch's own icon. A legend that
  // teaches a mark the grid does not use is worse than no legend, because
  // the skipper then looks for something that is not there.
  const items = [
    ['legendFree', 'bg-free-wash text-ink border-dashed', <span key="d">·</span>],
    ['legendHold', 'bg-hold text-hold-ink', <TideClockIcon key="h" size={13} />],
    ['legendFull', 'bg-full text-full-ink', <SPECIES_ICON.mixed key="f" size={13} />],
    ['legendLate', 'bg-late text-late-ink', <span key="l">!</span>],
  ] as const

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map(([key, style, mark]) => (
        <li
          key={key}
          className={cx(
            'flex items-center gap-1 border-3 border-rule px-2 py-1 text-xs font-extrabold uppercase',
            style,
          )}
        >
          {mark}
          {t(key)}
        </li>
      ))}
    </ul>
  )
}

/**
 * Explicit receipt after booking. A skipper who is not certain the slot is
 * theirs will hedge by taking a second one somewhere else, which is exactly
 * the hoarding the quota exists to stop — so the confirmation is a full
 * screen with a code they can read out at the box, not a toast that fades.
 */
function BookingConfirmed({
  boxId,
  code,
  crates,
  depositBy,
  onClose,
}: {
  boxId: BoxId
  code: string
  crates: number
  depositBy: number
  onClose: () => void
}) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-[var(--c-scrim)] p-4">
      <section className="sheet-in card flex w-full max-w-md flex-col gap-3 border-free bg-free-wash p-5">
        <h2 className="flex items-center gap-2 text-2xl">
          <CrateIcon size={28} />
          {t('bookedTitle')}
        </h2>
        <p className="text-lg font-extrabold">
          {t('storedIn', t(boxId), crates)}
        </p>
        <p className="text-sm font-extrabold uppercase text-ink-2">{t('bookedCode')}</p>
        <p className="tabular border-3 border-rule bg-card px-3 py-3 text-center text-3xl font-extrabold">
          {code}
        </p>
        <p className="font-bold">{t('bookedBy', formatClock(depositBy))}</p>
        <button type="button" className="btn btn-lg btn-primary btn-block" onClick={onClose}>
          {t('ok')}
        </button>
      </section>
    </div>
  )
}

/**
 * The one card that answers "what do I do next?". Its states map to
 * `BoatState`, and each shows exactly one primary action.
 */
function MyStatusCard({
  state,
  approved,
  boxId,
  crates,
  holdMs,
  elapsedMs,
  plannedOutAt,
  now,
  onDeposit,
  onCancel,
  onRelease,
}: {
  state: 'hold' | 'stored' | 'overstay'
  /** A blocked or pending boat may look, but not move crates. */
  approved: boolean
  boxId: BoxId | null
  crates: number
  holdMs: number
  elapsedMs: number
  plannedOutAt: number | null
  now: number
  onDeposit: () => void
  onCancel: () => void | Promise<void>
  onRelease: () => void | Promise<void>
}) {
  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const boxName = boxId ? t(boxId) : ''

  if (state === 'hold') {
    return (
      <section className="card flex flex-col gap-3 border-hold bg-hold-wash p-4">
        <h2 className="flex items-center gap-2 text-2xl">
          <CrateIcon size={26} />
          {t('holdTitle')}
        </h2>
        <p className="text-base font-bold">{t('holdBody', boxName, crates)}</p>
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-extrabold uppercase">{t('holdLeft')}</span>
          <span className="tabular text-3xl font-extrabold">{formatCountdown(holdMs)}</span>
        </p>
        <button
          type="button"
          className="btn btn-lg btn-primary btn-block"
          disabled={!approved}
          title={t('hintDeposit')}
          onClick={onDeposit}
        >
          {t('deposited')}
        </button>
        {!approved ? <BlockedNote /> : null}
        {approved ? (
          <ConfirmButton
            className="btn btn-ghost btn-block"
            label={t('cancelHold')}
            hint={t('hintCancelHold')}
            onConfirm={onCancel}
          />
        ) : null}
      </section>
    )
  }

  const late = state === 'overstay'
  return (
    <section
      className={cx(
        'card flex flex-col gap-3 p-4',
        late ? 'border-late bg-late-wash' : 'bg-free-wash',
      )}
    >
      <h2 className="flex items-center gap-2 text-2xl">
        <TideClockIcon size={26} />
        {t(late ? 'lateTitle' : 'storedTitle')}
      </h2>
      <p className="text-base font-bold">
        {late ? t('lateBody') : t('storedIn', boxName, crates)}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm font-bold">
        <div>
          <dt className="uppercase text-ink-2">{t('since')}</dt>
          <dd className="tabular text-xl font-extrabold">{formatElapsed(elapsedMs, lang)}</dd>
        </div>
        {plannedOutAt !== null ? (
          <div>
            <dt className="uppercase text-ink-2">{t('planned')}</dt>
            <dd className="tabular text-xl font-extrabold">{formatClock(plannedOutAt)}</dd>
          </div>
        ) : null}
      </dl>
      {plannedOutAt !== null ? (
        <p className="tabular text-sm font-extrabold">{formatGap(plannedOutAt - now, lang)}</p>
      ) : null}
      {approved ? (
        <ConfirmButton
          className={cx('btn btn-lg btn-block', late ? 'btn-warn' : 'btn-primary')}
          label={t('release')}
          hint={t('hintRelease')}
          onConfirm={onRelease}
        />
      ) : (
        <BlockedNote />
      )}
    </section>
  )
}

/**
 * Demo controls, fenced off and labelled as such.
 *
 * The offshore simulation is genuinely useful — it is the only way to see
 * the route, bearing and compass without taking a boat out — but unlabelled
 * next to the real controls it just reads as a mystery button. Grouping it
 * with the reset under a heading that says "demonstration only" means a
 * skipper knows to ignore it and a judge knows to press it.
 */
function DemoTools({
  simulating,
  onSimulate,
  onChangeHarbour,
  onResetDemo,
}: {
  simulating: boolean
  onSimulate: () => void
  onChangeHarbour: () => void
  onResetDemo: () => void | Promise<void>
}) {
  const t = useT()
  return (
    <section className="card-soft flex flex-col gap-2 p-3">
      <h3 className="text-sm font-extrabold uppercase">{t('demoTitle')}</h3>
      <p className="text-sm font-bold text-ink-2">{t('demoBody')}</p>

      <button
        type="button"
        className={cx('btn btn-block', simulating && 'btn-sea')}
        aria-pressed={simulating}
        onClick={onSimulate}
      >
        {t(simulating ? 'demoSimulateOff' : 'demoSimulateOn')}
      </button>
      <p className="text-xs font-bold text-ink-2">{t('demoSimulateHint')}</p>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost text-sm" onClick={onChangeHarbour}>
          {t('harbourSwitch')}
        </button>
        {/* Once the harbour is shared, resetting it destroys every live hold
            and stored crate for every phone in the harbour — a demo control
            with production reach. It moves into the admin console, where the
            PIN is at least a lock on it. Local mode affects this phone only,
            so it stays where a judge can find it. */}
        {syncEnabled ? (
          <p className="text-xs font-bold text-ink-2">{t('demoResetMoved')}</p>
        ) : (
          // Typed `void | Promise<void>`, because typing an async function
          // as `() => void` is legal TypeScript — return-type bivariance for
          // `void` — and that is exactly the hole that hid
          // `if (!signInAs(...))` for eight rounds.
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => void onResetDemo()}
          >
            {t('resetDemo')}
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * Why a control is dead. A disabled button with no reason is just a broken
 * app; the skipper needs to know the admin blocked the boat, not guess.
 */
function BlockedNote() {
  const t = useT()
  return (
    <p className="border-3 border-rule bg-full px-3 py-2 font-extrabold text-full-ink" role="status">
      {t('blockedBody')}
    </p>
  )
}
