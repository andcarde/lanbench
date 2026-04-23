'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const mysql = require('mysql');

const config = require('../config');
const { app } = require('../app');
const { createPasswordHasher } = require('../services/password-hasher');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;
const before = global.before || testApi.before;
const after = global.after || testApi.after;

let baseUrl = '';
let httpServer = null;
const passwordHasher = createPasswordHasher();

describe('login session integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    let testEmail = '';
    let testUserId = 0;
    let sessionId = '';

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
        if (sessionId)
            await dbQuery('DELETE FROM `sessions` WHERE `session_id` = ?', [sessionId]);

        if (testEmail)
            await dbQuery('DELETE FROM `User` WHERE `email` = ?', [testEmail]);

        if (!httpServer)
            return;

        await new Promise(resolve => {
            httpServer.close(() => resolve());
        });
    });

    it('stores request.session.user after successful login', async () => {
        testEmail = `login_session_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
        testUserId = buildTestUserId();
        const password = 'integrationPass99';
        const passwordHash = await passwordHasher.hashPassword(password);

        await dbQuery('DELETE FROM `User` WHERE `email` = ? OR `idUser` = ?', [testEmail, testUserId]);
        await dbQuery(
            'INSERT INTO `User` (`idUser`, `email`, `password`) VALUES (?, ?, ?)',
            [testUserId, testEmail, passwordHash]
        );

        const loginResponse = await fetch(`${baseUrl}/create-session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: testEmail,
                password
            })
        });
        assert.equal(loginResponse.status, 200);

        const sessionSetCookie = getSessionSetCookie(loginResponse);
        assert.ok(sessionSetCookie, 'No se recibio cabecera Set-Cookie en el login.');
        assert.match(sessionSetCookie, /HttpOnly/i);
        assert.match(sessionSetCookie, /SameSite=Lax/i);
        assert.doesNotMatch(sessionSetCookie, /;\s*Secure/i);

        const sessionCookie = getSessionCookie(loginResponse);
        assert.ok(sessionCookie, 'No se recibio cookie de sesion en el login.');

        sessionId = extractSessionId(sessionCookie);
        assert.ok(sessionId, 'No se pudo extraer session_id de la cookie.');

        const rows = await dbQuery(
            'SELECT `data` FROM `sessions` WHERE `session_id` = ? LIMIT 1',
            [sessionId]
        );
        assert.equal(rows.length, 1, 'No se encontro la sesion en la tabla sessions.');

        const sessionData = JSON.parse(rows[0].data);
        assert.ok(sessionData.user, 'No existe user en request.session.');
        assert.equal(sessionData.user.email, testEmail);
        assert.equal(sessionData.user.idUser, testUserId);
        assert.equal(typeof sessionData.user.idUser, 'number');
    });
});

function buildTestUserId() {
    return 1000000 + Math.floor(Math.random() * 1000000);
}

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

function getSessionSetCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        return cookies.find(cookie => cookie.startsWith('connect.sid=')) || null;
    }

    return response.headers.get('set-cookie');
}

function extractSessionId(sessionCookie) {
    const rawValue = sessionCookie.replace(/^connect\.sid=/, '');
    const decoded = decodeURIComponent(rawValue);
    const unsigned = decoded.startsWith('s:') ? decoded.slice(2) : decoded;
    const separator = unsigned.indexOf('.');
    if (separator <= 0)
        return '';
    return unsigned.slice(0, separator);
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
