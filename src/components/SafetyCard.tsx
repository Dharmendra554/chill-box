import { useT } from '../i18n/useT'
import { useNow } from '../hooks/useClock'
import { saveContacts, type Contact } from '../lib/download'
import type { WaveBand } from '../lib/marine'
import { formatClock, formatElapsed, MINUTE_MS } from '../lib/time'
import { cx } from '../lib/ui'
import { selectHarbour, useDockStore } from '../store/useDockStore'
import type { GeoFix } from '../types'
import { AnchorIcon, WaveIcon } from '../icons/marine'

/**
 * Landing safety and the numbers to call.
 *
 * The numbers are always on screen — never behind a menu — because the
 * moment they are needed is the moment nobody goes looking for them. When
 * the swell reads rough the card leads with what to do before it lists who
 * to call.
 *
 * 1554 is the Indian Coast Guard's toll-free marine distress line, 112 the
 * national emergency number, 108 the state ambulance service and 1077 the
 * district disaster control room. The harbour office line is per-harbour
 * demo data and is the one entry a real deployment must replace.
 */
/** Older than this and the position is labelled as what it is: old. */
const STALE_FIX_MS = 5 * MINUTE_MS

const NATIONAL = [
  { key: 'emCoastGuard', number: '1554' },
  { key: 'emAll', number: '112' },
  { key: 'emAmbulance', number: '108' },
  { key: 'emDisaster', number: '1077' },
] as const

export function SafetyCard({ band, fix }: { band: WaveBand | null; fix: GeoFix | null }) {
  const t = useT()
  const harbour = useDockStore(selectHarbour)
  const notify = useDockStore((s) => s.notify)
  const rough = band === 'rough'

  // On screen the label is short enough not to truncate; the saved contact
  // carries the harbour name, because "Harbour office" alone is useless in a
  // phone book that may end up holding three of them.
  const contacts: Contact[] = [
    ...NATIONAL.map(({ key, number }) => ({ name: t(key), number })),
    { name: t('emOffice'), number: harbour.office },
  ]

  const forVcard = contacts.map((c, i) =>
    i === contacts.length - 1 ? { ...c, name: `${c.name} — ${harbour.nameEn}` } : c,
  )

  return (
    <section
      className={cx('card flex flex-col gap-3 p-4', rough && 'border-full bg-full-wash')}
    >
      <h2 className="flex items-center gap-2 text-2xl">
        {rough ? <WaveIcon size={26} /> : <AnchorIcon size={26} />}
        {t('safetyTitle')}
      </h2>

      <p className="font-bold">{t(rough ? 'safetyRough' : 'safetyCalm')}</p>

      {rough ? (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 font-bold">
          <li>{t('safetyStepWait')}</li>
          <li>{t('safetyStepLife')}</li>
          <li>{t('safetyStepCall')}</li>
        </ol>
      ) : null}

      <h3 className="text-sm font-extrabold uppercase tracking-wide">{t('emergency')}</h3>
      <ul className="flex flex-col gap-2">
        {contacts.map((contact) => (
          <li key={contact.number}>
            <a
              href={`tel:${contact.number.replace(/\s/g, '')}`}
              className="btn btn-block justify-between gap-3 no-underline"
            >
              <span className="min-w-0 flex-1 truncate text-left text-base">
                {contact.name}
              </span>
              <span className="tabular shrink-0 text-lg">{contact.number}</span>
              <span className="sr-only">{t('callNow')}</span>
            </a>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-block"
        onClick={() => {
          saveContacts('harbour-emergency.vcf', forVcard)
          notify('ok', t('contactsSaved'))
        }}
      >
        {t('saveNumbers')}
      </button>

      <ShareLocation fix={fix} />
    </section>
  )
}

/**
 * The single most useful thing a skipper in trouble can send is where they
 * are. We show the last fix as plain readable degrees — dictatable over a
 * crackly VHF — and hand it to the phone's own share sheet, which reaches
 * whatever they already use to reach the shore.
 */
function ShareLocation({ fix }: { fix: GeoFix | null }) {
  const t = useT()
  const now = useNow()
  const lang = useDockStore((s) => s.lang)
  const harbour = useDockStore(selectHarbour)

  if (!fix) return <p className="text-sm font-bold text-ink-2">{t('noFix')}</p>

  // A position is only useful if you know how old it is. Under a shed roof
  // a fix can be an hour stale, and in a distress call that is the
  // difference between a search area and a wrong one.
  const stale = now - fix.at > STALE_FIX_MS
  const text = `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`
  const message = `${text}\nhttps://www.openstreetmap.org/?mlat=${fix.lat.toFixed(5)}&mlon=${fix.lon.toFixed(5)}#map=15/${fix.lat.toFixed(5)}/${fix.lon.toFixed(5)}`

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular border-3 border-rule bg-paper-2 px-3 py-2 text-center text-lg font-extrabold">
        {text}
      </p>
      <p className="text-xs font-bold text-ink-2">{t('lastFix', formatClock(fix.at))}</p>
      {stale ? (
        <p className="border-3 border-rule bg-late px-2 py-1 text-sm font-extrabold text-late-ink">
          {t('fixStale', formatElapsed(now - fix.at, lang))}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-block btn-warn"
        onClick={() => {
          const payload = { title: harbour.nameEn, text: message }
          // Share sheet where the phone has one; SMS is the offline-safe
          // fallback, since it goes through on a bar of signal that will
          // not carry a data connection.
          if (navigator.share) void navigator.share(payload).catch(() => undefined)
          else location.href = `sms:?body=${encodeURIComponent(message)}`
        }}
      >
        {t('shareLocation')}
      </button>
    </div>
  )
}
