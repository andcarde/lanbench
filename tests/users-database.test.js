'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const mysql = require('mysql');

const config = require('../config');
const { app } = require('../app');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;
const before = global.before || testApi.before;
const after = global.after || testApi.after;

let baseUrl = '';
let httpServer = null;

describe('users database integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    let testEmail;

    before(async () => {
        const freePort = await getFreePort();
        baseUrl = `http://127.0.0.1:${freePort}`;

        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => {
                if (error)
                    return reject(error);
                return resolve();
            });
        });
    });

    after(async () => {
        if (!httpServer)
            return;

        await new Promise(resolve => {
            httpServer.close(() => resolve());
        });
    });

    it('registers, logs in, logs out and deletes a user', async () => {
        testEmail = `integration_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
        const password = 'integrationPass99';

        await dbQuery('DELETE FROM `User` WHERE `email` = ?', [testEmail]);

        const registerResponse = await fetch(`${baseUrl}/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                surname: 'Andres',
                lastName: 'Garcia',
                email: testEmail,
                password,
                repeatPassword: password
            })
        });

        assert.equal(registerResponse.status, 201);

        const registerPayload = await registerResponse.json();
        assert.equal(registerPayload.message, 'User validated correctly.');

        const loginResponse = await fetch(`${baseUrl}/crear-sesion`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: testEmail,
                password
            })
        });

        assert.equal(loginResponse.status, 200);
        const loginPayload = await loginResponse.json();
        assert.equal(loginPayload.redirectUrl, '/tasks');

        const sessionCookie = getSessionCookie(loginResponse);
        assert.ok(sessionCookie, 'No se recibio cookie de sesion en el login.');

        const logoutResponse = await fetch(`${baseUrl}/cerrar-sesion`, {
            method: 'GET',
            headers: {
                cookie: sessionCookie
            },
            redirect: 'manual'
        });

        assert.ok(
            [302, 303].includes(logoutResponse.status),
            `Estado inesperado al cerrar sesion: ${logoutResponse.status}`
        );
        assert.equal(logoutResponse.headers.get('location'), '/login');

        const protectedResponseAfterLogout = await fetch(`${baseUrl}/tasks`, {
            method: 'GET',
            headers: {
                cookie: sessionCookie
            },
            redirect: 'manual'
        });

        assert.ok(
            [302, 303].includes(protectedResponseAfterLogout.status),
            `Estado inesperado accediendo a /tasks tras logout: ${protectedResponseAfterLogout.status}`
        );
        assert.equal(protectedResponseAfterLogout.headers.get('location'), '/login');

        const deleteResult = await dbQuery('DELETE FROM `User` WHERE `email` = ?', [testEmail]);
        assert.ok(
            deleteResult.affectedRows > 0,
            'No se pudo borrar el usuario de prueba en la base de datos.'
        );
    });
});

function getSessionCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        const session = cookies.find(cookie => cookie.startsWith('connect.sid='));
        return session ? session.split(';')[0] : null;
    }

    const setCookie = response.headers.get('set-cookie');
    if (!setCookie)
        return null;

    const sessionMatch = setCookie.match(/connect\.sid=[^;]+/);
    return sessionMatch ? sessionMatch[0] : null;
}

function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        const connection = mysql.createConnection({
            host: config.mysql.host,
            user: config.mysql.user,
            password: config.mysql.password,
            database: config.mysql.database,
            port: config.mysql.port
        });

        connection.connect(error => {
            if (error) {
                connection.end(() => {});
                return reject(error);
            }

            connection.query(sql, params, (queryError, result) => {
                connection.end(() => {});
                if (queryError)
                    return reject(queryError);
                return resolve(result);
            });
        });
    });
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => {
                if (error)
                    return reject(error);

                if (!address || typeof address !== 'object')
                    return reject(new Error('No se pudo resolver un puerto libre.'));

                return resolve(address.port);
            });
        });
        server.on('error', reject);
    });
}
