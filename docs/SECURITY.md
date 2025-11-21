# 🔐 KENSHO SECURITY GUIDE

**Version** : 1.0.0  
**Last Updated** : 2025-11-21  
**Status** : 🚧 EN DÉVELOPPEMENT

---

## 🎯 Vue d'Ensemble

Ce document décrit les mesures de sécurité implémentées dans Kensho et les bonnes pratiques à suivre pour sécuriser votre application.

---

## 🛡️ Architecture de Sécurité

### Niveaux de Sécurité

```
┌─────────────────────────────────────────┐
│   Application Layer (Browser)          │
│   ├── Payload Validation (Zod)         │
│   ├── Message Signing                  │
│   └── Rate Limiting (Client)           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│   Transport Layer (WebSocket)          │
│   ├── WSS (TLS/SSL)                    │
│   ├── JWT Authentication                │
│   └── Connection Validation            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│   Server Layer (Relay)                 │
│   ├── Auth Middleware                   │
│   ├── Rate Limiter                      │
│   ├── Payload Validator                 │
│   └── Audit Logging                     │
└─────────────────────────────────────────┘
```

---

## 🔑 1. Authentication (JWT)

### Implémentation

**Server-side** (`server/auth/jwt-manager.js`) :
```javascript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'your-secret-key';
const EXPIRATION = '24h';

export function generateToken(userId, metadata = {}) {
  return jwt.sign(
    {
      userId,
      ...metadata,
      iat: Date.now(),
    },
    SECRET,
    { expiresIn: EXPIRATION }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (error) {
    return null;
  }
}
```

**Client-side** (`src/core/communication/transport/WebSocketTransport.ts`) :
```typescript
async connect() {
  const token = await this.getAuthToken();
  this.ws = new WebSocket(`${this.url}?token=${token}`);
}

private async getAuthToken(): Promise<string> {
  // Récupérer depuis localStorage ou API
  const token = localStorage.getItem('kensho_auth_token');
  if (!token) {
    throw new Error('No auth token available');
  }
  return token;
}
```

### Process d'Authentication

1. **Handshake** : Client envoie JWT dans la query string
2. **Validation** : Serveur vérifie le token
3. **Rejection** : Connexion fermée si token invalide
4. **Refresh** : Token rafraîchi avant expiration

---

## 🛡️ 2. Payload Validation

### Schémas Zod

**Fichier** : `src/core/communication/validation/schemas.ts`

```typescript
import { z } from 'zod';

// Base message schema
export const KenshoMessageSchema = z.object({
  messageId: z.string().uuid(),
  type: z.enum(['request', 'response', 'stream_chunk', 'stream_end', 'stream_error', 'broadcast']),
  sourceWorker: z.string().min(1).max(100),
  targetWorker: z.string().min(1).max(100),
  payload: z.unknown(),
  timestamp: z.number().int().positive(),
  traceId: z.string().optional(),
});

// Request message
export const RequestMessageSchema = KenshoMessageSchema.extend({
  type: z.literal('request'),
  method: z.string().optional(),
});

// Response message
export const ResponseMessageSchema = KenshoMessageSchema.extend({
  type: z.literal('response'),
  error: z.object({
    message: z.string(),
    name: z.string(),
    stack: z.string().optional(),
  }).optional(),
});

// Stream chunk
export const StreamChunkSchema = KenshoMessageSchema.extend({
  type: z.literal('stream_chunk'),
  streamId: z.string().uuid(),
});
```

###Validator Implementation

**Fichier** : `src/core/communication/validation/PayloadValidator.ts`

```typescript
import { z } from 'zod';
import { KenshoMessage } from '../types';
import * as schemas from './schemas';

export class PayloadValidator {
  private stats = {
    validated: 0,
    rejected: 0,
    errors: new Map<string, number>(),
  };

  validate(message: unknown): message is KenshoMessage {
    try {
      schemas.KenshoMessageSchema.parse(message);
      this.stats.validated++;
      return true;
    } catch (error) {
      this.stats.rejected++;
      
      if (error instanceof z.ZodError) {
        const errorKey = error.errors[0]?.message || 'unknown';
        this.stats.errors.set(
          errorKey,
          (this.stats.errors.get(errorKey) || 0) + 1
        );
      }
      
      console.warn('[PayloadValidator] Invalid message:', error);
      return false;
    }
  }

  validateRequest(message: unknown): boolean {
    try {
      schemas.RequestMessageSchema.parse(message);
      return true;
    } catch {
      return false;
    }
  }

  validateResponse(message: unknown): boolean {
    try {
      schemas.ResponseMessageSchema.parse(message);
      return true;
    } catch {
      return false;
    }
  }

  getStats() {
    return {
      ...this.stats,
      rejectionRate: this.stats.rejected / (this.stats.validated + this.stats.rejected),
      errors: Array.from(this.stats.errors.entries()).map(([error, count]) => ({
        error,
        count,
      })),
    };
  }
}
```

---

## ⏱️ 3. Rate Limiting

### Server-side Rate Limiter

**Fichier** : `server/middleware/rate-limiter.js`

```javascript
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.clients = new Map();
  }

  check(clientId) {
    const now = Date.now();
    const clientData = this.clients.get(clientId) || {
      requests: [],
      blocked: false,
      blockedUntil: 0,
    };

    // Check if client is blocked
    if (clientData.blocked && now < clientData.blockedUntil) {
      return { allowed: false, reason: 'rate_limit_exceeded' };
    }

    // Remove expired requests
    clientData.requests = clientData.requests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    // Check limit
    if (clientData.requests.length >= this.maxRequests) {
      clientData.blocked = true;
      clientData.blockedUntil = now + this.windowMs;
      this.clients.set(clientId, clientData);
      return { allowed: false, reason: 'rate_limit_exceeded' };
    }

    // Add new request
    clientData.requests.push(now);
    clientData.blocked = false;
    this.clients.set(clientId, clientData);

    return {
      allowed: true,
      remaining: this.maxRequests - clientData.requests.length,
    };
  }

  reset(clientId) {
    this.clients.delete(clientId);
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      blockedClients: Array.from(this.clients.values()).filter(c => c.blocked).length,
    };
  }
}

export default RateLimiter;
```

