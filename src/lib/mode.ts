import { syncEnabled } from './harbourSync'

/**
 * Demo mode, and why it is decided once at start-up.
 *
 * The app has always had two ways to run: a shared harbour on Firebase, and
 * a local one on this phone. Which one you got was a BUILD-time fact — the
 * presence of `VITE_FIREBASE_*` — so a judge could not see the local one and
 * a skipper could not step out of the shared one to try something without
 * touching everyone else's crates.
 *
 * This makes it a toggle. What it does NOT do is switch modes underneath a
 * running app: flipping it writes the choice and reloads the page.
 *
 * That is the whole design, and it is deliberate. A live switch would have
 * to tear down two Firebase subscriptions, a reconnect timer and a store
 * subscription, reseed the boxes, and leave every in-flight write to land in
 * a mode that no longer exists. Fifteen audit rounds of evidence in
 * MEMORY.md say that the seams between a fix and the rest of this app are
 * where the defects live, and that is a seam with four sides. A reload has
 * none: every module reads the flag once, at import, exactly as it already
 * read `syncEnabled`, and the app comes up whole in the mode you asked for.
 *
 * The cost is a one-second reload on a control nobody touches twice. The
 * benefit is that `sharedActive` is a constant, so no code anywhere has to
 * cope with it changing.
 */

const KEY = 'ap-chill-box.demo'

function readFlag(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // Storage blocked entirely — a locked-down browser, or a test runner
    // with no DOM. Fall back to the deployment's own default rather than to
    // demo: a skipper whose phone will not remember a preference still needs
    // the real harbour, and demo is a thing you opt into, never a thing you
    // are quietly given.
    return false
  }
}

/**
 * Whether this session is running on its own local copy of the harbour.
 *
 * Always true when no database is configured — there is nothing else it
 * could be, and calling that "live" would be the app's own first lie.
 */
export const demoMode = syncEnabled ? readFlag() : true

/**
 * Whether writes go to the shared harbour every phone reads.
 *
 * This is what the app should branch on. `syncEnabled` answers a narrower
 * question — is a database configured at all — and is right only for
 * deciding whether the toggle can be offered.
 */
export const sharedActive = syncEnabled && !demoMode

/** Switch modes and reload, because a mode is decided at start-up. */
export function setDemoMode(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Nothing to do but carry on: the reload will read whatever survived,
    // and a mode that will not persist is better than a half-switched app.
  }
  location.reload()
}
