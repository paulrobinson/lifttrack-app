declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  readonly VITE_STORAGE_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
