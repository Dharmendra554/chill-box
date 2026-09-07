import { useT } from '../i18n/useT'
import { useNow } from '../hooks/useClock'
import { saveContacts, type Contact } from '../lib/download'
import { seaAdvice, type WaveBand } from '../lib/marine'
import { formatClock, formatElapsed, MINUTE_MS } from '../lib/time'
import { cx } from '../lib/ui'
import { toHarbourTime } from '../lib/harbourSync'
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

export function SafetyCard({
  band,
  fix,
  locating,
  seaKnown,
  seaFailed,
  readingAt,
}: Readonly<{
  band: WaveBand | null
  fix: GeoFix | null
  /** Whether a position may still arrive. False once we know none will. */
  locating: boolean
  /** Whether a swell reading has ever landed for this harbour. */
  seaKnown: boolean
  /** Whether the last attempt to fetch one failed. */
  seaFailed: boolean
  /** When the reading on screen was taken, in harbour time. */
  readingAt: number | null
}>) {
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

      {/* Four states, not two. `band === null` means we cannot stand behind
          a figure, and telling a skipper the sea is calm on that basis is
          the most expensive lie this app could tell. But "we asked and the
          answer is too old" and "we have not finished asking" are different
          sentences, and this card has now got the split wrong twice in
          opposite directions: first by collapsing them, then by asking only
          whether a reading had ever landed — which is false while we wait
          AND after the first fetch fails. On a cold start on 2G where the
          swell API does not answer, the strip said "Swell data offline"
          while this card, one scroll below, said it was on its way. A
          skipper waits for something that is not coming. It takes both
          questions: has one ever landed, and did the last attempt fail. */}
      <p className="font-bold">
        {t(seaAdvice(rough, band, seaKnown, seaFailed))}
      </p>

      {rough ? (
        <>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 font-bold">
            <li>{t('safetyStepWait')}</li>
            <li>{t('safetyStepLife')}</li>
            <li>{t('safetyStepCall')}</li>
          </ol>
          {/* A rough band deliberately outlives its own staleness gate,
              because warning about breakers that may have passed is the safe
              direction. That is a reason to date it, not a reason not to: a
              six-hour-old "delay your landing" over a sea that is now flat
              is still a confident number, and this card is the one a skipper
              acts on. §2 makes no exception for warnings. */}
          {readingAt !== null ? (
            <p className="text-sm font-bold text-ink-2">
              {t('waveTaken', formatClock(readingAt))}
            </p>
          ) : null}
        </>
      ) : null}

      <h3 className="text-sm font-extrabold uppercase">{t('emergency')}</h3>
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

      <ShareLocation fix={fix} locating={locating} />
    </section>
  )
}

/**
 * The single most useful thing a skipper in trouble can send is where they
 * are. We show the last fix as plain readable degrees — dictatable over a
 * crackly VHF — and hand it to the phone's own share sheet, which reaches
 * whatever they already use to reach the shore.
 */
function ShareLocation({ fix, locating }: Readonly<{ fix: GeoFix | null; locating: boolean }>) {
  const t = useT()
  const now = useNow()
  const lang = useDockStore((s) => s.lang)
  const harbour = useDockStore(selectHarbour)

  // "Still working out where you are" is only true while a position may
  // still arrive. It used to be shown for ever, including when the phone had
  // already refused — so a skipper in breakers, on the one screen that
  // exists for a boat in trouble, waited for a position that was never
  // coming instead of reading it off a plotter or saying plainly that he
  // did not have one. The hook knows within twelve seconds; nobody asked it.
  if (!fix) {
    return (
      <p className="text-sm font-bold text-ink-2">{t(locating ? 'noFix' : 'noFixEver')}</p>
    )
  }

  // A position is only useful if you know how old it is. Under a shed roof
  // a fix can be an hour stale, and in a distress call that is the
  // difference between a search area and a wrong one.
  //
  // The fix carries a DEVICE-clock timestamp — `position.timestamp` is the
  // one instant this app does not mint itself — so it is converted into
  // harbour time before being aged against the harbour's clock. Comparing
  // the two directly made a phone twenty minutes slow show a permanent
  // "this position is 20 minutes old" over a fix one second old, and a
  // phone twenty minutes fast never warn at all, however stale it really
  // was. On the one screen that exists for a boat in trouble.
  const age = Math.max(0, now - toHarbourTime(fix.at))
  const stale = age > STALE_FIX_MS
  const text = `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`
  const message = `${text}\nhttps://www.openstreetmap.org/?mlat=${fix.lat.toFixed(5)}&mlon=${fix.lon.toFixed(5)}#map=15/${fix.lat.toFixed(5)}/${fix.lon.toFixed(5)}`

  return (
    <div className="flex flex-col gap-2">
      <p className="tabular border-3 border-rule bg-paper-2 px-3 py-2 text-center text-lg font-extrabold">
        {text}
      </p>
      <p className="text-xs font-bold text-ink-2">{t('lastFix', formatClock(toHarbourTime(fix.at)))}</p>
      {stale ? (
        <p className="border-3 border-rule bg-late px-2 py-1 text-sm font-extrabold text-late-ink">
          {t('fixStale', formatElapsed(age, lang))}
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
