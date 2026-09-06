import { boatName, boatsAt } from '../data/boats'
import { useNow } from '../hooks/useClock'
import { useT } from '../i18n/useT'
import { formatClock, formatGap } from '../lib/time'
import { cx, STATUS_STYLE } from '../lib/ui'
import { crateCountForBoat, occupancyRows } from '../store/selectors'
import { selectBoxes, useDockStore } from '../store/useDockStore'
import type { T } from '../i18n/dictionary'
import type { Boat, Species } from '../types'
import { BoatIcon, CrateIcon, ShoalIcon } from '../icons/marine'
import { SPECIES_ICON } from '../icons/species'

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
  const now = useNow()

  // Approved boats only. A pending registration is between that skipper and
  // the admin, and every remaining row would carry the same 'Approved' chip.
  const boats = boatsAt(allBoats, harbourId).filter((b) => b.status === 'active')
  const rows = occupancyRows(boxes)
  const byId = new Map(boats.map((b) => [b.id, b]))

  return (
    <div className="flex flex-col gap-4">
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
            {rows.map((row) => {
              const boat = byId.get(row.boatId)
              return (
                // Two rows, not three columns. Telugu box names are long and
                // the catch tag is a fixed-width chip, so squeezing name,
                // box, tag and time onto one line made them overlap on a
                // narrow phone. The identity line sits above its details.
                <li key={`${row.boatId}-${row.boxId}`} className="card flex flex-col gap-2 p-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={cx(
                        'grid h-11 w-11 shrink-0 place-items-center border-3 border-rule font-display text-sm font-extrabold',
                        STATUS_STYLE[row.status],
                      )}
                    >
                      #{row.boatId}
                    </span>

                    <p className="min-w-0 flex-1 truncate font-display text-lg font-extrabold">
                      {boat ? boatName(boat, lang) : `#${row.boatId}`}
                    </p>

                    <div className="shrink-0 text-right">
                      <p className="text-[0.65rem] font-extrabold uppercase leading-tight text-ink-2">
                        {t('outIn')}
                      </p>
                      {row.plannedOutAt === null ? (
                        <p className="text-sm font-bold">{t('noPlan')}</p>
                      ) : (
                        <>
                          <p className="tabular text-lg font-extrabold leading-tight">
                            {formatClock(row.plannedOutAt)}
                          </p>
                          <p
                            className={cx(
                              'tabular text-xs font-extrabold leading-tight',
                              row.plannedOutAt < now && 'text-full',
                            )}
                          >
                            {formatGap(row.plannedOutAt - now, lang)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink-2">
                    <span>
                      {t(row.boxId)} · {row.crates} {t('crates')}
                    </span>
                    {row.species ? <CatchTag t={t} species={row.species} /> : null}
                  </p>
                </li>
              )
            })}
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
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

function BoatRow({ boat, stored }: { boat: Boat; stored: number }) {
  const t = useT()
  const lang = useDockStore((s) => s.lang)

  return (
    <li className="card flex items-center gap-3 p-3">
      <BoatIcon size={26} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-extrabold">
          {boatName(boat, lang)} <span className="tabular">#{boat.id}</span>
        </p>
        {/* Owner only. The mobile number is personal data and stays in the
            admin console — twenty skippers do not need each other's numbers
            published to look up who is holding a crate. */}
        <p className="truncate text-sm font-bold text-ink-2">{boat.owner}</p>
      </div>
      <span className="tabular shrink-0 text-xs font-bold text-ink-2">
        {stored > 0 ? `${t('storingNow')} ${stored}` : t('idle')}
      </span>
    </li>
  )
}

/** Catch tag as icon + name, so the list reads without colour alone. */
function CatchTag({ t, species }: { t: T; species: Species }) {
  const Icon = SPECIES_ICON[species]
  return (
    <span className="inline-flex items-center gap-1 border-3 border-rule px-1 py-0.5 text-xs font-extrabold">
      <Icon size={13} />
      {t(species)}
    </span>
  )
}
