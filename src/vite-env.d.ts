/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Firebase web config. Absent in a local-only build; see lib/harbourSync.ts. */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_DATABASE_URL?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
