# 🗺️ Feuille de Route - Ensemble 6

## 🎯 Tâche #25 : Inférence Spéculative sur l'Intention

### Objectifs
Transformer notre Router et notre RuntimeManager pour qu'ils n'attendent plus passivement le prompt final. Pendant que l'utilisateur tape, le système doit analyser le texte en temps réel, prédire l'intention la plus probable, et commencer à préchauffer le moteur du plugin expert correspondant en VRAM avant même que l'utilisateur n'ait appuyé sur "Envoyer".

### Étapes de Réalisation

#### Phase 1 : Mise à jour du UI Bridge et du Kernel (2 jours)
- [ ] Mise à jour du ui-controller.ts pour capturer les événements input
- [ ] Configuration du seuil minimal de 10 caractères
- [ ] Mise à jour du kernel.ts pour gérer le nouvel événement 'user-is-typing'
- [ ] Tests de l'intégration entre UI et Kernel
- [ ] Validation de la transmission asynchrone des données

#### Phase 2 : Implémentation de la logique de prédiction dans le Router (6 jours)
- [ ] Implémentation de la méthode predictAndPrewarm dans le Router
- [ ] Développement de l'algorithme de classification d'intention avec scoring
- [ ] Mise en place du système de debounce (300ms)
- [ ] Implémentation de la sélection d'expert pour chaque intention
- [ ] Ajout du seuil minimal de confiance (score < 2 → DIALOGUE)
- [ ] Implémentation de la boucle de feedback
- [ ] Intégration de la persistance des statistiques utilisateur
- [ ] Création de la classe UserPredictionProfile pour l'apprentissage adaptatif
- [ ] Tests unitaires de la logique de prédiction
- [ ] Tests d'intégration avec le CatalogManager

#### Phase 3 : Mise à jour du RuntimeManager (4 jours)
- [ ] Ajout de la méthode prewarmModel améliorée dans le RuntimeManager
- [ ] Implémentation de la vérification des modèles déjà chargés
- [ ] Configuration du mécanisme d'annulation (AbortController)
- [ ] Intégration de la gestion d'erreurs
- [ ] Ajout des métriques de performance
- [ ] Tests de la méthode de préchauffage
- [ ] Tests de l'annulation des préchauffages inutiles

#### Phase 4 : Optimisation et Améliorations (3 jours)
- [ ] Optimisation de l'algorithme de classification d'intention
- [ ] Mise en place d'un système de cache pour les intentions récentes
- [ ] Ajout de logs pour le suivi des prédictions
- [ ] Implémentation d'un mécanisme de libération de mémoire
- [ ] Tests de performance et de charge
- [ ] Tests de l'annulation des préchauffages inutiles

#### Phase 5 : Tests et Validation (4 jours)
- [ ] Tests de bout en bout de l'inférence spéculative
- [ ] Validation de la réduction de latence perçue
- [ ] Tests de robustesse (erreurs réseau, modèles indisponibles)
- [ ] Tests d'expérience utilisateur (feedback subjectif)
- [ ] Tests de bord (changement d'intention pendant la frappe)
- [ ] Tests de la boucle de feedback et des métriques
- [ ] Tests de l'apprentissage adaptatif par utilisateur
- [ ] Tests de persistance des profils utilisateur
- [ ] Tests de cross-session learning

#### Phase 6 : Documentation et Déploiement (1 jour)
- [ ] Documentation de l'inférence spéculative
- [ ] Guide d'utilisation pour les développeurs
- [ ] Procédure de déploiement
- [ ] Mise à jour de la documentation existante

### Livrables
1. ui-controller.ts - Mise à jour pour la capture des événements input
2. kernel.ts - Mise à jour pour le traitement des événements de frappe
3. Router.ts - Implémentation de la logique de prédiction d'intention adaptative
4. RuntimeManager.ts - Ajout de la méthode prewarmModel améliorée
5. SPECIFICATIONS_6.md - Spécifications techniques mises à jour
6. Documentation de l'inférence spéculative
7. Tests unitaires et d'intégration

### Critères d'Acceptation
- [ ] UI Bridge capture les événements input à partir de 10 caractères
- [ ] Kernel traite correctement les événements 'user-is-typing'
- [ ] Router prédit l'intention avec une précision > 85%
- [ ] RuntimeManager préchauffe les modèles de manière non bloquante
- [ ] Système utilise le debounce pour limiter la charge
- [ ] Mécanisme d'annulation des préchauffages fonctionne correctement
- [ ] Boucle de feedback permet d'améliorer la précision des prédictions
- [ ] Persistance des statistiques utilisateur fonctionne correctement
- [ ] Profils utilisateur spécifiques pour apprentissage adaptatif
- [ ] Métriques de performance disponibles et précises
- [ ] Latence perçue réduite de 70% minimum
- [ ] Expérience utilisateur améliorée (mesure subjective)
- [ ] Tests unitaires couvrant 90% du code
- [ ] Documentation complète du système

### Indicateurs de Performance
- Temps de réponse perçu : Réduction de 70% minimum
- Précision de prédiction : > 85%
- Charge CPU : < 5% d'augmentation pendant la frappe
- Mémoire utilisée : < 10% d'augmentation
- Taux de succès des préchargements : > 95%
- Taux d'annulation des préchargements inutiles : > 80%
- Taux d'apprentissage utilisateur : > 90% des utilisateurs montrent une amélioration
- Cross-session learning : Persistance des stats entre sessions
- Couverture de test : > 90%
- Satisfaction utilisateur : Note > 4.5/5

## 🎯 Tâche #26 : Génération Spéculative de Tokens avec Batching

### Objectifs
Implémenter une stratégie de "speculative decoding" simulée combinée avec du batch processing pour maximiser le throughput GPU et améliorer l'expérience utilisateur.

### Étapes de Réalisation

#### Phase 1 : Mise à jour du MockEngine (5 jours)
- [ ] Implémentation de la logique de génération spéculative dans le MockEngine
- [ ] Configuration des paramètres de vitesse (DRAFT_MODEL_SPEED, EXPERT_MODEL_SPEED)
- [ ] Implémentation de la phase de draft avec génération réelle de tokens
- [ ] Implémentation de la phase de validation avec vérification en une passe
- [ ] Configuration du mécanisme de validation contextuelle
- [ ] Implémentation du fallback en cas d'échec de validation
- [ ] Ajout de la gestion du KV-cache simulé
- [ ] Implémentation du batching pour le traitement parallèle
- [ ] Tests unitaires de la logique de génération spéculative

#### Phase 2 : Validation de la compatibilité (3 jours)
- [ ] Tests de compatibilité avec le TaskExecutor existant
- [ ] Validation de la consommation des tokens par le for await...of
- [ ] Tests de performance comparée (avant/après)
- [ ] Tests d'expérience utilisateur (fluidité de l'affichage)
- [ ] Tests de batching avec plusieurs requêtes simultanées

