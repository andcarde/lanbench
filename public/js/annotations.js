const exampleData = {
    triple: {
        predicate: 'uses',
        subject: 'summary',
        object: 'pencil'
    },
    sentences: [
        'Yo resumo pero dame un lápiz.',
        'Yo ago el resumen pero necesito una lápiz',
        'Con un lápiz puedo hacer el resumen'
    ]
};

$(document).ready(() => {
    const state = {
        rdfId: 1,
        lastSentences: ['', '', ''],
        lastResults: [],
        rejectionReasons: ['', '', '']
    };

    const toast = new bootstrap.Toast(document.getElementById('actionToast'));

    function showToast(message) {
        $('#toastMessage').text(message);
        toast.show();
    }

    function getRDFTripleById(id) {
        return {
            id,
            predicate: 'uses',
            subject: 'summary',
            object: 'pencil'
        };
    }

    function populateTriple(data) {
        $('#triplePredicate').text(data.predicate);
        $('#tripleSubject').text(data.subject);
        $('#tripleObject').text(data.object);
    }

    function getSentenceValues() {
        return [$('#sentence1').val(), $('#sentence2').val(), $('#sentence3').val()];
    }

    function clearValidationUI() {
        $('.sentence-block').removeClass('valid invalid warning');
        $('.sentence-status').text('');
        $('#validationSummary').html('<li class="list-group-item bg-transparent px-0 text-muted">No validation executed yet.</li>');
        $('#issuesCard').addClass('d-none');
        $('#issueTabsWrapper').addClass('d-none');
        $('#issueTabs').empty();
        $('#issueContent').empty();
        $('#issuesCounter').text('0 pending issues');
        $('#btnSend').addClass('d-none');
    }

    function resetState() {
        state.lastSentences = ['', '', ''];
        state.lastResults = [];
        state.rejectionReasons = ['', '', ''];
    }

    function loadExample() {
        const triple = getRDFTripleById(state.rdfId);
        populateTriple(triple);
        $('#sentence1').val(exampleData.sentences[0]);
        $('#sentence2').val(exampleData.sentences[1]);
        $('#sentence3').val(exampleData.sentences[2]);
        resetState();
        clearValidationUI();
        showToast('Example loaded.');
    }

    function resetForm() {
        $('#sentencesForm')[0].reset();
        populateTriple({ predicate: '<predicate>', subject: '<subject>', object: '<object>' });
        resetState();
        clearValidationUI();
        showToast('Form reset.');
    }

    function escapeHtml(text) {
        return $('<div>').text(text).html();
    }

    function escapeAttribute(text) {
        return String(text).replace(/"/g, '&quot;');
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
                    label: 'Pending',
                    summary: 'Empty sentence.',
                    issues: []
                };
            }

            if (validation && validation.valid) {
                state.rejectionReasons[index] = '';
                return {
                    state: 'valid',
                    label: 'Valid',
                    summary: 'No issues detected.',
                    issues: []
                };
            }

            const suggestion =
                validation && typeof validation.suggestion === 'string' && validation.suggestion.trim().length > 0
                    ? validation.suggestion
                    : trimmed;
            const reason =
                validation && typeof validation.reason === 'string' && validation.reason.trim().length > 0
                    ? validation.reason
                    : 'The sentence needs review.';

            if (rejectionReason) {
                return {
                    state: 'warning',
                    label: 'Rejected with reason',
                    summary: `Suggestion rejected: ${rejectionReason}`,
                    issues: []
                };
            }

            return {
                state: 'invalid',
                label: 'Needs review',
                summary: reason,
                issues: [
                    {
                        type: 'invalid',
                        title: 'Grammar',
                        message: reason,
                        suggestion,
                        reasonPlaceholder: 'Write here the reason for rejection'
                    }
                ]
            };
        });
    }

    function updateSentenceStyles(results) {
        $('.sentence-block').each(function (idx) {
            $(this).removeClass('valid invalid warning');
            const result = results[idx];
            if (!result)
                return;

            if (result.state === 'valid')
                $(this).addClass('valid');
            else if (result.state === 'invalid')
                $(this).addClass('invalid');
            else if (result.state === 'warning')
                $(this).addClass('warning');

            $(this).find('.sentence-status').text(result.label === 'Pending' ? '' : result.label);
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
                        <label class="form-label small">Suggestion preview</label>
                        <input type="text" class="form-control form-control-sm suggestion-input" value="${escapeAttribute(issue.suggestion)}">
                    </div>
                    <div class="mb-3 d-none reject-wrapper">
                        <label class="form-label small">Reason for rejection</label>
                        <textarea class="form-control form-control-sm reject-reason" rows="2" placeholder="${issue.reasonPlaceholder}"></textarea>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-sm btn-outline-primary btn-accept">Accept suggestion</button>
                        <button class="btn btn-sm btn-outline-secondary btn-reject-toggle">Reject</button>
                        <button class="btn btn-sm btn-secondary d-none btn-save-reject">Save rejection</button>
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
        const sentences = getSentenceValues();

        return $.ajax({
            url: '/annotations/check',
            type: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({ sentences })
        })
            .done(function (validations) {
                renderValidation(validations, sentences);
                if (showToastMessage)
                    showToast('Validation executed.');
            })
            .fail(function (xhr) {
                const message =
                    (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.text))
                    || 'Validation failed.';
                showToast(message);
            });
    }

    function areSentencesSynced(sentences) {
        return sentences.length === state.lastSentences.length
            && sentences.every((sentence, index) => sentence === state.lastSentences[index]);
    }

    function sendAnnotations() {
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

        $.ajax({
            url: '/annotations/send',
            type: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({
                rdfId: state.rdfId,
                sentences,
                rejectionReason: state.rejectionReasons.map(reason => reason || '')
            })
        })
            .done(function (response) {
                const message =
                    (response && response.message)
                    || 'Sentences sent successfully.';
                showToast(message);
            })
            .fail(function (xhr) {
                const message =
                    (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.text))
                    || 'The sentences could not be sent.';
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

    $('.sentence-input').on('input', function () {
        const inputId = $(this).attr('id');
        const sentenceIndex = Number(inputId.replace('sentence', '')) - 1;
        if (sentenceIndex >= 0 && sentenceIndex < state.rejectionReasons.length)
            state.rejectionReasons[sentenceIndex] = '';

        $('#btnSend').addClass('d-none');
    });

    $('#btnLoadExample').on('click', loadExample);
    $('#btnReset').on('click', resetForm);
    $('#btnSend').on('click', sendAnnotations);

    populateTriple({ predicate: '<predicate>', subject: '<subject>', object: '<object>' });
    clearValidationUI();
});