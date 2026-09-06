import { useMemo } from 'react'
import { useDockStore } from '../store/useDockStore'
import { translator, type T } from './dictionary'

/** Translator bound to the active language, stable between language flips. */
export function useT(): T {
  const lang = useDockStore((s) => s.lang)
  return useMemo(() => translator(lang), [lang])
}
