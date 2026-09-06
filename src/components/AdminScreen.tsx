import { useEffect, useMemo, useState, type ReactElement } from 'react'
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
import { syncEnabled } from '../lib/harbourSync'
import { formatDayClock, formatGap, monthKey, monthLabel } from '../lib/time'
import { cx } from '../lib/ui'
import { forceReleasable, occupancyRows } from '../store/selectors'
import { selectBoxes, selectHarbour, useDockStore } from '../store/useDockStore'
import { ConfirmButton } from './ConfirmButton'
import { HelmIcon } from '../icons/marine'
import { SPECIES_ICON } from '../icons/species'

/**
 * Harbour-master console: approvals, who is holding what right now, the
 * monthly record, and the numbers that change a decision.
 *
 * Totals say what happened; the insight strip says what to do about it —
 * how full the boxes really run, how long a crate sits, how often the 6 h
 * rule is broken, whether demand is rising, and the hour boats actually
 * land. That last one is what staffs the quay.
 *
 * Access control and its honest limits live in `lib/adminAuth.ts`.
 */
export function AdminScreen() {
  const unlocked = useDockStore((s) => s.adminUnlocked)
  return unlocked ? <Console /> : <PinGate />
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
      className="card flex flex-col gap-3 p-4"
      onSubmit={async (event) => {
        event.preventDefault()
        const result = await unlockAdmin(pin)
        setPin('')
        setProblem(result === 'wrong' ? 'wrong' : result === 'unavailable' ? 'unavailable' : null)
      }}
    >
      <h2 className="flex items-center gap-2 text-2xl">
        <HelmIcon size={28} />
        {t('adminTitle')}
      </h2>
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
  /** The boat whose approval is in flight, so a second tap cannot fire. */
  const [busy, setBusy] = useState<string | null>(null)
  const approveBoat = useDockStore((s) => s.approveBoat)
  const rejectBoat = useDockStore((s) => s.rejectBoat)
  const setBoatStatus = useDockStore((s) => s.setBoatStatus)
  const adminRelease = useDockStore((s) => s.adminRelease)
  const lockAdmin = useDockStore((s) => s.lockAdmin)
  const touchAdmin = useDockStore((s) => s.touchAdmin)
  const record = useDockStore((s) => s.record)

  const boats = boatsAt(allBoats, harbour.id)
  const ledger = useMemo(() => ledgerFor(allLedger, harbour.id), [allLedger, harbour.id])

  const months = useMemo(() => {
    const keys = monthKeys(ledger)
    return keys.length ? keys : [monthKey(now)]
  }, [ledger, now])
  const [month, setMonth] = useState(months[0])
  const active = months.includes(month) ? month : months[0]

  const totals = useMemo(() => monthTotals(ledger, active), [ledger, active])
  const perDay = useMemo(() => dailyCrates(ledger, active), [ledger, active])
  const perBox = useMemo(() => boxSplit(ledger, active), [ledger, active])
  const perSpecies = useMemo(() => speciesSplit(ledger, active), [ledger, active])
  const perBoat = useMemo(() => boatUsage(ledger, active), [ledger, active])
  const previous = months[months.indexOf(active) + 1]
  const today = new Date(now).toDateString()
  const insight = useMemo(
    () => monthInsight(ledger, active, previous, Date.parse(today)),
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
      'Mobile',
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
        boat?.mobile ?? '',
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

  const pending = boats.filter((b) => b.status === 'pending')
  const live = occupancyRows(boxes)
  const nameOf = (id: string) => {
    const boat = boats.find((b) => b.id === id)
    return boat ? boatName(boat, lang) : `#${id}`
  }

  return (
    <div className="flex flex-col gap-5" onPointerDown={touchAdmin} onKeyDown={touchAdmin}>
      <header className="flex items-center gap-2">
        <HelmIcon size={28} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl">{t('adminTitle')}</h2>
          <p className="truncate text-sm font-bold text-ink-2">
            {lang === 'te' ? harbour.unionTe : harbour.unionEn}
          </p>
        </div>
        <button type="button" className="btn h-11 min-h-11 px-3 text-sm" onClick={lockAdmin}>
          {t('adminLock')}
        </button>
      </header>

      {/* Approvals ------------------------------------------------------ */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xl">{t('adminApprovals')}</h3>
        {pending.length === 0 ? (
          <p className="card p-3 font-bold">{t('adminNoApprovals')}</p>
        ) : (
          pending.map((boat) => (
            <div key={boat.id} className="card flex flex-col gap-2 border-hold bg-hold-wash p-3">
              <div>
                <p className="font-display text-lg font-extrabold">
                  {boatName(boat, lang)} <span className="tabular">#{boat.id}</span>
                </p>
                <p className="text-sm font-bold">
                  {boat.owner} · <span className="tabular">{boat.mobile}</span>
                </p>
                <p className="text-xs font-bold text-ink-2">
                  {formatDayClock(boat.registeredAt, lang)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Awaited and guarded, like every other write on this
                    screen. It was the one bare promise-returning handler
                    left: a rejection inside it was unhandled, and a second
                    tap on 2G sent a second approval. */}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy === boat.id}
                  onClick={async () => {
                    if (busy === boat.id) return
                    setBusy(boat.id)
                    try {
                      await approveBoat(boat.id)
                    } finally {
                      setBusy(null)
                    }
                  }}
                >
                  {t('approve')}
                </button>
                <ConfirmButton
                  className="btn btn-danger"
                  label={t('reject')}
                  disabled={busy === boat.id}
                  onConfirm={() => rejectBoat(boat.id)}
                />
              </div>
            </div>
          ))
        )}
      </section>

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
                  {t(row.boxId)} · {row.crates} {t('crates')}
                  {row.plannedOutAt !== null
                    ? ` · ${formatGap(row.plannedOutAt - now, lang)}`
                    : ''}
                </p>
              </div>
              {row.status === 'reserved' ? null : forceReleasable(row) ? (
                <ConfirmButton
                  className="btn h-11 min-h-11 px-3 text-sm btn-warn"
                  label={t('adminForceRelease')}
                  onConfirm={() => adminRelease(row.boatId, row.boxId, row.overdueIndexes)}
                />
              ) : (
                // A true sentence rather than a button that the database
                // will refuse. See forceReleasable.
                <p className="w-24 shrink-0 text-xs font-bold text-ink-2">
                  {t('adminForceWait')}
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
          <Metric label={t('adminUtilisation')} value={`${insight.utilisation}%`} />
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

      {/* Roster --------------------------------------------------------- */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xl">{t('boatsTitle')}</h3>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {boats
            .filter((b) => b.status !== 'pending')
            .map((boat) => (
              <li key={boat.id} className="card flex items-center gap-2 p-2">
                <span className="min-w-0 flex-1 truncate font-bold">
                  {boatName(boat, lang)} <span className="tabular">#{boat.id}</span>
                </span>
                <button
                  type="button"
                  className={cx(
                    'btn h-11 min-h-11 px-3 text-sm',
                    boat.status === 'blocked' ? 'btn-primary' : 'btn-ghost',
                  )}
                  // Awaited, and logged only if it landed. The log records
                  // what happened, not what was attempted — the same rule
                  // already applied to approve, reject and force release,
                  // and missed here. A refused write left the hash-chained
                  // audit trail asserting a block the database never made,
                  // while the blocked skipper went on booking.
                  onClick={async () => {
                    const next = boat.status === 'blocked' ? 'active' : 'blocked'
                    if (await setBoatStatus(boat.id, next)) {
                      void record(
                        `boat.${next === 'blocked' ? 'block' : 'unblock'}`,
                        `#${boat.id}`,
                      )
                    }
                  }}
                >
                  {t(boat.status === 'blocked' ? 'unblock' : 'block')}
                </button>
              </li>
            ))}
        </ul>
      </section>

      <SyncPanel />
      <AuditPanel />
    </div>
  )
}

/**
 * Whether this harbour is shared, and the one-time button that makes it so.
 *
 * With no database configured the button would be a lie, so it is not shown
 * at all — the panel says plainly that this phone is on its own instead.
 */
function SyncPanel() {
  const t = useT()
  const publishHarbour = useDockStore((s) => s.publishHarbour)
  const resetDemo = useDockStore((s) => s.resetDemo)
  const [busy, setBusy] = useState(false)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl">{t('adminSync')}</h3>
      <p className="card p-3 font-bold">{t(syncEnabled ? 'adminSyncOn' : 'adminSyncOff')}</p>
      {syncEnabled ? (
        <>
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
      ) : null}
    </section>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'late'
}) {
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
}: {
  title: string
  rows: BarRow[]
  compact?: boolean
}) {
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

  useEffect(() => {
    let live = true
    void verifyAudit(audit).then((index) => {
      if (live) setBroken(index)
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
            broken === -1 ? 'bg-free text-free-ink' : 'bg-full text-full-ink',
          )}
        >
          {broken === -1 ? t('adminAuditIntact') : t('adminAuditBroken', broken + 1)}
        </p>
      ) : null}

      {audit.length === 0 ? (
        <p className="card p-3 font-bold">{t('adminAuditEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {[...audit].reverse().map((entry) => (
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
    </section>
  )
}
