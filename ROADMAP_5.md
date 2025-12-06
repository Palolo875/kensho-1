# 🗺️ Feuille de Route - Ensemble 5

## 🎯 Tâche #23 : Plugin Discovery & Dynamic Loading

### Objectifs
Transformer notre ModelCatalog statique en un système de découverte de plugins dynamique. Le Kernel doit maintenant télécharger un catalog.json depuis une source externe au démarrage, et le Router doit utiliser ce catalogue dynamique pour planifier ses exécutions.

### Étapes de Réalisation

#### Phase 1 : Création du catalog.json et CatalogManager (4 jours)
- [ ] Création du fichier catalog.json dans le dossier public avec métadonnées riches et feature flags
- [ ] Implémentation de la classe CatalogManager avec validation Zod
- [ ] Ajout des méthodes initialize, getModelSpec, getCatalog avec cache OPFS
- [ ] Intégration de la vérification de signature cryptographique
- [ ] Implémentation de la gestion des feature flags
- [ ] Intégration du streaming de statut avec sseStreamer
- [ ] Tests unitaires du CatalogManager

#### Phase 2 : Intégration dans le Kernel (1 jour)
- [ ] Mise à jour du kernel.ts pour initialiser le CatalogManager
- [ ] Gestion des erreurs d'initialisation avec fallback
- [ ] Tests d'intégration du CatalogManager dans le Kernel
- [ ] Validation du chargement du catalogue au démarrage

#### Phase 3 : Mise à jour du Router (2 jours)
- [ ] Suppression de l'import statique de MOCK_MODEL_CATALOG
- [ ] Intégration du CatalogManager dans le Router
- [ ] Mise à jour de la logique de sélection des experts avec fallbacks gracieux
- [ ] Implémentation de la prise en compte des feature flags dans la sélection
- [ ] Implémentation de la détection d'intent
- [ ] Tests de la nouvelle logique de planification

#### Phase 4 : Ajout du Hot-reload et Cache Intelligent (2 jours)
- [ ] Implémentation du mécanisme ETag pour éviter les refetch inutiles
- [ ] Mise en place du polling pour le hot-reload
- [ ] Détection automatique des changements de catalogue
- [ ] Détection automatique des changements de feature flags
- [ ] Notification des utilisateurs des nouvelles capacités
- [ ] Notification des utilisateurs des changements de configuration

#### Phase 5 : Tests et Validation (3 jours)
- [ ] Tests de bout en bout avec différents catalogues
- [ ] Validation du découplage entre logique et modèles
- [ ] Tests de robustesse (erreurs de réseau, catalogue invalide, signature invalide)
- [ ] Tests de performance et de charge
- [ ] Tests de sécurité (injection, signature invalide)
- [ ] Tests des feature flags (déploiement progressif, A/B testing, rollback)
- [ ] Tests des fallbacks gracieux

#### Phase 6 : Documentation et Déploiement (1 jour)
- [ ] Documentation de l'utilisation du CatalogManager
- [ ] Guide de mise à jour du catalog.json
- [ ] Documentation sur l'utilisation des feature flags
- [ ] Procédure de déploiement
- [ ] Mise à jour de la documentation existante

### Livrables
1. catalog.json - Fichier de catalogue dans le dossier public
2. CatalogManager.ts - Service de gestion du catalogue dynamique avec validation, cache et feature flags
3. SPECIFICATIONS_5.md - Spécifications techniques mises à jour
4. Documentation d'utilisation du système de plugins
5. Documentation sur l'utilisation des feature flags
6. Tests unitaires et d'intégration

### Critères d'Acceptation
- [x] Fichier catalog.json créé et accessible avec métadonnées riches et feature flags
- [x] CatalogManager implémenté avec validation Zod, cache OPFS, signature cryptographique et gestion des feature flags
- [x] Kernel initialise correctement le CatalogManager avec gestion d'erreurs
- [x] Router utilise le catalogue dynamique pour la planification avec fallbacks gracieux et prise en compte des feature flags
- [x] Découplage complet entre logique d'application et liste des modèles
- [x] Extensibilité facilitée pour ajouter de nouveaux plugins
- [x] Hot-reload du catalogue avec détection automatique des mises à jour
- [x] Validation stricte du format du catalogue
- [x] Sécurité renforcée avec vérification de signature
- [x] Gestion des déploiements progressifs avec feature flags
- [ ] Tests unitaires couvrant 90% du code
- [ ] Documentation complète du système

