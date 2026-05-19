'use strict';

const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const config = require('../config');

const globalRef = /** @type {any} */ (globalThis);
if (!globalRef.__lanbenchPrismaClient) {
    const adapter = new PrismaMariaDb({
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database
    });

    globalRef.__lanbenchPrismaClient = new PrismaClient({ adapter });
}

module.exports = globalRef.__lanbenchPrismaClient;
