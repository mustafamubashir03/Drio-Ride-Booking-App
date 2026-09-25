/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DEPLOY_ENV?: "local" | "render"
  readonly VITE_SOCKET_URL?: string
  readonly VITE_MAP_STYLE_URL?: string
  readonly VITE_MAP_DARK_STYLE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
