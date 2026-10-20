/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the FOLIA API (no secrets): e.g. https://<ref>.supabase.co/functions/v1/folia-analyze */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
