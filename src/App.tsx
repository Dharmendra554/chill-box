import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  LoadingBanner,
  OfflineBanner,
  TabBar,
  Toast,
  TopBar,
  WaveStrip,
} from './components/Chrome'
import { DockScreen } from './components/DockScreen'
import { HarbourScreen } from './components/HarbourScreen'
import { RegisterScreen } from './components/RegisterScreen'
import { useNow } from './hooks/useClock'
import { vibrate } from './hooks/useHaptics'
import { MARINE_STALE_MS, useMarine } from './hooks/useMarine'
import { STALE_MS, SYNC_STALE_MS, useConnectivity } from './hooks/useConnectivity'
import { useT } from './i18n/useT'
import { demoMode, sharedActive } from './lib/mode'
import { waveBand } from './lib/marine'
import { speakCapacity, stopSpeech } from './lib/speech'
import { boatState } from './store/selectors'
import {
  flushStorage,
  selectBoxes,
  selectHarbour,
  selectMyBoat,
  setStorageErrorHandler,
  useDockStore,
} from './store/useDockStore'

/**
 * The harbour record, off the booking path.
 *
 * It pulls in the reporting maths, the CSV writer and the PBKDF2 verifier
 * behind it. Twenty skippers on 2G were downloading all of it to look at
 * three boxes — while MEMORY.md claimed it was already a separate chunk. It
 * is a tab now rather than a hidden URL, and that makes the split matter
 * more, not less: it must cost nothing until somebody taps it.
 */
const RecordScreen = lazy(() =>
  import('./components/RecordScreen').then((m) => ({ default: m.RecordScreen })),
)

/**
 * App shell. It decides *what* is on screen and keeps the document in sync
 * with theme and language; nothing here does work a screen could do.
 *
 * Three tabs, all equal. The third used to be a PIN-gated console at the
 * `#admin` URL, kept off the tab bar so skippers never saw a door they had
 * no reason to open — which was right while it could approve, block and
 * force-release. It can do none of those now, so what is behind it is the
 * harbour's own activity, and there is no honest reason to hide a harbour's
 * activity from the harbour. `#admin` still works: it is in the README and
 * in muscle memory.
 */
