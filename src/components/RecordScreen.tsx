import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNow } from '../hooks/useClock'
import { boatName, boatsAt } from '../data/boats'
import { BOX_SHORT } from '../i18n/dictionary'
import { useT } from '../i18n/useT'
import {
  boatUsage,
  boxSplit,
  dailyCrates,
  entriesForMonth,
  hourHistogram,
  hourLabel,
  ledgerFor,
  monthInsight,
  monthKeys,
  monthTotals,
  speciesSplit,
} from '../lib/stats'
import { verifyAudit } from '../lib/adminAuth'
import { saveCsv } from '../lib/download'
import { sharedActive } from '../lib/mode'
import {
  formatDayClock,
  formatGap,
  monthKey,
  monthLabel,
  RECLAIM_MS,
  startOfLocalDay,
} from '../lib/time'
import { cx } from '../lib/ui'
import { occupancyRows } from '../store/selectors'
import { selectBoxes, selectHarbour, useDockStore } from '../store/useDockStore'
import { ConfirmButton } from './ConfirmButton'
import { HelmIcon } from '../icons/marine'
import { SPECIES_ICON } from '../icons/species'

/** Audit rows rendered before the "show the rest" button. */
const AUDIT_PAGE = 50

/** Why the month-on-month comparison is not on screen. See `monthInsight`. */
const TREND_MISSING = {
  noPrevious: 'adminTrendFirst',
  monthRunning: 'adminTrendRunning',
  clipped: 'adminTrendClipped',
  emptyPrevious: 'adminTrendEmpty',
} as const

/**
 * The harbour's record of itself, open to every boat in it.
 *
 * This was the harbour-master console: a PIN-gated screen at a hidden URL
 * holding Approve, Reject, Block and Force release. Those four were the only
 * authority in an app whose brief opens with "without a central harbour
 * master", and in a real village they are a monopoly — whoever holds the PIN
 * decides who may store fish. They are gone. A boat may book from the second
 * it registers, and the eight-hour rule frees a blocked box with no
 * intervention from anybody.
 *
 * What is left was never authority: who is holding what right now, the
 * monthly record, and the numbers that change a decision — how full the
 * boxes really run, how long a crate sits, how often the six-hour rule is
 * broken, whether demand is rising, and the hour boats actually land. That
 * last one is what staffs the quay. A harbour with nobody in charge needs
 * all of it visible to everybody, so there is no PIN on any of it.
 *
 * The PIN survives on `HarbourTools` alone — Publish harbour and Reset demo
 * — which are deployment and demonstration controls, not harbour policy.
 * Its honest limits live in `lib/adminAuth.ts`.
 *
 * NO MOBILE NUMBERS. This screen is open to anyone with the link now, and
 * publishing twenty families' phone numbers on it would be a breach with no
 * upside. `HarbourScreen` has always argued this for the roster; the CSV
 * export dropped its Mobile column for the same reason.
 */
export function RecordScreen() {
  return <Console />
}

function PinGate() {
  const t = useT()
  const unlockAdmin = useDockStore((s) => s.unlockAdmin)
  const lockedUntil = useDockStore((s) => s.adminLockedUntil)
  const now = useNow()

  const [pin, setPin] = useState('')
  const [problem, setProblem] = useState<'wrong' | 'unavailable' | null>(null)

  const lockedFor = Math.max(0, Math.ceil((lockedUntil - now) / 1000))

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault()
        const result = await unlockAdmin(pin)
        setPin('')
        // `locked` and `ok` are not problems to report here: one is already
        // shown by the lockout counter, the other is the door opening.
        setProblem(result === 'wrong' || result === 'unavailable' ? result : null)
      }}
    >
      {/* No heading. This form is nested inside the tools section, which
          already has one — and while it WAS the door to the whole screen it
          repeated the page title back at the reader on a 320 px phone. */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-extrabold uppercase">{t('adminPinLabel')}</span>
        <input
          className="field tabular"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value)
            setProblem(null)
          }}
        />
      </label>

      {lockedFor > 0 ? (
        <p className="border-3 border-rule bg-late px-3 py-2 font-extrabold text-late-ink" role="alert">
          {t('adminLocked', lockedFor)}
        </p>
      ) : problem ? (
        <p className="border-3 border-rule bg-full px-3 py-2 font-extrabold text-full-ink" role="alert">
          {t(problem === 'wrong' ? 'adminWrongPin' : 'adminUnavailable')}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn btn-lg btn-primary btn-block"
        disabled={lockedFor > 0 || pin.length === 0}
      >
        {t('adminUnlock')}
      </button>
      <p className="text-sm font-bold text-ink-2">{t('adminSessionNote')}</p>
    </form>
  )
}

