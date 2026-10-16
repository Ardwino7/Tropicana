import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { profileQuery } from "@/data/hooks";
import type { AppRole, Profile } from "@/types/domain";
import { EmptyState, Loading } from "@/components/ui";

interface AuthValue {
  userId: string | null;
  profile: Profile | null;
  role: AppRole | null;
  email: string | null;
  /** `checking` couvre l'hydratation de session *et* la lecture du profil. */
  checking: boolean;
  signedIn: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session);
        setChecking(false);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  const profileRequest = useQuery(profileQuery(userId));
  const profile = profileRequest.data ?? null;

  const value = useMemo<AuthValue>(
    () => ({
      userId,
      profile,
      role: profile?.role ?? null,
      email: session?.user.email ?? null,
      checking: checking || (Boolean(userId) && profileRequest.isPending),
      signedIn: Boolean(session && profile),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [userId, profile, session, checking, profileRequest.isPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé sous AuthProvider.");
  return context;
}

/** Chemin d'atterrissage d'un rôle : le RH ouvre la synthèse, le chef de service la grille. */
export function homeFor(role: AppRole | null): string {
  return role === "rh" ? "/synthese" : "/pointage";
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { checking, signedIn, userId, profile } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured) return <Navigate to="/configuration" replace />;
  if (checking) return <Loading label="Ouverture de la session" />;
  if (!signedIn) return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;

  // Profil absent = compte créé hors du seed. La RLS protège les données, mais
  // l'interface ne peut pas deviner quel rôle afficher.
  if (userId && !profile)
    return (
      <EmptyState
        title="Compte non rattaché à un rôle"
        body="Aucune ligne dans `profiles` pour cet identifiant. Un RH doit vous affecter un rôle, ou le seed doit être relancé."
      />
    );

  return <>{children}</>;
}

export function RequireRole({ role, children }: { role: AppRole; children: ReactNode }) {
  const { role: current } = useAuth();
  if (current === role) return <>{children}</>;
  return <Navigate to={homeFor(current)} replace />;
}
