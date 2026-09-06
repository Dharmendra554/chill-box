import { useEffect } from 'react'
import { useDockStore } from '../store/useDockStore'

export function useClock(): void {
  useEffect(() => {
    useDockStore.getState().tick(Date.now())
    const id = window.setInterval(() => {
      useDockStore.getState().tick(Date.now())
    }, 1000)
    return () => window.clearInterval(id)
  }, [])
}
