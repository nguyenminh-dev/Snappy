/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL: string;
  readonly VITE_ENV: 'development' | 'dev-v3' | 'stagging' | 'production';
  readonly VITE_API_KEY: string;
  // add more variables if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
