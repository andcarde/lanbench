// @ts-nocheck
/**
 * @file Frontend for `public/annotations.html` — main annotation page.
 *
 * Renders the current entry (triples + reference sentences), manages the
 * annotator's sentence editor with its validation via
 * `/api/annotations/check`, persists each submission via
 * `/api/annotations/send` and advances the session with
 * `/api/annotations/:datasetId/continue` / `/api/annotations/:datasetId/next`.
 */
const exampleData = {
    sentences: [
        'Yo resumo pero dame un lápiz.',
        'Yo hago el resumen pero necesito un lápiz.',
        'Con un lápiz puedo hacer el resumen.'
    ]
};

/**
 * Extracts a human-readable error message from an AJAX error-like object.
 * @param {*} errorLike - jQuery xhr or error object.
 * @param {string} fallbackMessage - Message to use if none can be extracted.
 * @returns {string} The resolved error message.
 */
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
        datasetOptions: { llmMode: null },
        totalSections: 0,
        currentSectionNumber: 1,
        currentEntry: null,
        entryStartedAt: null,
        entryIndexInSection: 0,
        totalEntriesInSection: 0,
        isLastEntryInSection: false,
        lastSentences: ['', '', ''],
        lastResults: [],
        rejectionReasons: ['', '', ''],
        submittedSentences: []
    };

    const toast = new bootstrap.Toast(document.getElementById('actionToast'));

    /**
     * Shows the action toast with the given message.
     * @param {string} message - Message to display.
     */
    function showToast(message) {
        $('#toastMessage').text(message);
        toast.show();
    }

    /**
     * Escapes a value for safe insertion as HTML text.
     * @param {string} text - Text to escape.
     * @returns {string} HTML-escaped string.
     */
    function escapeHtml(text) {
        return $('<div>').text(text).html();
    }

    /**
     * Escapes a value for safe insertion into an HTML attribute.
     * @param {string} text - Text to escape.
     * @returns {string} Attribute-escaped string.
     */
    function escapeAttribute(text) {
        return String(text).replace(/"/g, '&quot;');
    }

    /**
     * Converts a value to a positive integer, or null if invalid.
     * @param {*} value - Value to convert.
     * @returns {?number} Positive integer, or null.
     */
    function toPositiveInteger(value) {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0)
            return null;
        return parsed;
    }

    /**
     * Reads the page parameters (datasetId, llmMode) from the URL.
     * @returns {*} Page parameters.
     */
    function getPageParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            datasetId: toPositiveInteger(params.get('datasetId')),
            llmMode: normalizeLlmMode(params.get('llmMode'))
        };
    }

    /**
     * Normalizes the LLM mode received from the backend or URL.
     * @param {*} value - LLM mode value.
     * @returns {?string} Normalized mode.
     */
    function normalizeLlmMode(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return ['generation', 'correction', 'none'].includes(normalized) ? normalized : null;
    }

    /**
     * Indicates whether LLM checks are disabled for the dataset.
     * @returns {boolean} True if the mode is none.
     */
    function isDatasetLlmDisabled() {
        return normalizeLlmMode(state.datasetOptions && state.datasetOptions.llmMode) === 'none';
    }

    /**
     * Gets the current entry from the state.
     * @returns {*} The current entry, or null.
     */
    function getCurrentEntry() {
        return state.currentEntry || null;
    }

    /**
     * Gets the triples for an entry (original or modified, whichever exists).
     * @param {*} entry - Entry object.
     * @returns {*} Array of triples.
     */
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

    /**
     * Gets the primary (first) triple of an entry, or a placeholder triple.
     * @param {*} entry - Entry object.
     * @returns {*} The primary triple.
     */
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

    /**
     * Populates the primary-triple display fields.
     * @param {*} data - Triple with predicate/subject/object.
     */
    function populateTriple(data) {
        $('#triplePredicate').text(data.predicate);
        $('#tripleSubject').text(data.subject);
        $('#tripleObject').text(data.object);
    }

    /**
     * Renders the full triples list for an entry.
     * @param {*} entry - Entry object.
     */
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

    /**
     * Gets the required number of sentence inputs for an entry (min 3).
     * @param {*} entry - Entry object.
     * @returns {number} Required sentence count.
     */
    function getRequiredSentenceCount(entry = getCurrentEntry()) {
        const englishSentences = entry && Array.isArray(entry.englishSentences)
            ? entry.englishSentences.filter(sentence => typeof sentence === 'string' && sentence.trim().length > 0)
            : (entry && Array.isArray(entry.sourceSentences)
                ? entry.sourceSentences.filter(sentence => typeof sentence === 'string' && sentence.trim().length > 0)
                : []);

        return Math.max(englishSentences.length, 3);
    }

    /**
     * Gets the current number of rendered sentence inputs (defaults to 3).
     * @returns {number} Current sentence count.
     */
    function getCurrentSentenceCount() {
        return $('.sentence-input').length || 3;
    }

    /**
     * Renders the English-reference + Spanish-input sentence pairs.
     * @param {*} entry - Entry object.
     */
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

    /**
     * Gets the current values of all sentence inputs.
     * @returns {string[]} Sentence values.
     */
    function getSentenceValues() {
        return $('.sentence-input').map(function () {
            return $(this).val();
        }).get();
    }

    /**
     * Builds the entry context sent to the validation endpoint.
     * @param {*} entry - Entry object.
     * @returns {*} Entry context, or null.
     */
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
            triples: getEntryTriples(entry),
            previousSentences: state.submittedSentences.slice(),
            // US-31: lets the backend resolve the dataset's active AI credential
            // for this /check. Datasets with llm_mode='none' short-circuit to the
            // global provider, so this never regresses the default behaviour.
            ...(state.datasetId ? { datasetId: Number(state.datasetId) } : {})
        };
    }

    /**
     * Clears all validation UI (styles, summary, issues).
     */
    function clearValidationUI() {
        $('.sentence-block').removeClass('valid invalid warning duplicate');
        $('.sentence-pair').removeClass('pair-valid pair-invalid pair-warning pair-duplicate');
        $('.sentence-status').text('');
        if (isDatasetLlmDisabled()) {
            $('#validationSummary').empty();
            $('#issuesCard').addClass('d-none');
            $('#issueTabsWrapper').addClass('d-none');
            $('#issueTabs').empty();
            $('#issueContent').empty();
            $('#issuesCounter').text('0 pending issues');
            updateBypassSendButton(getSentenceValues());
            return;
        }

        $('#validationSummary').html('<li class="list-group-item bg-transparent px-0 text-muted">No validation executed yet.</li>');
        $('#issuesCard').addClass('d-none');
        $('#issueTabsWrapper').addClass('d-none');
        $('#issueTabs').empty();
        $('#issueContent').empty();
        $('#issuesCounter').text('0 pending issues');
        $('#btnSend').addClass('d-none');
    }

    /**
     * Applies the dataset options to the view state.
     * @param {*} options - Dataset options.
     */
    function applyDatasetOptions(options) {
        const source = options && typeof options === 'object' ? options : {};
        state.datasetOptions = {
            llmMode: normalizeLlmMode(source.llmMode) || 'correction',
            isReviewEnabled: Boolean(source.isReviewEnabled),
            hasAdditionalReviews: Boolean(source.hasAdditionalReviews)
        };
        updateValidationModeUI();
    }

    /**
     * Loads the dataset options from the backend.
     * @param {number} datasetId - Dataset identifier.
     * @returns {Promise<*>} Load promise.
     */
    function loadDatasetOptions(datasetId) {
        if (typeof window.fetchDatasetOptions !== 'function') {
            applyDatasetOptions({ llmMode: 'correction' });
            return $.Deferred().resolve(state.datasetOptions).promise();
        }

        return window.fetchDatasetOptions(datasetId)
            .done(function (options) {
                applyDatasetOptions(options);
            })
            .fail(function () {
                applyDatasetOptions({ llmMode: 'correction' });
                showToast('No se pudieron cargar las opciones del dataset.');
            });
    }

    /**
     * Resolves the options from the URL or the backend.
     * @param {number} datasetId - Dataset identifier.
     * @param {?string} llmMode - Mode received via the URL.
     * @returns {Promise<*>} Options promise.
     */
    function resolveDatasetOptions(datasetId, llmMode) {
        if (llmMode) {
            applyDatasetOptions({ llmMode });
            return $.Deferred().resolve(state.datasetOptions).promise();
        }

        return loadDatasetOptions(datasetId);
    }

    /**
     * Adjusts the validation controls according to the dataset options.
     */
    function updateValidationModeUI() {
        $('#btnCheck').toggleClass('d-none', isDatasetLlmDisabled());
        if (isDatasetLlmDisabled()) {
            $('#issuesCard').addClass('d-none');
            $('#validationSummary').empty();
            updateBypassSendButton(getSentenceValues());
            return;
        }

        $('#btnSend').addClass('d-none');
    }

    /**
     * Updates the send button when there is no check phase (LLM disabled).
     * @param {Array} sentences - Current sentences.
     */
    function updateBypassSendButton(sentences) {
        if (!isDatasetLlmDisabled())
            return;

        const allCompleted = Array.isArray(sentences)
            && sentences.length > 0
            && sentences.every(sentence => typeof sentence === 'string' && sentence.trim().length > 0);
        $('#btnSend').toggleClass('d-none', !allCompleted);
    }

    /**
     * Resets the validation state arrays to the given sentence count.
     * @param {number} sentenceCount - Number of sentences.
     */
    function resetValidationState(sentenceCount = getCurrentSentenceCount()) {
        state.lastSentences = Array.from({ length: sentenceCount }, () => '');
        state.lastResults = [];
        state.rejectionReasons = Array.from({ length: sentenceCount }, () => '');
    }

    /**
     * Updates the task title/subtitle copy.
     * @param {string} message - Subtitle message.
     */
    function updateTaskCopy(message) {
        $('#taskTitle').text('Task · RDF to Spanish');
        $('#taskSubtitle').text(message);
    }

    /**
     * Updates the header info (dataset name, section/entry indicators).
     */
    function updateHeaderInfo() {
        const currentEntryPosition = state.entryIndexInSection + 1;
        const totalEntriesInSection = state.totalEntriesInSection;

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

    /**
     * Enables or disables the form controls.
     * @param {boolean} isEnabled - Whether the form is enabled.
     */
    function setFormEnabled(isEnabled) {
        $('.sentence-input').prop('disabled', !isEnabled);
        $('#btnCheck').prop('disabled', !isEnabled);
        $('#btnSend').prop('disabled', !isEnabled);
        $('#btnReset').prop('disabled', !isEnabled);
        $('#btnLoadExample').prop('disabled', !isEnabled);
    }

    /**
     * Loads the example sentences into the input fields.
     */
    function loadExample() {
        $('.sentence-input').each(function (index) {
            $(this).val(exampleData.sentences[index] || '');
        });
        resetValidationState();
        clearValidationUI();
        showToast('Ejemplo cargado en los campos de texto.');
    }

    /**
     * Resets the sentences form and validation state.
     * @param {boolean} showMessage - Whether to show a toast.
     */
    function resetForm(showMessage = true) {
        const formElement = $('#sentencesForm')[0];
        if (formElement)
            formElement.reset();

        resetValidationState();
        clearValidationUI();

        if (showMessage)
            showToast('Formulario reiniciado.');
    }

    /**
     * Applies an entry payload to the view (triples, sentences, header, state).
     * @param {*} payload - Entry payload from the backend.
     * @param {*} options - Options (e.g. { showToast }).
     */
    function applyEntryPayload(payload, options = {}) {
        const entry = payload && payload.entry ? payload.entry : null;

        if (!entry) {
            state.currentEntry = null;
            state.entryIndexInSection = 0;
            state.totalEntriesInSection = 0;
            state.isLastEntryInSection = false;

            renderSentencePairs(null);
            setFormEnabled(false);
            populateTriple({ predicate: '<predicate>', subject: '<subject>', object: '<object>' });
            renderTriplesList(null);
            resetValidationState();
            clearValidationUI();
            updateHeaderInfo();
            return;
        }

        state.currentEntry = entry;
        state.entryStartedAt = Date.now();   // start the elapsed-time clock for this entry
        state.rdfId = Number(entry.entryId ?? entry.eid);
        state.datasetName = payload.datasetName || state.datasetName || '';
        state.totalSections = Number(payload.totalSections) || state.totalSections || 1;
        state.currentSectionNumber = Number(payload.sectionNumber) || state.currentSectionNumber || 1;
        state.entryIndexInSection = Number(payload.entryIndexInSection) || 0;
        state.totalEntriesInSection = Number(payload.totalEntriesInSection)
            || state.totalEntriesInSection
            || 0;
        state.isLastEntryInSection = Boolean(payload.isLastEntryInSection);

        populateTriple(getPrimaryTriple(entry));
        renderTriplesList(entry);
        renderSentencePairs(entry);
        updateHeaderInfo();
        resetForm(false);
        setFormEnabled(true);
        updateValidationModeUI();

        updateTaskCopy(
            `Dataset ${state.datasetName} · sección ${state.currentSectionNumber} · entry ${state.entryIndexInSection + 1} de ${state.totalEntriesInSection}.`
        );
        replaceNavigationState();

        if (options.showToast)
            showToast(`Entry ${state.entryIndexInSection + 1} de la sección ${state.currentSectionNumber} cargada.`);
    }

    /**
     * Replaces the navigation state (URL query) to reflect the current dataset.
     * @returns {void}
     */
    function replaceNavigationState() {
        const params = new URLSearchParams();

        if (state.datasetId)
            params.set('datasetId', String(state.datasetId));

        if (window.history && typeof window.history.replaceState === 'function')
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }

    /**
     * Marks the current section as completed and shows the completion screen.
     * @param {boolean} moreSectionsAvailable - Whether more sections remain.
     */
    function completeSection(moreSectionsAvailable = true) {
        setFormEnabled(false);
        clearValidationUI();
        updateTaskCopy(
            `Sección ${state.currentSectionNumber} completada en ${state.datasetName}. Ya se han procesado sus ${state.totalEntriesInSection} entries.`
        );
        $('#validationSummary').html(
            '<li class="list-group-item bg-transparent px-0 text-success">Sección completada correctamente.</li>'
        );
        showSectionCompletedScreen(moreSectionsAvailable);
    }

    /**
     * Shows the "section completed" screen.
     * @param {boolean} moreSectionsAvailable - Whether more sections remain.
     */
    function showSectionCompletedScreen(moreSectionsAvailable = true) {
        $('#issuesCard').addClass('d-none');
        $('#sectionCompletedCard').removeClass('d-none');
        $('#datasetCompletedCard').addClass('d-none');
        $('#btnContinueSection').toggleClass('d-none', !moreSectionsAvailable);
        showToast(`Sección ${state.currentSectionNumber} completada.`);
    }

    /**
     * Shows the "dataset completed" screen.
     */
    function showDatasetCompletedScreen() {
        $('#issuesCard').addClass('d-none');
        $('#sectionCompletedCard').addClass('d-none');
        $('#datasetCompletedCard').removeClass('d-none');
        setFormEnabled(false);
        updateTaskCopy('¡Dataset completado! No hay más secciones disponibles para anotar.');
        showToast('¡Dataset completado!');
    }

    /**
     * Loads the next section (continue + next entry), or shows completion.
     */
    function loadNextSection() {
        setFormEnabled(false);
        updateTaskCopy('Cargando siguiente sección...');

        window.fetchContinueAnnotation(state.datasetId)
            .done(function (continuePayload) {
                const result = continuePayload && typeof continuePayload === 'object' ? continuePayload : {};
                const caseNumber = Number(result.caseNumber);

                if (caseNumber !== 4 && caseNumber !== 5) {
                    showDatasetCompletedScreen();
                    return;
                }

                window.fetchNextEntry(state.datasetId)
                    .done(function (payload) {
                        if (!payload || !payload.entry) {
                            showDatasetCompletedScreen();
                            return;
                        }

                        $('#sectionCompletedCard').addClass('d-none');
                        $('#datasetCompletedCard').addClass('d-none');
                        applyEntryPayload(payload, { showToast: true });
                    })
                    .fail(function () {
                        showDatasetCompletedScreen();
                    });
            })
            .fail(function () {
                showDatasetCompletedScreen();
            });
    }

    /**
     * Loads the next entry in the section, or completes the section.
     */
    function loadNextEntry() {
        if (state.isLastEntryInSection) {
            completeSection();
            return;
        }

        setFormEnabled(false);
        window.fetchNextEntry(state.datasetId)
            .done(function (payload) {
                if (!payload || !payload.entry) {
                    completeSection();
                    return;
                }
                applyEntryPayload(payload, { showToast: true });
            })
            .fail(function (xhr) {
                const message = extractApiErrorMessage(xhr, 'No se pudo cargar la siguiente entry.');
                showToast(message);
                setFormEnabled(true);
            });
    }

    /**
     * Maps backend validations to the visual result format used by the app.
     * @param {Array} sentences - Current sentences.
     * @param {Array} validations - Backend validations.
     * @returns {Array} Visual results per sentence.
     */
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
            const duplicateAlert = validationAlerts.find(alert => alert && alert.severity === 'duplicate');
            const primaryAlert = duplicateAlert || validationAlerts[0] || null;
            const correctionProposal =
                validation && typeof validation.proposal === 'string' && validation.proposal.trim().length > 0
                    ? validation.proposal.trim()
                    : null;
            const suggestion =
                correctionProposal
                    || (primaryAlert && typeof primaryAlert.suggestion === 'string' && primaryAlert.suggestion.trim().length > 0
                    ? primaryAlert.suggestion
                    : (validation && typeof validation.suggestion === 'string' && validation.suggestion.trim().length > 0
                        ? validation.suggestion
                        : trimmed));
            const reason =
                primaryAlert && typeof primaryAlert.message === 'string' && primaryAlert.message.trim().length > 0
                    ? primaryAlert.message
                    : (validation && typeof validation.reason === 'string' && validation.reason.trim().length > 0
                        ? validation.reason
                        : 'The sentence needs review.');
            const isDuplicate = Boolean(duplicateAlert);
            const isWarning = !isDuplicate && Boolean(
                (primaryAlert && primaryAlert.severity === 'warning')
                || (validation && !validation.isValid && validation.warning)
            );

            if (isDuplicate) {
                state.rejectionReasons[index] = '';
                return {
                    state: 'duplicate',
                    label: 'Repetida',
                    summary: reason,
                    issues: []
                };
            }

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

    /**
     * Builds the visual result for an accepted suggestion.
     * @returns {*} Valid result.
     */
    function buildAcceptedResult() {
        return {
            state: 'valid',
            label: 'Válida',
            summary: 'No se han detectado problemas.',
            issues: []
        };
    }

    /**
     * Updates the per-sentence styles based on the validation results.
     * @param {Array} results - Visual results.
     */
    function updateSentenceStyles(results) {
        $('.sentence-block').each(function (idx) {
            $(this).removeClass('valid invalid warning duplicate');
            $(this).closest('.sentence-pair').removeClass('pair-valid pair-invalid pair-warning pair-duplicate');
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
            } else if (result.state === 'duplicate') {
                $(this).addClass('duplicate');
                $(this).closest('.sentence-pair').addClass('pair-duplicate');
            }

            $(this).find('.sentence-status').text(result.label === 'Pendiente' ? '' : result.label);
        });
    }

    /**
     * Renders the validation summary list.
     * @param {Array} results - Visual results.
     */
    function renderSummary(results) {
        const items = results.map((result, index) => {
            let badgeClass;
            if (result.state === 'valid')
                badgeClass = 'success';
            else if (result.state === 'invalid')
                badgeClass = 'danger';
            else if (result.state === 'duplicate')
                badgeClass = 'secondary';
            else
                badgeClass = 'warning';

            const badgeStyle = result.state === 'duplicate'
                ? ' style="background-color:#7e57c2!important;color:#fff;"'
                : '';

            return `
            <li class="list-group-item bg-transparent px-0">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div>
                        <strong>Oración ${index + 1}</strong><br>
                        <span class="text-muted">${escapeHtml(result.summary)}</span>
                    </div>
                    <span class="badge text-bg-${badgeClass}"${badgeStyle}>${result.label}</span>
                </div>
            </li>`;
        }).join('');

        $('#validationSummary').html(items);
    }

    /**
     * Renders the issue cards/tabs for sentences that need review.
     * @param {Array} results - Visual results.
     */
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
                ${item.issues.map((issue, issueIndex) => {
                    const rejectionReason = state.rejectionReasons[item.sentenceIndex] || '';
                    const isRejected = rejectionReason.trim().length > 0;

                    return `
                <div class="issue-card mb-3" data-sentence-index="${item.sentenceIndex}" data-issue-index="${issueIndex}">
                    <div class="issue-header ${issue.type}">Oración ${item.sentenceIndex + 1} · ${issue.title}</div>
                    <div class="issue-body">
                    <p class="mb-2">${escapeHtml(issue.message)}</p>
                    <div class="suggestion-preview">${escapeHtml(issue.suggestion)}</div>
                    <div class="mb-3">
                        <label class="form-label small">Sugerencia</label>
                        <input type="text" class="form-control form-control-sm suggestion-input" value="${escapeAttribute(issue.suggestion)}">
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-sm btn-outline-primary btn-accept">Aceptar sugerencia</button>
                        <button class="btn btn-sm ${isRejected ? 'btn-secondary active' : 'btn-outline-secondary'} btn-reject-toggle" aria-pressed="${isRejected ? 'true' : 'false'}">Rechazar</button>
                    </div>
                    <div class="mt-3 ${isRejected ? '' : 'd-none'} reject-wrapper">
                        <label class="form-label small">Razón</label>
                        <textarea class="form-control form-control-sm reject-reason" rows="2" placeholder="Explica por qué rechazas la sugerencia">${escapeHtml(rejectionReason)}</textarea>
                    </div>
                    </div>
                </div>`;
                }).join('')}
            </div>`).join('')}
        </div>
        `);

        const totalIssues = problematic.reduce((sum, item) => sum + item.issues.length, 0);
        $('#issuesCounter').text(`${totalIssues} pending issue${totalIssues > 1 ? 's' : ''}`);
    }

    /**
     * Updates the send button visibility based on results and sentences.
     * @param {Array} results - Visual results.
     * @param {Array} sentences - Current sentences.
     */
    function updateSendButton(results, sentences) {
        if (isDatasetLlmDisabled()) {
            updateBypassSendButton(sentences);
            return;
        }

        const allCompleted = sentences.every(sentence => sentence.trim().length > 0);
        const allResolvable = results.every((result, index) => {
            if (result.state === 'valid' || result.state === 'warning')
                return true;
            return Boolean(state.rejectionReasons[index]);
        });

        $('#btnSend').toggleClass('d-none', !(allCompleted && allResolvable));
    }

    /**
     * Renders already-resolved results without re-running validation.
     * @param {Array} results - Visual results.
     * @param {Array} sentences - Current sentences.
     */
    function renderResolvedState(results, sentences) {
        state.lastSentences = sentences.slice();
        state.lastResults = results.slice();

        updateSentenceStyles(state.lastResults);
        renderSummary(state.lastResults);
        renderIssues(state.lastResults);
        updateSendButton(state.lastResults, state.lastSentences);
    }

    /**
     * Renders the validation result for the given sentences.
     * @param {Array} validations - Backend validations.
     * @param {Array} sentences - Current sentences.
     */
    function renderValidation(validations, sentences) {
        const results = mapValidationsToResults(sentences, validations);
        state.lastSentences = sentences.slice();
        state.lastResults = results;

        updateSentenceStyles(results);
        renderSummary(results);
        renderIssues(results);
        updateSendButton(results, sentences);
    }

    /**
     * Runs the validation flow for the current entry's sentences.
     * @param {boolean} showToastMessage - Whether to show a toast on success.
     * @returns {*} Promise of the validation request.
     */
    function runValidation(showToastMessage) {
        const entry = getCurrentEntry();
        if (!entry) {
            showToast('No hay ninguna entry cargada.');
            return $.Deferred().reject().promise();
        }

        if (isDatasetLlmDisabled()) {
            sendAnnotations();
            return $.Deferred().resolve().promise();
        }

        const sentences = getSentenceValues();

        return window.checkAnnotations(sentences, buildCheckEntryContext(entry))
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

    /**
     * Checks whether the given sentences match the last validated ones.
     * @param {Array} sentences - Current sentences.
     * @returns {boolean} True if they are in sync.
     */
    function areSentencesSynced(sentences) {
        return sentences.length === state.lastSentences.length
            && sentences.every((sentence, index) => sentence === state.lastSentences[index]);
    }

    /**
     * Sends the current annotations, validating/synchronizing first as needed.
     */
    function sendAnnotations() {
        const entry = getCurrentEntry();
        if (!entry) {
            showToast('No hay ninguna entry activa.');
            return;
        }

        const sentences = getSentenceValues();

        if (isDatasetLlmDisabled()) {
            if (!sentences.every(sentence => typeof sentence === 'string' && sentence.trim().length > 0)) {
                showToast('Completa todas las oraciones antes de enviar.');
                return;
            }

            state.lastSentences = sentences.slice();
            state.lastResults = sentences.map(buildAcceptedResult);
            state.rejectionReasons = Array.from({ length: sentences.length }, () => '');
            postCurrentAnnotations(sentences);
            return;
        }

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

        postCurrentAnnotations(sentences);
    }

    /**
     * Persists the current annotations and advances the view.
     * @param {Array} sentences - Final sentences.
     */
    function postCurrentAnnotations(sentences) {
        const timeSpentSeconds = state.entryStartedAt
            ? Math.floor((Date.now() - state.entryStartedAt) / 1000)
            : 0;
        window.postAnnotations(state.datasetId, state.rdfId, sentences, state.rejectionReasons, {
            sectionNumber: state.currentSectionNumber,
            isLastEntry: state.isLastEntryInSection,
            timeSpentSeconds
        })
            .done(function (response) {
                sentences.forEach(sentence => {
                    const trimmed = typeof sentence === 'string' ? sentence.trim() : '';
                    if (trimmed)
                        state.submittedSentences.push(trimmed);
                });
                const message =
                    response && response.savedAt
                        ? 'Anotaciones guardadas correctamente.'
                        : ((response && response.message)
                            || 'Sentences sent successfully.');
                showToast(message);

                if (response && response.sessionAdvance && response.sessionAdvance.sectionDone) {
                    completeSection(response.sessionAdvance.moreSectionsAvailable !== false);
                    return;
                }

                loadNextEntry();
            })
            .fail(function (xhr) {
                const message = extractApiErrorMessage(xhr, 'The sentences could not be sent.');
                showToast(message);
            });
    }

    /**
     * Resolves the active session and loads the current entry for the dataset.
     */
    function loadCurrentEntry() {
        const pageParams = getPageParams();
        const debugDefaults = window.getDebugParams();
        const datasetId = pageParams.datasetId || (debugDefaults && debugDefaults.datasetId);

        if (!datasetId) {
            setFormEnabled(false);
            updateTaskCopy('Selecciona un dataset desde la vista de datasets para comenzar una sección.');
            updateHeaderInfo();
            return;
        }

        state.datasetId = datasetId;
        updateTaskCopy('Resolviendo la sección activa para este dataset...');
        setFormEnabled(false);

        resolveDatasetOptions(datasetId, pageParams.llmMode)
            .always(function () {
                window.fetchContinueAnnotation(datasetId)
                    .done(function (continuePayload) {
                        const result = continuePayload && typeof continuePayload === 'object'
                            ? continuePayload
                            : {};
                        const caseNumber = Number(result.caseNumber);

                        if (caseNumber !== 4 && caseNumber !== 5) {
                            showDatasetCompletedScreen();
                            return;
                        }

                        window.fetchNextEntry(datasetId)
                            .done(function (payload) {
                                if (!payload || !payload.entry) {
                                    updateHeaderInfo();
                                    updateTaskCopy('La sección activa no tiene entries pendientes.');
                                    return;
                                }
                                applyEntryPayload(payload, { showToast: false });
                            })
                            .fail(function (xhr) {
                                const message = extractApiErrorMessage(xhr, 'No se pudo cargar la entry activa.');
                                state.datasetId = null;
                                state.datasetName = '';
                                state.totalSections = 0;
                                state.currentEntry = null;
                                state.totalEntriesInSection = 0;
                                updateHeaderInfo();
                                updateTaskCopy(message);
                                showToast(message);
                            });
                    })
                    .fail(function (xhr) {
                        const message = extractApiErrorMessage(xhr, 'No se pudo iniciar la sesión de anotación.');
                        state.datasetId = null;
                        state.datasetName = '';
                        state.totalSections = 0;
                        state.currentEntry = null;
                        state.totalEntriesInSection = 0;
                        updateHeaderInfo();
                        updateTaskCopy(message);
                        showToast(message);
                    });
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

        const sentences = getSentenceValues();
        const results = state.lastResults.slice();
        results[sentenceIndex] = buildAcceptedResult();

        renderResolvedState(results, sentences);
        showToast(`Sugerencia aceptada para la oración ${sentenceIndex + 1}.`);
    });

    $('#issueContent').on('click', '.btn-reject-toggle', function () {
        const issueCard = $(this).closest('.issue-card');
        const sentenceIndex = Number(issueCard.data('sentence-index'));

        issueCard.find('.reject-wrapper').removeClass('d-none');
        $(this)
            .addClass('active')
            .removeClass('btn-outline-secondary')
            .addClass('btn-secondary')
            .attr('aria-pressed', 'true');

        if (sentenceIndex >= 0 && sentenceIndex < state.rejectionReasons.length)
            issueCard.find('.reject-reason').val(state.rejectionReasons[sentenceIndex] || '');

        issueCard.find('.reject-reason').trigger('focus');
    });

    $('#issueContent').on('input', '.reject-reason', function () {
        const issueCard = $(this).closest('.issue-card');
        const sentenceIndex = Number(issueCard.data('sentence-index'));
        if (sentenceIndex < 0 || sentenceIndex >= state.rejectionReasons.length)
            return;

        state.rejectionReasons[sentenceIndex] = $(this).val().trim();
        updateSendButton(state.lastResults, getSentenceValues());
    });

    $('#sentencesForm').on('input', '.sentence-input', function () {
        const inputId = $(this).attr('id');
        const sentenceIndex = Number(inputId.replace('sentence', '')) - 1;
        if (sentenceIndex >= 0 && sentenceIndex < state.rejectionReasons.length)
            state.rejectionReasons[sentenceIndex] = '';

        if (isDatasetLlmDisabled()) {
            updateBypassSendButton(getSentenceValues());
            return;
        }

        $('#btnSend').addClass('d-none');
    });

    $('#btnLoadExample').on('click', loadExample);
    $('#btnReset').on('click', function () {
        resetForm(true);
    });
    $('#btnSend').on('click', sendAnnotations);
    $('#btnContinueSection').on('click', loadNextSection);

    renderSentencePairs(null);
    populateTriple({ predicate: '<predicate>', subject: '<subject>', object: '<object>' });
    $('#btnCheck').addClass('d-none');
    clearValidationUI();
    setFormEnabled(false);
    updateHeaderInfo();
    loadCurrentEntry();
    });
}
