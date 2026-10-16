import { QueryClient } from "@tanstack/react-query";

/**
 * Le pointage est une donnée volatile : un poste voisin saisit en parallèle.
 * 30 s de fraîcheur, refill au retour en fenêtre, et le temps réel lève ce délai
 * sur la grille de saisie.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
      throwOnError: false,
    },
    mutations: { retry: 0 },
  },
});