### Indicateurs de Performance
- Temps de chargement du catalogue : < 1 seconde
- Disponibilité du système après chargement : 100%
- Taux de succès des requêtes de catalogue : > 99.9%
- Couverture de test : > 90%
- Extensibilité : Ajout d'un nouveau plugin sans redéploiement
- Sécurité : Vérification de signature réussie
- Robustesse : Fonctionnement en mode dégradé quand le catalogue est indisponible
- Déploiement progressif : Gestion des rollouts et A/B testing

## 🎯 Tâche #24 : Background Sync & Update

### Objectifs
Créer un UpdateService qui, périodiquement et en arrière-plan, vérifie si une nouvelle version du catalog.json ou des fichiers de modèles est disponible. S'il détecte une mise à jour, il la télécharge silencieusement dans l'OPFS et notifie l'utilisateur qu'une nouvelle version est prête à être activée.

### Étapes de Réalisation

#### Phase 1 : Création de l'UpdateService (2 jours)
- [ ] Implémentation de la classe UpdateService
- [ ] Ajout des méthodes start, stop, checkForUpdates
- [ ] Implémentation de la vérification périodique (toutes les 15 minutes)
- [ ] Implémentation de la simulation de téléchargement en arrière-plan
- [ ] Intégration avec sseStreamer pour les notifications
- [ ] Tests unitaires de l'UpdateService

#### Phase 2 : Intégration dans le Kernel (1 jour)
- [ ] Mise à jour du kernel.ts pour initialiser l'UpdateService
- [ ] Configuration du démarrage automatique du service
- [ ] Tests d'intégration du service dans le Kernel

#### Phase 3 : Amélioration de la gestion des mises à jour (2 jours)
- [ ] Implémentation de la comparaison fine des versions
- [ ] Ajout de la gestion des erreurs réseau et de téléchargement
- [ ] Implémentation de la priorité de téléchargement
- [ ] Ajout du nettoyage des anciennes versions
- [ ] Tests des améliorations

#### Phase 4 : Tests et Validation (2 jours)
- [ ] Tests de bout en bout du système de mise à jour
- [ ] Validation du téléchargement en arrière-plan
- [ ] Tests de notification utilisateur
- [ ] Tests de robustesse (erreurs réseau, serveur indisponible)
- [ ] Tests de performance et de charge

#### Phase 5 : Documentation et Déploiement (1 jour)
- [ ] Documentation de l'utilisation de l'UpdateService
- [ ] Guide de configuration du service
- [ ] Procédure de déploiement
- [ ] Mise à jour de la documentation existante

### Livrables
1. UpdateService.ts - Service de vérification et de téléchargement des mises à jour
2. SPECIFICATIONS_5.md - Spécifications techniques mises à jour
3. Documentation d'utilisation de l'UpdateService
4. Tests unitaires et d'intégration

### Critères d'Acceptation
- [x] UpdateService implémenté avec vérification périodique
- [x] Téléchargement en arrière-plan des mises à jour
- [x] Notification utilisateur via SSE quand une mise à jour est prête
- [x] Kernel initialise correctement l'UpdateService
- [ ] Gestion des erreurs réseau et de téléchargement
- [ ] Comparaison fine des versions
- [ ] Priorité de téléchargement
- [ ] Nettoyage des anciennes versions
- [ ] Tests unitaires couvrant 90% du code
- [ ] Documentation complète du système

### Indicateurs de Performance
- Fréquence de vérification : Toutes les 15 minutes
- Temps de téléchargement en arrière-plan : < 30 secondes pour 100MB
- Taux de succès des vérifications : > 99.9%
- Couverture de test : > 90%
- Notification utilisateur : 100% des mises à jour détectées sont notifiées
- Transparence : Aucun impact sur l'expérience utilisateur pendant le téléchargement