function Console() {
  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const harbour = useDockStore(selectHarbour)
  const allBoats = useDockStore((s) => s.boats)
  const boxes = useDockStore(selectBoxes)
  const allLedger = useDockStore((s) => s.ledger)
  const now = useNow()
  const touchAdmin = useDockStore((s) => s.touchAdmin)
  const record = useDockStore((s) => s.record)

  /**
   * Any interaction inside the console defers the idle lock.
   *
   * Listeners on the node, not `onPointerDown`/`onKeyDown` in the JSX: a
   * plain `<div>` carrying interaction handlers claims to be a control, and
   * this one is not — it is a container that happens to notice activity, and
   * there is nothing here to activate. Nothing in this subtree is portalled,
   * so a native listener sees every event React's would.
   */
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = root.current
    if (!node) return
    const wake = () => touchAdmin()
    node.addEventListener('pointerdown', wake)
    node.addEventListener('keydown', wake)
    return () => {
      node.removeEventListener('pointerdown', wake)
      node.removeEventListener('keydown', wake)
    }
  }, [touchAdmin])

  const boats = boatsAt(allBoats, harbour.id)
  const ledger = useMemo(() => ledgerFor(allLedger, harbour.id), [allLedger, harbour.id])

  /**
   * NOT keyed on `now`, which ticks at 1 Hz.
   *
   * `monthKeys` walks every ledger row — up to LEDGER_LIMIT of them — so
   * with `now` in the dependencies this recomputed once a second and put
   * roughly half of every second of main thread into a list that changes
   * once a month. Every Approve and Force-release on the console queued
   * behind it. `now` is only the fallback for an empty ledger, where the
   * exact second cannot matter: it names the current month.
   */
  const ledgerMonths = useMemo(() => monthKeys(ledger), [ledger])
  const months = ledgerMonths.length ? ledgerMonths : [monthKey(now)]
  const [month, setMonth] = useState(months[0])
  const active = months.includes(month) ? month : months[0]

  const totals = useMemo(() => monthTotals(ledger, active), [ledger, active])
  const perDay = useMemo(() => dailyCrates(ledger, active), [ledger, active])
  const perBox = useMemo(() => boxSplit(ledger, active), [ledger, active])
  const perSpecies = useMemo(() => speciesSplit(ledger, active), [ledger, active])
  const perBoat = useMemo(() => boatUsage(ledger, active), [ledger, active])
  const previous = months[months.indexOf(active) + 1]
  /**
   * Midnight in the HARBOUR, not on this device.
   *
   * This was `Date.parse(new Date(now).toDateString())`, which renders a
   * harbour-time instant in the DEVICE's timezone and parses it back as
   * device-local midnight. At 03:00 IST on the 1st of a month, a laptop set
   * to New York turns that into the 30th of the previous one — so
   * `monthInsight` believed the current month was over and compared one day
   * of it against all of the month before, which is the −83% collapse
   * `stats.ts` documents at length as the thing it exists to prevent, and
   * divided a busy first day by a full month's capacity besides.
   *
   * The device CLOCK was taken out of circulation three rounds ago; this was
   * the device CALENDAR, still deciding what month it is. `startOfLocalDay`
   * already existed, exported, doing exactly this in harbour time.
   *
   * Rounded to the day so the memo below does not re-run every second.
   */
  const today = startOfLocalDay(now)
  const insight = useMemo(
    () => monthInsight(ledger, active, previous, today),
    [ledger, active, previous, today],
  )
  const perHour = useMemo(() => hourHistogram(ledger, active), [ledger, active])

  /**
   * One row per completed storage cycle for the selected month — the raw
   * ledger, not a summary, so the society can do its own arithmetic in a
   * spreadsheet the auditor already knows how to open.
   */
  const exportMonth = () => {
    const header = [
      'Harbour',
      'Month',
      'Boat',
      'Boat name',
      'Owner',
      // No Mobile column. It was here while this screen was PIN-gated and
      // the export was one person's; the screen is open to the whole harbour
      // now, and a CSV is the easiest thing in the world to forward.
      'Box',
      'Crates',
      'Catch',
      'Deposited',
      'Released',
      'Hours',
      'Overstay',
    ]
    const rows = entriesForMonth(ledger, active).map((e) => {
      const boat = boats.find((b) => b.id === e.boatId)
      const hours = (e.releasedAt - e.depositedAt) / 3_600_000
      return [
        harbour.nameEn,
        active,
        e.boatId,
        boat ? boat.nameEn : '',
        boat?.owner ?? '',
        t(e.boxId),
        e.crates,
        e.species ? t(e.species) : '',
        formatDayClock(e.depositedAt, 'en'),
        formatDayClock(e.releasedAt, 'en'),
        hours.toFixed(2),
        e.overstay ? 'yes' : 'no',
      ]
    })
    saveCsv(`${harbour.id}-${active}.csv`, [header, ...rows])
    void record('report.export', active, `${rows.length} rows`)
  }

  const live = occupancyRows(boxes)
  const nameOf = (id: string) => {
    const boat = boats.find((b) => b.id === id)
    return boat ? boatName(boat, lang) : `#${id}`
  }

  return (
    <div className="flex flex-col gap-5" ref={root}>
      <header className="flex items-center gap-2">
        <HelmIcon size={28} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl">{t('adminTitle')}</h2>
          <p className="truncate text-sm font-bold text-ink-2">
            {lang === 'te' ? harbour.unionTe : harbour.unionEn}
          </p>
        </div>
      </header>
      <p className="card p-3 font-bold">{t('recordIntro')}</p>

      {/* Live usage ----------------------------------------------------- */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xl">{t('adminLive')}</h3>
        {live.length === 0 ? (
          <p className="card p-3 font-bold">{t('nothingStored')}</p>
        ) : (
          live.map((row) => (
            <div key={`${row.boatId}-${row.boxId}`} className="card flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-extrabold">
                  {nameOf(row.boatId)} <span className="tabular">#{row.boatId}</span>
                </p>
                <p className="text-sm font-bold text-ink-2">
                  {/* `crateOne` exists for exactly this and was never used
                      here: every row in Live usage is one or two crates, so
                      the console read "1 crates" on almost every line. */}
                  {t(row.boxId)} · {row.crates} {t(row.crates === 1 ? 'crateOne' : 'crates')}
                  {row.plannedOutAt !== null
                    ? ` · ${formatGap(row.plannedOutAt - now, lang)}`
                    : ''}
                </p>
              </div>
              {/* No button. There used to be a Force release here for
                  whoever held the PIN, which meant a crate blocking a box
                  waited until that one person happened to open this screen —
                  and gave them a power the brief's own premise says nobody at
                  this harbour has. The clock does it now, at eight hours, for
                  everybody equally. What is left is the true sentence saying
                  when. */}
              {row.status === 'reserved' ? null : (
                <p className="w-24 shrink-0 text-xs font-bold text-ink-2">
                  {t('reclaimWhen', RECLAIM_MS / 3_600_000)}
                </p>
              )}
            </div>
          ))
        )}
      </section>

      {/* Monthly report ------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-xl">{t('adminMonth')}</h3>
          <select
            className="field w-auto"
            value={active}
            onChange={(event) => setMonth(event.target.value)}
          >
            {months.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key, lang)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn h-11 min-h-11 px-3 text-sm"
            onClick={() => exportMonth()}
          >
            {t('adminExport')}
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Metric label={t('adminTrips')} value={totals.trips} />
          <Metric label={t('adminCrates')} value={totals.crates} />
          <Metric label={t('adminCrateHours')} value={totals.crateHours} />
          <Metric label={t('adminOverstays')} value={totals.overstays} tone="late" />
          <Metric label={t('adminBoats')} value={totals.boats} />
        </dl>

        <h4 className="text-lg">{t('adminInsights')}</h4>
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric
            label={t('adminUtilisation')}
            value={insight.utilisation === null ? '—' : `${insight.utilisation}%`}
          />
          <Metric label={t('adminDwell')} value={`${insight.dwellHours} h`} />
          <Metric
            label={t('adminOverstayRate')}
            value={`${insight.overstayRate}%`}
            tone={insight.overstayRate > 15 ? 'late' : undefined}
          />
          <Metric
            label={t('adminPeakHour')}
            value={insight.peakHour === null ? '—' : hourLabel(insight.peakHour)}
          />
        </dl>

        {insight.cratesDelta !== null ? (
          <p className="tabular text-sm font-extrabold">
            {t('adminTrend')}:{' '}
            <span className={insight.cratesDelta < 0 ? 'text-full' : 'text-free'}>
              {insight.cratesDelta > 0 ? '+' : ''}
              {insight.cratesDelta}%
            </span>
          </p>
        ) : (
          // A comparison that is simply absent reads as "no change". It has
          // four separate reasons for being absent and the harbour master
          // needs to know which — especially on a complete month, where the
          // utilisation beside it looks authoritative and the trend just is
          // not on the page.
          <p className="text-sm font-bold text-ink-2">
            {t('adminTrend')}: {t(TREND_MISSING[insight.trendMissing ?? 'noPrevious'])}
          </p>
        )}

        {/* Say why the figures are missing. A `—` and a trend line that
            simply is not there read as an empty month, not as a month we
            decline to summarise — while Trips and Crates from the same
            truncated window sit above them looking authoritative. AGENTS §2:
            if a thing cannot work, say why. */}
        {insight.utilisation === null ? (
          <p className="text-sm font-bold text-ink-2">{t('adminMonthClipped')}</p>
        ) : null}

        <Bars
          title={t('adminPerHour')}
          rows={perHour.map((n, hour) => ({
            key: String(hour),
            label: hourLabel(hour),
            value: n,
          }))}
          compact
        />

        <Bars
          title={t('adminPerDay')}
          rows={perDay.map((d) => ({ key: String(d.day), label: String(d.day), value: d.crates }))}
          compact
        />
        <Bars
          title={t('adminPerBox')}
          rows={(['box1', 'box2', 'box3'] as const).map((id) => ({
            key: id,
            label: t(BOX_SHORT[id]),
            value: perBox[id],
          }))}
        />
        <Bars
          title={t('adminPerSpecies')}
          rows={perSpecies.map((row) => ({
            key: row.species,
            label: t(row.species),
            value: row.crates,
            Icon: SPECIES_ICON[row.species],
          }))}
        />

        <h4 className="text-lg">{t('adminPerBoat')}</h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b-3 border-rule text-left">
                <th className="py-1 pr-2">{t('boatsTitle')}</th>
                <th className="py-1 pr-2 text-right">{t('adminTrips')}</th>
                <th className="py-1 pr-2 text-right">{t('adminCrates')}</th>
                <th className="py-1 pr-2 text-right">{t('adminCrateHours')}</th>
                <th className="py-1 text-right">{t('adminOverstays')}</th>
              </tr>
            </thead>
            <tbody>
              {perBoat.map((row) => (
                <tr key={row.boatId} className="border-b border-rule-soft">
                  <td className="py-1.5 pr-2 font-bold">
                    {nameOf(row.boatId)} <span className="tabular">#{row.boatId}</span>
                  </td>
                  <td className="tabular py-1.5 pr-2 text-right">{row.trips}</td>
                  <td className="tabular py-1.5 pr-2 text-right">{row.crates}</td>
                  <td className="tabular py-1.5 pr-2 text-right">{row.crateHours}</td>
                  <td
                    className={cx(
                      'tabular py-1.5 text-right font-extrabold',
                      row.overstays > 0 && 'text-full',
                    )}
                  >
                    {row.overstays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      <AuditPanel />
      <HarbourTools />
    </div>
  )
}

/**
 * The only PIN left in the app, and what it is still for.
 *
 * Publish harbour seeds a real society's database, and Reset demo clears
 * every phone's crates. Neither is harbour policy — they are the deployment
 * and demonstration controls — but both are destructive and neither is
 * something twenty skippers should meet by scrolling. So they keep the lock,
 * with its lockout and its idle expiry, while every number above them is
 * open to everybody.
 *
 * The lock is on the TOOLS, not on the record. That is the whole difference
 * between a console and a noticeboard, and it is why nothing in this file
 * can approve, block or release anything any more.
 */
function HarbourTools() {
  const t = useT()
  const unlocked = useDockStore((s) => s.adminUnlocked)
  const lockAdmin = useDockStore((s) => s.lockAdmin)
  const publishHarbour = useDockStore((s) => s.publishHarbour)
  const resetDemo = useDockStore((s) => s.resetDemo)
  const [busy, setBusy] = useState(false)

  return (
    <section className="card flex flex-col gap-2 border-dashed p-3">
      <h3 className="text-xl">{t('adminSync')}</h3>
      <p className="font-bold">{t(sharedActive ? 'adminSyncOn' : 'adminSyncOff')}</p>
      {!unlocked ? (
        <PinGate />
      ) : sharedActive ? (
        <>
          <button type="button" className="btn btn-block" onClick={lockAdmin}>
            {t('adminLock')}
          </button>
          <button
            type="button"
            className="btn btn-lg btn-block"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await publishHarbour()
              setBusy(false)
            }}
          >
            {t('adminPublish')}
          </button>
          <p className="text-sm font-bold text-ink-2">{t('adminPublishBody')}</p>

          <ConfirmButton
            className="btn btn-lg btn-block"
            label={t('adminResetShared')}
            onConfirm={resetDemo}
          />
          <p className="text-sm font-bold text-ink-2">{t('adminResetSharedBody')}</p>
        </>
      ) : (
        // Unlocked, but there is no shared harbour to publish to or reset.
        // A button that cannot work is a lie; the sentence above already
        // says this phone is on its own.
        <button type="button" className="btn btn-block" onClick={lockAdmin}>
          {t('adminLock')}
        </button>
      )}
    </section>
  )
}

function Metric({
  label,
  value,
  tone,
}: Readonly<{
  label: string
  value: string | number
  tone?: 'late'
}>) {
  return (
    <div className={cx('card p-3', tone === 'late' && value !== 0 && 'bg-late-wash')}>
      <dt className="text-xs font-extrabold uppercase text-ink-2">{label}</dt>
      <dd className="tabular text-2xl font-extrabold">{value}</dd>
    </div>
  )
}

interface BarRow {
  key: string
  label: string
  value: number
  Icon?: (props: { size?: number }) => ReactElement
}

/**
 * Bars in plain CSS. A chart library would be ~50 kB over a 2G tether to
 * draw twelve rectangles, so this stays hand-rolled and accessible.
 */
function Bars({
  title,
  rows,
  compact,
}: Readonly<{
  title: string
  rows: BarRow[]
  compact?: boolean
}>) {
  const max = Math.max(1, ...rows.map((r) => r.value))

  if (compact) {
    return (
      <figure className="card p-3">
        <figcaption className="mb-2 text-sm font-extrabold uppercase text-ink-2">{title}</figcaption>
        {/* Height and colour, and a `title` that never renders on a touch
            screen — so this chart carried no text at all, which is the
            "never colour alone" rule the README states and this broke. The
            bars are decorative; the figure carries the reading. */}
        <div className="flex h-24 items-end gap-[2px]" aria-hidden="true">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex-1 bg-free"
              style={{ height: `${Math.max(2, (row.value / max) * 100)}%` }}
              title={`${row.label}: ${row.value}`}
            />
          ))}
        </div>
        <p className="sr-only">{rows.map((row) => `${row.label}: ${row.value}`).join('. ')}</p>
      </figure>
    )
  }

  return (
    <figure className="card flex flex-col gap-1.5 p-3">
      <figcaption className="text-sm font-extrabold uppercase text-ink-2">{title}</figcaption>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <span className="flex w-24 shrink-0 items-center gap-1 truncate text-sm font-bold">
            {row.Icon ? <row.Icon size={16} /> : null}
            {row.label}
          </span>
          <span className="h-5 flex-1 border-3 border-rule">
            <span
              className="block h-full bg-free"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </span>
          <span className="tabular w-10 shrink-0 text-right text-sm font-extrabold">
            {row.value}
          </span>
        </div>
      ))}
    </figure>
  )
}

