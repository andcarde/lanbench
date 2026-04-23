const exampleData = {
    sentences: [
        'Yo resumo pero dame un lápiz.',
        'Yo hago el resumen pero necesito un lápiz.',
        'Con un lápiz puedo hacer el resumen.'
    ]
};

function extractApiErrorMessage(errorLike, fallbackMessage) {
    const payload = errorLike && typeof errorLike === 'object'
        && errorLike.responseJSON && typeof errorLike.responseJSON === 'object'
        ? errorLike.responseJSON
        : null;

    if (payload && typeof payload.message === 'string' && payload.message.trim().length > 0)
        return payload.message;

    if (errorLike && typeof errorLike.message === 'string' && errorLike.message.trim().length > 0)
        return errorLike.message;

    if (errorLike && typeof errorLike.responseText === 'string' && errorLike.responseText.trim().length > 0)
        return errorLike.responseText;

    return fallbackMessage;
}

if (typeof module !== 'undefined' && module.exports)
    module.exports = { extractApiErrorMessage };

if (typeof window !== 'undefined' && typeof $ === 'function') {
    $(document).ready(() => {
    const state = {
        rdfId: 1,
        datasetId: null,
        datasetName: '',
        totalSections: 0,
        currentSectionNumber: 1,
        sectionEntries: [],
        currentEntryIndex: 0,
        lastSentences: ['', '', ''],
        lastResults: [],
        rejectionReasons: ['', '', '']
    };

    const toast = new bootstrap.Toast(document.getElementById('actionToast'));

    function showToast(message) {
        $('#toastMessage').text(message);
        toast.show();
    }

    function escapeHtml(text) {
        return $('<div>').text(text).html();
    }

    function escapeAttribute(text) {
        return String(text).replace(/"/g, '&quot;');
    }

    function toPositiveInteger(value) {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0)
            return null;
        return parsed;
    }

    function getPageParams() {
        const params = new URLSearchParams(window.location.search);
        const sectionIndex = toPositiveInteger(params.get('sectionIndex'));
        return {
            datasetId: toPositiveInteger(params.get('datasetId')),
            sectionNumber: sectionIndex || toPositiveInteger(params.get('section')) || 1,
            entryId: toPositiveInteger(params.get('entryId'))
        };
    }

    function getCurrentEntry() {
        return state.sectionEntries[state.currentEntryIndex] || null;
    }

    function getEntryTriples(entry) {
        if (!entry || typeof entry !== 'object')
            return [];

        if (Array.isArray(entry.triples) && entry.triples.length)
            return entry.triples;

        if (Array.isArray(entry.originalTriples) && entry.originalTriples.length)
            return entry.originalTriples;

        if (Array.isArray(entry.modifiedTriples) && entry.modifiedTriples.length)
            return entry.modifiedTriples;

        return [];
    }

    function getPrimaryTriple(entry) {
        const triples = getEntryTriples(entry);
        if (triples.length)
            return triples[0];

        return {
            predicate: '<predicate>',
            subject: '<subject>',
            object: '<object>'
        };
    }

    function populateTriple(data) {
        $('#triplePredicate').text(data.predicate);
        $('#tripleSubject').text(data.subject);
        $('#tripleObject').text(data.object);
    }

    function renderTriplesList(entry) {
        const triples = getEntryTriples(entry);

        if (!triples.length) {
            $('#triplesListWrapper').addClass('d-none');
            $('#triplesList').empty();
            return;
        }

        $('#triplesListWrapper').removeClass('d-none');
        $('#triplesList').html(`
            <div class="triples-header">
                <span>Predicate</span>
                <span>Subject</span>
                <span>Object</span>
            </div>
            ${triples.map(triple => `
                <div class="triple-line">
                    <div>${escapeHtml(triple.predicate)}</div>
                    <div>${escapeHtml(triple.subject)}</div>
                    <div>${escapeHtml(triple.object)}</div>
                </div>
            `).join('')}
        `);
    }

    function getRequiredSentenceCount(entry = getCurrentEntry()) {
        const englishSentences = entry && Array.isArray(entry.englishSentences)
            ? entry.englishSentences.filter(sentence => typeof sentence === 'string' && sentence.trim().length > 0)
            : (entry && Array.isArray(entry.sourceSentences)
                ? entry.sourceSentences.filter(sentence => typeof sentence === 'string' && sentence.trim().length > 0)
                : []);

        return Math.max(englishSentences.length, 3);
    }

    function getCurrentSentenceCount() {
        return $('.sentence-input').length || 3;
    }

    function renderSentencePairs(entry) {
        const englishSentences = entry && Array.isArray(entry.englishSentences)
            ? entry.englishSentences
            : (entry && Array.isArray(entry.sourceSentences) ? entry.sourceSentences : []);
        const sentenceCount = getRequiredSentenceCount(entry);

        $('#sentencePairsContainer').html(
            Array.from({ length: sentenceCount }, (_, index) => {
                const englishSentence = typeof englishSentences[index] === 'string'
                    ? englishSentences[index].trim()
                    : '';

                return `
                    <div class="sentence-pair" data-pair-index="${index}">
                        ${englishSentence
                            ? `
                                <div class="sentence-reference">
                                    <span class="sentence-reference-label">Oración en inglés ${index + 1}</span>
                                    <div class="sentence-reference-text">${escapeHtml(englishSentence)}</div>
                                </div>
                            `
                            : '<div class="sentence-reference-empty"></div>'}
                        <div class="sentence-block" data-index="${index}">
                            <label class="form-label" for="sentence${index + 1}">Oración ${index + 1}</label>
                            <input
                                type="text"
                                class="form-control sentence-input"
                                id="sentence${index + 1}"
                                maxlength="160"
                                autocomplete="off"
                            />
                            <div class="sentence-status small mt-2"></div>
                        </div>
                    </div>
                `;
            }).join('')
        );
    }

    function getSentenceValues() {
        return $('.sentence-input').map(function () {
            return $(this).val();
        }).get();
    }

    function buildCheckEntryContext(entry) {
        if (!entry || typeof entry !== 'object')
            return null;

        return {
            entryId: Number(entry.entryId ?? entry.eid),
            category: entry.category || '',
            englishSentences: Array.isArray(entry.englishSentences)
                ? entry.englishSentences
                : (Array.isArray(entry.sourceSentences) ? entry.sourceSentences : []),
            sectionIndex: Number(entry.sectionIndex ?? state.currentSectionNumber ?? 1),
            triples: getEntryTriples(entry)
        };
    }

    function clearValidationUI() {
        $('.sentence-block').removeClass('valid invalid warning');
        $('.sentence-pair').removeClass('pair-valid pair-invalid pair-warning');
        $('.sentence-status').text('');
        $('#validationSummary').html('<li class="list-group-item bg-transparent px-0 text-muted">No validation executed yet.</li>');
        $('#issuesCard').addClass('d-none');
        $('#issueTabsWrapper').addClass('d-none');
        $('#issueTabs').empty();
        $('#issueContent').empty();
        $('#issuesCounter').text('0 pending issues');
        $('#btnSend').addClass('d-none');
    }

    function resetValidationState(sentenceCount = getCurrentSentenceCount()) {
        state.lastSentences = Array.from({ length: sentenceCount }, () => '');
        state.lastResults = [];
        state.rejectionReasons = Array.from({ length: sentenceCount }, () => '');
    }

    function updateTaskCopy(message) {
        $('#taskTitle').text('Task · RDF to Spanish');
        $('#taskSubtitle').text(message);
    }

    function updateHeaderInfo() {
        const currentEntryPosition = state.currentEntryIndex + 1;
        const totalEntriesInSection = state.sectionEntries.length;

        $('#datasetName').text(state.datasetName || 'Sin dataset seleccionado');
        $('#sectionIndicator').text(
            state.datasetId
                ? `${state.currentSectionNumber} / ${state.totalSections || 1}`
                : '-'
        );
        $('#entryIndicator').text(
            state.datasetId
                ? `${currentEntryPosition} / ${totalEntriesInSection || 0}`
                : '-'
        );
        $('#sectionSizeIndicator').text(
            state.datasetId
                ? `${totalEntriesInSection} entries`
                : '-'
        );
    }

    function setFormEnabled(isEnabled) {
        $('.sentence-input').prop('disabled', !isEnabled);
        $('#sentencesForm button[type="submit"]').prop('disabled', !isEnabled);
        $('#btnSend').prop('disabled', !isEnabled);
        $('#btnReset').prop('disabled', !isEnabled);
        $('#btnLoadExample').prop('disabled', !isEnabled);
    }

    function loadExample() {
        $('.sentence-input').each(function (index) {
            $(this).val(exampleData.sentences[index] || '');
        });
        resetValidationState();
        clearValidationUI();
        showToast('Ejemplo cargado en los campos de texto.');
    }

    function resetForm(showMessage = true) {
        const formElement = $('#sentencesForm')[0];
        if (formElement)
            formElement.reset();

        resetValidationState();
        clearValidationUI();

        if (showMessage)
            showToast('Formulario reiniciado.');
    }

    function loadEntry(entryIndex, options = {}) {
        const entry = state.sectionEntries[entryIndex];

        if (!entry) {
            renderSentencePairs(null);
            setFormEnabled(false);
            populateTriple({ predicate: '<predicate>', subject: '<subject>', object: '<object>' });
            renderTriplesList(null);
            resetValidationState();
            clearValidationUI();
            updateHeaderInfo();
            return;
        }

        state.currentEntryIndex = entryIndex;
        state.rdfId = Number(entry.entryId ?? entry.eid);

        populateTriple(getPrimaryTriple(entry));
        renderTriplesList(entry);
        renderSentencePairs(entry);
        updateHeaderInfo();
        resetForm(false);
        setFormEnabled(true);

        updateTaskCopy(
            `Dataset ${state.datasetName} · sección ${state.currentSectionNumber} · entry ${state.currentEntryIndex + 1} de ${state.sectionEntries.length}.`
        );
        replaceNavigationState();

        if (options.showToast)
            showToast(`Entry ${state.currentEntryIndex + 1} de la sección ${state.currentSectionNumber} cargada.`);
    }

    function replaceNavigationState() {
        const currentEntry = getCurrentEntry();
        const params = new URLSearchParams();

        if (state.datasetId)
            params.set('datasetId', String(state.datasetId));
        if (state.currentSectionNumber)
            params.set('sectionIndex', String(state.currentSectionNumber));
        if (currentEntry && Number.isInteger(Number(currentEntry.entryId ?? currentEntry.eid)))
            params.set('entryId', String(Number(currentEntry.entryId ?? currentEntry.eid)));

        if (window.history && typeof window.history.replaceState === 'function')
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }

    function completeSection() {
        setFormEnabled(false);
        clearValidationUI();
        updateTaskCopy(
            `Sección ${state.currentSectionNumber} completada en ${state.datasetName}. Ya se han procesado sus ${state.sectionEntries.length} entries.`
        );
        $('#validationSummary').html(
            '<li class="list-group-item bg-transparent px-0 text-success">Sección completada correctamente.</li>'
        );
        showToast(`Sección ${state.currentSectionNumber} completada.`);
    }

    function loadNextEntry() {
        const nextIndex = state.currentEntryIndex + 1;

        if (nextIndex >= state.sectionEntries.length) {
            completeSection();
            return;
        }

        loadEntry(nextIndex, { showToast: true });
    }

    function mapValidationsToResults(sentences, validations) {
        return sentences.map((sentence, index) => {
            const trimmed = sentence.trim();
            const validation = Array.isArray(validations) ? validations[index] : null;
            const rejectionReason = state.rejectionReasons[index];

            if (!trimmed) {
                state.rejectionReasons[index] = '';
                return {
                    state: 'empty',
                    label: 'Pendiente',
                    summary: 'Oración vacía.',
                    issues: []
                };
            }

            if (validation && (validation.isValid || validation.valid)) {
                state.rejectionReasons[index] = '';
                return {
                    state: 'valid',
                    label: 'Válida',
                    summary: 'No se han detectado problemas.',
                    issues: []
                };
            }

            const validationAlerts = validation && Array.isArray(validation.alerts)
                ? validation.alerts
                : [];
            const primaryAlert = validationAlerts[0] || null;
            const suggestion =
                primaryAlert && typeof primaryAlert.suggestion === 'string' && primaryAlert.suggestion.trim().length > 0
                    ? primaryAlert.suggestion
                    : (validation && typeof validation.suggestion === 'string' && validation.suggestion.trim().length > 0
                        ? validation.suggestion
                        : trimmed);
            const reason =
                primaryAlert && typeof primaryAlert.message === 'string' && primaryAlert.message.trim().length > 0
                    ? primaryAlert.message
                    : (validation && typeof validation.reason === 'string' && validation.reason.trim().length > 0
                        ? validation.reason
                        : 'The sentence needs review.');
            const isWarning = Boolean(
                (primaryAlert && primaryAlert.severity === 'warning')
                || (validation && !validation.isValid && validation.warning)
            );

            if (validation && !(validation.isValid || validation.valid) && isWarning) {
                state.rejectionReasons[index] = '';
                return {
                    state: 'warning',
                    label: 'Aviso',
                    summary: reason,
                    issues: []
                };
            }

            if (rejectionReason) {
                return {
                    state: 'warning',
                    label: 'Rechazada con motivo',
                    summary: `Sugerencia rechazada: ${rejectionReason}`,
                    issues: []
                };
            }

            return {
                state: 'invalid',
                label: 'Requiere revisión',
                summary: reason,
                issues: [
                    {
                        type: 'invalid',
                        title: 'Revisión',
                        message: reason,
                        suggestion,
                        reasonPlaceholder: 'Explica por qué rechazas la sugerencia'
                    }
                ]
            };
        });
    }

    function updateSentenceStyles(results) {
        $('.sentence-block').each(function (idx) {
            $(this).removeClass('valid invalid warning');
            $(this).closest('.sentence-pair').removeClass('pair-valid pair-invalid pair-warning');
            const result = results[idx];
            if (!result)
                return;

            if (result.state === 'valid') {
                $(this).addClass('valid');
                $(this).closest('.sentence-pair').addClass('pair-valid');
            } else if (result.state === 'invalid') {
                $(this).addClass('invalid');
                $(this).closest('.sentence-pair').addClass('pair-invalid');
            } else if (result.state === 'warning') {
                $(this).addClass('warning');
                $(this).closest('.sentence-pair').addClass('pair-warning');
            }

            $(this).find('.sentence-status').text(result.label === 'Pendiente' ? '' : result.label);
        });
    }

    function renderSummary(results) {
        const items = results.map((result, index) => {
            const badgeClass = result.state === 'valid'
                ? 'success'
                : (result.state === 'invalid' ? 'danger' : 'warning');

            return `
            <li class="list-group-item bg-transparent px-0">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div>
                        <strong>Oración ${index + 1}</strong><br>
                        <span class="text-muted">${escapeHtml(result.summary)}</span>
                    </div>
                    <span class="badge text-bg-${badgeClass}">${result.label}</span>
                </div>
            </li>`;
        }).join('');

        $('#validationSummary').html(items);
    }

    function renderIssues(results) {
        const problematic = results
            .map((result, sentenceIndex) => ({ sentenceIndex, ...result }))
            .filter(result => result.issues.length > 0);

        if (!problematic.length) {
            $('#issuesCard').addClass('d-none');
            return;
        }

        $('#issuesCard').removeClass('d-none');

        if (problematic.length > 1) {
            $('#issueTabsWrapper').removeClass('d-none');
            $('#issueTabs').html(problematic.map((item, idx) => `
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${idx === 0 ? 'active' : ''}" data-bs-toggle="tab" data-bs-target="#issue-pane-${item.sentenceIndex}" type="button" role="tab">Oración ${item.sentenceIndex + 1}</button>
                </li>`).join(''));
        } else {
            $('#issueTabsWrapper').addClass('d-none');
            $('#issueTabs').empty();
        }

        $('#issueContent').html(`
        <div class="tab-content">
            ${problematic.map((item, idx) => `
            <div class="tab-pane fade ${idx === 0 ? 'show active' : ''}" id="issue-pane-${item.sentenceIndex}" role="tabpanel">
                ${item.issues.map((issue, issueIndex) => `
                <div class="issue-card mb-3" data-sentence-index="${item.sentenceIndex}" data-issue-index="${issueIndex}">
                    <div class="issue-header ${issue.type}">Oración ${item.sentenceIndex + 1} · ${issue.title}</div>
                    <div class="issue-body">
                    <p class="mb-2">${escapeHtml(issue.message)}</p>
                    <div class="suggestion-preview">${escapeHtml(issue.suggestion)}</div>
                    <div class="mb-3">
                        <label class="form-label small">Sugerencia</label>
                        <input type="text" class="form-control form-control-sm suggestion-input" value="${escapeAttribute(issue.suggestion)}">
                    </div>
                    <div class="mb-3 d-none reject-wrapper">
                        <label class="form-label small">Motivo del rechazo</label>
                        <textarea class="form-control form-control-sm reject-reason" rows="2" placeholder="Explica por qué rechazas la sugerencia"></textarea>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-sm btn-outline-primary btn-accept">Aceptar sugerencia</button>
                        <button class="btn btn-sm btn-outline-secondary btn-reject-toggle">Rechazar</button>
                        <button class="btn btn-sm btn-secondary d-none btn-save-reject">Guardar rechazo</button>
                    </div>
                    </div>
                </div>`).join('')}
            </div>`).join('')}
        </div>
        `);

        const totalIssues = problematic.reduce((sum, item) => sum + item.issues.length, 0);
        $('#issuesCounter').text(`${totalIssues} pending issue${totalIssues > 1 ? 's' : ''}`);
    }

    function updateSendButton(results, sentences) {
        const allCompleted = sentences.every(sentence => sentence.trim().length > 0);
        const allResolvable = results.every((result, index) => {
            if (result.state === 'valid' || result.state === 'warning')
                return true;
            return Boolean(state.rejectionReasons[index]);
        });

        $('#btnSend').toggleClass('d-none', !(allCompleted && allResolvable));
    }

    function renderValidation(validations, sentences) {
        const results = mapValidationsToResults(sentences, validations);
        state.lastSentences = sentences.slice();
        state.lastResults = results;

        updateSentenceStyles(results);
        renderSummary(results);
        renderIssues(results);
        updateSendButton(results, sentences);
    }

    function runValidation(showToastMessage) {
        const entry = getCurrentEntry();
        if (!entry) {
            showToast('No hay ninguna entry cargada.');
            return $.Deferred().reject().promise();
        }

        const sentences = getSentenceValues();

        return checkAnnotations(sentences, buildCheckEntryContext(entry))
            .done(function (validations) {
                renderValidation(validations, sentences);
                if (showToastMessage)
                    showToast('Validación ejecutada.');
            })
            .fail(function (xhr) {
                const message = extractApiErrorMessage(xhr, 'Validation failed.');
                showToast(message);
            });
    }

    function areSentencesSynced(sentences) {
        return sentences.length === state.lastSentences.length
            && sentences.every((sentence, index) => sentence === state.lastSentences[index]);
    }

    function sendAnnotations() {
        const entry = getCurrentEntry();
        if (!entry) {
            showToast('No hay ninguna entry activa.');
            return;
        }

        const sentences = getSentenceValues();

        if (!areSentencesSynced(sentences)) {
            runValidation(false).always(() => {
                sendAnnotations();
            });
            return;
        }

        const canSend = state.lastResults.length === sentences.length
            && !$('#btnSend').hasClass('d-none');

        if (!canSend) {
            showToast('Please resolve or reject all issues before sending.');
            return;
        }

        postAnnotations(state.datasetId, state.rdfId, sentences, state.rejectionReasons)
            .done(function (response) {
                const message =
                    response && response.savedAt
                        ? 'Anotaciones guardadas correctamente.'
                        : ((response && response.message)
                            || 'Sentences sent successfully.');
                showToast(message);
                loadNextEntry();
            })
            .fail(function (xhr) {
                const message = extractApiErrorMessage(xhr, 'The sentences could not be sent.');
                showToast(message);
            });
    }

    function loadDatasetSection() {
        const pageParams = getPageParams();
        const debugDefaults = getDebugParams();
        const params = {
            datasetId: pageParams.datasetId || (debugDefaults && debugDefaults.datasetId),
            sectionNumber: pageParams.sectionNumber || (debugDefaults && debugDefaults.sectionNumber) || 1,
            entryId: pageParams.entryId || null
        };

        if (!params.datasetId) {
            setFormEnabled(false);
            updateTaskCopy('Selecciona un dataset desde la vista de datasets para comenzar una sección.');
            updateHeaderInfo();
            return;
        }

        state.datasetId = params.datasetId;
        state.currentSectionNumber = params.sectionNumber;
        updateTaskCopy('Cargando sección del dataset seleccionado...');
        setFormEnabled(false);

        fetchDatasetSection(params.datasetId, params.sectionNumber)
            .done(function (payload) {
                state.datasetName = payload
                    ? (payload.datasetName || (payload.dataset ? payload.dataset.name : '') || '')
                    : '';
                state.totalSections = payload
                    ? Number(payload.totalSections || (payload.dataset ? payload.dataset.totalSections : 0) || 1)
                    : 1;
                state.sectionEntries = payload && Array.isArray(payload.entries) ? payload.entries : [];
                state.currentEntryIndex = 0;

                if (!state.sectionEntries.length) {
                    updateHeaderInfo();
                    updateTaskCopy('La sección seleccionada no contiene entries.');
                    return;
                }

                const entryIndex = params.entryId
                    ? state.sectionEntries.findIndex(entry => Number(entry.entryId ?? entry.eid) === params.entryId)
                    : 0;
                loadEntry(entryIndex >= 0 ? entryIndex : 0, { showToast: false });
            })
            .fail(function (xhr) {
                const message = extractApiErrorMessage(xhr, 'No se pudo cargar la sección del dataset.');
                state.datasetId = null;
                state.datasetName = '';
                state.totalSections = 0;
                state.sectionEntries = [];
                updateHeaderInfo();
                updateTaskCopy(message);
                showToast(message);
            });
    }

    $('#sentencesForm').on('submit', function (event) {
        event.preventDefault();
        runValidation(true);
    });

    $('#issueContent').on('click', '.btn-accept', function () {
        const issueCard = $(this).closest('.issue-card');
        const sentenceIndex = Number(issueCard.data('sentence-index'));
        const suggestion = issueCard.find('.suggestion-input').val().trim();

        if (!suggestion) {
            issueCard.find('.suggestion-input').trigger('focus');
            return;
        }

        state.rejectionReasons[sentenceIndex] = '';
        $(`#sentence${sentenceIndex + 1}`).val(suggestion);
        runValidation(false);
        showToast(`Suggestion applied to sentence ${sentenceIndex + 1}.`);
    });

    $('#issueContent').on('click', '.btn-reject-toggle', function () {
        const issueCard = $(this).closest('.issue-card');
        issueCard.find('.reject-wrapper, .btn-save-reject').removeClass('d-none');
        $(this).addClass('d-none');
    });

    $('#issueContent').on('click', '.btn-save-reject', function () {
        const issueCard = $(this).closest('.issue-card');
        const sentenceIndex = Number(issueCard.data('sentence-index'));
        const reason = issueCard.find('.reject-reason').val().trim();

        if (!reason) {
            issueCard.find('.reject-reason').trigger('focus');
            showToast('Please provide a rejection reason.');
            return;
        }

        state.rejectionReasons[sentenceIndex] = reason;
        renderValidation(
            state.lastResults.map(result => ({ valid: result.state === 'valid' })),
            getSentenceValues()
        );
        showToast(`Suggestion rejected for sentence ${sentenceIndex + 1}.`);
    });

    $('#sentencesForm').on('input', '.sentence-input', function () {
        const inputId = $(this).attr('id');
        const sentenceIndex = Number(inputId.replace('sentence', '')) - 1;
        if (sentenceIndex >= 0 && sentenceIndex < state.rejectionReasons.length)
            state.rejectionReasons[sentenceIndex] = '';

        $('#btnSend').addClass('d-none');
    });

    $('#btnLoadExample').on('click', loadExample);
    $('#btnReset').on('click', function () {
        resetForm(true);
    });
    $('#btnSend').on('click', sendAnnotations);

    renderSentencePairs(null);
    populateTriple({ predicate: '<predicate>', subject: '<subject>', object: '<object>' });
    clearValidationUI();
    setFormEnabled(false);
    updateHeaderInfo();
    loadDatasetSection();
    });
}
