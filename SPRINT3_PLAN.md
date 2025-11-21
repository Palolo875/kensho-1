# 🔮 Sprint 3: Intelligence & Outils

**Objectif** : Transformer Kensho d'un simple chatbot en un véritable assistant agentique capable d'utiliser des outils et de se souvenir du contexte.

---

## 📋 User Stories

### 1. Intégration Modèle Réel
> "En tant que développeur, je veux remplacer le Mock Agent par un vrai modèle LLM (Phi-3 ou TinyLlama) optimisé pour le navigateur, afin d'avoir de vraies conversations."
- **Tâche** : Résoudre le problème de build OOM (WebLLM).
- **Tâche** : Configurer le chargement dynamique du modèle.
- **Tâche** : Tester les performances d'inférence (tokens/sec).

### 2. Utilisation d'Outils (Tool Use)
> "En tant qu'utilisateur, je veux que Kensho puisse effectuer des calculs mathématiques précis qu'un LLM seul pourrait rater."
- **Tâche** : Implémenter un `CalculatorTool`.
- **Tâche** : Étendre l'OIE Agent pour détecter l'intention "calcul".
- **Tâche** : Permettre à l'agent d'appeler l'outil et d'intégrer le résultat dans la réponse.

### 3. Mémoire à Long Terme (RAG Lite)
> "En tant qu'utilisateur, je veux que Kensho se souvienne de mes préférences d'une conversation à l'autre."
- **Tâche** : Implémenter un `VectorStore` local (ex: via IndexedDB + embeddings légers).
- **Tâche** : Créer un mécanisme d'indexation des messages importants.
- **Tâche** : Injecter le contexte pertinent dans le prompt système.

### 4. Multimodalité
> "En tant qu'utilisateur, je veux pouvoir envoyer une image ou un fichier texte pour que Kensho l'analyse."
- **Tâche** : Activer le drag & drop dans `ChatInput`.
- **Tâche** : Traiter les fichiers côté client (conversion base64/texte).
- **Tâche** : Adapter le prompt pour inclure le contenu des fichiers.

---

## 📅 Planification Préliminaire

| Jour | Activité |
|------|----------|
| 1-2  | **Fix Build & WebLLM** : Faire tourner le vrai modèle en prod. |
| 3-4  | **Tool Use Engine** : Architecture pour enregistrer et appeler des outils. |
| 5-6  | **Calculator & Weather Tools** : Premiers outils de démonstration. |
| 7-8  | **RAG Foundation** : Stockage vectoriel basique. |
| 9    | **Polishing UI** : Affichage des "pensées" (utilisation d'outils). |
| 10   | **Buffer & Demo** |

---

## 🛑 Risques Identifiés

- **Performance** : Le chargement de Phi-3 (~2GB) peut être lourd pour certains navigateurs.
- **Complexité OIE** : Le routing entre "réponse directe" et "utilisation d'outil" nécessite un prompt engineering fin.
