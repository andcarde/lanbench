'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { app } = require('../app');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;
const before = global.before || testApi.before;
const after = global.after || testApi.after;

let baseUrl = '';
let httpServer = null;

describe('auth routing boundary', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

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

    it('redirige a /login cuando un navegador accede sin sesión a páginas privadas', async () => {
        const paths = [
            '/tasks',
            '/datasets/1/view',
            '/annotations'
        ];

        for (const path of paths) {
            const response = await fetch(`${baseUrl}${path}`, {
                redirect: 'manual'
            });

            assert.ok(
                [302, 303].includes(response.status),
                `Estado inesperado para ${path}: ${response.status}`
            );
            assert.equal(response.headers.get('location'), '/login');
        }
    });

    it('responde 401 JSON cuando un cliente API accede sin sesión a endpoints privados', async () => {
        const requests = [
            { path: '/api/datasets', method: 'GET' },
            { path: '/api/annotations/check', method: 'POST', body: { sentences: ['hola'], entryContext: null } },
            { path: '/api/administrator/logout', method: 'POST', body: {} }
        ];

        for (const requestSpec of requests) {
            const response = await fetch(`${baseUrl}${requestSpec.path}`, {
                method: requestSpec.method,
                headers: requestSpec.body
                    ? { 'content-type': 'application/json' }
                    : undefined,
                body: requestSpec.body ? JSON.stringify(requestSpec.body) : undefined,
                redirect: 'manual'
            });

            assert.equal(response.status, 401, `Estado inesperado para ${requestSpec.path}`);
            assert.match(response.headers.get('content-type') || '', /application\/json/);

            const payload = await response.json();
            assert.deepEqual(payload, {
                message: 'Es necesario iniciar sesión.',
                redirectTo: '/login'
            });
        }
    });
});

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
