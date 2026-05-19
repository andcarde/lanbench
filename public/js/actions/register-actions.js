// @ts-nocheck
/**
 * @file Acciones (AJAX) del formulario de registro.
 *
 * Envia `POST /register` para usuarios normales y
 * `POST /register/moderator` cuando hay codigo de invitacion.
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
     * Ejecuta una llamada JSON contra el servidor y devuelve { ok, status, data }.
     * El caller decide como mapear errores a UI.
     * @param {string} url - URL absoluta o relativa a invocar.
     * @param {*} options - Opciones de fetch (method, body, headers).
     * @returns {Promise<*>} Resultado normalizado de la llamada.
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
            catch (_e) { data = text; }
        }
        return { ok: response.ok, status: response.status, data };
    }

    /**
     * Envia la peticion de registro estandar (usuario normal).
     * @param {*} payload - Cuerpo del formulario de registro.
     * @returns {Promise<*>} Resultado normalizado de la llamada.
     */
    function submitRegister(payload) {
        return callJson('/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Envia la peticion de registro como moderador con el codigo de un solo uso.
     * @param {*} payload - Cuerpo del formulario de registro mas el campo code.
     * @returns {Promise<*>} Resultado normalizado de la llamada.
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
