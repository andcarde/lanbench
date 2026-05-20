'use strict';

/**
 * @file Database health-check.
 *
 * Exposes `warnIfDatabaseInactive` (print a friendly console warning at
 * startup) and the helpers that check connectivity by delegating to `mysql2`.
 * It keeps the side effects (logs) separate from the pure detection to make
 * testing easier.
 */

const config = require('../config');

const DATABASE_INACTIVE_MESSAGE =
    'ERROR: La conexión a la base de datos está inactiva.';

/**
 * Checks whether the configured database accepts connections.
 * @param {*} options - Optional dependencies for testing.
 * @returns {Promise<boolean>} True if the connection is active.
 */
function checkDatabaseConnection({
    mysqlClient,
    mysqlConfig = config.mysql,
} = {}) {
    const connectionConfig = { ...mysqlConfig, connectTimeout: 2000 };

    if (mysqlClient) {
        return new Promise((resolve) => {
            const connection = mysqlClient.createConnection(connectionConfig);
            connection.connect((/** @type {*} */ error) => {
                connection.end(() => {});
                resolve(!error);
            });
        });
    }

    return checkWithMariadb(connectionConfig);
}

/**
 * Default implementation using the mariadb driver (promises).
 * @param {*} connectionConfig - Connection configuration.
 * @returns {Promise<boolean>} True if the connection is established and closed without error.
 */
async function checkWithMariadb(connectionConfig) {
    let mariadb;
    try {
        mariadb = require('mariadb');
    } catch {
        return false;
    }

    let connection;
    try {
        connection = await mariadb.createConnection(connectionConfig);
    } catch {
        return false;
    }

    try {
        await connection.end();
    } catch {
        // Ignore errors when closing the connection.
    }

    return true;
}

/**
 * Writes a warning if the database connection is not available.
 * @param {*} options - Optional dependencies for testing.
 * @returns {Promise<boolean>} True if the connection is active.
 */
async function warnIfDatabaseInactive({
    checkConnection = checkDatabaseConnection,
    logger = console,
} = {}) {
    let isActive = false;

    try {
        isActive = await checkConnection();
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        logger.debug(`Database connection check failed: ${error.message}`);
    }

    if (!isActive) logger.warn(DATABASE_INACTIVE_MESSAGE);

    return isActive;
}

module.exports = {
    DATABASE_INACTIVE_MESSAGE,
    checkDatabaseConnection,
    warnIfDatabaseInactive
};
