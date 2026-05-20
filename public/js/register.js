// @ts-nocheck
/**
 * @file Frontend for `public/register.html`.
 *
 * Handles form validation (including the 16-character moderator code, with
 * per-cell autofocus) and triggers two distinct routes: `/register` for normal
 * users and `/register/moderator` when a valid code is provided.
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
     * Validates the registration payload and returns an error message, or null if valid.
     * @param {*} payload - Form payload to validate.
     * @returns {?string} Error message, or null if the payload is valid.
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
     * Validates the moderator code and returns the corresponding error message.
     * @param {string} code - Code entered by the user.
     * @returns {?string} Error message, or null if valid.
     */
    function validateCode(code) {
        if (typeof code !== 'string' || code.length !== CODE_LENGTH)
            return 'Moderator register code must be exactly 16 characters long.';

        if (!CODE_FULL_REGEX.test(code))
            return 'Moderator register code must contain only letters and digits.';

        return null;
    }

    /**
     * Checks whether `value` is an alphabetic string of 1..64 characters.
     * @param {*} value - Value to check.
     * @param {*} alphaRegex - Regex of allowed alphabetic characters.
     * @returns {boolean} True if the value is valid.
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
     * Checks whether `value` is a valid password (9..64 characters).
     * @param {*} value - Value to check.
     * @returns {boolean} True if the password is valid.
     */
    function isValidPassword(value) {
        return typeof value === 'string' && value.length > 8 && value.length <= 64;
    }

    /**
     * Shows the form-level error message.
     * @param {string} message - Message to display.
     */
    function showError(message) {
        registerError.text(message);
        registerError.removeClass('d-none');
    }

    /**
     * Hides and clears the form-level error message.
     */
    function hideError() {
        registerError.addClass('d-none');
        registerError.text('');
    }

    /**
     * Shows the inline error associated with the moderator code field.
     * @param {string} message - Message to display.
     */
    function showModeratorCodeError(message) {
        moderatorCodeError.text(message);
        moderatorCodeError.removeClass('d-none');
    }

    /**
     * Hides and clears the moderator code inline error.
     */
    function hideModeratorCodeError() {
        moderatorCodeError.addClass('d-none');
        moderatorCodeError.text('');
    }

    /**
     * Shows a Bootstrap toast with the given message and style.
     * @param {string} message - Message to display in the toast.
     * @param {string} type - Bootstrap contextual style (e.g. 'success', 'danger').
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
