'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { sanitizePayload } = require('../../../middlewares/request-log-middleware');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('request-log redaction (T8)', () => {
    it('redacts AI credential secrets (apiKey/api_key/credential) and the legacy ones', () => {
        const sanitized = /** @type {any} */ (sanitizePayload({
            provider: 'groq',
            apiKey: 'gsk_live_secret',
            api_key: 'another_secret',
            credential: 'opaque',
            password: 'p',
            token: 't'
        }));

        assert.equal(sanitized.apiKey, '[REDACTED]');
        assert.equal(sanitized.api_key, '[REDACTED]');
        assert.equal(sanitized.credential, '[REDACTED]');
        assert.equal(sanitized.password, '[REDACTED]');
        assert.equal(sanitized.token, '[REDACTED]');
        assert.equal(sanitized.provider, 'groq');
    });

    it('does NOT redact the legitimate masked field keyLast4 (no bare "key" token)', () => {
        const sanitized = /** @type {any} */ (sanitizePayload({
            keyLast4: 'ab12',
            model: 'llama-3.3-70b',
            apiBase: 'https://api.groq.com/openai/v1'
        }));

        assert.equal(sanitized.keyLast4, 'ab12');
        assert.equal(sanitized.model, 'llama-3.3-70b');
        assert.equal(sanitized.apiBase, 'https://api.groq.com/openai/v1');
    });

    it('returns non-object payloads unchanged', () => {
        assert.equal(sanitizePayload(null), null);
        assert.equal(sanitizePayload('text'), 'text');
    });
});