### Integration dans le Relay

**Fichier** : `server/relay.js` (à modifier)

```javascript
import RateLimiter from './middleware/rate-limiter.js';

const rateLimiter = new RateLimiter(100, 60000); // 100 req/min

wss.on('connection', (ws) => {
  const clientId = generateClientId();
  
  ws.on('message', (data) => {
    const rateCheck = rateLimiter.check(clientId);
    
    if (!rateCheck.allowed) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Rate limit exceeded. Try again later.',
      }));
      return;
    }
    
    // Process message
    handleMessage(data);
  });
});
```

---

## 🔒 4. TLS/SSL (WSS)

### Configuration HTTPS

**Fichier** : `server/relay.js` (version sécurisée)

```javascript
import https from 'https';
import fs from 'fs';
import { WebSocketServer } from 'ws';

const server = https.createServer({
  cert: fs.readFileSync('/path/to/cert.pem'),
  key: fs.readFileSync('/path/to/key.pem'),
});

const wss = new WebSocketServer({ server });

server.listen(8443, () => {
  console.log('Secure WebSocket server running on wss://localhost:8443');
});
```

### Client Configuration

```typescript
class WebSocketTransport {
  constructor() {
    // Use WSS in production
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//yourserver.com:8443`;
  }
}
```

---

## 📝 5. Audit Logging

### Log Structure

```typescript
interface AuditLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'security';
  event: string;
  userId?: string;
  clientId: string;
  metadata: Record<string, unknown>;
}
```

### Implementation

**Fichier** : `server/audit/logger.js`

```javascript
export class AuditLogger {
  log(event) {
    const entry = {
      timestamp: Date.now(),
      ...event,
    };
    
    // Log to console (dev)
    console.log('[AUDIT]', JSON.stringify(entry));
    
    // TODO: Send to logging service (prod)
    // - Elasticsearch
    // - CloudWatch
    // - Datadog
  }

  logSecurityEvent(type, details) {
    this.log({
      level: 'security',
      event: type,
      ...details,
    });
  }
}
```

---

## ⚠️ 6. Best Practices

### DO ✅

1. **Toujours valider les payloads** côté serveur ET client
2. **Utiliser WSS** en production (jamais WS non chiffré)
3. **Rotation des secrets** JWT régulièrement
4. **Rate limiting** agressif pour prévenir DDoS
5. **Logs d'audit** pour tous les événements de sécurité
6. **Timeout des connexions** inactives
7. **Vérifier l'origine** des messages WebSocket
8. **Sanitize user input** avant processing

### DON'T ❌

1. ❌ **Ne jamais** logger les tokens JWT
2. ❌ **Ne jamais** exposer les secrets dans le code
3. ❌ **Ne jamais** faire confiance aux données client
4. ❌ **Ne pas** utiliser WS non chiffré en production
5. ❌ **Ne pas** oublier de valider TOUS les messages
6. ❌ **Ne pas** ignorer les erreurs de validation
7. ❌ **Ne pas** permettre des payloads illimités

---

## 🔍 7. Security Checklist

Avant de déployer en production :

- [ ] JWT authentication activée
- [ ] WSS (TLS/SSL) configuré
- [ ] Rate limiting implémenté
- [ ] Payload validation active
- [ ] Audit logging fonctionnel
- [ ] Secrets stockés dans variables d'environnement
- [ ] CORS correctement configuré
- [ ] Origin validation activée
- [ ] Timeouts configurés
- [ ] Error messages ne révèlent pas d'info sensible

---

## 📊 8. Monitoring de Sécurité

### Métriques à Tracker

- **Failed authentication attempts** / minute
- **Rate limit violations** / minute
- **Invalid payloads rejected** / minute
- **Active connections** count
- **Average connection duration**
- **Suspicious patterns** (rapid reconnections, etc.)

### Alertes

Configurer des alertes pour :
- Taux d'auth failures > 10/min
- Rate limit violations > 50/min
- Connexions suspectes (même IP, différents users)

---

## 🚨 9. Incident Response

En cas d'incident de sécurité :

1. **Isolation** : Bloquer l'IP/client immédiatement
2. **Investigation** : Analyser les logs d'audit
3. **Mitigation** : Changer les secrets si compromis
4. **Communication** : Notifier les utilisateurs affectés
5. **Post-mortem** : Documenter et améliorer

---

## 📚 10. Ressources

- [OWASP WebSocket Security](https://owasp.org/www-community/vulnerabilities/WebSockets)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Rate Limiting Strategies](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)

---

## ✅ Status d'Implémentation

| Feature | Status | Priority |
|---------|--------|----------|
| JWT Auth | 🔄 TODO | 🔴 HIGH |
| Payload Validation | 🔄 TODO | 🔴 HIGH |
| Rate Limiting | 🔄 TODO | 🔴 HIGH |
| WSS/TLS | 🔄 TODO | 🟡 MEDIUM |
| Audit Logging | 🔄 TODO | 🟡 MEDIUM |
| CORS Config | 🔄 TODO | 🟡 MEDIUM |

---

**Maintenu par** : Kensho Security Team  
**Dernière revue** : 2025-11-21
