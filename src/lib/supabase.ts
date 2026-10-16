import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Mode fixture : `VITE_MOCK_API=1 npm run dev` en local, ou `VITE_DEMO_MODE=1`
 * pour un déploiement de démonstration public avec des données fictives.
 */
export const isMockMode =
  (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "1") ||
  import.meta.env.VITE_DEMO_MODE === "1";

/**
 * Un projet fraîchement cloné n'a pas de `.env.local`. Plutôt qu'une page
 * blanche ou une erreur réseau obscure, l'application affiche l'écran de
 * configuration — d'où ce test sur les valeurs placeholder de `.env.example`.
 */
export const isSupabaseConfigured =
  isMockMode ||
  (Boolean(url) &&
    Boolean(anonKey) &&
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net|de|jp|us|sg|au)$/i.test(url ?? "") &&
    !url?.includes("REMPLACEZ"));

const clientUrl = isMockMode ? `${window.location.origin}/__mock` : (url ?? "https://unconfigured.supabase.co");
const clientKey = isMockMode ? "mock-anon-key" : (anonKey ?? "anon-key-missing");

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const SUPABASE_URL = isSupabaseConfigured ? clientUrl : null;
