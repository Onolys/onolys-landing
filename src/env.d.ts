/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SIGNUP_URL?: string;
  readonly PUBLIC_GA_ID?: string;
  readonly PUBLIC_SIGNUP_PLAN?: string;
  readonly PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
