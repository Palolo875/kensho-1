# 🎯 Guide d'Utilisation - Conversation avec Gemma 3 270m

**Statut:** ✅ **Prêt à utiliser**  
**Modèle:** Gemma 3 270m (INT4, ultra-léger)  
**Temps de démarrage:** ~1-2 minutes (téléchargement + initialisation)

---

## 🚀 Démarrage Rapide

### Étape 1: Initialiser Kensho au démarrage de votre app

```typescript
import { initializeKensho } from '@/kensho';

// Dans votre composant React ou au chargement initial
const kensho = await initializeKensho();
console.log("✅ Kensho est prêt!");
```

**Optionnel: Afficher la progression du téléchargement**

```typescript
const kensho = await initializeKensho('gemma-3-270m', (progress) => {
  console.log(`⏳ ${progress.text}`);
  // Vous pouvez aussi mettre à jour une barre de progression
  // setDownloadProgress(progress.progress);
});
```

---

### Étape 2: Lancer une conversation

```typescript
import { initializeKensho } from '@/kensho';

const kensho = await initializeKensho();

// Demander quelque chose à Gemma
const userMessage = "Bonjour Kensho, dis-moi blague!";

// Streaming la réponse
for await (const event of kensho.dialogue.startConversation(userMessage)) {
  switch (event.type) {
    case 'token':
      // Afficher chaque token en temps réel
      console.log(event.data); // ex: "Pourquoi", " ", "les"...
      break;
      
    case 'complete':
      // Réponse complète
      console.log("📤 Réponse complète:", event.data.response);
      console.log("📊 Métriques:", event.data.metrics);
      break;
      
    case 'error':
      console.error("❌ Erreur:", event.data.message);
      break;
  }
}
```

---

## 💻 Exemple Complet (React)

```typescript
import { useState, useEffect } from 'react';
import { initializeKensho } from '@/kensho';
import type { KenshoAPI } from '@/kensho';

export function ChatComponent() {
  const [kensho, setKensho] = useState<KenshoAPI | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState("");

  // Initialiser Kensho au montage
  useEffect(() => {
    const init = async () => {
      try {
        console.log("🚀 Initialisation de Kensho...");
        const api = await initializeKensho('gemma-3-270m', (progress) => {
          setDownloadProgress(progress.text || "Chargement...");
        });
        setKensho(api);
        setInitializing(false);
        console.log("✅ Kensho prêt!");
      } catch (error) {
        console.error("❌ Erreur init:", error);
        setInitializing(false);
      }
    };
    init();
  }, []);

  // Envoyer un message
  const handleSendMessage = async (userMessage: string) => {
    if (!kensho || loading) return;

    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    let response = '';
    try {
      // Streamer la réponse
      for await (const event of kensho.dialogue.startConversation(userMessage)) {
        if (event.type === 'token') {
          response += event.data;
          // Mettre à jour en temps réel
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg.role === 'assistant') {
              lastMsg.content = response;
            } else {
              updated.push({ role: 'assistant', content: response });
            }
            return updated;
          });
        } else if (event.type === 'complete') {
          console.log("📊 Métriques:", event.data.metrics);
        }
      }
    } catch (error) {
      console.error("❌ Erreur:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "❌ Erreur lors de la réponse" }]);
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return <div>⏳ Initialisation... {downloadProgress}</div>;
  }

  if (!kensho) {
    return <div>❌ Erreur lors de l'initialisation</div>;
  }

  return (
    <div>
      <div>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '10px', padding: '10px', backgroundColor: msg.role === 'user' ? '#e3f2fd' : '#f5f5f5' }}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>
      <button
        onClick={() => handleSendMessage("Bonjour!")}
        disabled={loading}
      >
        {loading ? "En attente..." : "Dire bonjour"}
      </button>
    </div>
  );
}
```

---

## 🎮 API Reference

### `initializeKensho(modelKey?, onProgress?)`

Initialise le moteur Kensho.

**Paramètres:**
- `modelKey?: string` - Modèle à pré-charger (défaut: 'gemma-3-270m')
- `onProgress?: (progress) => void` - Callback pour voir la progression

