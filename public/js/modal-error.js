
// modal-error.js
'use strict';

let modalInstance = null;

// Show a  error modal with the given title and message
function showAlertModal(title, message) {
    const id = 'errorModal';

    // Delete previous modal if exits
    const existingModal = document.getElementById(id);
    if (existingModal) {
        existingModal.remove();
        if (modalInstance)
            modalInstance.dispose();
    }

    const html = `
        <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="errorModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="errorModalLabel">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        ${message}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add the modal to the DOM
    document.body.insertAdjacentHTML('beforeend', html);

    // Init the modal
    const modal = document.getElementById(id);
    modalInstance = new bootstrap.Modal(modal);
    
    // Vinculate the close button with the modal
    modal.querySelectorAll('[data-bs-dismiss="modal"]').forEach(button => {
        button.addEventListener('click', () => modalInstance.hide());
    });
    // Remove the modal from the DOM after close it
    modal.addEventListener('hidden.bs.modal', function () {
        modal.remove();
    });

    // Show the modal
    modalInstance.show();
}

// exports showAlertModal function