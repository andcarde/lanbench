// @ts-nocheck
/**
 * @file Frontend de `public/register.html`.
 *
 * Maneja la validacion del formulario (incluido el codigo de moderador de
 * 16 caracteres, con autofocus por celda) y dispara dos rutas distintas:
 * `/register` para usuarios normales y `/register/moderator` cuando se
 * informa un codigo valido.
 */
$(document).ready(function () {
    const CODE_LENGTH = 16;
    const CODE_CHAR_REGEX = /^[A-Za-z0-9]$/;
    const CODE_FULL_REGEX = /^[A-Za-z0-9]{16}$/;

    const registerForm = $('#registerForm');
    const registerToast = $('#registerToast');
    const toastMessage = $('#toastMessage');
    const registerError = $('#registerError');
    const moderatorToggle = $('#moderatorToggle');
    const moderatorCodeRow = $('#moderatorCodeRow');
    const moderatorCode = $('#moderatorCode');
    const moderatorCodeError = $('#moderatorCodeError');

    moderatorToggle.on('change', function () {
        const enabled = $(this).is(':checked');
        if (enabled) {
            moderatorCodeRow.removeAttr('hidden');
            return;
        }
        moderatorCodeRow.attr('hidden', '');
        moderatorCode.val('');
        hideModeratorCodeError();
    });

    moderatorCode.on('keypress', function (event) {
        if (event.which === 0 || event.ctrlKey || event.metaKey)
            return;
        const character = String.fromCharCode(event.which);
        if (!CODE_CHAR_REGEX.test(character))
            event.preventDefault();
    });

    moderatorCode.on('paste', function (event) {
        const clipboardData = (event.originalEvent || event).clipboardData
            || globalThis.clipboardData;
        if (!clipboardData)
            return;
        event.preventDefault();
        const pasted = String(clipboardData.getData('text') || '');
        const filtered = pasted.replace(/[^A-Za-z0-9]/g, '');
        const current = String(moderatorCode.val() || '');
        const selectionStart = this.selectionStart || current.length;
        const selectionEnd = this.selectionEnd || current.length;
        const merged = (
            current.slice(0, selectionStart)
            + filtered
            + current.slice(selectionEnd)
        ).slice(0, CODE_LENGTH);
        moderatorCode.val(merged);
    });

    registerForm.on('submit', function (event) {
        event.preventDefault();

        hideError();
        hideModeratorCodeError();

        const isModeratorMode = moderatorToggle.is(':checked');

        const payload = {
            surname: $('#surname').val().trim(),
            lastName: $('#lastName').val().trim(),
            email: $('#email').val().trim(),
            password: $('#password').val(),
            repeatPassword: $('#repeatPassword').val()
        };

        const validationError = validatePayload(payload);
        if (validationError) {
            showError(validationError);
            showToast(validationError, 'danger');
            return;
        }

        let request;
        if (isModeratorMode) {
            const code = String(moderatorCode.val() || '');
            const codeError = validateCode(code);
            if (codeError) {
                showError(codeError);
                showModeratorCodeError(codeError);
                showToast(codeError, 'danger');
                return;
            }
            request = globalThis.RegisterActions.submitModeratorRegister({
                ...payload,
                code
            });
        } else {
            request = globalThis.RegisterActions.submitRegister(payload);
        }

        request.then(function (result) {
            if (result.ok) {
                const successMessage = (result.data && result.data.message)
                    || 'Register successful.';
                showToast(successMessage, 'success');
                registerForm[0].reset();
                moderatorCodeRow.attr('hidden', '');
                setTimeout(function () {
                    globalThis.location.href = '/login';
                }, 1000);
                return;
            }

            const failureMessage = (result.data && result.data.message)
                || 'There was an error during register.';
            showError(failureMessage);
            if (isModeratorMode && result.status === 400
                && failureMessage === 'Invalid moderator register code.')
                showModeratorCodeError(failureMessage);
            showToast(failureMessage, 'danger');
        }).catch(function () {
            const message = 'There was an error during register.';
            showError(message);
            showToast(message, 'danger');
        });
    });

    /**
     * Comprueba validate payload y devuelve el resultado de la validacion.
     * @param {*} payload - Valor de payload usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function validatePayload(payload) {
        const alphaRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ]+$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!isValidAlphabeticField(payload.surname, alphaRegex))
            return 'Surname must contain only alphabetic characters and be 1 to 64 characters long.';

        if (!isValidAlphabeticField(payload.lastName, alphaRegex))
            return 'Last name must contain only alphabetic characters and be 1 to 64 characters long.';

        if (!emailRegex.test(payload.email))
            return 'Email format is invalid.';

        if (!isValidPassword(payload.password))
            return 'Password must be longer than 8 characters and at most 64 characters.';

        if (payload.repeatPassword !== payload.password)
            return 'Repeat password must match password.';

        return null;
    }

    /**
     * Valida el codigo de moderador y devuelve el mensaje de error correspondiente.
     * @param {string} code - Codigo introducido por el usuario.
     * @returns {?string} Mensaje de error o null si es valido.
     */
    function validateCode(code) {
        if (typeof code !== 'string' || code.length !== CODE_LENGTH)
            return 'Moderator register code must be exactly 16 characters long.';

        if (!CODE_FULL_REGEX.test(code))
            return 'Moderator register code must contain only letters and digits.';

        return null;
    }

    /**
     * Comprueba is valid alphabetic field y devuelve el resultado de la validacion.
     * @param {*} value - Valor de value usado por la funcion.
     * @param {*} alphaRegex - Valor de alphaRegex usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function isValidAlphabeticField(value, alphaRegex) {
        return (
            typeof value === 'string'
            && value.length > 0
            && value.length <= 64
            && alphaRegex.test(value)
        );
    }

    /**
     * Comprueba is valid password y devuelve el resultado de la validacion.
     * @param {*} value - Valor de value usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function isValidPassword(value) {
        return typeof value === 'string' && value.length > 8 && value.length <= 64;
    }

    /**
     * Actualiza error con los datos indicados.
     * @param {string} message - Valor de message usado por la funcion.
     */
    function showError(message) {
        registerError.text(message);
        registerError.removeClass('d-none');
    }

    /**
     * Actualiza error con los datos indicados.
     */
    function hideError() {
        registerError.addClass('d-none');
        registerError.text('');
    }

    /**
     * Muestra el error inline asociado al campo del codigo de moderador.
     * @param {string} message - Mensaje a mostrar.
     */
    function showModeratorCodeError(message) {
        moderatorCodeError.text(message);
        moderatorCodeError.removeClass('d-none');
    }

    /**
     * Oculta y limpia el error inline del codigo de moderador.
     */
    function hideModeratorCodeError() {
        moderatorCodeError.addClass('d-none');
        moderatorCodeError.text('');
    }

    /**
     * Actualiza toast con los datos indicados.
     * @param {string} message - Valor de message usado por la funcion.
     * @param {string} type - Valor de type usado por la funcion.
     */
    function showToast(message, type) {
        toastMessage.text(message);
        registerToast
            .removeClass('text-bg-dark text-bg-success text-bg-danger')
            .addClass('text-bg-' + type);
        const bsToast = new bootstrap.Toast(registerToast[0]);
        bsToast.show();
    }
});
