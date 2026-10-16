# Tropicana — Pointage des effectifs

Application de démonstration pour le suivi des présences et la gestion des dossiers salariés.

## Démonstration locale

```bash
npm install
VITE_MOCK_API=1 npm run dev
```

Les comptes de démonstration sont affichés sur l'écran de connexion. Le jeu de données est fictif.

## Déploiement Vercel

Créer le projet Vercel depuis ce dépôt avec `demo` comme répertoire racine et la commande de build `npm run build` (sortie : `dist`). Ajouter la variable d'environnement `VITE_DEMO_MODE=1` pour activer le jeu de données fictif dans la version publique. Ne pas ajouter de clé `SUPABASE_SERVICE_ROLE_KEY` ni de données réelles de salariés.

Le fichier `vercel.json` redirige les routes de l'application vers `index.html` pour que les liens directs fonctionnent.

