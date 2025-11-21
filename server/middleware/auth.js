// server/middleware/auth.js
import JWTManager from '../auth/jwt-manager.js';

const jwtManager = new JWTManager();

/**
 * Authentication middleware for WebSocket connections.
 */
class AuthMiddleware {
    constructor() {
        this.jwtManager = jwtManager;
    }

    /**
     * Extracts JWT token from WebSocket upgrade request.
     * @param {object} request - HTTP upgrade request
     * @returns {string|null} JWT token or null if not found
     */
    extractToken(request) {
        // Try query parameter first (e.g., ws://server?token=xxx)
        const url = new URL(request.url, 'ws://localhost');
        const tokenFromQuery = url.searchParams.get('token');
        if (tokenFromQuery) {
            return tokenFromQuery;
        }

        // Try Authorization header
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        return null;
    }

    /**
     * Authenticates a WebSocket connection request.
     * @param {object} request - HTTP upgrade request
     * @returns {object} { authenticated: boolean, userId?: string, error?: string }
     */
    authenticate(request) {
        const token = this.extractToken(request);

        if (!token) {
            return {
                authenticated: false,
                error: 'No authentication token provided',
            };
        }

        const payload = this.jwtManager.verifyToken(token);

        if (!payload) {
            return {
                authenticated: false,
                error: 'Invalid or expired token',
            };
        }

        return {
            authenticated: true,
            userId: payload.userId,
            metadata: payload,
        };
    }

    /**
     * Generates a token for a user (for testing/development).
     * @param {string} userId - User ID
     * @param {object} metadata - Additional metadata
     * @returns {string} JWT token
     */
    generateToken(userId, metadata = {}) {
        return this.jwtManager.generateToken(userId, metadata);
    }
}

export default AuthMiddleware;
