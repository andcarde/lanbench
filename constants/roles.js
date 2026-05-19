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

/** @type {'annotator'} Anotador de una seccion. */
const ROLE_ANNOTATOR = 'annotator';
/** @type {'reviewer'} Revisor de las anotaciones de otros. */
const ROLE_REVIEWER = 'reviewer';
/** @type {'admin'} Administrador del dataset (gestiona permisos, etc.). */
const ROLE_ADMIN = 'admin';

/**
 * Lista canonica e inmutable de roles validos.
 * @type {ReadonlyArray<DatasetRole>}
 */
const ALL_ROLES = Object.freeze([ROLE_ANNOTATOR, ROLE_REVIEWER, ROLE_ADMIN]);

/**
 * Type-guard: devuelve true si el valor es un dataset-role conocido.
 *
 * @param {unknown} value - Valor recibido.
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
