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
import { useMarine } from './hooks/useMarine'
import { STALE_MS, SYNC_STALE_MS, useConnectivity } from './hooks/useConnectivity'
import { useT } from './i18n/useT'
import { syncEnabled } from './lib/harbourSync'
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
 * The harbour master's console, off the skipper's critical path.
 *
 * It is 619 lines, and it pulls in the reporting maths, the CSV writer and
 * the PBKDF2 verifier behind it. Twenty skippers on 2G were downloading all
 * of it to look at three boxes, and never opening it — while MEMORY.md
 * claimed it was already a separate chunk. It lives at #admin only, so
 * fetching it when that route opens costs the one person who wants it a
 * moment and everyone else nothing.
 */
const AdminScreen = lazy(() =>
  import('./components/AdminScreen').then((m) => ({ default: m.AdminScreen })),
)

/**
 * App shell. It decides *what* is on screen and keeps the document in sync
 * with theme and language; nothing here does work a screen could do.
 *
 * The harbour-master console is not a tab. It is reachable only at the
 * `#admin` URL — the admin bookmarks it once — so skippers never see a door
 * they have no reason to open.
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
  const reachedAt = syncEnabled
    ? syncLive
      ? now
      : syncedAt
    : (marine.reading?.fetchedAt ?? null)
  const reach = useConnectivity(reachedAt, now, syncEnabled ? SYNC_STALE_MS : STALE_MS)

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

  // `#admin` is the only route in the app. Watching hashchange keeps the
  // back button working when the admin leaves the console.
  useEffect(() => {
    const sync = () => setTab(location.hash === '#admin' ? 'admin' : 'dock')
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
    const fresh = !syncEnabled || reach === 'connected'
    const outcome = speakCapacity(boxes, fresh, () => setSpeaking(false))
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

  const inAdmin = tab === 'admin'
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
  const band = !marine.reading
    ? null
    : marine.error && waveBand(marine.reading.waveHeight) !== 'rough'
      ? null
      : waveBand(marine.reading.waveHeight)

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <TopBar
        t={t}
        lang={lang}
        theme={theme}
        harbourId={harbour.id}
        boat={boat}
        speaking={speaking}
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
      {reach === 'checking' && syncEnabled ? (
        <LoadingBanner t={t} />
      ) : reach !== 'stale' ? (
        <WaveStrip t={t} reading={marine.reading} band={band} error={marine.error} />
      ) : (
        // Local-only mode has no shared copy to be behind, and `reachedAt` is
        // then the weather poll — dating the box figures to it said something
        // true about the wrong thing. `staleNever` is the honest line there.
        <OfflineBanner t={t} since={syncEnabled ? reachedAt : null} />
      )}

      <main className="mx-auto max-w-6xl px-3 py-4 pb-28">
        {/* The admin fallback is not `null`: on 2G the console's chunk takes
            seconds, and the tab bar is hidden in admin — so the harbour
            master got a blank page with no way back and no sign that
            anything was happening. */}
        {inAdmin ? (
          <Suspense fallback={<p className="card p-4 font-bold">{t('loadingTitle')}</p>}>
            <AdminScreen />
          </Suspense>
        ) : !boat ? (
          <RegisterScreen />
        ) : (
          <>
            {boat.status !== 'active' ? (
              <p
                className={
                  boat.status === 'pending'
                    ? 'card mb-4 border-hold bg-hold-wash p-4'
                    : 'card mb-4 border-full bg-full-wash p-4'
                }
                role="status"
              >
                <strong className="block font-display text-xl">
                  {t(boat.status === 'pending' ? 'pendingTitle' : 'blockedTitle')}
                </strong>
                <span className="font-bold">
                  {t(boat.status === 'pending' ? 'pendingBody' : 'blockedBody')}
                </span>
              </p>
            ) : null}

            {tab === 'dock' ? (
              <DockScreen
                band={band}
                seaKnown={marine.reading !== null}
                onChangeHarbour={signOut}
                onResetDemo={resetDemo}
              />
            ) : (
              <HarbourScreen />
            )}

          </>
        )}
      </main>

      {inAdmin ? null : <TabBar t={t} tab={tab} onTab={setTab} />}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
