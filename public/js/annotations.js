// @ts-nocheck
/**
 * @file Frontend de `public/annotations.html` — pagina principal de
 * anotacion.
 *
 * Renderiza la entry actual (triples + oraciones de referencia), gestiona
 * el editor de oraciones del anotador con su validacion via
 * `/api/annotations/check`, persiste cada envio via `/api/annotations/send`
 * y avanza la sesion con `/api/annotations/:datasetId/continue` /
 * `/api/annotations/:datasetId/next`.
 */
const exampleData = {
    sentences: [
        'Yo resumo pero dame un lápiz.',
        'Yo hago el resumen pero necesito un lápiz.',
        'Con un lápiz puedo hacer el resumen.'
    ]
};

/**
 * Ejecuta la logica de extract api error message.
 * @param {*} errorLike - Valor de errorLike usado por la funcion.
 * @param {string} fallbackMessage - Valor de fallbackMessage usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
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
     * Actualiza toast con los datos indicados.
     * @param {string} message - Valor de message usado por la funcion.
     */
    function showToast(message) {
        $('#toastMessage').text(message);
        toast.show();
    }

    /**
     * Convierte escape html al formato esperado.
     * @param {string} text - Valor de text usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function escapeHtml(text) {
        return $('<div>').text(text).html();
    }

    /**
     * Convierte escape attribute al formato esperado.
     * @param {string} text - Valor de text usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function escapeAttribute(text) {
        return String(text).replace(/"/g, '&quot;');
    }

    /**
     * Convierte to positive integer al formato esperado.
     * @param {*} value - Valor de value usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function toPositiveInteger(value) {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0)
            return null;
        return parsed;
    }

    /**
     * Obtiene page params desde la fuente correspondiente.
     * @returns {*} Resultado producido por la funcion.
     */
    function getPageParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            datasetId: toPositiveInteger(params.get('datasetId')),
            llmMode: normalizeLlmMode(params.get('llmMode'))
        };
    }

    /**
     * Normaliza el modo LLM recibido desde backend o URL.
     * @param {*} value - Valor de modo LLM.
     * @returns {?string} Modo normalizado.
     */
    function normalizeLlmMode(value) {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return ['generation', 'correction', 'none'].includes(normalized) ? normalized : null;
    }

    /**
     * Indica si las comprobaciones LLM estan desactivadas para el dataset.
     * @returns {boolean} True si el modo es none.
     */
    function isDatasetLlmDisabled() {
        return normalizeLlmMode(state.datasetOptions && state.datasetOptions.llmMode) === 'none';
    }

    /**
     * Obtiene current entry desde la fuente correspondiente.
     * @returns {*} Resultado producido por la funcion.
     */
    function getCurrentEntry() {
        return state.currentEntry || null;
    }

    /**
     * Obtiene entry triples desde la fuente correspondiente.
     * @param {*} entry - Valor de entry usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Obtiene primary triple desde la fuente correspondiente.
     * @param {*} entry - Valor de entry usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Actualiza triple con los datos indicados.
     * @param {*} data - Valor de data usado por la funcion.
     */
    function populateTriple(data) {
        $('#triplePredicate').text(data.predicate);
        $('#tripleSubject').text(data.subject);
        $('#tripleObject').text(data.object);
    }

    /**
     * Renderiza triples list en la interfaz.
     * @param {*} entry - Valor de entry usado por la funcion.
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
     * Obtiene required sentence count desde la fuente correspondiente.
     * @param {*} entry - Valor de entry usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Obtiene current sentence count desde la fuente correspondiente.
     * @returns {*} Resultado producido por la funcion.
     */
    function getCurrentSentenceCount() {
        return $('.sentence-input').length || 3;
    }

    /**
     * Renderiza sentence pairs en la interfaz.
     * @param {*} entry - Valor de entry usado por la funcion.
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
     * Obtiene sentence values desde la fuente correspondiente.
     * @returns {*} Resultado producido por la funcion.
     */
    function getSentenceValues() {
        return $('.sentence-input').map(function () {
            return $(this).val();
        }).get();
    }

    /**
     * Construye check entry context a partir de los datos recibidos.
     * @param {*} entry - Valor de entry usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
            previousSentences: state.submittedSentences.slice()
        };
    }

    /**
     * Ejecuta la logica de clear validation ui.
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
     * Aplica las opciones del dataset en el estado de la vista.
     * @param {*} options - Opciones del dataset.
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
     * Carga opciones del dataset desde backend.
     * @param {number} datasetId - Identificador del dataset.
     * @returns {Promise<*>} Promesa de carga.
     */
    function loadDatasetOptions(datasetId) {
        if (typeof fetchDatasetOptions !== 'function') {
            applyDatasetOptions({ llmMode: 'correction' });
            return $.Deferred().resolve(state.datasetOptions).promise();
        }

        return fetchDatasetOptions(datasetId)
            .done(function (options) {
                applyDatasetOptions(options);
            })
            .fail(function () {
                applyDatasetOptions({ llmMode: 'correction' });
                showToast('No se pudieron cargar las opciones del dataset.');
            });
    }

    /**
     * Resuelve opciones desde URL o backend.
     * @param {number} datasetId - Identificador del dataset.
     * @param {?string} llmMode - Modo recibido por URL.
     * @returns {Promise<*>} Promesa de opciones.
     */
    function resolveDatasetOptions(datasetId, llmMode) {
        if (llmMode) {
            applyDatasetOptions({ llmMode });
            return $.Deferred().resolve(state.datasetOptions).promise();
        }

        return loadDatasetOptions(datasetId);
    }

    /**
     * Ajusta controles de validacion segun las opciones del dataset.
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
     * Actualiza el boton de envio cuando no hay fase de check.
     * @param {Array} sentences - Oraciones actuales.
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
     * Ejecuta la logica de reset validation state.
     * @param {number} sentenceCount - Valor de sentenceCount usado por la funcion.
     */
    function resetValidationState(sentenceCount = getCurrentSentenceCount()) {
        state.lastSentences = Array.from({ length: sentenceCount }, () => '');
        state.lastResults = [];
        state.rejectionReasons = Array.from({ length: sentenceCount }, () => '');
    }

    /**
     * Actualiza task copy con los datos indicados.
     * @param {string} message - Valor de message usado por la funcion.
     */
    function updateTaskCopy(message) {
        $('#taskTitle').text('Task · RDF to Spanish');
        $('#taskSubtitle').text(message);
    }

    /**
     * Actualiza header info con los datos indicados.
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
     * Actualiza form enabled con los datos indicados.
     * @param {boolean} isEnabled - Valor de isEnabled usado por la funcion.
     */
    function setFormEnabled(isEnabled) {
        $('.sentence-input').prop('disabled', !isEnabled);
        $('#btnCheck').prop('disabled', !isEnabled);
        $('#btnSend').prop('disabled', !isEnabled);
        $('#btnReset').prop('disabled', !isEnabled);
        $('#btnLoadExample').prop('disabled', !isEnabled);
    }

    /**
     * Obtiene example desde la fuente correspondiente.
     * @returns {Promise<*>} Resultado producido por la funcion.
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
     * Ejecuta la logica de reset form.
     * @param {string} showMessage - Valor de showMessage usado por la funcion.
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
     * Obtiene entry desde la fuente correspondiente.
     * @param {*} entryIndex - Valor de entryIndex usado por la funcion.
     * @param {*} options - Valor de options usado por la funcion.
     * @returns {Promise<*>} Resultado producido por la funcion.
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
     * Ejecuta la logica de replace navigation state.
     * @returns {*} Resultado producido por la funcion.
     */
    function replaceNavigationState() {
        const params = new URLSearchParams();

        if (state.datasetId)
            params.set('datasetId', String(state.datasetId));

        if (window.history && typeof window.history.replaceState === 'function')
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }

    /**
     * Ejecuta la logica de complete section.
     * @returns {*} Resultado producido por la funcion.
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
     * Ejecuta la logica de show section completed screen.
     * @returns {*} Resultado producido por la funcion.
     */
    function showSectionCompletedScreen(moreSectionsAvailable = true) {
        $('#issuesCard').addClass('d-none');
        $('#sectionCompletedCard').removeClass('d-none');
        $('#datasetCompletedCard').addClass('d-none');
        $('#btnContinueSection').toggleClass('d-none', !moreSectionsAvailable);
        showToast(`Sección ${state.currentSectionNumber} completada.`);
    }

    /**
     * Ejecuta la logica de show dataset completed screen.
     * @returns {*} Resultado producido por la funcion.
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
     * Ejecuta la logica de load next section.
     * @returns {Promise<*>} Resultado producido por la funcion.
     */
    function loadNextSection() {
        setFormEnabled(false);
        updateTaskCopy('Cargando siguiente sección...');

        fetchContinueAnnotation(state.datasetId)
            .done(function (continuePayload) {
                const result = continuePayload && typeof continuePayload === 'object' ? continuePayload : {};
                const caseNumber = Number(result.caseNumber);

                if (caseNumber !== 4 && caseNumber !== 5) {
                    showDatasetCompletedScreen();
                    return;
                }

                fetchNextEntry(state.datasetId)
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
     * Obtiene next entry desde la fuente correspondiente.
     * @returns {Promise<*>} Resultado producido por la funcion.
     */
    function loadNextEntry() {
        if (state.isLastEntryInSection) {
            completeSection();
            return;
        }

        setFormEnabled(false);
        fetchNextEntry(state.datasetId)
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
     * Mapea validations to results al formato usado por la aplicacion.
     * @param {Array} sentences - Valor de sentences usado por la funcion.
     * @param {Array} validations - Valor de validations usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Construye resultado visual para una sugerencia aceptada.
     * @returns {*} Resultado valido.
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
     * Actualiza sentence styles con los datos indicados.
     * @param {Array} results - Valor de results usado por la funcion.
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
     * Renderiza summary en la interfaz.
     * @param {Array} results - Valor de results usado por la funcion.
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
     * Renderiza issues en la interfaz.
     * @param {Array} results - Valor de results usado por la funcion.
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
     * Actualiza send button con los datos indicados.
     * @param {Array} results - Valor de results usado por la funcion.
     * @param {Array} sentences - Valor de sentences usado por la funcion.
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
     * Renderiza resultados ya resueltos sin volver a consultar la validacion.
     * @param {Array} results - Resultados visuales.
     * @param {Array} sentences - Oraciones actuales.
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
     * Renderiza validation en la interfaz.
     * @param {Array} validations - Valor de validations usado por la funcion.
     * @param {Array} sentences - Valor de sentences usado por la funcion.
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
     * Ejecuta la logica de run validation.
     * @param {string} showToastMessage - Valor de showToastMessage usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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

    /**
     * Ejecuta la logica de are sentences synced.
     * @param {Array} sentences - Valor de sentences usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function areSentencesSynced(sentences) {
        return sentences.length === state.lastSentences.length
            && sentences.every((sentence, index) => sentence === state.lastSentences[index]);
    }

    /**
     * Ejecuta la logica de send annotations.
     * @returns {*} Resultado producido por la funcion.
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
     * Persiste las anotaciones actuales y avanza la vista.
     * @param {Array} sentences - Oraciones definitivas.
     */
    function postCurrentAnnotations(sentences) {
        postAnnotations(state.datasetId, state.rdfId, sentences, state.rejectionReasons, {
            sectionNumber: state.currentSectionNumber,
            isLastEntry: state.isLastEntryInSection
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
     * Obtiene dataset section desde la fuente correspondiente.
     * @returns {Promise<*>} Resultado producido por la funcion.
     */
    function loadCurrentEntry() {
        const pageParams = getPageParams();
        const debugDefaults = getDebugParams();
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
                fetchContinueAnnotation(datasetId)
                    .done(function (continuePayload) {
                        const result = continuePayload && typeof continuePayload === 'object'
                            ? continuePayload
                            : {};
                        const caseNumber = Number(result.caseNumber);

                        if (caseNumber !== 4 && caseNumber !== 5) {
                            showDatasetCompletedScreen();
                            return;
                        }

                        fetchNextEntry(datasetId)
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
