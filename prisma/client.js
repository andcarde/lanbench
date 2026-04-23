'use strict';

const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const config = require('../config');

if (!global.__lanbenchPrismaClient) {
    const adapter = new PrismaMariaDb({
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database
    });

    global.__lanbenchPrismaClient = new PrismaClient({ adapter });
}

module.exports = global.__lanbenchPrismaClient;
