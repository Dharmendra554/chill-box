import { useEffect, useRef, type RefObject } from 'react'

/**
 * Open a `<dialog>` modally, and make the fallback behave like one.
 *
 * Four sheets in this app open the same way and all four carried the same
 * two lines, so this is one concept in one place rather than an abstraction
 * for its own sake.
 *
 * `showModal()` is feature-detected because it throws on old Android
 * WebViews — and in the booking receipt's case it would throw one frame
 * AFTER the crate was claimed in the shared database, handing the skipper a
 * crash screen and a "Reset this phone" button instead of the code he came
 * for. The fallback is `setAttribute('open', '')`.
 *
 * But that fallback opens a NON-MODAL dialog, and three comments in this
 * codebase claimed otherwise. Non-modal means: focus does not move, the
 * `cancel` event never fires so `onCancel={onClose}` is inert, and Escape
 * does nothing. On the receipt — which exists to make a skipper certain the
 * slot is his so he does not hedge by taking a second one — a screen-reader
 * user was never told it had appeared, on precisely the devices the branch
 * exists for. So the fallback moves focus and wires Escape itself.
 *
 * What it still does NOT do, said plainly because the last comment here
 * overstated it: the page behind a fallback dialog stays tabbable and there
 * is no backdrop. A focus trap would need a full sentinel implementation for
 * a branch that only runs on WebViews old enough to lack `showModal`, and
 * the honest trade is to say so rather than to imply a trap that is not
 * there.
 *
 * Use `useModal` below rather than calling this from an effect directly:
 * the effect's dependencies are the whole defect this helper had.
 */
function openModal(el: HTMLDialogElement | null, onClose: () => void): () => void {
  if (!el || el.open) return () => {}

  if (typeof el.showModal === 'function') {
    el.showModal()
    return () => {}
  }

  el.setAttribute('open', '')
  // `tabIndex = -1` so the dialog itself can take focus without joining the
  // tab order. Without this the fallback announced nothing at all.
  el.tabIndex = -1
  el.focus()

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    // Matches the modal path, where Escape fires `cancel` and closes.
    event.preventDefault()
    onClose()
  }
  el.addEventListener('keydown', onKeyDown)
  return () => el.removeEventListener('keydown', onKeyDown)
}

/**
 * Open a dialog once, for the life of the component.
 *
 * The four sheets called `openModal` straight from an effect keyed on
 * `onClose`, and every caller passes an inline arrow. `App` re-renders at
 * 1 Hz (the clock), so `onClose` had a new identity every second and the
 * effect tore down and re-ran every second. On the `showModal` path that is
 * harmless — the re-run early-returns because the dialog is already open.
 * On the FALLBACK path the teardown removed the Escape listener and the
 * re-run returned before re-adding it, so Escape worked for exactly one
 * second and then stopped, on the old WebViews that branch exists for.
 *
 * The mount effect takes no reactive dependencies at all, and the current
 * `onClose` is read through a ref when the key is actually pressed.
 */
export function useModal(
  ref: RefObject<HTMLDialogElement | null>,
  onClose: () => void,
): void {
  const latest = useRef(onClose)
  // Updated in an effect, not during render: a ref written while rendering
  // is a lint error here and a real hazard under concurrent rendering, where
  // a render can be thrown away after it has already mutated the ref.
  useEffect(() => {
    latest.current = onClose
  }, [onClose])
  useEffect(() => openModal(ref.current, () => latest.current()), [ref])
}
