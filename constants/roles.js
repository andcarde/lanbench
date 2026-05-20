'use strict';

/**
 * @file Dataset-role catalogue.
 *
 * These constants describe the per-dataset roles held in the `permits` table
 * (one row per (datasetId, userId)). They are NOT server-level roles. The
 * server-level role lives on the `users` table as the boolean `isModerator`
 * and is exposed in sessions/DTOs as `isModerator` — see {@link module:middlewares/auth}.
 *
 * @typedef {import('../types/typedefs').DatasetRole} DatasetRole
 */

/** @type {'annotator'} Annotator of a section. */
const ROLE_ANNOTATOR = 'annotator';
/** @type {'reviewer'} Reviewer of other users' annotations. */
const ROLE_REVIEWER = 'reviewer';
/** @type {'admin'} Dataset administrator (manages permissions, etc.). */
const ROLE_ADMIN = 'admin';

/**
 * Canonical, immutable list of valid roles.
 * @type {ReadonlyArray<DatasetRole>}
 */
const ALL_ROLES = Object.freeze([ROLE_ANNOTATOR, ROLE_REVIEWER, ROLE_ADMIN]);

/**
 * Type-guard: returns true if the value is a known dataset-role.
 *
 * @param {unknown} value - Received value.
 * @returns {value is DatasetRole}
 */
function isValidRole(value) {
    return typeof value === 'string' && /** @type {ReadonlyArray<string>} */ (ALL_ROLES).includes(value);
}

module.exports = {
    ROLE_ANNOTATOR,
    ROLE_REVIEWER,
    ROLE_ADMIN,
    ALL_ROLES,
    isValidRole
};
