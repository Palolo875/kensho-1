# Feuille de Route - Ensemble 3 (Tâches 19, 20 & 21)

## Tâche #19 du Manifeste - Offline-First & Intégrité

### Objectif
Transformer le StorageManager en un gardien de l'intégrité avec vérification offline-first et auto-réparation.

### Tâches Techniques

#### Tâche #1 : Création du Manifeste et des Fichiers Factices
- [x] Création du fichier manifest.json décrivant les ressources nécessaires
- [x] Définition des métadonnées (chemin, hash, taille) pour chaque fichier
- [x] Création des fichiers factices dans le dossier public
- [x] Ajout de métadonnées de version intelligentes (version, changelog, required)
- [x] Implémentation des chunks pour les delta updates

#### Tâche #2 : Mise à jour du StorageManager
- [x] Ajout de la méthode initializeAndVerify() pour la vérification d'intégrité
- [x] Implémentation du chargement du manifeste
- [x] Vérification de l'existence des fichiers
- [x] Calcul et comparaison des hashes avec SHA-256 réel
- [x] Simulation du téléchargement en cas de fichier manquant ou corrompu
- [x] Intégration du streaming de statut pendant la vérification
- [x] Implémentation du retry avec exponential backoff
- [x] Ajout de la vérification proactive de l'espace disque
- [x] Implémentation de la vérification par chunks pour les gros fichiers
- [x] Sauvegarde des métadonnées de fichiers

#### Tâche #3 : Mise à jour du Kernel
- [x] Intégration de la vérification d'intégrité au démarrage
- [x] Gestion des erreurs critiques lors de la vérification
- [x] Feedback utilisateur pendant le processus de vérification

### Résultats Attendus
- ✅ Offline-First : Une fois les fichiers téléchargés et vérifiés, Kensho peut démarrer et fonctionner à 100% sans aucune connexion réseau.
- ✅ Auto-Réparation : Si un fichier est manquant ou corrompu (par une mise à jour ratée, une erreur disque, etc.), le système le détecte et le répare automatiquement au prochain démarrage.
- ✅ Delta Updates : Le système peut télécharger seulement les parties modifiées des gros fichiers au lieu de tout re-télécharger.
- ✅ Sécurité : Vérification d'intégrité fiable avec SHA-256 réel.

## Tâche #20 du Manifeste - Circuit Breaker & Fallback

### Objectif
Implémenter un système de résilience de niveau SOTA avec détection de panne, basculement automatique, test progressif, auto-guérison et protection contre la saturation.

### Tâches Techniques

#### Tâche #1 : Création des Moteurs Factices Spécialisés
- [x] Création du MockGPUEngine avec capacité de simulation d'échec
- [x] Création du MockCPUEngine avec performance dégradée mais fiable
- [x] Implémentation des générateurs asynchrones pour les deux moteurs

#### Tâche #2 : Mise à jour du RuntimeManager avec Circuit Breaker Complet
- [x] Implémentation de la logique de Circuit Breaker avec états CLOSED/OPEN/HALF_OPEN
- [x] Ajout des seuils d'échec et de succès configurables
- [x] Implémentation du mode fallback temporaire
- [x] Ajout de la réinitialisation automatique après période de fallback
- [x] Intégration du streaming de statut pour l'utilisateur
- [x] Ajout des méthodes de test pour forcer les échecs
- [x] Implémentation du timeout pour les opérations en HALF_OPEN
- [x] Ajout des métriques pour le monitoring
- [x] Implémentation de la gestion des rejets (hard open)

#### Tâche #3 : Mise à jour du TaskExecutor avec Backpressure
- [x] Intégration du Circuit Breaker dans le flux d'exécution
- [x] Gestion des échecs avec notification au RuntimeManager
- [x] Propagation appropriée des erreurs
- [x] Implémentation de l'exécution avec timeout en mode HALF_OPEN
- [x] Ajout d'une file d'attente prioritaire pour le backpressure
- [x] Implémentation de la gestion des rejets contrôlés

### Résultats Attendus
- ✅ Détection de Panne : Le système ne se contente plus de subir les erreurs, il les compte.
- ✅ Basculement Automatique : Après un nombre critique de pannes, il bascule de manière autonome vers sa source d'énergie de secours (le CPU).
- ✅ Test Progressif : Le système teste progressivement le retour du GPU avant de le réactiver complètement.
- ✅ Auto-Guérison : Après un certain temps, il tente de réactiver sa source d'énergie principale, permettant un retour à la normale sans intervention manuelle.
- ✅ Feedback Utilisateur : L'utilisateur est informé en temps réel des changements d'état du système.
- ✅ Monitoring : Le système expose des métriques détaillées pour le debugging et l'optimisation.
- ✅ Protection contre la Saturation : Le système protège contre la saturation en mode fallback avec une file d'attente prioritaire et des rejets contrôlés.

### Améliorations Futures Possibles
1. Signature numérique du manifeste pour une sécurité renforcée
2. Cache LRU pour éviter les revalidations inutiles
3. Mode dégradé avec fallbacks pour les fichiers optionnels
4. Background prefetch pour les chunks les plus utilisés
5. Support des patchs binaires pour les mises à jour minimales
6. Rendre la MAX_QUEUE_SIZE dynamique selon l'utilisation

## Tâche #21 du Manifeste - Télémétrie Structurée

### Objectif
Remplacer tous les console.log par un LoggerService centralisé qui produit des logs structurés en JSON, capable de gérer différents niveaux de criticité et d'enrichir chaque log avec des métadonnées contextuelles.

### Tâches Techniques

#### Tâche #1 : Création du LoggerService
- [x] Création du LoggerService avec niveaux de criticité (INFO, WARN, ERROR, DEBUG)
- [x] Implémentation de l'interface LogPayload pour les métadonnées
- [x] Ajout de la gestion des erreurs avec stack trace
- [x] Implémentation de la sortie JSON structurée

#### Tâche #2 : Intégration du LoggerService dans les services existants
- [x] Remplacement des console.log dans le Router
- [x] Remplacement des console.log dans le TaskExecutor
- [x] Remplacement des console.log dans le RuntimeManager
- [x] Remplacement des console.log dans le StorageManager
- [x] Remplacement des console.log dans les moteurs factices

#### Tâche #3 : Validation de la télémétrie structurée
- [x] Vérification de la sortie JSON dans la console
- [x] Test des différents niveaux de criticité
- [x] Validation des métadonnées contextuelles

### Résultats Attendus
- ✅ Centralisation : Tous les logs passent par un seul service.
- ✅ Structure : Chaque événement est un objet JSON riche en contexte, prêt à être analysé, filtré et agrégé.
- ✅ Niveaux de Criticité : Nous pouvons distinguer un simple message d'information d'une erreur critique qui nécessite une alerte.
- ✅ Traçabilité : Chaque log est horodaté et associé à un service spécifique.
- ✅ Debugging : Les erreurs incluent les stack traces pour faciliter le debugging.

### Améliorations Futures Possibles
1. Envoi des logs à un service externe (Datadog, Sentry, etc.)
2. Filtrage des logs par niveau de criticité en production
3. Agrégation des logs pour des métriques en temps réel
4. Rotation des logs pour éviter la saturation de la console