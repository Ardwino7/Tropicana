/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** `"1"` active les fixtures en développement local. */
  readonly VITE_MOCK_API?: string;
  /** `"1"` active les fixtures fictives dans le déploiement public de démonstration. */
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
