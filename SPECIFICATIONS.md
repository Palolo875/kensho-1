# Spécifications Techniques - Amélioration du RuntimeManager

## Objectif
Transformer le RuntimeManager pour adopter les techniques de performance les plus avancées de 2025, en simulant la pré-compilation des modèles et l'utilisation de buffers "zero-copy".

## Philosophie "Usine Vide"
Nous n'allons pas réellement compiler de shaders WebGPU. Nous allons simuler le résultat de ce processus. Le RuntimeManager aura une nouvelle logique :

1. Au premier "chargement" d'un modèle, il simulera une compilation longue et coûteuse.
2. Il stockera un "graphe compilé" factice dans notre StorageManager (OPFS).
3. Lors des lancements suivants, il détectera ce graphe et simulera un démarrage quasi-instantané (<200ms).

## Étape 1 : Mise à jour du StorageManager pour gérer les "graphes"

### Constantes

```typescript
const GRAPH_VERSION = '2.0'; // Bump quand le format change
```

### Structure de données pour les graphes compilés

```typescript
interface CompiledGraphHeader {
  version: string;           // Version du format du graphe
  modelName: string;         // Nom du modèle
  schemaHash: string;        // Hash du schéma pour validation
  generatedAt: number;       // Timestamp de génération
}

interface CompiledGraph extends CompiledGraphHeader {
  // Données du graphe compilé
  [key: string]: any;
}
```

### Méthodes à implémenter

#### getCompiledGraph
``typescript
public async getCompiledGraph(modelKey: string): Promise<CompiledGraph | null> {
  try {
    const handle = await this.getFileHandle(`graphs/${modelKey}.json`);
    if (!handle) return null;
    const file = await handle.getFile();
    const content = await file.text();
    const graph: CompiledGraph = JSON.parse(content);
    
    // Vérification de version pour invalider les anciens graphes
    if (graph?.version !== GRAPH_VERSION) {
      console.log(`[StorageManager] Graphe obsolète (v${graph?.version}), recompilation nécessaire.`);
      return null; // Force la recompilation
    }
    
    console.log(`[StorageManager] Graphe pré-compilé trouvé pour ${modelKey}.`);
    return graph;
  } catch (error) {
    console.warn(`[StorageManager] Erreur lecture graphe ${modelKey}:`, error);
    return null; // Fallback gracieux
  }
}
```

#### saveCompiledGraph
```typescript
public async saveCompiledGraph(modelKey: string, graphData: any): Promise<void> {
  if (!this.root) return;
  
  // Ajout des métadonnées standardisées
  const graphWithMetadata: CompiledGraph = {
    ...graphData,
    version: GRAPH_VERSION,
    modelName: modelKey,
    schemaHash: this.computeSchemaHash(),
    generatedAt: Date.now()
  };
  
  const handle = await this.root.getFileHandle(`graphs/${modelKey}.json`, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(graphWithMetadata));
  await writable.close();
  console.log(`[StorageManager] Graphe pré-compilé pour ${modelKey} sauvegardé.`);
}

private computeSchemaHash(): string {
  // Implémentation simplifiée d'un hash du schéma
  return 'schema-hash-placeholder';
}
```

## Étape 2 : Mise à jour du RuntimeManager pour la Pré-Compilation

### Nouvelles propriétés
```typescript
private loadedCompiledGraphs: Map<string, any> = new Map();
private readonly MAX_CACHED_GRAPHS = 3;

// Statistiques du cache pour monitoring
private cacheStats = {
  hits: 0,
  misses: 0,
  currentSize: 0
};

private evictOldestGraph(): void {
  if (this.loadedCompiledGraphs.size >= this.MAX_CACHED_GRAPHS) {
    const oldest = this.loadedCompiledGraphs.keys().next().value;
    this.loadedCompiledGraphs.delete(oldest);
    this.cacheStats.currentSize = this.loadedCompiledGraphs.size;
    console.log(`[RuntimeManager] Éviction du graphe ${oldest} (LRU)`);
  }
}

