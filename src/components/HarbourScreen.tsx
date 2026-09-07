import { boatName, boatsAt } from '../data/boats'
import { useNow } from '../hooks/useClock'
import { useT } from '../i18n/useT'
import { formatElapsed, RECLAIM_MS } from '../lib/time'
import { crateCountForBoat, joinedRecently, occupancyRows } from '../store/selectors'
import { selectBoxes, useDockStore } from '../store/useDockStore'
import type { Boat } from '../types'
import { BoatIcon, CrateIcon, ShoalIcon, TideClockIcon } from '../icons/marine'
import { CrateRow } from './CrateRow'

/** How long a reclaimed crate stays on the board after the space is freed. */
const NOT_COLLECTED_MS = 24 * 60 * 60 * 1000

/**
 * The community view, and the reason the app is worth opening when you are
 * not booking anything: every crate in the harbour, whose it is, and when
 * it frees up — ordered soonest first so the next opening is at the top.
 */
export function HarbourScreen() {
  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const boxes = useDockStore(selectBoxes)
  const harbourId = useDockStore((s) => s.harbourId)
  const allBoats = useDockStore((s) => s.boats)
  const ledger = useDockStore((s) => s.ledger)
  const now = useNow()

  // Every boat, with no filter.
  //
  // This used to keep `status === 'active'` only, with the comment "a pending
  // registration is between that skipper and the admin". There is no admin
  // and no pending: a boat on the roster may book from the second it
  // registers, so hiding one from the harbour would hide a boat that is
  // already competing for the same crates.
  const boats = boatsAt(allBoats, harbourId)
  const rows = occupancyRows(boxes)
  const byId = new Map(boats.map((b) => [b.id, b]))

  /**
   * Crates the harbour took back at the eight-hour line, most recent first.
   *
   * Read from the ledger rather than kept as its own state, so it survives a
   * reload, agrees between phones, and cannot drift from the row the society
   * bills off. `reclaimed` is a recorded fact, not a derived one: a skipper
   * who collects at 8 h 01 m writes a row with identical timestamps, and this
   * list must never accuse him of abandoning his catch.
   */
  const notCollected = ledger
    .filter(
      (e) =>
        e.harbourId === harbourId &&
        e.reclaimed === true &&
        now - e.releasedAt < NOT_COLLECTED_MS,
    )
    .sort((a, b) => b.releasedAt - a.releasedAt)

  return (
    <div className="flex flex-col gap-4">
      {/* Above the crates, because this is the only thing on the screen that
          is somebody else's problem becoming everyone's. */}
      {notCollected.length > 0 ? (
        <section className="flex flex-col gap-2">
          <header>
            <h2 className="flex items-center gap-2 text-2xl">
              <TideClockIcon size={26} />
              {t('lateListTitle')}
            </h2>
            <p className="font-bold text-ink-2">{t('lateListBody')}</p>
          </header>
          <ul className="flex flex-col gap-2">
            {notCollected.map((entry) => {
              const boat = byId.get(entry.boatId)
              return (
                <li
                  key={entry.id}
                  className="card flex items-center gap-3 border-late bg-late-wash p-3"
                >
                  <TideClockIcon size={24} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-extrabold">
                      {boat ? boatName(boat, lang) : ''}{' '}
                      <span className="tabular">#{entry.boatId}</span>
                    </p>
                    <p className="truncate text-sm font-bold">
                      {t(entry.crates === 1 ? 'lateListRow1' : 'lateListRow', t(entry.boxId), entry.crates)}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-xs font-bold">
                    {formatElapsed(now - entry.releasedAt, lang)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <header>
          <h2 className="flex items-center gap-2 text-2xl">
            <CrateIcon size={26} />
            {t('harbourTitle')}
          </h2>
          <p className="font-bold text-ink-2">{t('harbourBody')}</p>
        </header>

        {rows.length === 0 ? (
          <p className="card p-4 font-bold">{t('nothingStored')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <CrateRow
                key={`${row.boatId}-${row.boxId}`}
                t={t}
                lang={lang}
                row={row}
                boat={byId.get(row.boatId)}
                now={now}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <header>
          <h2 className="flex items-center gap-2 text-2xl">
            <ShoalIcon size={26} />
            {t('boatsTitle')}
          </h2>
          <p className="font-bold text-ink-2">{t('boatsCount', boats.length)}</p>
        </header>

        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {boats.map((boat) => (
            <BoatRow
              key={boat.id}
              boat={boat}
              stored={crateCountForBoat(boxes, boat.id)}
              isNew={joinedRecently(boat.registeredAt, now)}
            />
          ))}
        </ul>
      </section>

      <p className="text-sm font-bold text-ink-2">{t('reclaimNote', RECLAIM_MS / 3_600_000)}</p>
    </div>
  )
}

function BoatRow({
  boat,
  stored,
  isNew,
}: Readonly<{ boat: Boat; stored: number; isNew: boolean }>) {
  const t = useT()
  const lang = useDockStore((s) => s.lang)

  return (
    <li className="card flex items-center gap-3 p-3">
      <BoatIcon size={26} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-extrabold">
          {boatName(boat, lang)} <span className="tabular">#{boat.id}</span>
          {/* Shape and text, never colour alone — AGENTS.md §4. This is all
              that replaced admin approval: nobody vets a new boat and nobody
              can stop it booking, but the harbour can see it arrived, which
              is what the twenty would see on the quay anyway. */}
          {isNew ? (
            <span className="ml-1 border-2 border-rule bg-sea px-1 text-xs font-extrabold text-sea-ink">
              {t('legendNew')}
            </span>
          ) : null}
        </p>
        {/* Owner only. The mobile number is personal data and stays off every
            screen anyone can open — twenty skippers do not need each other's
            numbers published to look up who is holding a crate. */}
        <p className="truncate text-sm font-bold text-ink-2">{boat.owner}</p>
      </div>
      <span className="tabular shrink-0 text-xs font-bold text-ink-2">
        {stored > 0 ? `${t('storingNow')} ${stored}` : t('idle')}
      </span>
    </li>
  )
}
