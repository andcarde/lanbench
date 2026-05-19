'use strict';

/**
 * @file Health-check de la base de datos.
 *
 * Expone `warnIfDatabaseInactive` (mostrar warning amigable en consola al
 * arrancar) y los helpers que comprueban conectividad delegando en
 * `mysql2`. Mantiene los efectos secundarios (logs) separados de la pura
 * deteccion para facilitar tests.
 */

const config = require('../config');

const DATABASE_INACTIVE_MESSAGE =
    'ERROR: La conexión a la base de datos está inactiva.';

/**
 * Comprueba si la base de datos configurada acepta conexiones.
 * @param {*} options - Dependencias opcionales para pruebas.
 * @returns {Promise<boolean>} True si la conexion esta activa.
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
 * Implementacion por defecto usando el driver mariadb (promesas).
 * @param {*} connectionConfig - Configuracion de conexion.
 * @returns {Promise<boolean>} True si la conexion se establece y cierra sin error.
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
        // Ignorar errores al cerrar la conexion.
    }

    return true;
}

/**
 * Escribe una advertencia si la conexion a base de datos no esta disponible.
 * @param {*} options - Dependencias opcionales para pruebas.
 * @returns {Promise<boolean>} True si la conexion esta activa.
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
