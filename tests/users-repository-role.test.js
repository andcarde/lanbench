'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersRepository } = require('../repositories/users-repository');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('users-repository role projection', () => {
    it('findByEmail incluye role en el select de Prisma', async () => {
        const capturedArgs = [];
        const fakePrisma = {
            user: {
                async findFirst(args) {
                    capturedArgs.push(args);
                    return {
                        idUser: 1,
                        email: 'admin@example.com',
                        password: 'hashed',
                        role: 'admin'
                    };
                },
                async create() { throw new Error('not used'); },
                async update() { throw new Error('not used'); }
            }
        };

        const repository = createUsersRepository({ prisma: fakePrisma });

        const user = await repository.findByEmail('admin@example.com');

        assert.equal(capturedArgs.length, 1);
        assert.deepEqual(capturedArgs[0], {
            where: { email: 'admin@example.com' },
            select: {
                idUser: true,
                email: true,
                password: true,
                role: true
            }
        });
        assert.equal(user.role, 'admin');
    });
});
