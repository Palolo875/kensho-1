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

#### Tâche #2 : Mise à jour du TaskExecutor
- [x] Remplacement de l'appel direct au moteur par une délégation aux workers
- [x] Implémentation du système de messaging avec les workers
- [x] Gestion du cycle de vie des workers (création/termination)
- [x] Mise en place de la récupération des résultats via promesses

### Résultats Attendus
- Exécution isolée de chaque plugin dans un contexte sécurisé
- Interface utilisateur parfaitement fluide même en cas d'erreur dans un plugin
- Architecture prête pour l'exécution de vrais modèles dans des workers
- Protection contre les boucles infinies et les crashes
- Communication asynchrone entre le kernel et les plugins

## Tâche #18 du Manifeste - (À définir)

### Objectif
(Contenu à venir)

### Tâches Techniques
- (Contenu à venir)

### Résultats Attendus
- (Contenu à venir)

## Statut Global
✅ Tâche #17 du Manifeste - TERMINÉE

L'architecture a été radicalement améliorée avec l'isolation complète des plugins. Cette transformation marque une étape majeure vers un système de production robuste et sécurisé.