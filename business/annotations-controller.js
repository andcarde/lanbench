'use strict';

const SpanishController = require('./spanish-controller');

const savedAnnotations = [];

function check(request, response) {
    const sentences = normalizeSentencesPayload(request.body);
    if (!isStringArray(sentences))
        return response.status(400).json({ text: 'Datos inválidos' });

    return checkSentences(sentences, [], (error, validations) => {
        if (error)
            return response.status(500).json({ text: getErrorMessage(error) });
        return response.status(200).json(validations);
    });
}

function send(request, response) {
    const payload = normalizeSendPayload(request.body);
    if (!isSendPayloadValid(payload.sentences, payload.rdfId, payload.rejectionReason))
        return response.status(400).json({ text: 'Datos inválidos' });

    return saveSentences(payload.rdfId, payload.sentences, payload.rejectionReason, 0, (error) => {
        if (error)
            return response.status(500).json({ text: getErrorMessage(error) });
        return response.status(200).json({ message: 'Sentences saved successfully.' });
    });
}

function checkSentences(pendingSentences, validations, callback) {
    if (pendingSentences.length === 0)
        return callback(null, validations);

    const [sentence, ...restSentences] = pendingSentences;
    return runCheck(sentence, (error, result) => {
        if (error)
            return callback(error);

        if (result.valid) {
            validations.push({ valid: true });
        } else {
            validations.push({
                valid: false,
                reason: result.reason,
                suggestion: result.suggestion
            });
        }

        return checkSentences(restSentences, validations, callback);
    });
}

function saveSentences(rdfId, sentences, rejectionReasons, index, callback) {
    if (index >= sentences.length)
        return callback(null);

    const sentence = sentences[index];
    const rejectionReason = rejectionReasons[index];
    return runSave(rdfId, sentence, rejectionReason, (error) => {
        if (error)
            return callback(error);
        return saveSentences(rdfId, sentences, rejectionReasons, index + 1, callback);
    });
}

function runCheck(sentence, callback) {
    try {
        if (typeof SpanishController.check !== 'function')
            return callback(null, { valid: true, reason: null, suggestion: null });

        if (SpanishController.check.length >= 2)
            return SpanishController.check(sentence, (error, result) => {
                if (error)
                    return callback(error);
                return callback(null, normalizeCheckResult(result));
            });

        const result = SpanishController.check(sentence);
        if (result && typeof result.then === 'function')
            return result.then(checkResult => callback(null, normalizeCheckResult(checkResult))).catch(callback);

        return callback(null, normalizeCheckResult(result));
    } catch (error) {
        return callback(error);
    }
}

function runSave(rdfId, sentence, rejectionReason, callback) {
    try {
        if (typeof SpanishController.save === 'function' && SpanishController.save.length >= 4)
            return SpanishController.save(rdfId, sentence, rejectionReason, (error, result) => {
                if (error)
                    return callback(error);
                return finalizeSavedSentence(result, rdfId, sentence, rejectionReason, callback);
            });

        if (typeof SpanishController.save === 'function') {
            const result = SpanishController.save(rdfId, sentence, rejectionReason);
            if (result && typeof result.then === 'function')
                return result
                    .then(saveResult => finalizeSavedSentence(saveResult, rdfId, sentence, rejectionReason, callback))
                    .catch(callback);

            return finalizeSavedSentence(result, rdfId, sentence, rejectionReason, callback);
        }

        return finalizeSavedSentence(null, rdfId, sentence, rejectionReason, callback);
    } catch (error) {
        return callback(error);
    }
}

function finalizeSavedSentence(result, rdfId, sentence, rejectionReason, callback) {
    if (result && typeof result === 'object' && result.error)
        return callback(result.error);

    savedAnnotations.push({
        rdfId,
        sentence,
        rejectionReason: rejectionReason || '',
        savedAt: new Date().toISOString()
    });

    return callback(null);
}

function normalizeCheckResult(result) {
    if (!result || typeof result !== 'object')
        return { valid: true, reason: null, suggestion: null };

    return {
        valid: Boolean(result.valid),
        reason: result.reason || null,
        suggestion: result.suggestion || null
    };
}

function normalizeSentencesPayload(payload) {
    if (Array.isArray(payload))
        return payload;
    if (payload && Array.isArray(payload.sentences))
        return payload.sentences;
    return null;
}

function normalizeSendPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return { sentences: null, rdfId: null, rejectionReason: null };

    return {
        sentences: payload.sentences,
        rdfId: payload.rdfId,
        rejectionReason: payload.rejectionReason || payload.rejectionReasons
    };
}

function isSendPayloadValid(sentences, rdfId, rejectionReasons) {
    return isStringArray(sentences)
        && Number.isInteger(rdfId)
        && isStringArray(rejectionReasons)
        && rejectionReasons.length === sentences.length;
}

function isStringArray(values) {
    return Array.isArray(values)
        && values.every(value => typeof value === 'string');
}

function getErrorMessage(error) {
    if (!error)
        return 'Error interno del servidor';
    return error.message || String(error);
}

module.exports = {
    check,
    send
};
