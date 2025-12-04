# Feuille de Route - Ensemble 2 (Tâches 17 & 18)

## Tâche #17 du Manifeste - Sandboxing des Plugins

### Objectif
Transformer l'architecture d'exécution pour isoler chaque plugin dans un Worker dédié, garantissant une sécurité maximale et une UI non-bloquante.

### Tâches Techniques

#### Tâche #1 : Création du PluginWorker
- [x] Implémentation du worker dédié à l'exécution des plugins
- [x] Mise en place du système de communication par messages
- [x] Intégration du MockEngine dans le contexte du worker
- [x] Gestion des événements TOKEN, COMPLETE et ERROR
- [x] Ajout du mécanisme de health check (ping/pong)
- [x] Implémentation du heartbeat automatique

#### Tâche #2 : Mise à jour du TaskExecutor
- [x] Remplacement de l'appel direct au moteur par une délégation aux workers
- [x] Implémentation du système de messaging avec les workers
- [x] Gestion du cycle de vie des workers (création/termination)
- [x] Mise en place de la récupération des résultats via promesses
- [x] Implémentation du pool de workers avec réutilisation
- [x] Ajout du système de timeout pour les workers bloqués
- [x] Intégration du health check des workers
- [x] Mise en place du warmup des workers au démarrage
- [x] Ajout du monitoring des statistiques des workers
- [x] Implémentation de la terminaison des workers inactifs
- [x] Ajout du système de heartbeat et self-healing
- [x] Implémentation du rate limiting intelligent par utilisateur

### Résultats Attendus
- Exécution isolée de chaque plugin dans un contexte sécurisé
- Interface utilisateur parfaitement fluide même en cas d'erreur dans un plugin
- Architecture prête pour l'exécution de vrais modèles dans des workers
- Protection contre les boucles infinies et les crashes
- Communication asynchrone entre le kernel et les plugins
- Gestion mémoire optimisée avec pool de workers
- Surveillance avancée des workers avec health check
- Warmup des workers pour réduire la latence initiale
- Timeout automatique pour les workers bloqués
- Self-healing avec redémarrage automatique des workers silencieux
- Heartbeat pour détection proactive des workers figés
- Rate limiting intelligent basé sur le comportement utilisateur

## Tâche #18 du Manifeste - Guardrails Avancés

### Objectif
Transformer les guardrails en un système intelligent et modulaire avec plugins de sécurité dédiés et watermarking.

### Tâches Techniques

#### Tâche #1 : Création du Plugin de Sécurité Factice
- [x] Ajout d'un nouveau type de spécialité "SECURITY" dans le catalogue des modèles
- [x] Implémentation du modèle de sécurité factice
- [x] Ajout de granularité dans les types de sécurité (INPUT_VALIDATION, OUTPUT_MODERATION, etc.)

#### Tâche #2 : Mise à jour du Router
- [x] Insertion d'une étape de validation de sécurité avant l'exécution de la tâche principale
- [x] Modification de la structure ExecutionPlan pour accepter un tableau de tâches

#### Tâche #3 : Mise à jour du TaskExecutor
- [x] Gestion des tâches de sécurité avec annulation du plan en cas d'échec
- [x] Exécution des tâches de sécurité en série avant les tâches principales
- [x] Implémentation de la validation de sécurité structurée avec scores et catégories
- [x] Ajout d'un audit trail pour les blocages de sécurité
- [x] Implémentation d'une politique de sécurité unifiée
- [x] Ajout de la gestion des faux positifs
- [x] Intégration du rate limiting intelligent

#### Tâche #4 : Création du WatermarkingService
- [x] Implémentation du service de watermarking simulé
- [x] Ajout des méthodes apply() et verify()
- [x] Utilisation de caractères zero-width pour un watermarking invisible
- [x] Ajout de métadonnées utiles dans le watermark
- [x] Implémentation d'une injection avec alternance pour éviter les patterns détectables
- [x] Ajout d'une vérification d'intégrité post-application
- [x] Génération d'une attestation interne

#### Tâche #5 : Intégration du Watermarking dans le DialoguePlugin
- [x] Application du watermarking avant l'envoi de la réponse finale
- [x] Mise en cache des réponses watermarked
- [x] Vérification de l'intégrité du watermark après génération

### Résultats Attendus
- Défense active avec modèles de sécurité dédiés
- Traçabilité des réponses générées via watermarking invisible
- Architecture modulaire pour l'extension future
- Protection proactive contre les contenus dangereux
- Conformité et lutte contre la désinformation
- Validation de sécurité structurée avec scores et catégories
- Audit trail pour les blocages de sécurité
- Watermarking avec métadonnées utiles
- Politique de sécurité unifiée avec évaluation contextualisée
- Gestion intelligente des faux positifs
- Rate limiting adaptatif basé sur le comportement

## Statut Global
✅ Tâche #17 du Manifeste - TERMINÉE
✅ Tâche #18 du Manifeste - TERMINÉE

L'architecture a été radicalement améliorée avec l'isolation complète des plugins et un système de sécurité avancé. Ces transformations marquent une étape majeure vers un système de production robuste et sécurisé.