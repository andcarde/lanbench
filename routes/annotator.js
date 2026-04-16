'use strict';

const express = require('express');
const router = express.Router();
const SpanishController = require('../business/spanish-controller');

router.post('/check', (request, response) => {
    const sentences = request.body;
    if (!isStringArray(sentences))
        return response.status(400).json({ text: 'Datos inválidos' });

    checkSentences(sentences, [], (error, validations) => {
        if (error)
            return response.status(500).json({ text: getErrorMessage(error) });
        return response.status(200).json(validations);
    });
});

router.post('/send', (request, response) => {
    const sentences = request.body.sentences;
    const rdfId = request.body.rdfId;
    const rejectionReasons = request.body.rejectionReason;

    if (!isSendPayloadValid(sentences, rdfId, rejectionReasons))
        return response.status(400).json({ text: 'Datos inválidos' });

    saveSentences(rdfId, sentences, rejectionReasons, 0, (error) => {
        if (error)
            return response.status(500).json({ text: getErrorMessage(error) });
        return response.status(200).send();
    });
});

function checkSentences(pendingSentences, validations, callback) {
    if (pendingSentences.length === 0)
        return callback(null, validations);

    const [sentence, ...restSentences] = pendingSentences;
    return runCheck(sentence, (error, result) => {
        if (error)
            return callback(error);

        if (result.valid)
            validations.push({ valid: true });
        else
            validations.push({
                valid: false,
                reson: result.reason,
                suggestion: result.suggestion
            });

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
    const finalize = (result) => {
        if (!result || typeof result !== 'object')
            return callback(new Error('Respuesta inválida de SpanishController.check'));
        if (result.error)
            return callback(result.error);
        return callback(null, {
            valid: Boolean(result.valid),
            reason: result.reason || null,
            suggestion: result.suggestion || null
        });
    };

    try {
        if (SpanishController.check.length >= 2)
            return SpanishController.check(sentence, (...args) => {
                const error = args[0];
                const result = args[1];

                if (args.length === 1 && error && typeof error === 'object' && ('valid' in error || 'error' in error))
                    return finalize(error);
                if (error)
                    return callback(error);
                return finalize(result);
            });

        const result = SpanishController.check(sentence);
        if (result && typeof result.then === 'function')
            return result.then(finalize).catch(callback);

        return finalize(result);
    } catch (error) {
        return callback(error);
    }
}

function runSave(rdfId, sentence, rejectionReason, callback) {
    const finalize = (result) => {
        if (!result || typeof result !== 'object')
            return callback(null);
        if (result.error)
            return callback(result.error);
        return callback(null);
    };

    try {
        if (SpanishController.save.length >= 4)
            return SpanishController.save(rdfId, sentence, rejectionReason, (...args) => {
                const error = args[0];
                const result = args[1];
                if (error)
                    return callback(error);
                return finalize(result);
            });

        const result = SpanishController.save(rdfId, sentence, rejectionReason);
        if (result && typeof result.then === 'function')
            return result.then(finalize).catch(callback);

        return finalize(result);
    } catch (error) {
        return callback(error);
    }
}

function isSendPayloadValid(sentences, rdfId, rejectionReasons) {
    return isStringArray(sentences)
        && isInteger(rdfId)
        && isStringArray(rejectionReasons)
        && rejectionReasons.length === sentences.length;
}

function isStringArray(values) {
    return Array.isArray(values)
        && values.every(value => typeof value === 'string');
}

function isInteger(value) {
    return Number.isInteger(value);
}

function getErrorMessage(error) {
    if (!error)
        return 'Error interno del servidor';
    return error.message || String(error);
}

module.exports = router;
