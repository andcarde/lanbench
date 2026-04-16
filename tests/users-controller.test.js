'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const { mock, instance, when, verify, capture, anything } = require('ts-mockito');

const usersController = require('../business/users-controller');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;
const afterEach = global.afterEach || testApi.afterEach;

class ConnectionDouble {
    query(sql, params, callback) {}

    release() {}
}

class PoolDouble {
    getConnection(callback) {}
}

class ResponseDouble {
    status(code) {
        return this;
    }

    json(payload) {
        return this;
    }
}

afterEach(() => {
    usersController.__resetDependenciesForTests();
});

function createResponse() {
    const responseMock = mock(ResponseDouble);
    const response = instance(responseMock);
    when(responseMock.status(anything())).thenReturn(response);
    when(responseMock.json(anything())).thenReturn(response);
    return { responseMock, response };
}

function wireMockedPool(connection) {
    const poolMock = mock(PoolDouble);
    when(poolMock.getConnection(anything())).thenCall(callback => callback(null, connection));
    const pool = instance(poolMock);

    usersController.__setDependenciesForTests({
        getConnection: pool.getConnection.bind(pool)
    });

    return poolMock;
}

describe('users-controller MySQL + Mockito tests', () => {
    it('register inserts a new user in MySQL when email is available', async () => {
        const connectionMock = mock(ConnectionDouble);
        when(connectionMock.release()).thenReturn();

        const sqlQueue = [
            {
                sql: 'SELECT `idUser` FROM `User` WHERE `email` = ? LIMIT 1',
                params: ['test@example.com'],
                rows: []
            },
            {
                sql: 'SELECT COALESCE(MAX(`idUser`), 0) + 1 AS `nextId` FROM `User`',
                params: [],
                rows: [{ nextId: 1 }]
            },
            {
                sql: 'INSERT INTO `User` (`idUser`, `email`, `password`) VALUES (?, ?, ?)',
                params: [1, 'test@example.com', 'supersecret99'],
                rows: { affectedRows: 1 }
            }
        ];

        when(connectionMock.query(anything(), anything(), anything())).thenCall((sql, params, callback) => {
            const expected = sqlQueue.shift();
            assert.ok(expected, 'Unexpected SQL query call.');
            assert.equal(sql, expected.sql);
            assert.deepEqual(params, expected.params);
            callback(null, expected.rows);
        });

        const connection = instance(connectionMock);
        const poolMock = wireMockedPool(connection);

        const { responseMock, response } = createResponse();
        const request = {
            body: {
                surname: 'Garcia',
                lastName: 'Lopez',
                email: 'Test@Example.com',
                password: 'supersecret99',
                repeatPassword: 'supersecret99'
            },
            session: {}
        };

        await usersController.register(request, response);

        assert.equal(sqlQueue.length, 0);
        verify(poolMock.getConnection(anything())).once();
        verify(connectionMock.release()).once();
        verify(responseMock.status(201)).once();

        const payload = capture(responseMock.json).last()[0];
        assert.deepEqual(payload, {
            title: 'Register completed',
            message: 'User validated correctly.'
        });
    });

    it('register returns conflict when email already exists in MySQL', async () => {
        const connectionMock = mock(ConnectionDouble);
        when(connectionMock.release()).thenReturn();

        when(connectionMock.query(anything(), anything(), anything())).thenCall((sql, params, callback) => {
            assert.equal(sql, 'SELECT `idUser` FROM `User` WHERE `email` = ? LIMIT 1');
            assert.deepEqual(params, ['taken@example.com']);
            callback(null, [{ idUser: 9 }]);
        });

        const connection = instance(connectionMock);
        wireMockedPool(connection);

        const { responseMock, response } = createResponse();
        const request = {
            body: {
                surname: 'Maria',
                lastName: 'Perez',
                email: 'taken@example.com',
                password: 'supersecret99',
                repeatPassword: 'supersecret99'
            },
            session: {}
        };

        await usersController.register(request, response);

        verify(connectionMock.query(anything(), anything(), anything())).once();
        verify(connectionMock.release()).once();
        verify(responseMock.status(409)).once();

        const payload = capture(responseMock.json).last()[0];
        assert.deepEqual(payload, { message: 'Email already registered.' });
    });

    it('login validates credentials against MySQL and creates session', async () => {
        const connectionMock = mock(ConnectionDouble);
        when(connectionMock.release()).thenReturn();

        when(connectionMock.query(anything(), anything(), anything())).thenCall((sql, params, callback) => {
            assert.equal(sql, 'SELECT `idUser`, `email`, `password` FROM `User` WHERE `email` = ? LIMIT 1');
            assert.deepEqual(params, ['test@example.com']);
            callback(null, [{ idUser: 7, email: 'test@example.com', password: 'supersecret99' }]);
        });

        const connection = instance(connectionMock);
        wireMockedPool(connection);

        const { responseMock, response } = createResponse();
        const request = {
            body: {
                email: 'test@example.com',
                password: 'supersecret99'
            },
            session: {}
        };

        await usersController.login(request, response);

        verify(connectionMock.release()).once();
        verify(responseMock.status(200)).once();
        assert.deepEqual(request.session.usuario, {
            id: 7,
            email: 'test@example.com',
            active: true
        });

        const payload = capture(responseMock.json).last()[0];
        assert.deepEqual(payload, { redirectUrl: '/tasks' });
    });

    it('login returns unauthorized when credentials are invalid', async () => {
        const connectionMock = mock(ConnectionDouble);
        when(connectionMock.release()).thenReturn();

        when(connectionMock.query(anything(), anything(), anything())).thenCall((sql, params, callback) => {
            assert.equal(sql, 'SELECT `idUser`, `email`, `password` FROM `User` WHERE `email` = ? LIMIT 1');
            assert.deepEqual(params, ['missing@example.com']);
            callback(null, []);
        });

        const connection = instance(connectionMock);
        wireMockedPool(connection);

        const { responseMock, response } = createResponse();
        const request = {
            body: {
                email: 'missing@example.com',
                password: 'supersecret99'
            },
            session: {}
        };

        await usersController.login(request, response);

        verify(connectionMock.release()).once();
        verify(responseMock.status(401)).once();
        assert.equal(request.session.usuario, undefined);

        const payload = capture(responseMock.json).last()[0];
        assert.deepEqual(payload, {
            title: 'Login incorrecto',
            message: 'La contraseña no se corresponde con el usuario proporcionado.'
        });
    });
});
