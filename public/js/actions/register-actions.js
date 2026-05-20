// @ts-nocheck
/**
 * @file Registration form actions (AJAX).
 *
 * Sends `POST /register` for normal users and `POST /register/moderator` when
 * there is an invitation code.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.RegisterActions = api;
})(typeof self !== 'undefined' ? self : this, function () {
    /**
     * Performs a JSON call against the server and returns { ok, status, data }.
     * The caller decides how to map errors to the UI.
     * @param {string} url - Absolute or relative URL to call.
     * @param {*} options - Fetch options (method, body, headers).
     * @returns {Promise<*>} Normalized result of the call.
     */
    async function callJson(url, options = {}) {
        const fetchImpl = typeof fetch === 'function' ? fetch : null;
        if (!fetchImpl)
            throw new Error('fetch is not available');

        const response = await fetchImpl(url, {
            credentials: 'same-origin',
            ...options,
            headers: {
                Accept: 'application/json',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {})
            }
        });

        const text = await response.text();
        let data = null;
        if (text) {
            try { data = JSON.parse(text); }
            catch { data = text; }
        }
        return { ok: response.ok, status: response.status, data };
    }

    /**
     * Sends the standard registration request (normal user).
     * @param {*} payload - Registration form body.
     * @returns {Promise<*>} Normalized result of the call.
     */
    function submitRegister(payload) {
        return callJson('/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Sends the moderator registration request with the single-use code.
     * @param {*} payload - Registration form body plus the `code` field.
     * @returns {Promise<*>} Normalized result of the call.
     */
    function submitModeratorRegister(payload) {
        return callJson('/register/moderator', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    return {
        submitRegister,
        submitModeratorRegister
    };
});
