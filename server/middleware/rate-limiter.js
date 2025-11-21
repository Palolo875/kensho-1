// server/middleware/rate-limiter.js

/**
 * Rate Limiter for WebSocket connections and messages.
 * Implements sliding window algorithm.
 */
class RateLimiter {
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 100;
        this.windowMs = options.windowMs || 60000; // 1 minute
        this.blockDurationMs = options.blockDurationMs || this.windowMs * 2;
        this.clients = new Map();

        // Cleanup expired entries every 5 minutes
        this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
    }

    /**
     * Checks if a client is allowed to make a request.
     * @param {string} clientId - Client identifier (IP, userId, etc.)
     * @returns {object} { allowed: boolean, remaining?: number, reason?: string }
     */
    check(clientId) {
        const now = Date.now();
        const clientData = this.clients.get(clientId) || {
            requests: [],
            blocked: false,
            blockedUntil: 0,
            violations: 0,
        };

        // Check if client is currently blocked
        if (clientData.blocked && now < clientData.blockedUntil) {
            return {
                allowed: false,
                reason: 'rate_limit_exceeded',
                retryAfter: Math.ceil((clientData.blockedUntil - now) / 1000),
            };
        }

        // Unblock if block period is over
        if (clientData.blocked && now >= clientData.blockedUntil) {
            clientData.blocked = false;
            clientData.violations = 0;
        }

        // Remove expired requests (sliding window)
        clientData.requests = clientData.requests.filter(
            timestamp => now - timestamp < this.windowMs
        );

        // Check if limit exceeded
        if (clientData.requests.length >= this.maxRequests) {
            clientData.blocked = true;
            clientData.blockedUntil = now + this.blockDurationMs;
            clientData.violations++;

            this.clients.set(clientId, clientData);

            console.warn(`[RateLimiter] Client ${clientId} blocked for ${this.blockDurationMs}ms (violation #${clientData.violations})`);

            return {
                allowed: false,
                reason: 'rate_limit_exceeded',
                retryAfter: Math.ceil(this.blockDurationMs / 1000),
            };
        }

        // Add new request
        clientData.requests.push(now);
        this.clients.set(clientId, clientData);

        return {
            allowed: true,
            remaining: this.maxRequests - clientData.requests.length,
            limit: this.maxRequests,
            reset: Math.ceil((now + this.windowMs) / 1000),
        };
    }

    /**
     * Manually resets a client's rate limit (for testing or admin actions).
     * @param {string} clientId - Client to reset
     */
    reset(clientId) {
        this.clients.delete(clientId);
        console.log(`[RateLimiter] Reset client ${clientId}`);
    }

    /**
     * Resets all clients (for testing).
     */
    resetAll() {
        this.clients.clear();
        console.log('[RateLimiter] Reset all clients');
    }

    /**
     * Cleanup expired client data.
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [clientId, clientData] of this.clients.entries()) {
            // Remove if no recent requests and not blocked
            const hasRecentRequests = clientData.requests.some(
                timestamp => now - timestamp < this.windowMs
            );
            const isBlocked = clientData.blocked && now < clientData.blockedUntil;

            if (!hasRecentRequests && !isBlocked) {
                this.clients.delete(clientId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[RateLimiter] Cleaned up ${cleaned} expired clients`);
        }
    }

    /**
     * Gets statistics about rate limiting.
     * @returns {object} Statistics
     */
    getStats() {
        const now = Date.now();
        const clients = Array.from(this.clients.values());

        return {
            totalClients: this.clients.size,
            blockedClients: clients.filter(c => c.blocked && now < c.blockedUntil).length,
            activeClients: clients.filter(c =>
                c.requests.some(timestamp => now - timestamp < this.windowMs)
            ).length,
            totalViolations: clients.reduce((sum, c) => sum + c.violations, 0),
            config: {
                maxRequests: this.maxRequests,
                windowMs: this.windowMs,
                blockDurationMs: this.blockDurationMs,
            },
        };
    }

    /**
     * Disposes of the rate limiter (stops cleanup interval).
     */
    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

export default RateLimiter;
