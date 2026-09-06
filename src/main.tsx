import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { primeVoices } from './lib/speech'
import { useDockStore } from './store/useDockStore'

// Voices load asynchronously; warm the list before the first tap.
primeVoices()

// Paint the persisted theme before React mounts so there is no light flash
// on a phone that was left in night mode.
const { theme, lang } = useDockStore.getState()
document.documentElement.dataset.theme = theme
document.documentElement.lang = lang

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
