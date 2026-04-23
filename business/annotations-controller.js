'use strict';

const { createAnnotationsService } = require('../services/annotations-service');
const { User } = require('../entities/user');
const { isStringArray, getErrorMessage } = require('../utils/validators');
const { buildApiErrorPayloadFromError } = require('../utils/api-error-payload');
const { normalizeIncomingEntryContext } = require('../contracts/dto-mappers');

function createAnnotationsController({ annotationsService } = {}) {
    const service = annotationsService || createAnnotationsService();

    async function check(request, response) {
        const payload = normalizeCheckPayload(request.body);
        if (!isStringArray(payload.sentences))
            return response.status(400).json(legacyTextError('Datos inválidos'));

        try {
            const validations = await service.checkSentences(payload.sentences, payload.entryContext);
            return response.status(200).json(validations);
        } catch (error) {
            return response.status(500).json(
                buildApiErrorPayloadFromError(error, getErrorMessage(error))
            );
        }
    }

    async function send(request, response) {
        const idUser = resolveSessionUserId(request);
        if (idUser === null)
            return response.status(403).json(legacyTextError('Sesión no válida.'));

        const payload = normalizeSendPayload(request.body);
        if (!isSendPayloadValid(payload.sentences, payload.entryId, payload.datasetId, payload.rejectionReasons))
            return response.status(400).json(legacyTextError('Datos inválidos'));

        try {
            const savedAnnotation = await service.saveSentences({
                idUser,
                idDataset: payload.datasetId,
                rdfId: payload.entryId,
                sentences: payload.sentences,
                rejectionReasons: payload.rejectionReasons
            });

            return response.status(200).json(savedAnnotation);
        } catch (error) {
            if (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500)
                return response.status(error.status).json(
                    buildApiErrorPayloadFromError(error, getErrorMessage(error))
                );

            return response.status(500).json(
                buildApiErrorPayloadFromError(error, getErrorMessage(error))
            );
        }
    }

    return { check, send };
}

function normalizeSentencesPayload(payload) {
    if (Array.isArray(payload))
        return payload;
    if (payload && Array.isArray(payload.sentences))
        return payload.sentences;
    return null;
}

function normalizeCheckPayload(payload) {
    return {
        sentences: normalizeSentencesPayload(payload),
        entryContext: normalizeEntryContext(
            payload && typeof payload === 'object'
                ? (payload.entryContext || payload.entry || null)
                : null
        )
    };
}

function normalizeEntryContext(entryContext) {
    const normalized = normalizeIncomingEntryContext(entryContext);
    if (!normalized)
        return null;

    return {
        eid: normalized.eid,
        category: normalized.category,
        sourceSentences: normalized.sourceSentences,
        triples: normalized.triples
    };
}

function normalizeSendPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return { sentences: null, entryId: null, datasetId: null, rejectionReasons: null };

    return {
        sentences: payload.sentences,
        entryId: toPositiveInteger(payload.entryId ?? payload.rdfId),
        datasetId: toPositiveInteger(payload.datasetId),
        rejectionReasons: payload.rejectionReasons || payload.rejectionReason
    };
}

function isSendPayloadValid(sentences, entryId, datasetId, rejectionReasons) {
    return isStringArray(sentences)
        && Number.isInteger(entryId)
        && entryId > 0
        && Number.isInteger(datasetId)
        && datasetId > 0
        && isRejectionReasonsArray(rejectionReasons)
        && rejectionReasons.length === sentences.length;
}

function isRejectionReasonsArray(value) {
    return Array.isArray(value)
        && value.every(item => typeof item === 'string');
}

function resolveSessionUserId(request) {
    const sessionUser = User.fromSession(request && request.session ? request.session.user : null);
    return sessionUser ? sessionUser.idUser : null;
}

function toPositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

function legacyTextError(text) {
    return { text };
}

module.exports = {
    createAnnotationsController
};
