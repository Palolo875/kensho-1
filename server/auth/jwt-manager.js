// server/auth/jwt-manager.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * JWT Manager for Kensho WebSocket Authentication
 */
class JWTManager {
    constructor() {
        // In production, use environment variables
        this.secret = process.env.JWT_SECRET || this.generateSecret();
        this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';
        this.algorithm = 'HS256';

        if (!process.env.JWT_SECRET) {
            console.warn('⚠️ WARNING: Using generated JWT secret. Set JWT_SECRET in production!');
            console.warn(`Generated secret: ${this.secret}`);
        }
    }

    /**
     * Generates a random secret for development.
     */
    generateSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    /**
     * Generates a JWT token for a user.
     * @param {string} userId - Unique user identifier
     * @param {object} metadata - Additional claims to include
     * @returns {string} JWT token
     */
    generateToken(userId, metadata = {}) {
        const payload = {
            userId,
            ...metadata,
            iat: Math.floor(Date.now() / 1000),
        };

        return jwt.sign(payload, this.secret, {
            expiresIn: this.expiresIn,
            algorithm: this.algorithm,
        });
    }

    /**
     * Verifies a JWT token.
     * @param {string} token - JWT token to verify
     * @returns {object|null} Decoded payload or null if invalid
     */
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.secret, {
                algorithms: [this.algorithm],
            });
            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                console.warn('[JWT] Token expired:', error.message);
            } else if (error.name === 'JsonWebTokenError') {
                console.warn('[JWT] Invalid token:', error.message);
            } else {
                console.error('[JWT] Verification error:', error);
            }
            return null;
        }
    }

    /**
     * Decodes a token without verification (for debugging).
     * @param {string} token - JWT token to decode
     * @returns {object|null} Decoded payload or null if invalid
     */
    decodeToken(token) {
        try {
            return jwt.decode(token);
        } catch (error) {
            console.error('[JWT] Decode error:', error);
            return null;
        }
    }

    /**
     * Checks if a token is expired without throwing errors.
     * @param {string} token - JWT token to check
     * @returns {boolean} True if expired
     */
    isTokenExpired(token) {
        const decoded = this.decodeToken(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        return decoded.exp < Math.floor(Date.now() / 1000);
    }

    /**
     * Refreshes a token if it's close to expiration.
     * @param {string} token - Current JWT token
     * @param {number} thresholdSeconds - Refresh if expires in less than this
     * @returns {string|null} New token or null if refresh not needed
     */
    refreshIfNeeded(token, thresholdSeconds = 3600) {
        const decoded = this.decodeToken(token);
        if (!decoded || !decoded.exp) {
            return null;
        }

        const timeUntilExpiration = decoded.exp - Math.floor(Date.now() / 1000);
        if (timeUntilExpiration < thresholdSeconds) {
            // Token expires soon, generate a new one
            const { userId, ...metadata } = decoded;
            delete metadata.iat;
            delete metadata.exp;
            return this.generateToken(userId, metadata);
        }

        return null; // No refresh needed
    }
}

export default JWTManager;
