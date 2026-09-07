import { emptyCount } from '../store/selectors'
import type { BoxId, ColdBox } from '../types'

/**
 * Spoken capacity readout — always in Telugu.
 *
 * Many skippers here hear Telugu instantly but read numerals slowly, so
 * this is the fastest answer to "is there room?" with wet hands. The
 * language toggle changes the screen, never this: the readout exists for
 * the people who cannot use the screen, and reading it to them in English
 * would defeat the point.
 *
 * Two browser quirks make naive `speechSynthesis` code silently do nothing,
 * and both bit this app:
 *
 *  1. `getVoices()` returns an EMPTY array on the first call in Chrome and
 *     most Android WebViews — voices arrive asynchronously and fire
 *     `voiceschanged`. Code that reads the list at click time finds nothing
 *     and speaks with no voice at all. `primeVoices()` warms the cache at
 *     startup and keeps it fresh.
 *  2. Most phones ship NO Telugu voice, and feeding Telugu script to an
 *     English voice produces silence, not a fallback.
 *
 * So when there is no Telugu voice we speak Telugu *words* in Latin script
 * through an Indian-accented voice: "velam haalu box, rendu cretlu". A
 * Telugu speaker understands that immediately. Switching to English would
 * have been easier and useless.
 */

let voices: SpeechSynthesisVoice[] = []

export function supportsSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Warm the voice list at startup and on every later change. */
export function primeVoices(): void {
  if (!supportsSpeech()) return
  const refresh = () => {
    voices = speechSynthesis.getVoices()
  }
  refresh()
  speechSynthesis.addEventListener('voiceschanged', refresh)
}

/**
 * Best available voice for a language prefix.
 *
 * Quality varies wildly between the voices a phone exposes. Ranking beats
 * taking the first match: the regional tag (`te-IN`) is preferred over a
 * bare language, and a network voice over an embedded one — Google's Indic
 * TTS is markedly more natural than the small on-device fallbacks, and this
 * readout is short enough that the round trip does not matter.
 */
function findVoice(prefix: string): SpeechSynthesisVoice | undefined {
  if (!voices.length) voices = speechSynthesis.getVoices()
  const list = voices
  const score = (v: SpeechSynthesisVoice) => {
    const tag = v.lang.toLowerCase().replace('_', '-')
    if (!tag.startsWith(prefix)) return -1
    let n = 1
    if (tag.startsWith(`${prefix}-in`)) n += 4
    if (!v.localService) n += 2
    if (/google/i.test(v.name)) n += 1
    return n
  }
  return list
    .filter((v) => score(v) > 0)
    .sort((a, b) => score(b) - score(a))[0]
}

/** Telugu script, for a phone that actually has a Telugu voice. */
const TE = {
  box1: 'వేలం హాలు బాక్స్',
  box2: 'ఐస్ ప్లాంట్ బాక్స్',
  box3: 'డీజిల్ బంక్ బాక్స్',
  crates: 'క్రేట్లు',
  full: 'నిండింది',
  stale: 'జాగ్రత్త. ఈ లెక్క పాతది. బాక్స్ దగ్గర చూసుకోండి.',
  demo: 'ఇది డెమో. నిజమైన బుకింగ్ కాదు.',
  counts: ['సున్నా', 'ఒక', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది', 'పది'],
} as const

/** The same Telugu words in Latin script, for an Indian English voice. */
const ROMAN = {
  box1: 'velam haalu box',
  box2: 'ice plant box',
  box3: 'diesel bunk box',
  crates: 'cretlu',
  full: 'nindindi',
  stale: 'jaagratta. ee lekka paatadi. box daggara chusukondi.',
  demo: 'idi demo. nijamaina booking kaadu.',
  counts: ['sunna', 'oka', 'rendu', 'moodu', 'naalugu', 'aidu', 'aaru', 'edu', 'enimidi', 'tommidi', 'padi'],
} as const

type Phrases = typeof TE | typeof ROMAN

function line(boxes: ColdBox[], words: Phrases): string {
  return boxes
    .map((box) => {
      const free = emptyCount(box)
      const name = words[box.id as BoxId]
      if (free === 0) return `${name}, ${words.full}`
      return `${name}, ${words.counts[free] ?? free} ${words.crates}`
    })
    .join('. ')
}

/** What actually happened, so the UI can be honest about a downgrade. */
export type SpeechOutcome = 'telugu' | 'transliterated' | 'unsupported'

/**
 * Read the harbour out loud.
 *
 * `fresh` is whether these figures are current. It is not optional and it is
 * not decoration: the readout exists for the skipper who cannot read the
 * screen, and the staleness warning used to live *entirely* in on-screen
 * text. So the one person the feature is for heard a flat, confident "four
 * crates" off a frozen snapshot, and walked to a full box with his catch —
 * the app's own primary failure mode, delivered through its own
 * accessibility feature. If the figures are not current, the voice says so
 * first, before any number.
 *
 * `demo` is the same argument one step further, and it was missed when the
 * mode was added: the entire disclaimer went into text, on a screen the one
 * user this button exists for cannot read. He heard a flat, confident
 * "Auction Hall, two crates" off a harbour that does not exist. Whichever
 * caveat applies is spoken FIRST, before any number, for the same reason.
 */
export function speakCapacity(
  boxes: ColdBox[],
  fresh: boolean,
  onEnd: () => void,
  demo = false,
): SpeechOutcome {
  if (!supportsSpeech()) return 'unsupported'

  const telugu = findVoice('te')
  const voice = telugu ?? findVoice('en') ?? findVoice('hi')
  const words: Phrases = telugu ? TE : ROMAN

  const caveats = [demo ? words.demo : '', fresh ? '' : words.stale].filter(Boolean).join(' ')
  const spoken = caveats ? `${caveats} ${line(boxes, words)}` : line(boxes, words)
  const utterance = new SpeechSynthesisUtterance(spoken)
  utterance.lang = voice?.lang ?? (telugu ? 'te-IN' : 'en-IN')
  if (voice) utterance.voice = voice
  utterance.rate = 0.88
  utterance.onend = onEnd
  utterance.onerror = onEnd

  speechSynthesis.cancel()
  speechSynthesis.speak(utterance)
  // Some Android WebViews start paused after a cancel().
  speechSynthesis.resume()

  return telugu ? 'telugu' : 'transliterated'
}

export function stopSpeech(): void {
  if (supportsSpeech()) speechSynthesis.cancel()
}
