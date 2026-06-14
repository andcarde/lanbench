'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSecretCrypto } = require('../../../utils/secret-crypto');
const config = require('../../../config');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const SECRET = 'a-stable-test-secret-value-1234567890';

describe('secret-crypto (T2)', () => {
    it('round-trips unicode and long strings', () => {
        const crypto = createSecretCrypto({ secret: SECRET });
        const plain = `gsk_live_ABCdef_üñîçødé_${'x'.repeat(500)}`;

        const cipher = crypto.encryptSecret(plain);
        assert.notEqual(cipher, plain);
        assert.equal(cipher.split(':').length, 3);
        assert.equal(crypto.decryptSecret(cipher), plain);
    });

    it('produces a different ciphertext each time (random IV) but decrypts to the same value', () => {
        const crypto = createSecretCrypto({ secret: SECRET });
        const a = crypto.encryptSecret('same-value');
        const b = crypto.encryptSecret('same-value');

        assert.notEqual(a, b);
        assert.equal(crypto.decryptSecret(a), 'same-value');
        assert.equal(crypto.decryptSecret(b), 'same-value');
    });

    it('throws when the ciphertext is tampered with (GCM authentication)', () => {
        const crypto = createSecretCrypto({ secret: SECRET });
        const parts = crypto.encryptSecret('secret-key-value').split(':');
        const ciphertext = Buffer.from(parts[2], 'base64');
        ciphertext[0] ^= 0xff;
        parts[2] = ciphertext.toString('base64');

        assert.throws(() => crypto.decryptSecret(parts.join(':')));
    });

    it('throws when the auth tag is tampered with', () => {
        const crypto = createSecretCrypto({ secret: SECRET });
        const parts = crypto.encryptSecret('secret-key-value').split(':');
        const authTag = Buffer.from(parts[1], 'base64');
        authTag[0] ^= 0xff;
        parts[1] = authTag.toString('base64');

        assert.throws(() => crypto.decryptSecret(parts.join(':')));
    });

    it('throws on a malformed payload', () => {
        const crypto = createSecretCrypto({ secret: SECRET });
        assert.throws(() => crypto.decryptSecret('not-a-valid-payload'), /Formato/);
    });

    it('fails explicitly when no secret is configured', () => {
        // `secret: ''` is treated as "not provided" and falls back to the
        // configured secret, so neutralise the config-level fallback to genuinely
        // exercise the no-secret-anywhere path (otherwise a populated .env masks it).
        const savedKey = config.credentials.encryptionKey;
        config.credentials.encryptionKey = '';
        try {
            const crypto = createSecretCrypto({ secret: '' });
            assert.throws(() => crypto.encryptSecret('x'), /secreto de cifrado/);
            assert.throws(() => crypto.decryptSecret('a:b:c'), /secreto de cifrado/);
        } finally {
            config.credentials.encryptionKey = savedKey;
        }
    });

    it('a credential encrypted with one secret cannot be decrypted with another', () => {
        const a = createSecretCrypto({ secret: SECRET });
        const other = createSecretCrypto({ secret: 'a-completely-different-secret-0987654321' });
        const cipher = a.encryptSecret('top-secret');

        assert.throws(() => other.decryptSecret(cipher));
    });
});