**Retourne:** Promise<KenshoAPI>

**Exemple:**
```typescript
const kensho = await initializeKensho();
```

---

### `kensho.dialogue.startConversation(userPrompt, modelKey?)`

Lance une conversation avec streaming.

**Paramètres:**
- `userPrompt: string` - Le message de l'utilisateur
- `modelKey?: string` - Modèle (défaut: 'gemma-3-270m')

**Retourne:** AsyncGenerator<StreamEvent>

**Événements:**
```typescript
type StreamEvent = {
  type: 'token' | 'complete' | 'error' | 'metrics' | 'info'
  data: any
  timestamp: number
}
```

---

## 📊 Événements Détails

### `token` Event
Émis pour chaque token généré.
```typescript
{
  type: 'token',
  data: 'Hello',  // Chaque token (peut être un char ou un mot)
  timestamp: 1704067200000
}
```

### `complete` Event
Émis quand la génération est terminée.
```typescript
{
  type: 'complete',
  data: {
    response: 'Full response text',
    fromCache?: boolean,  // Si vient du cache
    metrics: {
      ttft: 245,              // Time To First Token (ms)
      totalTime: 2000,        // Temps total (ms)
      tokens: 42,             // Nombre de tokens
      tokensPerSec: '21.0'    // Vitesse génération
    }
  },
  timestamp: 1704067200000
}
```

### `error` Event
Émis si erreur.
```typescript
{
  type: 'error',
  data: {
    message: 'Error message',
    stack?: 'Stack trace'
  },
  timestamp: 1704067200000
}
```

---

## ⚡ Performance Attendu

| Métrique | Valeur |
|----------|--------|
| **Initialisation** | ~1-2 minutes (premier démarrage) |
| **TTFT** | ~245ms (temps avant premier token) |
| **Throughput** | ~4-5 tokens/sec |
| **Cache Hit** | <1ms (très rapide) |
| **Cache Miss** | 2-3 secondes (full inference) |

---

## 🔧 Configuration Avancée

### Changer de modèle
```typescript
// Pendant une conversation
for await (const event of kensho.dialogue.startConversation(prompt, 'phi-3')) {
  // Utiliser phi-3 au lieu de gemma-3
}
```

### Voir les stats du cache
```typescript
const stats = kensho.dialogue.getCacheStats();
console.log(`Cache hit rate: ${stats.hitRate}%`);
```

---

## ❓ FAQ

### Q: Combien de temps pour initialiser?
**A:** ~1-2 minutes pour télécharger Gemma 3 INT4 (~3.5GB).

### Q: Peut-on utiliser hors ligne après téléchargement?
**A:** Oui! Gemma s'exécute entièrement en WebGPU, zéro appel réseau après init.

### Q: Quel est le VRAM requis?
**A:** ~2GB pour Gemma 3 INT4. Moins avec quantization plus agressif.

### Q: Peut-on avoir plusieurs conversations simultanées?
**A:** Oui! TaskExecutor gère les queues multi-thread.

### Q: Pourquoi première requête est lente?
**A:** Warm-up GPU + initialisation. Les suivantes sont plus rapides.

---

## 🚀 Prochaines Étapes

1. ✅ **Intégration UI** - Ajouter un chat component
2. ✅ **Conversation History** - Persister les messages
3. ⏳ **Système de prompts** - Créer des personas
4. ⏳ **Multi-modèles** - Switcher entre Gemma/Phi/etc
5. ⏳ **Advanced Agents** - FactCheck, Code, Vision

---

## 📱 Support

**Problème:** Application freeze après initialisation  
**Solution:** Attendre le téléchargement complet (voir la barre de progression)

**Problème:** VRAM insuffisante  
**Solution:** Utiliser quantization plus agressif ou réduire cache

**Problème:** Tokens lents  
**Solution:** Attendre le warm-up GPU ou réduire batch size

---

**Status: ✅ PRÊT À UTILISER**

Lancez `initializeKensho()` et commencez à discuter! 🚀
