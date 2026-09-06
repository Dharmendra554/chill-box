import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Last line of defence.
 *
 * A React error normally unmounts the tree and leaves a white screen. On a
 * dock at 4 a.m. that is indistinguishable from a dead phone, and the
 * skipper has no way back. This catches the crash, keeps the app on screen,
 * and offers two escapes in order of destructiveness: reload first, and
 * only then wipe this device's saved state.
 *
 * The message is bilingual and hard-coded rather than translated, because
 * the i18n layer is one of the things that could have thrown.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry endpoint by design; the console is what a field engineer
    // with a USB cable can actually read.
    console.error('Chill-Box crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center bg-paper p-4 text-ink">
        <div className="card flex w-full max-w-md flex-col gap-3 p-5">
          <h1 className="text-2xl">యాప్‌లో లోపం · Something broke</h1>
          <p className="font-bold">
            యాప్ మళ్లీ తెరవండి. మీ బుకింగ్ సురక్షితంగా ఉంది.
            <br />
            Reopen the app — your booking is safe.
          </p>
          <button
            type="button"
            className="btn btn-lg btn-primary btn-block"
            onClick={() => location.reload()}
          >
            మళ్లీ తెరువు · Reload
          </button>
          <button
            type="button"
            className="btn btn-block"
            onClick={() => {
              try {
                localStorage.clear()
              } catch {
                /* storage may be blocked; the reload is still worth doing */
              }
              location.reload()
            }}
          >
            రీసెట్ · Reset this phone
          </button>
          <p className="text-xs font-bold text-ink-2">{error.message}</p>
        </div>
      </div>
    )
  }
}
