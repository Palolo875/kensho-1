# 📄 UniversalReaderAgent - Documentation Complète

## Vue d'ensemble

L'UniversalReaderAgent est un agent intelligent capable de lire et d'extraire du texte à partir de différents types de documents : PDFs (natifs ou scannés) et images. Il implémente une stratégie de routage intelligente avec fallback automatique vers l'OCR lorsque nécessaire.

## Architecture

### Composants Principaux

#### 1. TesseractService (`src/core/tools/TesseractService.ts`)

Service OCR encapsulé utilisant Tesseract.js v6.

**Fonctionnalités:**
- Initialisation lazy (à la première utilisation)
- Thread-safe avec gestion de promesse partagée
- Support français + anglais
- Logger de progression intégré
- Gestion robuste du lifecycle (init/recognize/dispose)

**API:**
```typescript
class TesseractService {
  async initialize(): Promise<void>
  async recognize(imageBuffer: ArrayBuffer, progressCallback): Promise<{ text, confidence }>
  async dispose(): Promise<void>
}
```

**Points techniques:**
- Utilise `createWorker('fra+eng')` pour l'initialisation
- Cache la promesse d'initialisation pour éviter les race conditions
- Réinitialise `initPromise` après succès ou échec pour permettre les retry

#### 2. ChunkProcessor (`src/core/processing/ChunkProcessor.ts`)

Processeur Map-Reduce pour documents longs.

**Stratégie:**
1. **Détection**: Si texte < 9000 chars → retour direct
2. **Map**: Découpage intelligent par paragraphes (~3000 tokens/chunk)
3. **Map**: Résumé parallèle de chaque chunk via MainLLMAgent
4. **Reduce**: Synthèse finale des résumés partiels

**Exemple de découpage:**
```
Document 50 000 chars
  ↓
5 chunks de ~10 000 chars
  ↓
5 résumés parallèles (Map)
  ↓
1 résumé global (Reduce)
```

**API:**
```typescript
class ChunkProcessor {
  async process(fullText: string): Promise<{
    fullText: string;
    summary?: string;
    wasSummarized: boolean;
  }>
}
```

#### 3. UniversalReaderAgent (`src/agents/universal-reader/index.ts`)

Agent orchestrateur avec routage intelligent.

**Logique de routage pour PDF:**

```
PDF reçu
  ↓
Extraction texte natif (pdf.js)
  ↓
Calcul densité: text.length / (fileSizeMB + 0.01)
  ↓
Densité < 100 chars/MB OU texte < 100 chars ?
  ├─ NON → Utiliser texte natif
  └─ OUI → Fallback OCR
      ↓
      Render page 1 vers Canvas
      ↓
      OCR via TesseractService
      ↓
      Retour avec warning "PDF scanné"
```

**Logique pour Images:**

```
Image reçue
  ↓
OCR via TesseractService
  ↓
Vérification confiance < 70%
  ↓
Warning si faible confiance
```

## Types de Données

### ReadResult

```typescript
interface ReadResult {
  success: boolean;
  fullText: string;
  summary?: string;
  wasSummarized: boolean;
  metadata: {
    method: 'pdf-native' | 'pdf-ocr' | 'image-ocr';
    processingTime: number;        // ms
    confidence?: number;            // 0-100 pour OCR
    pageCount?: number;             // Pour PDF
    warnings?: string[];
  };
}
```

## Utilisation

### Cas 1: Lecture d'un PDF natif

```typescript
const fileInput = document.getElementById('file');
const file = fileInput.files[0];
const buffer = await file.arrayBuffer();

const result = await runtime.callAgent('UniversalReaderAgent', 'read', [{
  fileBuffer: buffer,
  fileType: 'application/pdf'
}]);

console.log('Méthode:', result.metadata.method);        // 'pdf-native'
console.log('Pages:', result.metadata.pageCount);       // 42
console.log('Temps:', result.metadata.processingTime);  // 523ms
console.log('Texte:', result.fullText.substring(0, 100));
```

### Cas 2: Lecture d'un PDF scanné

```typescript
// Même code que ci-dessus, mais:
console.log('Méthode:', result.metadata.method);        // 'pdf-ocr'
console.log('Confiance:', result.metadata.confidence);  // 87.5%
console.log('Warnings:', result.metadata.warnings);     
// ["Le document semble être scanné. Seule la première page..."]
```

### Cas 3: Document long avec résumé

```typescript
const result = await runtime.callAgent('UniversalReaderAgent', 'read', [{
  fileBuffer: longDocumentBuffer,
  fileType: 'application/pdf'
}]);

if (result.wasSummarized) {
  console.log('Résumé:', result.summary);
  console.log('Texte complet disponible:', result.fullText.length, 'chars');
}
```

