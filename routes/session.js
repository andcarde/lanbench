
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
    database: mysql.database,
    port: mysql.port
});

const middlewareSession = session ({
    saveUninitialized: false,
    secret: config.session.secret,
    resave: false,
    store: sessionStore,
    cookie: config.session.cookie
});

module.exports = middlewareSession;
