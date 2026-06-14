'use strict';

/**
 * @file Personal endpoints controller (`/api/me`) — currently the per-user
 * statistics surface (US-14). The user is always derived from the session,
 * never from the request, so one user can never read another's stats.
 *
 * @typedef {Object} MeControllerDeps
 * @property {Record<string, any>} [meStatisticsService]
 */

const { createMeStatisticsService } = require('../services/me-statistics-service');
const { respondWithApiError, respondUnauthenticated } = require('../utils/api-error-payload');
const { resolveSessionUser, resolveSessionUserId } = require('../middlewares/auth');

/**
 * Builds the personal-endpoints controller.
 *
 * @param {MeControllerDeps} [options]
 */
function createMeController({ meStatisticsService } = {}) {
    const service = meStatisticsService || createMeStatisticsService();

    /**
     * `GET /api/me/stats` — the current user's annotation/review statistics.
     * @param {*} request - HTTP request.
     * @param {*} response - HTTP response.
     */
    async function getMyStats(request, response) {
        const userId = resolveSessionUserId(request);
        if (!userId)
            return respondUnauthenticated(response);

        const user = resolveSessionUser(request);
        const email = user ? user.email : null;

        try {
            const stats = await service.getMyStatistics({ userId, email });
            return response.status(200).json(stats);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return {
        getMyStats
    };
}

module.exports = {
    createMeController
};