public getCacheStats(): { hits: number; misses: number; currentSize: number } {
  return { ...this.cacheStats };
}
```

### Méthode loadModel
```typescript
public async loadModel(modelKey: string, isUserRequested: boolean = true): Promise<void> {
  await this.ready;

  // 1. Vérifier si le graphe est déjà en mémoire vive
  if (this.loadedCompiledGraphs.has(modelKey)) {
    console.log(`[RuntimeManager] Le graphe pour ${modelKey} est déjà en VRAM (simulé).`);
    this.cacheStats.hits++;
    return;
  } else {
    this.cacheStats.misses++;
  }

  // 2. Vérifier si le graphe est dans le stockage persistant (OPFS)
  const cachedGraph = await storageManager.getCompiledGraph(modelKey);
  if (cachedGraph) {
    console.log(`[RuntimeManager] Chargement du graphe pré-compilé pour ${modelKey} depuis l'OPFS...`);
    // Simule un chargement ultra-rapide depuis le stockage vers la VRAM
    await new Promise(r => setTimeout(r, 200)); // <200ms
    this.loadedCompiledGraphs.set(modelKey, cachedGraph);
    this.cacheStats.currentSize = this.loadedCompiledGraphs.size;
    console.log(`[RuntimeManager] ✅ ${modelKey} prêt (démarrage à froid évité).`);
    return;
  }

  // 3. Si aucun graphe n'existe, simuler la compilation longue
  console.log(`[RuntimeManager] ⚠️ Aucun graphe pré-compilé pour ${modelKey}. Lancement de la compilation...`);
  
  // Timeline simulée déterministe pour une progression cohérente
  const compilationStages = [
    { stage: 'parsing', duration: 800, progress: 0.2 },
    { stage: 'linking', duration: 600, progress: 0.4 },
    { stage: 'optimizing', duration: 1000, progress: 0.7 },
    { stage: 'compiling', duration: 600, progress: 0.9 },
    { stage: 'finalizing', duration: 200, progress: 1.0 }
  ];
  
  // Émettre des événements de progression pendant la compilation
  this.emit('compilation-progress', { modelKey, stage: 'initializing', progress: 0.0 });
  
  // Simule une compilation longue et coûteuse (shaders, etc.)
  for (const { stage, duration, progress } of compilationStages) {
    await new Promise(r => setTimeout(r, duration));
    this.emit('compilation-progress', { modelKey, stage, progress });
  }
  
  const newGraph = { 
    id: modelKey, 
    compiledAt: Date.now(), 
    version: '2.0',
    schemaVersion: '1.0' // Pour permettre des migrations futures
  };
  
  // Sauvegarde le nouveau graphe dans l'OPFS et en mémoire
  await storageManager.saveCompiledGraph(modelKey, newGraph);
  
  // Gestion du cache mémoire avec eviction LRU
  this.evictOldestGraph();
  this.loadedCompiledGraphs.set(modelKey, newGraph);
  this.cacheStats.currentSize = this.loadedCompiledGraphs.size;
  console.log(`[RuntimeManager] ✅ ${modelKey} compilé et prêt.`);
}
```

### Mise à jour de getEngineFor
``typescript
public async getEngineFor(modelKey: string): Promise<any> {
  await this.loadModel(modelKey);
  // Renvoie le moteur factice, car la logique de génération est séparée
  return this.engine; 
}
```

### Nouvelle méthode warmupModels
``typescript
public async warmupModels(modelKeys: string[]): Promise<void> {
  console.log(`[RuntimeManager] Warming up ${modelKeys.length} models in background...`);
  
  // Utiliser requestIdleCallback si disponible pour un warming à faible priorité
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(async () => {
      await this.performWarmup(modelKeys);
    }, { timeout: 5000 }); // Timeout de 5 secondes
  } else {
    // Fallback pour les navigateurs qui ne supportent pas requestIdleCallback
    setTimeout(async () => {
      await this.performWarmup(modelKeys);
    }, 0);
  }
}

private async performWarmup(modelKeys: string[]): Promise<void> {
  // Charger les modèles en parallèle en arrière-plan
  const warmupPromises = modelKeys.map(async (modelKey) => {
    try {
      // Appeler la même pipeline que loadModel, mais en mode "silent/background"
      await this.loadModel(modelKey, false); // isUserRequested = false pour le warming
      console.log(`[RuntimeManager] ✅ ${modelKey} warmed up successfully`);
    } catch (error) {
      console.warn(`[RuntimeManager] ⚠️ Failed to warm up ${modelKey}:`, error);
      // Ne jamais bloquer l'UI en cas d'erreur de warming
    }
  });
  
  // Attendre que tous les warmups soient terminés sans bloquer l'UI
  await Promise.all(warmupPromises);
  console.log(`[RuntimeManager] Warmup phase complete.`);
}
```

## Tâche #16 du Manifeste - Buffer Pools & Pipelining Asynchrone

### Objectif
Transformer le MemoryManager et le TaskExecutor pour simuler les techniques de gestion de mémoire et de pipelining les plus avancées, qui permettent d'augmenter drastiquement le débit (tokens/seconde).

### Philosophie "Usine Vide"
Nous n'allouons pas de vrais buffers GPU. Nous allons :

1. Modifier le MemoryManager pour qu'il gère des "pools" de mémoire virtuelle.
2. Modifier le TaskExecutor pour qu'il simule un pipeline où le "CPU" prépare les données pendant que le "GPU" calcule, réduisant les temps morts.

### Étape 1 : Mise à jour du MemoryManager pour gérer les Pools de Buffers

#### Nouvelles propriétés
```typescript
private bufferPools: Map<string, { 
  size: number, 
  available: number,
  activeAllocations: Array<{
    size: number,
    lastUse: number,
    scopeId?: string
  }>
}> = new Map();
```

#### Constructeur mis à jour
```

