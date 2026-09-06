import { useCallback, useEffect, useState } from 'react'
import { AdminScreen } from './components/AdminScreen'
import { OfflineBanner, TabBar, Toast, TopBar, WaveStrip } from './components/Chrome'
import { DockScreen } from './components/DockScreen'
import { HarbourScreen } from './components/HarbourScreen'
import { RegisterScreen } from './components/RegisterScreen'
import { useClock } from './hooks/useClock'
import { vibrate } from './hooks/useHaptics'
import { useMarine } from './hooks/useMarine'
import { useConnectivity } from './hooks/useConnectivity'
import { useT } from './i18n/useT'
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
 * App shell. It decides *what* is on screen and keeps the document in sync
 * with theme and language; nothing here does work a screen could do.
 *
 * The harbour-master console is not a tab. It is reachable only at the
 * `#admin` URL — the admin bookmarks it once — so skippers never see a door
 * they have no reason to open.
 */
export default function App() {
  useClock()

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

  const [speaking, setSpeaking] = useState(false)

  const now = useDockStore((s) => s.now)
  const marine = useMarine(harbour.lat, harbour.lon)
  // Reachability is proven by the swell poll landing, not assumed from
  // navigator.onLine — see useConnectivity.
  const reachedAt = marine.reading?.fetchedAt ?? null
  const reach = useConnectivity(reachedAt, now)

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

  const onSpeak = useCallback(() => {
    if (speaking) {
      stopSpeech()
      setSpeaking(false)
      return
    }
    // Always Telugu, whatever the screen language is set to.
    if (speakCapacity(boxes, () => setSpeaking(false)) === 'unsupported') {
      notify('warn', t('voiceNone'))
      return
    }
    setSpeaking(true)
  }, [boxes, notify, speaking, t])

  const inAdmin = tab === 'admin'
  const band = marine.reading ? waveBand(marine.reading.waveHeight) : null

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
      {reach !== 'stale' ? (
        <WaveStrip t={t} reading={marine.reading} error={marine.error} />
      ) : (
        <OfflineBanner t={t} since={reachedAt} />
      )}

      <main className="mx-auto max-w-6xl px-3 py-4 pb-28">
        {inAdmin ? (
          <AdminScreen />
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
              <DockScreen band={band} onChangeHarbour={signOut} onResetDemo={resetDemo} />
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
