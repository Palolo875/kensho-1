# Guide de Contribution - Kensho

Bienvenue contributeur ! 🎉 Ce document vous explique comment contribuer au projet **Kensho**, notre architecture "Constellation Résiliente" d'agents multi-workers.

---

## 📋 Table des Matières

1. [Installation Rapide](#installation-rapide)
2. [Standards de Code](#standards-de-code)
3. [Convention de Commits](#convention-de-commits)
4. [Processus de Pull Request](#processus-de-pull-request)
5. [Définition de "Terminé"](#définition-de-terminé)

---

## 🚀 Installation Rapide

### Prérequis
- Node.js 18+ ou Bun
- Git

### Étapes

```bash
# 1. Cloner le dépôt
git clone https://github.com/Palolo875/kensho-1.git
cd kensho-1

# 2. Installer les dépendances
npm install

# 3. Lancer les tests pour vérifier que tout fonctionne
npm test

# 4. Lancer le serveur de développement
npm run dev
```

**Note**: Husky se configure automatiquement lors de `npm install` (via le script `prepare`).

---

## 📏 Standards de Code

### Formatage Automatique

Le code est **automatiquement formaté** via Prettier lors de chaque commit grâce aux hooks Git (Husky + lint-staged).

```bash
# Formater manuellement tout le code
npm run format

# Vérifier le formatage sans modifier
npm run format:check
```

### Linting

ESLint vérifie la qualité du code TypeScript/React.

```bash
# Vérifier le code
npm run lint

# Corriger automatiquement les problèmes
npm run lint:fix
```

### Type Checking

TypeScript vérifie les types de manière stricte.

```bash
# Vérifier les types
npm run type-check
```

### Commande de Qualité Globale

Avant de créer une PR, exécutez :

```bash
npm run quality
```

Cette commande exécute dans l'ordre :
1. Format check (Prettier)
2. Lint (ESLint)
3. Type check (TypeScript)
4. Tests unitaires (Vitest)

**Si cette commande passe, votre code est prêt !** ✅

---

## 💬 Convention de Commits

Nous utilisons **Conventional Commits** pour générer automatiquement des changelogs et maintenir un historique clair.

### Format

```
<type>(<scope>): <subject>
```

### Types Autorisés

- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `docs`: Documentation seulement
- `style`: Formatage (pas de changement de code)
- `refactor`: Refactoring sans changement de fonctionnalité
- `perf`: Amélioration de performance
- `test`: Ajout/modification de tests
- `chore`: Tâches de maintenance
- `ci`: Changements CI/CD

### Exemples

```bash
# Bonne pratique ✅
git commit -m "feat(MessageBus): Add payload validation with Zod"
git commit -m "fix(StreamManager): Handle cancellation race condition"
git commit -m "docs(README): Update installation instructions"

# Mauvaise pratique ❌
git commit -m "updates"
git commit -m "fix stuff"
```

### Hook de Validation

Le hook `commit-msg` (via Husky) **bloquera automatiquement** les commits qui ne respectent pas ce format.

---

## 🔄 Processus de Pull Request

### 1. Créer une branche

```bash
git checkout main
git pull
git checkout -b feat/websocket-reconnection
```

### 2. Développer avec discipline

- Commitez **souvent** (petits commits atomiques)
- Utilisez la convention de commits
- Assurez-vous que `npm run quality` passe
- Ajoutez des tests pour toute nouvelle fonctionnalité

### 3. Ouvrir la Pull Request

- **Titre** : Utilisez la convention (`feat: ...`, `fix: ...`)
- **Description** : Expliquez POURQUOI (pas QUOI, c'est dans le code)
- Liez les issues concernées (`Closes #123`)

### 4. CI/CD Automatique

Les **GitHub Actions** vérifieront automatiquement :
- ✅ Lint (ESLint)
- ✅ Type Check (TypeScript)
- ✅ Tests Unitaires (Vitest)

**La PR ne pourra être fusionnée que si tout passe !** 🚦

---

## ✅ Définition de "Terminé"

Une tâche est considérée comme **terminée** seulement si :

### Code
- [ ] Le code respecte les standards (Prettier + ESLint)
- [ ] Les types TypeScript sont corrects
- [ ] Le code est testé (tests unitaires et/ou E2E)
- [ ] Pas de `console.log` oubliés (sauf `console.warn/error`)

### Tests
- [ ] Les tests unitaires passent (`npm run test:unit`)
- [ ] Les tests E2E passent si applicable
- [ ] La couverture de code est maintenue ou améliorée

### Documentation
- [ ] Le README est à jour si nécessaire
- [ ] Les commentaires JSDoc sont présents pour fonctions publiques

### CI/CD
- [ ] La CI passe (lint + types + tests)
- [ ] Pas de warnings ni d'erreurs dans les logs

### Review
- [ ] Au moins 1 approbation d'un reviewer
- [ ] Tous les commentaires sont résolus

---

## 🏗️ Architecture

Consultez [ARCHITECTURE.md](./ARCHITECTURE.md) pour comprendre la structure du projet.

---

## 🙏 Merci !

Chaque contribution, petite ou grande, fait avancer Kensho. Merci de faire partie de cette aventure ! 🚀

**Philosophie Kensho** : La qualité n'est pas négociable. La simplicité est un art. La résilience est une discipline.
