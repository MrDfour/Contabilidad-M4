/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del relay propio en Cloudflare Workers (PLAN_SYNC_KV.md, K-12). */
  readonly VITE_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