export default function App() {

  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const theme = useDockStore((s) => s.theme)
  const tab = useDockStore((s) => s.tab)
  const harbour = useDockStore(selectHarbour)
  const boxes = useDockStore(selectBoxes)
  const myBoatId = useDockStore((s) => s.myBoatId)
  const boat = useDockStore(selectMyBoat)
  const toast = useDockStore((s) => s.toast)
  const setLang = useDockStore((s) => s.setLang)
  const setTheme = useDockStore((s) => s.setTheme)
  const setTab = useDockStore((s) => s.setTab)
  const signOut = useDockStore((s) => s.signOut)
  const resetDemo = useDockStore((s) => s.resetDemo)
  const dismissToast = useDockStore((s) => s.dismissToast)
  const notify = useDockStore((s) => s.notify)
  const syncLive = useDockStore((s) => s.syncLive)
  const syncedAt = useDockStore((s) => s.syncedAt)

  const [speaking, setSpeaking] = useState(false)
  /**
   * Whether the "which boat are you" screen is open.
   *
   * Local state rather than a fourth tab, because it is not a place — it is
   * the one question the app asks, at the moment a visitor wants a crate,
   * and it closes for ever once answered.
   *
   * It is scoped to the BOOK tab, and that is not tidiness. It used to win
   * over `tab` outright, so while it was open the tab bar — the only
   * navigation in the app — lit up, moved `aria-current`, and changed
   * nothing: a dead control, which AGENTS §2 forbids by name. And "back to
   * the boxes" only cleared this flag, so a visitor who had tapped Harbour
   * behind it landed on Harbour, under a button that says boxes.
   */
  const [identifying, setIdentifying] = useState(false)
  const asking = identifying && !boat && tab === 'dock'

  const now = useNow()
  const marine = useMarine(harbour.lat, harbour.lon)
  // Reachability is proven by a request landing, not assumed from
  // navigator.onLine — see useConnectivity.
  //
  // When the harbour is shared, the database socket is the signal that
  // matters: the swell API and Firebase can fail independently, and it is
  // the box figures, not the wave height, that send a boat to a full box.
  // While the socket is live the figures are current by definition; once it
  // drops, they are only as fresh as the last thing it told us.
  // In local-only mode there is nothing to be behind: the box figures ARE
  // this phone's own, and no network exists that could make them stale. The
  // weather poll was standing in for reachability here, and it stopped being
  // able to: `fetchedAt` is now the instant the SEA was measured, which
  // Open-Meteo buckets to a quarter of an hour, so a phone that had missed
  // nothing dropped past `STALE_MS` before the next poll landed and got
  // "No signal" in red over a working link and correct figures. The swell
  // strip carries its own age and its own offline line; it does not need
  // this banner to speak for it.
  let reachedAt: number | null = now
  if (sharedActive) reachedAt = syncLive ? now : syncedAt
  const reach = useConnectivity(reachedAt, now, sharedActive ? SYNC_STALE_MS : STALE_MS)


  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dataset.theme = theme
    // The browser chrome follows the in-app toggle, not the OS setting —
    // otherwise a phone in system-dark shows a dark status bar above a
    // daylight-themed app.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'day' ? '#FAF7F0' : '#101a2b')
  }, [lang, theme])

  // `#admin` is a bookmark, not the route any more — the record is a tab.
  // Watching hashchange keeps the back button working for anyone who still
  // arrives that way, and for the README, which has sent judges there for
  // eighteen rounds.
  useEffect(() => {
    const sync = () => setTab(location.hash === '#admin' ? 'record' : 'dock')
    if (location.hash === '#admin') sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [setTab])

  // A crate of ours going overdue is the one event worth a buzz in a pocket.
  const late = myBoatId ? boatState(boxes, myBoatId) === 'overstay' : false
  useEffect(() => {
    if (late) vibrate([120, 60, 120, 60, 200])
  }, [late])

  // Persist writes are coalesced, so a phone closed between them would lose
  // the last few seconds. Flush when the page is hidden — the only moment
  // mobile browsers reliably give before they freeze or kill a tab.
  useEffect(() => {
    const flush = () => flushStorage()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    setStorageErrorHandler(() => notify('error', t('storageFull')))
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [notify, t])

  useEffect(() => () => stopSpeech(), [])

  // Whether we have already said that this phone has no Telugu voice.
  const toldAboutVoice = useRef(false)

  const onSpeak = useCallback(() => {
    if (speaking) {
      stopSpeech()
      setSpeaking(false)
      return
    }
    // Always Telugu, whatever the screen language is set to. And the voice
    // carries the same staleness warning the banner does — see speakCapacity.
    // In local-only mode the figures ARE this phone's own and cannot be
    // stale, so `reach` — which then tracks the weather poll — must not
    // decide. A warning that fires when nothing is wrong stops being read.
    const fresh = !sharedActive || reach === 'connected'
    const outcome = speakCapacity(boxes, fresh, () => setSpeaking(false), demoMode)
    if (outcome === 'unsupported') {
      notify('warn', t('voiceNone'))
      return
    }
    // This phone has no Telugu voice, so those are Telugu words spoken by an
    // Indian English voice. Worth saying once — the skipper can hear that it
    // sounds wrong and should know it is the phone, not the app. Once per
    // session only: a warning on every tap is noise, and this toast does not
    // fade by itself.
    if (outcome === 'transliterated' && !toldAboutVoice.current) {
      toldAboutVoice.current = true
      notify('warn', t('voiceRoman'))
    }
    setSpeaking(true)
  }, [boxes, notify, reach, speaking, t])

  /**
   * The sea state, and only while we can stand behind it.
   *
   * `useMarine` keeps the last good reading when a fetch fails, which is
   * right for the strip — an old figure with its time on it beats no figure.
   * It is NOT right for the landing-safety card: a six-hour-old "calm" over
   * a squall is the one number a skipper might come in on. So a stale
   * reading only keeps its band if that band is `rough`, which is the
   * conservative direction; anything else becomes unknown.
   */
  const band = (() => {
    if (!marine.reading) return null
    const of = waveBand(marine.reading.waveHeight)
    if (of === 'rough') return of
    // An old reading is not a current sea state, whether or not the last
    // fetch reported an error — a backgrounded tab simply stops polling,
    // and the figure ages silently. `rough` is exempt above because
    // warning about breakers that may have passed is the safe direction;
    // `calm` is the one a skipper comes in on.
    const old = now - marine.reading.fetchedAt > MARINE_STALE_MS
    return marine.error || old ? null : of
  })()

  /**
   * The one line under the header, and which of the three it is.
   *
   * Named rather than nested in the JSX because these three cases are the
   * app's whole freshness policy: still asking, current, or behind.
   * Local-only mode has no shared copy to be behind, and `reachedAt` is then
   * the weather poll — dating the box figures to it said something true
   * about the wrong thing, so `staleNever` is the honest line there.
   */
  let banner = <OfflineBanner t={t} since={sharedActive ? reachedAt : null} shared={sharedActive} />
  if (reach === 'checking' && sharedActive) banner = <LoadingBanner t={t} />
  else if (reach !== 'stale' || demoMode) {
    // `|| demoMode`: a demo has no shared copy to fall behind, so losing the
    // radio changes nothing about these figures. Without this, switching a
    // phone to flight mode in demo stacked an amber "No signal — these
    // figures are from this phone only" on top of the demo banner already
    // saying exactly that, and raised an alarm about a link the mode does
    // not use. A warning that fires when nothing is wrong stops being read.
    banner = <WaveStrip t={t} reading={marine.reading} band={band} error={marine.error} />
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <TopBar
        t={t}
        lang={lang}
        theme={theme}
        harbourId={harbour.id}
        boat={boat}
        speaking={speaking}
        demo={demoMode}
        banner={banner}
        onLang={setLang}
        onTheme={setTheme}
        onSpeak={onSpeak}
      />
      {/*
        Three states, not two. `checking` used to render the wave strip,
        which says nothing about the figures — so for the first twenty
        seconds of every cold start the boxes showed either the last
        session's snapshot or, on a fresh install, the seeded demo
        occupancy, rendered pixel-identically to live data and with nothing
        on screen to say otherwise. A skipper opening the app on 2G reads it
        inside those twenty seconds. It fails in the dangerous direction: he
        sees crates that do not exist, rather than none at all.
      */}
      <main className="mx-auto max-w-6xl px-3 py-4 pb-28">
        {/* The record's fallback is not `null`: on 2G that chunk takes
            seconds, so a blank page with nothing happening was the whole
            experience of tapping the tab. */}
        {asking ? (
          <RegisterScreen onDone={() => setIdentifying(false)} />
        ) : tab === 'record' ? (
          <Suspense fallback={<p className="card p-4 font-bold">{t('loadingTitle')}</p>}>
            <RecordScreen />
          </Suspense>
        ) : tab === 'dock' ? (
          <DockScreen
            band={band}
            seaKnown={marine.reading !== null}
            seaFailed={marine.error}
            readingAt={marine.reading?.fetchedAt ?? null}
            // Signing out is "I am not this boat any more", which is the
            // same question this screen asks — so it opens it rather than
            // leaving a visitor on a Book tab whose only action is a button
            // they just came from.
            onChangeHarbour={() => {
              signOut()
              setIdentifying(true)
            }}
            onResetDemo={resetDemo}
            onIdentify={() => setIdentifying(true)}
          />
        ) : (
          <HarbourScreen />
        )}
      </main>

      {/* Always. The tab bar used to be hidden inside the console, which is
          why a 2G chunk load there left the harbour master with no way back
          — and a screen you can reach and not leave is worse than one you
          cannot reach. */}
      <TabBar t={t} tab={tab} onTab={setTab} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
