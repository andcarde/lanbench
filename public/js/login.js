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
            url: '/crear-sesion',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload)
        })
            .done(function (response) {
                showToast('Login successful!', 'success');
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

    function showToast(message, type) {
        toastMessage.text(message);
        loginToast
            .removeClass('text-bg-dark text-bg-success text-bg-danger')
            .addClass(`text-bg-${type || 'dark'}`);
        const bsToast = new bootstrap.Toast(loginToast[0]);
        bsToast.show();
    }
});