#### Phase 3 : Optimisation et Améliorations (4 jours)
- [ ] Optimisation des paramètres de vitesse pour simulation réaliste
- [ ] Ajout de logs pour le suivi des validations
- [ ] Implémentation de métriques de performance
- [ ] Configuration de l'adaptation dynamique de la longueur de spéculation
- [ ] Implémentation du mode fallback vers génération classique
- [ ] Optimisation de l'algorithme de regroupement par batch
- [ ] Tests de robustesse (gestion des erreurs)

#### Phase 4 : Tests et Validation (3 jours)
- [ ] Tests de bout en bout de la génération spéculative avec batching
- [ ] Validation du gain de vitesse perçu (jusqu'à 3.5x dans les cas favorables)
- [ ] Tests de robustesse (échecs de validation et fallback)
- [ ] Tests d'expérience utilisateur (fluidité de l'affichage)
- [ ] Tests de performance avec métriques
- [ ] Tests de batching avec différentes tailles de batch

#### Phase 5 : Documentation et Déploiement (1 jour)
- [ ] Documentation de la génération spéculative de tokens avec batching
- [ ] Guide d'utilisation pour les développeurs
- [ ] Procédure de déploiement
- [ ] Mise à jour de la documentation existante

### Livrables
1. MockEngine.ts - Implémentation de la logique de génération spéculative avec batching
2. TaskExecutor.ts - Mise à jour pour supporter le batching
3. SPECIFICATIONS_6.md - Spécifications techniques mises à jour
4. Documentation de la génération spéculative de tokens avec batching
5. Tests unitaires et d'intégration

### Critères d'Acceptation
- [ ] MockEngine implémente la logique de génération spéculative avec vraie génération
- [ ] Phase de draft génère réellement des tokens basés sur le contexte
- [ ] Phase de validation vérifie le bloc en une seule passe
- [ ] Mécanisme de validation fonctionne avec taux de succès contextuel
- [ ] Fallback fonctionne correctement en cas d'échec
- [ ] Gestion du KV-cache simulé fonctionne correctement
- [ ] Adaptation dynamique de la longueur de spéculation fonctionne
- [ ] Mode fallback vers génération classique fonctionne
- [ ] Batching fonctionne correctement avec plusieurs requêtes
- [ ] TaskExecutor consomme les tokens sans modification
- [ ] Gain de vitesse perçu jusqu'à 3.5x dans les cas favorables
- [ ] Affichage fluide de blocs de tokens entiers
- [ ] Architecture existante reste compatible
- [ ] Tests unitaires couvrant 90% du code
- [ ] Documentation complète du système

### Indicateurs de Performance
- Gain de vitesse : Jusqu'à 3.5x dans les cas favorables
- Fluidité de l'affichage : Affichage de blocs de tokens entiers
- Taux de succès de validation : Variable selon la difficulté du contexte
- Compatibilité : 100% avec l'architecture existante
- Couverture de test : > 90%
- Satisfaction utilisateur : Note > 4.9/5
- Métriques de performance : Disponibles et précises
- Throughput GPU : Maximisation de l'utilisation du GPU/WebGPU