### Cas 4: Image avec OCR

```typescript
const result = await runtime.callAgent('UniversalReaderAgent', 'read', [{
  fileBuffer: imageBuffer,
  fileType: 'image/png'
}]);

console.log('Méthode:', result.metadata.method);        // 'image-ocr'
console.log('Confiance:', result.metadata.confidence);  // 92.3%
console.log('Texte:', result.fullText);
```

## Intégration avec OIEAgent

Le UniversalReaderAgent peut être enregistré dans le TaskPlanner pour être utilisé automatiquement:

```typescript
// Dans src/agents/oie/planner.ts
const agentCapabilities = [
  // ... autres agents
  {
    name: 'UniversalReaderAgent',
    description: 'Lit des PDFs et images, extrait le texte',
    keywords: ['lire', 'pdf', 'document', 'image', 'texte', 'ocr', 'scanner'],
    priority: 0.8
  }
];
```

Ensuite l'utilisateur peut simplement dire:
- "Lis ce PDF pour moi"
- "Extrait le texte de cette image"
- "Résume ce document"

## Performance

### Benchmarks typiques

| Type | Taille | Temps | Méthode |
|------|--------|-------|---------|
| PDF natif 10 pages | 2 MB | ~500ms | pdf-native |
| PDF scanné 1 page | 5 MB | ~8s | pdf-ocr |
| Image PNG texte | 200 KB | ~6s | image-ocr |
| PDF long 100 pages | 10 MB | ~30s | pdf-native + Map-Reduce |

**Notes:**
- OCR est ~15x plus lent que l'extraction native
- Map-Reduce ajoute ~3-5s par chunk (appels LLM)
- Premier appel OCR inclut le téléchargement des langues (~10 MB)

## Limitations et Améliorations Futures

### Limitations actuelles (Sprint 4)

1. **PDF scannés**: Seule la première page est traitée en OCR
2. **Progression**: Pas de callback temps réel vers l'UI (logger interne uniquement)
3. **Langues**: Support limité à français + anglais
4. **Format**: Pas de préservation de la mise en forme (tableaux, colonnes)

### Roadmap Sprint 5+

- [ ] OCR multi-pages pour PDF scannés
- [ ] Support de langues additionnelles (espagnol, allemand, etc.)
- [ ] Extraction de tableaux structurés
- [ ] Détection automatique de la langue
- [ ] Stream de progression vers l'UI
- [ ] Cache des résultats OCR (IndexedDB)
- [ ] Support de fichiers Word/Excel via conversion

## Dépannage

### "Le service OCR n'a pas pu être initialisé"

**Cause**: Échec de téléchargement des fichiers de langues Tesseract.

**Solution**:
- Vérifier la connexion internet
- Les fichiers sont téléchargés depuis CDN (~10 MB)
- Retry automatique prévu dans le code

### "La confiance de l'OCR est faible"

**Cause**: Image de mauvaise qualité, texte manuscrit, ou langue non supportée.

**Solution**:
- Améliorer la qualité de l'image (résolution, contraste)
- Vérifier que le texte est en français ou anglais
- Utiliser un PDF natif si disponible

### Performance dégradée

**Cause**: Trop d'appels LLM en parallèle pour Map-Reduce.

**Solution**:
- Le ChunkProcessor fait déjà du parallélisme optimal
- Si besoin, ajuster `MAX_CHUNK_LENGTH` dans ChunkProcessor.ts
- Considérer un cache des résumés

## Tests

### Tests unitaires

```bash
bun run test tests/unit/ChunkProcessor.test.ts
```

Couvre:
- ✅ Textes courts (pas de résumé)
- ✅ Textes longs (Map-Reduce complet)
- ✅ Mocking du runtime et MainLLMAgent

### Tests d'intégration (à venir)

```bash
bun run test tests/integration/UniversalReader.test.ts
```

Devrait couvrir:
- PDF natif end-to-end
- PDF scanné avec OCR
- Image OCR
- Gestion des erreurs

## Contribuer

Pour ajouter un nouveau format de document:

1. Ajouter la détection dans `UniversalReaderAgent.read()`
2. Créer une fonction `readNewFormat(buffer)`
3. Intégrer avec `ChunkProcessor` pour les longs documents
4. Mettre à jour les types dans `types.ts`
5. Ajouter des tests

---

**Auteur**: Sprint 4 Implementation  
**Date**: Novembre 2024  
**Version**: 1.0.0
