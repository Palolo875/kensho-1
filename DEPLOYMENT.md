# 🚀 Deployment Guide

> **Production deployment strategies for Kensho**

This guide covers how to deploy Kensho in various production environments.

---

## 1. Pre-Deployment Checklist

Before deploying to production, ensure:

- [ ] **TypeScript Strict Mode**: Enable `strict: true` in `tsconfig.json` (see [PROJECT_STATUS.md](./PROJECT_STATUS.md#3-risks--mitigations))
- [ ] **Environment Variables**: Create `.env` from `.env.example` with production values
- [ ] **Dependencies Audit**: Run `npm audit` to check for vulnerabilities
- [ ] **Tests Pass**: Run `npm run test:unit` and `npm run test:e2e`
- [ ] **Build Success**: Run `npm run build` without errors
- [ ] **Performance Check**: Test with WebGPU-enabled browser (Chrome 113+)

---

## 2. Deployment Scenarios

### Scenario A: Static Hosting (Simple, No Relay)

**Best for**: Personal use, demos, BroadcastChannel-only deployments.

**Platforms**: GitHub Pages, Vercel, Netlify, Cloudflare Pages.

#### Steps (Vercel Example):
1. **Build**:
   ```bash
   npm run build
   ```
2. **Deploy**:
   ```bash
   vercel --prod
   ```
3. **Configure**:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

**Limitations**:
- No WebSocket relay (multi-device communication disabled).
- Only BroadcastChannel works (multi-tab on same browser).

---

### Scenario B: Self-Hosted (VPS + Relay Server)

**Best for**: Full control, WebSocket support, private deployments.

**Requirements**:
- VPS (DigitalOcean, AWS EC2, Linode) with Ubuntu 22.04+
- Domain name (optional but recommended)
- SSL certificate (Let's Encrypt)

#### Architecture:
```
[User Browser] → [Nginx (reverse proxy)] → [Static Files (port 8080)]
                                          └→ [Relay Server (port 3001)]
```

#### Step-by-Step:

**1. Install Dependencies**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install Certbot (for SSL)
sudo apt install -y certbot python3-certbot-nginx
```

**2. Deploy Application**
```bash
# Clone repository
git clone https://github.com/Palolo875/kensho-1.git
cd kensho-1

# Install dependencies
npm ci --production

# Build
npm run build
```

**3. Configure PM2**
Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'kensho-relay',
      script: 'server/relay.secure.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        JWT_SECRET: 'your-strong-secret-key-here'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M'
    }
  ]
};
```

Start:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable on boot
```

**4. Configure Nginx**
Create `/etc/nginx/sites-available/kensho`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Static files
    location / {
        root /path/to/kensho-1/dist;
        try_files $uri $uri/ /index.html;
        
        # Caching for assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # WebSocket relay
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Timeouts
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/kensho /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl reload nginx
```

**5. SSL Certificate**
```bash
sudo certbot --nginx -d your-domain.com
```

**6. Firewall**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

### Scenario C: Docker Container

**Best for**: Reproducible deployments, Kubernetes, cloud-native environments.

#### Dockerfile:
```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package*.json ./
RUN npm ci --production

# Expose ports
EXPOSE 8080 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start relay server
CMD ["node", "server/relay.secure.js"]
```

#### docker-compose.yml:
```yaml
version: '3.8'
services:
  kensho:
    build: .
    ports:
      - "8080:8080"
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped
    volumes:
      - ./dist:/app/dist:ro
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8080')"]
      interval: 30s
      timeout: 3s
      retries: 3
```

#### Deploy:
```bash
# Build
docker-compose build

# Start
JWT_SECRET="your-secret" docker-compose up -d

# View logs
docker-compose logs -f
```

---

### Scenario D: Kubernetes (Advanced)

**Best for**: High availability, auto-scaling, enterprise deployments.

#### kensho-deployment.yaml:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kensho
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kensho
  template:
    metadata:
      labels:
        app: kensho
    spec:
      containers:
      - name: kensho
        image: your-registry/kensho:latest
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 3001
          name: websocket
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: kensho-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: kensho
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 8080
    name: http
  - port: 3001
    targetPort: 3001
    name: websocket
  selector:
    app: kensho
```

---

## 3. Environment Variables (Production)

### Required Variables:
```bash
# JWT Secret for relay authentication (CRITICAL: Use a strong random string)
JWT_SECRET="$(openssl rand -base64 32)"

# Optional: Disable LLM autoload for faster startup
VITE_LLM_AUTOLOAD=false

# Optional: Specify runtime mode
VITE_MODE=full
```

### Generating Secure Secrets:
```bash
# Linux/macOS
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

---

## 4. Performance Optimization

### 4.1. CDN Configuration
If using a CDN (Cloudflare, AWS CloudFront):

**Cache Rules**:
- **Static Assets** (`*.js`, `*.css`, `*.woff2`): Cache for 1 year
- **HTML** (`index.html`): No cache (always fetch latest)
- **WebSocket** (`/ws`): Bypass CDN

### 4.2. Compression
Nginx gzip configuration:
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
gzip_min_length 1000;
```

### 4.3. HTTP/2 & HTTP/3
Enable in Nginx:
```nginx
listen 443 ssl http2;
listen 443 quic reuseport;  # HTTP/3
```

---

## 5. Monitoring & Logging

### 5.1. PM2 Logs
```bash
# View logs
pm2 logs kensho-relay

# Save logs to file
pm2 logs kensho-relay --raw > /var/log/kensho.log
```

### 5.2. Nginx Access Logs
```bash
tail -f /var/log/nginx/access.log
```

### 5.3. Application Metrics
Kensho exposes metrics via the Observatory UI. Access at `/observatory`.

Key Metrics:
- **VRAM Usage**: `MemoryManager.getStats()`
- **Message Latency**: `MetricsCollector` (MessageBus)
- **Cache Hit Rate**: `ResponseCache.getStats()`

---

## 6. Security Best Practices

### 6.1. Relay Server
- **Always use `relay.secure.js`** in production (JWT authentication).
- **Rotate JWT secrets** regularly (every 90 days).
- **Rate limit**: Default is 100 req/min. Adjust in `server/middleware/rate-limiter.js`.

### 6.2. HTTPS
- **Always use SSL/TLS** (Let's Encrypt is free).
- **Redirect HTTP to HTTPS**:
  ```nginx
  server {
      listen 80;
      server_name your-domain.com;
      return 301 https://$host$request_uri;
  }
  ```

### 6.3. CSP Headers
Add Content Security Policy:
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' wss://your-domain.com;";
```

---

## 7. Backup & Recovery

### 7.1. Database Backup
Kensho uses IndexedDB (client-side). No server-side backup needed.

For relay server logs:
```bash
# Daily backup
0 2 * * * tar -czf /backup/kensho-logs-$(date +\%Y\%m\%d).tar.gz /var/log/kensho.log
```

### 7.2. Configuration Backup
```bash
# Backup Nginx config
sudo cp /etc/nginx/sites-available/kensho /backup/nginx-kensho.conf

# Backup PM2 config
pm2 save
cp ~/.pm2/dump.pm2 /backup/pm2-dump.pm2
```

---

## 8. Troubleshooting

### Issue: WebSocket Connection Fails
**Symptoms**: Multi-device sync not working.
**Diagnosis**:
```bash
# Check relay server is running
pm2 status kensho-relay

# Check port is open
telnet localhost 3001
```

**Fix**: Ensure Nginx proxy config includes `Upgrade` headers (see Scenario B).

### Issue: High Memory Usage
**Symptoms**: Server OOM (Out of Memory).
**Diagnosis**: Check PM2 logs for VRAM errors.
**Fix**:
- Reduce `max_memory_restart` in `ecosystem.config.js`.
- Disable LLM autoload (`VITE_LLM_AUTOLOAD=false`).

### Issue: Slow Page Load
**Symptoms**: First load takes > 10 seconds.
**Diagnosis**: Check if WebGPU model is downloading.
**Fix**: Enable CDN caching for static assets.

---

*For development setup, see [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).*
*For configuration details, see [CONFIGURATION.md](./CONFIGURATION.md).*
