$(document).ready(function () {
    const registerForm = $('#registerForm');
    const registerToast = $('#registerToast');
    const toastMessage = $('#toastMessage');
    const registerError = $('#registerError');

    registerForm.on('submit', function (event) {
        event.preventDefault();

        hideError();

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

        $.ajax({
            url: '/register',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload)
        })
            .done(function (response) {
                const message =
                    (response && response.message)
                    || 'Register successful.';
                showToast(message, 'success');
                registerForm[0].reset();
                setTimeout(function () {
                    window.location.href = '/login';
                }, 1000);
            })
            .fail(function (xhr) {
                const message =
                    (xhr.responseJSON && xhr.responseJSON.message)
                    || 'There was an error during register.';
                showError(message);
                showToast(message, 'danger');
            });
    });

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

    function isValidAlphabeticField(value, alphaRegex) {
        return (
            typeof value === 'string'
            && value.length > 0
            && value.length <= 64
            && alphaRegex.test(value)
        );
    }

    function isValidPassword(value) {
        return typeof value === 'string' && value.length > 8 && value.length <= 64;
    }

    function showError(message) {
        registerError.text(message);
        registerError.removeClass('d-none');
    }

    function hideError() {
        registerError.addClass('d-none');
        registerError.text('');
    }

    function showToast(message, type) {
        toastMessage.text(message);
        registerToast
            .removeClass('text-bg-dark text-bg-success text-bg-danger')
            .addClass('text-bg-' + type);
        const bsToast = new bootstrap.Toast(registerToast[0]);
        bsToast.show();
    }
});
