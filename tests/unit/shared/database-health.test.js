'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    DATABASE_INACTIVE_MESSAGE,
    checkDatabaseConnection,
    warnIfDatabaseInactive
} = require('../../../utils/database-health');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('database health', () => {
    it('checkDatabaseConnection devuelve true cuando la conexión se abre', async () => {
        const result = await checkDatabaseConnection({
            mysqlClient: createMysqlClientStub(null)
        });

        assert.equal(result, true);
    });

    it('checkDatabaseConnection devuelve false cuando la conexión falla', async () => {
        const result = await checkDatabaseConnection({
            mysqlClient: createMysqlClientStub(new Error('ECONNREFUSED'))
        });

        assert.equal(result, false);
    });

    it('warnIfDatabaseInactive muestra el mensaje pedido si la conexión no está activa', async () => {
        /** @type {any[]} */
        const warnings = [];
        const result = await warnIfDatabaseInactive({
            checkConnection: async () => false,
            logger: {
                warn(/** @type {*} */ message) {
                    warnings.push(message);
                }
            }
        });

        assert.equal(result, false);
        assert.deepEqual(warnings, [DATABASE_INACTIVE_MESSAGE]);
    });

    it('warnIfDatabaseInactive no avisa si la conexión está activa', async () => {
        /** @type {any[]} */
        const warnings = [];
        const result = await warnIfDatabaseInactive({
            checkConnection: async () => true,
            logger: {
                warn(/** @type {*} */ message) {
                    warnings.push(message);
                }
            }
        });

        assert.equal(result, true);
        assert.deepEqual(warnings, []);
    });
});

/**
 * Creates a minimal mysql client stub to test connectivity.
 * @param {*} connectError - Error that connection.connect will return.
 * @returns {*} Simulated mysql client.
 */
function createMysqlClientStub(connectError) {
    return {
        createConnection() {
            return {
                connect(/** @type {*} */ callback) {
                    callback(connectError);
                },
                end(/** @type {*} */ callback) {
                    callback();
                }
            };
        }
    };
}
