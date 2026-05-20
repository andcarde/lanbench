'use strict';

/**
 * @file `PrismaSessionStore` — `express-session.Store` backed by Prisma.
 *
 * Persists sessions in the `Session` table, deserializes lazily, and keeps an
 * internal timer that cleans up expired sessions every `cleanupIntervalMs`
 * (default 15 min).
 */

const session = require('express-session');
const defaultPrisma = require('../prisma/client');

const Store = session.Store;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Express-session Store backed by Prisma over the Session model.
 */
class PrismaSessionStore extends Store {
    /**
     * @param {{ prisma?: any, defaultTtlMs?: number, cleanupIntervalMs?: number }} [options]
     */
    constructor(options = {}) {
        super();
        this.prisma = options.prisma || defaultPrisma;
        this.defaultTtlMs = options.defaultTtlMs ?? ONE_DAY_MS;
        const cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;

        if (cleanupIntervalMs > 0) {
            this.cleanupTimer = setInterval(() => {
                this.purgeExpired().catch(() => {});
            }, cleanupIntervalMs);
            if (typeof this.cleanupTimer.unref === 'function')
                this.cleanupTimer.unref();
        }
    }

    /**
     * Gets a session by sid.
     * @param {string} sid
     * @param {Function} callback
     */
    get(sid, callback) {
        this.prisma.session.findUnique({ where: { sid } })
            .then((/** @type {*} */ row) => {
                if (!row) return callback(null, null);
                if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
                    this.prisma.session.delete({ where: { sid } }).catch(() => {});
                    return callback(null, null);
                }
                try {
                    return callback(null, JSON.parse(row.data));
                } catch (parseError) {
                    return callback(parseError);
                }
            })
            .catch(callback);
    }

    /**
     * Saves or replaces a session.
     * @param {string} sid
     * @param {*} sessionData
     * @param {((err?: any) => void) | undefined} [callback]
     */
    set(sid, sessionData, callback) {
        const expiresAt = resolveExpiry(sessionData, this.defaultTtlMs);
        const data = JSON.stringify(sessionData);

        this.prisma.session.upsert({
            where: { sid },
            create: { sid, data, expiresAt },
            update: { data, expiresAt }
        })
            .then(() => callback && callback(null))
            .catch((/** @type {*} */ error) => callback && callback(error));
    }

    /**
     * Deletes a session by sid.
     * @param {string} sid
     * @param {((err?: any) => void) | undefined} [callback]
     */
    destroy(sid, callback) {
        this.prisma.session.deleteMany({ where: { sid } })
            .then(() => callback && callback(null))
            .catch((/** @type {*} */ error) => callback && callback(error));
    }

    /**
     * Renews a session's expiration date.
     * @param {string} sid
     * @param {*} sessionData
     * @param {(() => void) | undefined} [callback]
     */
    touch(sid, sessionData, callback) {
        const expiresAt = resolveExpiry(sessionData, this.defaultTtlMs);

        this.prisma.session.update({
            where: { sid },
            data: { expiresAt }
        })
            .then(() => callback && callback())
            .catch((/** @type {*} */ error) => {
                if (error && error.code === 'P2025')
                    return callback && callback();
                return callback && callback();
            });
    }

    /**
     * Removes the expired sessions.
     * @returns {Promise<number>} Number of deleted sessions.
     */
    async purgeExpired() {
        const result = await this.prisma.session.deleteMany({
            where: { expiresAt: { lte: new Date() } }
        });
        return result?.count ?? 0;
    }

    /**
     * Releases the internal timer.
     */
    close() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
}

/**
 * Computes the expiration date of the session record.
 * @param {*} sessionData - Session data sent by express-session.
 * @param {number} defaultTtlMs - Default TTL if the cookie does not set an expiration.
 * @returns {Date} Expiration date.
 */
function resolveExpiry(sessionData, defaultTtlMs) {
    const expires = sessionData?.cookie?.expires;
    if (expires instanceof Date && !Number.isNaN(expires.getTime()))
        return expires;
    if (typeof expires === 'string' || typeof expires === 'number') {
        const parsed = new Date(expires);
        if (!Number.isNaN(parsed.getTime()))
            return parsed;
    }
    return new Date(Date.now() + defaultTtlMs);
}

module.exports = {
    PrismaSessionStore
};
