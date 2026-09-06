import { boatName, boatsAt } from '../data/boats'
import { useNow } from '../hooks/useClock'
import { useT } from '../i18n/useT'
import { crateCountForBoat, occupancyRows } from '../store/selectors'
import { selectBoxes, useDockStore } from '../store/useDockStore'
import type { Boat } from '../types'
import { BoatIcon, CrateIcon, ShoalIcon } from '../icons/marine'
import { CrateRow } from './CrateRow'

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
            <BoatRow key={boat.id} boat={boat} stored={crateCountForBoat(boxes, boat.id)} />
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
