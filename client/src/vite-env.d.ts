/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BETTER_AUTH_URL?: string
  readonly VITE_SOCKET_URL?: string
  readonly VITE_MAP_STYLE_URL?: string
  readonly VITE_MAP_DARK_STYLE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
