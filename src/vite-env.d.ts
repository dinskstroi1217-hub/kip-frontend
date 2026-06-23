/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_VERSION?: string;
  /** 'true' → window.fetch перехватывается локальными моками. См. src/mocks/. */
  readonly VITE_USE_MOCKS?: string;
  /** Явная база роутера (corp/single-file, где BASE_URL относительный). */
  readonly VITE_ROUTER_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
