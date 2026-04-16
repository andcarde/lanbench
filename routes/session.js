
// session.js
'use strict';

const config = require('../config.js');
const mysql = config.mysql;

// Últiles de sesiones
const session = require('express-session');
const mysqlsession = require('express-mysql-session');
const MySQLStore = mysqlsession(session);
const sessionStore = new MySQLStore({
    host: mysql.host,
    user: mysql.user,
    password: mysql.password,
    database: mysql.database
});

const middlewareSession = session ({
    saveUninitialized: false,
    secret:
        '276e8b1a915e1374464686627f666ae75cd4a725f8dedcd2c04c71a10d6b8ee8' +
        '6ef4cfa82515f03a577bf7879834bf9829257185e2c21a87ee81b897c2b08d07' +
        '9f1512db40f046ecd3b2800ee6493bce4e87aa2920fa1c346a0c88311a8e5379' +
        'fd3ad1fadf9ff6a815bb3b9424a39239a3a87c492f943ef9f6c8f55c82140939' +
        '8eeffc00baaf8d013f50d24186d85f712a7ac9d750dc960e55da83c69b35d016' +
        '8484fdffdd85d7516d44bb974da199a08c82c6ce65d4ceb185b74ae21de1143c' +
        '3ab3af1144ad54d2dce9a2e5da81c02c9ba6aba65e3d247dc1b2cc840715a085' +
        'd67f97fc65aed05389e7be5e78636935c40c2f446b3ad975f0864fd16bdd6a8e' +
        '3a233e6a7e7ab00f5ff19e3d3b9f3616bf0e6156d2a17b0cd9753f545bddc978' +
        'f7c349e505d7bafcbf82b441904989e1323c1d4f74d87ea5dd1c8457245d4b59',
    resave: false,
    store: sessionStore
});

module.exports = middlewareSession;