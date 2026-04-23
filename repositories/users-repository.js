'use strict';

const defaultPrisma = require('../prisma/client');

function createUsersRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    async function findByEmail(email) {
        return deps.prisma.user.findFirst({
            where: { email },
            select: {
                idUser: true,
                email: true,
                password: true,
                role: true
            }
        });
    }

    async function createUser({ email, password, role }) {
        const data = { email, password };
        if (typeof role === 'string' && role.length > 0)
            data.role = role;

        return deps.prisma.user.create({ data });
    }

    async function updatePassword(idUser, password) {
        return deps.prisma.user.update({
            where: { idUser },
            data: { password }
        });
    }

    async function setRole(idUser, role) {
        return deps.prisma.user.update({
            where: { idUser },
            data: { role }
        });
    }

    return {
        findByEmail,
        createUser,
        updatePassword,
        setRole
    };
}

module.exports = {
    createUsersRepository
};