```

#### Nouvelles méthodes

##### createPool
```

```

##### allocateFromPool
```

```

##### freeToPool
```

```

##### canAllocate
```

```

##### getPoolStats
```

```

##### startGarbageCollector
```typescript
private startGarbageCollector(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [name, pool] of this.bufferPools) {
      // Filtrer les allocations inactives (plus de 30 secondes)
      pool.activeAllocations = pool.activeAllocations.filter(alloc => {
        if (now - alloc.lastUse > 30000) {
          pool.available += alloc.size;
          console.log(`[GC] Release ${alloc.size}MB from ${name}`);
          return false;
        }
        return true;
      });
    }
  }, 10000); // Exécute toutes les 10 secondes
}
```

##### addEventListener (pour les hooks de monitoring)
```typescript
private listeners: Map<string, Function[]> = new Map();

public addEventListener(event: string, callback: Function): void {
  if (!this.listeners.has(event)) {
    this.listeners.set(event, []);
  }
  this.listeners.get(event)!.push(callback);
}

private emit(event: string, data: any): void {
  const callbacks = this.listeners.get(event);
  if (callbacks) {
    for (const callback of callbacks) {
      callback(data);
    }
  }
}
```

### Étape 2 : Mise à jour du MockEngine pour simuler le Pipelining

#### Nouvelle méthode generate
```
public async *generate(prompt: string, modelKey: string): AsyncGenerator<string> {
  console.log(`[MockEngine] Début de la génération pour ${modelKey} avec pipelining...`);
  
  const tokens = `Réponse simulée (pipelined, via ${this.getHardware()}) du modèle ${modelKey} pour le prompt : "${prompt}"`.split(' ');
  let nextTokenData: any = null; // Buffer du prochain token

  for (let i = 0; i < tokens.length; i++) {
    const tokenId = `${modelKey}-${Date.now()}-${i}`;
    
    // Alloue de la mémoire pour les activations du prochain token
    const allocated = memoryManager.allocateFromPool('activations', 2, tokenId); // Simule 2MB par token
    if (!allocated) {
      console.error("[MockEngine] PIPELINE STALL: Plus de mémoire d'activation !");
      // Implémente du backpressure avec timeout
      const startTime = Date.now();
      while (!memoryManager.allocateFromPool('activations', 2, tokenId)) {
        console.warn("[MockEngine] Backpressure: attente de libération mémoire...");
        await new Promise(r => setTimeout(r, 10)); // Attente active courte
        // Timeout après 500ms
        if (Date.now() - startTime > 500) throw new Error("Memory deadlock");
      }
    }

    try {
      // Prépare le prochain token (CPU)
      const prepareNext = i < tokens.length - 1 
        ? this.prepareTokenData(tokens[i + 1], `${tokenId}-next`) 
        : Promise.resolve();

      // Calcule le token actuel (GPU) en parallèle
      const currentToken = nextTokenData || await this.prepareTokenData(tokens[i], tokenId);
      const result = await this.computeToken(currentToken);

      // Les deux s'exécutent en parallèle !
      nextTokenData = await prepareNext;

      yield result + ' ';
    } finally {
      // Garantit la libération même en cas d'erreur
      memoryManager.freeToPool('activations', 2, tokenId);
    }
  }
  console.log(`[MockEngine] Fin de la génération pour ${modelKey}.`);
}

private async prepareTokenData(token: string, tokenId: string): Promise<any> {
  // Simule allocation pour la préparation
  memoryManager.allocateFromPool('uniforms', 1, tokenId);
  try {
    await new Promise(r => setTimeout(r, 5)); // Simule CPU
    return { token, prepared: true, tokenId };
  } finally {
    memoryManager.freeToPool('uniforms', 1, tokenId);
  }
}

private async computeToken(data: any): Promise<string> {
  // Simule allocation pour le calcul
  memoryManager.allocateFromPool('kv-cache', 3, data.tokenId);
  try {
    await new Promise(r => setTimeout(r, 15)); // Simule GPU
    return data.token;
  } finally {
    memoryManager.freeToPool('kv-cache', 3, data.tokenId);
  }
}
```

### Étape 3 : Mise à jour du TaskExecutor pour utiliser le nouveau MockEngine

#### Import ajouté
```

```

#### Nouvelle propriété
```

```

#### Constructeur mis à jour
```

```

#### Méhtode executeSingleTask mise à jour
```
