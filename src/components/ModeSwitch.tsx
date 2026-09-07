import { useT } from '../i18n/useT'
import { syncEnabled } from '../lib/harbourSync'
import { demoMode, setDemoMode } from '../lib/mode'
import { useDockStore } from '../store/useDockStore'

/**
 * Which harbour this session is on, and the switch between them.
 *
 * On the registration screen as well as in the demo tools, because the tools
 * live at the bottom of the Book screen and the Book screen only exists once
 * you have a boat. So on a configured build the only route to the demo ran
 * through registering in the REAL society's roster first — where a boat can
 * never be deleted. The sandbox was behind the thing it exists to protect.
 *
 * Rendered only where there is a choice: with no database configured the app
 * is local and always was, and a toggle that cannot move is worse than none.
 */
export function ModeSwitch() {
  const t = useT()
  const notify = useDockStore((s) => s.notify)
  if (!syncEnabled) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="border-3 border-rule bg-paper-2 px-3 py-2 text-sm font-extrabold">
        {t(demoMode ? 'modeDemoNow' : 'modeLiveNow')}
      </p>
      <button
        type="button"
        className="btn btn-block"
        onClick={() => {
          // Says so when it cannot. A switch that silently fails is a dead
          // button, and this one decides which harbour the next booking
          // reaches.
          if (!setDemoMode(!demoMode)) notify('error', t('modeSwitchFailed'))
        }}
      >
        {t(demoMode ? 'modeGoLive' : 'modeGoDemo')}
      </button>
      {/* What it costs, before the tap rather than after it. Switching
          reloads the page — that is the whole design, see MEMORY.md §26 —
          which discards anything typed into the registration form above. */}
      <p className="text-xs font-bold text-ink-2">{t('modeHint')}</p>
      <p className="text-xs font-bold text-ink-2">{t('modeReloads')}</p>
    </div>
  )
}
