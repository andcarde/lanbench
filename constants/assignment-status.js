'use strict';

/**
 * @file Estados validos de una asignacion de seccion a un anotador/revisor.
 *
 * El ciclo de vida es:
 *   `active` -> `completed` | `released` | `expired`
 *
 * @typedef {import('../types/typedefs').AssignmentStatus} AssignmentStatus
 */

/** @type {'active'} La asignacion sigue abierta. */
const ASSIGNMENT_ACTIVE = 'active';
/** @type {'completed'} El anotador termino la seccion. */
const ASSIGNMENT_COMPLETED = 'completed';
/** @type {'expired'} La asignacion expiro por inactividad. */
const ASSIGNMENT_EXPIRED = 'expired';
/** @type {'released'} El anotador devolvio la asignacion sin completarla. */
const ASSIGNMENT_RELEASED = 'released';

/**
 * Lista canonica con todos los estados de asignacion.
 * @type {AssignmentStatus[]}
 */
const ALL_ASSIGNMENT_STATUSES = [
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_EXPIRED,
    ASSIGNMENT_RELEASED
];

module.exports = {
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_EXPIRED,
    ASSIGNMENT_RELEASED,
    ALL_ASSIGNMENT_STATUSES
};
