// @ts-nocheck
/**
 * @file Frontend for `public/login.html`.
 *
 * Attaches a handler to the login form that sends `email`/`password` to the
 * `/api/session` endpoint and, if it responds with `redirectUrl`, redirects
 * the user. Errors are shown in a Bootstrap toast.
 */
$(document).ready(function () {
    const loginForm = $('#loginForm');
    const loginToast = $('#loginToast');
    const toastMessage = $('#toastMessage');

    loginForm.on('submit', function (event) {
        event.preventDefault();

        const payload = {
            email: $('#email').val().trim(),
            password: $('#password').val().trim()
        };

        if (!payload.email || !payload.password) {
            showToast('Please fill in all fields.', 'danger');
            return;
        }

        $.ajax({
            url: '/api/session',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload)
        })
            .done(function (response) {
                showToast('Login successful!', 'success');
                // Brief delay so the success toast is visible before redirecting.
                setTimeout(function () {
                    window.location.href = (response && response.redirectUrl) || '/tasks';
                }, 400);
            })
            .fail(function (xhr) {
                const responsePayload = xhr.responseJSON || {};
                const message =
                    responsePayload.message
                    || responsePayload.text
                    || 'Invalid credentials.';
                showToast(message, 'danger');
            });
    });

    $('#btnRegister').on('click', function () {
        window.location.href = '/register';
    });

    /**
     * Shows a Bootstrap toast with the given message and style.
     * @param {string} message - Message to display in the toast.
     * @param {string} type - Bootstrap contextual style (e.g. 'success', 'danger').
     */
    function showToast(message, type) {
        toastMessage.text(message);
        loginToast
            .removeClass('text-bg-dark text-bg-success text-bg-danger')
            .addClass(`text-bg-${type || 'dark'}`);
        const bsToast = new bootstrap.Toast(loginToast[0]);
        bsToast.show();
    }
});