/**
 * The audit trail, with a live integrity check. Each row is chained to the
 * one before by SHA-256, so an edited or deleted entry shows up here as a
 * broken link rather than disappearing silently.
 */
function AuditPanel() {
  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const audit = useDockStore((s) => s.audit)
  const [broken, setBroken] = useState<number | null>(null)
  const [all, setAll] = useState(false)

  /**
   * Newest first, and only a page of them until asked.
   *
   * The console re-renders every second (it shows live countdowns), and this
   * list was rebuilt, re-formatted and reconciled every time: at the 2 000
   * rows the cap allows that is 2 000 `Intl.format` calls and 2 000 list
   * items a second, on the screen where Approve and Force-release live.
   * Round 14 removed the formatter CONSTRUCTIONS here and left the calls.
   *
   * Memoised on `audit` alone, so a tick no longer rebuilds and re-reverses
   * the array. The `formatDayClock` calls in the rows DO still run every
   * tick — about 57 a second on the default page, measured, against 2 006
   * before the slice. That is the honest number; the memo does not make a
   * tick free, it makes it cheap.
   *
   * Sliced because nobody reads two thousand rows on a 320 px phone — the
   * rest is one tap away, and the integrity check above still runs over
   * every row either way, which is the part that has to be complete.
   */
  const rows = useMemo(() => [...audit].reverse(), [audit])
  const shown = all ? rows : rows.slice(0, AUDIT_PAGE)

  useEffect(() => {
    let live = true
    // `.catch`, because this is a `crypto.subtle` call and a rejection here
    // left `broken` at null — which renders NOTHING: no green, no red, on
    // the one panel whose entire job is to make a claim about the log. A
    // panel that says nothing is read as a panel that found nothing wrong.
    // -2 is "we could not check", which the panel says out loud.
    void verifyAudit(audit)
      .then((index) => {
        if (live) setBroken(index)
      })
      .catch(() => {
        if (live) setBroken(-2)
      })
    return () => {
      live = false
    }
  }, [audit])

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl">{t('adminAudit')}</h3>
      {broken !== null ? (
        <p
          className={cx(
            'border-3 border-rule px-3 py-2 text-sm font-extrabold',
            broken === -1
              ? 'bg-free text-free-ink'
              : broken === -2
                ? 'bg-late text-late-ink'
                : 'bg-full text-full-ink',
          )}
        >
          {broken === -1
            ? t('adminAuditIntact')
            : broken === -2
              ? t('adminAuditUnchecked')
              : t('adminAuditBroken', broken + 1)}
        </p>
      ) : null}

      {audit.length === 0 ? (
        <p className="card p-3 font-bold">{t('adminAuditEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {shown.map((entry) => (
            <li key={entry.id} className="card flex items-baseline gap-2 p-2 text-sm">
              <span className="tabular shrink-0 text-xs font-bold text-ink-2">
                {formatDayClock(entry.at, lang)}
              </span>
              <span className="min-w-0 flex-1 font-bold">
                {entry.action} {entry.target}
                {entry.detail ? ` · ${entry.detail}` : ''}
              </span>
              <span className="tabular shrink-0 text-[0.6rem] text-ink-2" title={entry.hash}>
                {entry.hash.slice(0, 8)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* And a way back. "Show the rest" was one-way, so an unlabelled tap
          restored the 1 Hz cost this paging exists to avoid — 2 000 rows
          re-rendered every second on the screen carrying Approve and Force
          release — permanently, for the session. */}
      {audit.length > AUDIT_PAGE ? (
        <button type="button" className="btn btn-block" onClick={() => setAll(!all)}>
          {all ? t('adminAuditFewer', AUDIT_PAGE) : t('adminAuditMore', audit.length - AUDIT_PAGE)}
        </button>
      ) : null}
    </section>
  )
}
