/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'http' | 'worker';
}

declare const __APP_VERSION__: string;
