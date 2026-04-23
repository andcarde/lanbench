'use strict';

class User {
    constructor({ idUser, email, role }) {
        this.idUser = normalizeIdUser(idUser);
        this.email = normalizeEmail(email);
        this.role = normalizeRole(role);
    }

    static fromPersistence(source) {
        return new User({
            idUser: source && source.idUser,
            email: source && source.email,
            role: source && source.role
        });
    }

    static fromSession(source) {
        if (!source || typeof source !== 'object')
            return null;

        const user = new User({
            idUser: source.idUser,
            email: source.email,
            role: source.role
        });

        return user.isValid() ? user : null;
    }

    isValid() {
        return Number.isInteger(this.idUser)
            && this.idUser > 0
            && typeof this.email === 'string'
            && this.email.length > 0;
    }

    toSession() {
        if (!this.isValid())
            throw new Error('Cannot serialize an invalid user.');

        return {
            idUser: this.idUser,
            email: this.email,
            role: this.role
        };
    }
}

function normalizeIdUser(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

function normalizeEmail(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim().toLowerCase();
}

function normalizeRole(value) {
    if (typeof value === 'string' && value.trim().length > 0)
        return value.trim();
    return 'annotator';
}

module.exports = { User };
