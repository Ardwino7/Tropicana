import { Route, Routes, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { isSupabaseConfigured } from "@/lib/supabase";
import { AuthProvider, RequireAuth, RequireRole, homeFor, useAuth } from "@/auth/AuthContext";
import { ToastProvider } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui";
import LoginPage from "@/pages/LoginPage";
import ConfigurePage from "@/pages/ConfigurePage";
import PointagePage from "@/pages/PointagePage";
import EffectifPage from "@/pages/EffectifPage";
import EmployeePage from "@/pages/EmployeePage";
import SynthesePage from "@/pages/SynthesePage";

function RoleHome() {
  const { role } = useAuth();
  return <Navigate to={homeFor(role)} replace />;
}

function NotFound() {
  return (
    <EmptyState
      title="Page introuvable"
      body="Ce chemin n'existe pas dans l'application. Depuis la barre latérale, retrouvez le pointage du jour, l'effectif et la synthèse RH."
    />
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigurePage />;

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/connexion" element={<LoginPage />} />
            <Route path="/configuration" element={<ConfigurePage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<RoleHome />} />
              <Route
                path="/pointage"
                element={
                  <RequireRole role="chef_de_service">
                    <PointagePage />
                  </RequireRole>
                }
              />
              <Route
                path="/effectif"
                element={
                  <RequireRole role="chef_de_service">
                    <EffectifPage />
                  </RequireRole>
                }
              />
              <Route path="/salaries/:id" element={<EmployeePage />} />
              <Route
                path="/synthese"
                element={
                  <RequireRole role="rh">
                    <SynthesePage />
                  </RequireRole>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
