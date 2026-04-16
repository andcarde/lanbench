
// pool.js
"use strict"

const config = require('./config');
const mysql = require('mysql');
const pool = mysql.createPool({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database
});

const getConnection = (callback) => {
    pool.getConnection((error, connection) => {
        callback(error, connection);
    });
}

module.exports = getConnection;