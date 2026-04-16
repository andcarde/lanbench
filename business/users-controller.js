'use strict';

const defaultGetConnection = require('../pool');

const dependencies = {
    getConnection: defaultGetConnection
};

async function register(request, response) {
    const payload = {
        surname: request.body.surname,
        lastName: request.body.lastName,
        email: request.body.email,
        password: request.body.password,
        repeatPassword: request.body.repeatPassword
    };

    const validationError = validateRegisterPayload(payload);
    if (validationError)
        return response.status(400).json({ message: validationError });

    const email = toTrimmedString(payload.email).toLowerCase();
    let connection;
    try {
        connection = await acquireConnection();

        const existingUsers = await runQuery(
            connection,
            'SELECT `idUser` FROM `User` WHERE `email` = ? LIMIT 1',
            [email]
        );
        if (existingUsers.length > 0)
            return response.status(409).json({ message: 'Email already registered.' });

        const nextIdRows = await runQuery(
            connection,
            'SELECT COALESCE(MAX(`idUser`), 0) + 1 AS `nextId` FROM `User`',
            []
        );
        const nextId = toPositiveInteger(nextIdRows[0] && nextIdRows[0].nextId, 1);

        await runQuery(
            connection,
            'INSERT INTO `User` (`idUser`, `email`, `password`) VALUES (?, ?, ?)',
            [nextId, email, payload.password]
        );

        return response.status(201).json({
            title: 'Register completed',
            message: 'User validated correctly.'
        });
    } catch (error) {
        return response.status(500).json({ message: 'Internal server error.' });
    } finally {
        releaseConnection(connection);
    }
}

async function login(request, response) {
    const email = toTrimmedString(request.body.email).toLowerCase();
    const password = toTrimmedString(request.body.password);

    if (!isValidEmail(email) || !isValidPassword(password))
        return response.status(400).json({ message: 'Invalid login payload.' });

    let connection;
    try {
        connection = await acquireConnection();

        const users = await runQuery(
            connection,
            'SELECT `idUser`, `email`, `password` FROM `User` WHERE `email` = ? LIMIT 1',
            [email]
        );

        const user = users[0];
        if (!user || user.password !== password)
            return response.status(401).json({
                title: 'Login incorrecto',
                message: 'La contraseña no se corresponde con el usuario proporcionado.'
            });

        request.session.usuario = {
            id: user.idUser,
            email: user.email,
            active: true
        };

        return response.status(200).json({ redirectUrl: '/tasks' });
    } catch (error) {
        return response.status(500).json({ message: 'Internal server error.' });
    } finally {
        releaseConnection(connection);
    }
}

function validateRegisterPayload(payload) {
    const alphaRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ]+$/;

    if (!isValidAlphabeticField(payload.surname, alphaRegex))
        return 'Surname must contain only alphabetic characters and be 1 to 64 characters long.';

    if (!isValidAlphabeticField(payload.lastName, alphaRegex))
        return 'Last name must contain only alphabetic characters and be 1 to 64 characters long.';

    if (!isValidEmail(payload.email))
        return 'Email format is invalid.';

    if (!isValidPassword(payload.password))
        return 'Password must be longer than 8 characters and at most 64 characters.';

    if (payload.repeatPassword !== payload.password)
        return 'Repeat password must match password.';

    return null;
}

function isValidAlphabeticField(value, alphaRegex) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= 64
        && alphaRegex.test(value);
}

function isValidEmail(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128)
        return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
}

function isValidPassword(value) {
    return typeof value === 'string'
        && value.length > 8
        && value.length <= 64;
}

function toTrimmedString(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim();
}

function toPositiveInteger(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return fallback;
    return parsed;
}

function acquireConnection() {
    return new Promise((resolve, reject) => {
        dependencies.getConnection((error, connection) => {
            if (error)
                return reject(error);
            return resolve(connection);
        });
    });
}

function runQuery(connection, sql, params) {
    return new Promise((resolve, reject) => {
        connection.query(sql, params, (error, rows) => {
            if (error)
                return reject(error);
            return resolve(rows || []);
        });
    });
}

function releaseConnection(connection) {
    if (connection && typeof connection.release === 'function')
        connection.release();
}

function setDependenciesForTests(customDependencies) {
    if (!customDependencies || typeof customDependencies !== 'object')
        return;

    if (typeof customDependencies.getConnection === 'function')
        dependencies.getConnection = customDependencies.getConnection;
}

function resetDependenciesForTests() {
    dependencies.getConnection = defaultGetConnection;
}

module.exports = {
    register,
    login,
    __setDependenciesForTests: setDependenciesForTests,
    __resetDependenciesForTests: resetDependenciesForTests
};
