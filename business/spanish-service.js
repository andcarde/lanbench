'use strict';

const ruleChecker = require('./rule-checker');
const ollamaSpanishChecker = require('./ollama-spanish-checker');
const { createAnnotationsRepository } = require('../repositories/annotations-repository');
const { ServiceError } = require('../services/service-error');

function createSpanishService({
    ruleBasedChecker,
    semanticChecker,
    annotationsRepository
} = {}) {
    const deps = {
        ruleBasedChecker: ruleBasedChecker || ruleChecker,
        semanticChecker: semanticChecker || ollamaSpanishChecker,
        annotationsRepository: annotationsRepository || createAnnotationsRepository()
    };

    async function check(sentence, context = {}) {
        const baseResult = deps.ruleBasedChecker.check(sentence);
        if (deps.ruleBasedChecker.isImmediateFailure(baseResult))
            return baseResult;

        try {
            return await deps.semanticChecker.check(sentence, context);
        } catch (_error) {
            return baseResult;
        }
    }

    async function save(payload, sentence, rejectionReason) {
        const normalizedPayload = normalizeSavePayload(payload, sentence, rejectionReason);

        if (normalizedPayload.mode === 'legacy') {
            return {
                ok: true,
                rdfId: normalizedPayload.rdfId,
                sentence: normalizedPayload.sentences[0].sentence,
                rejectionReason: normalizedPayload.sentences[0].rejectionReason
            };
        }

        const persisted = await deps.annotationsRepository.replaceForAccessibleEntry({
            idUser: normalizedPayload.idUser,
            idDataset: normalizedPayload.idDataset,
            eid: normalizedPayload.rdfId,
            sentences: normalizedPayload.sentences
        });

        if (!persisted) {
            throw new ServiceError('La entry solicitada no existe o no es accesible para el usuario.', {
                status: 404,
                code: 'annotation_entry_not_found'
            });
        }

        return {
            ok: true,
            idDataset: normalizedPayload.idDataset,
            rdfId: normalizedPayload.rdfId,
            savedCount: persisted.savedCount
        };
    }

    return {
        check,
        save
    };
}

function normalizeSavePayload(payload, sentence, rejectionReason) {
    if (payload && typeof payload === 'object' && Array.isArray(payload.sentences)) {
        const rejectionReasons = Array.isArray(payload.rejectionReasons)
            ? payload.rejectionReasons
            : (Array.isArray(payload.rejectionReason) ? payload.rejectionReason : []);

        return {
            mode: 'batch',
            idUser: toPositiveInteger(payload.idUser),
            idDataset: toPositiveInteger(payload.idDataset),
            rdfId: toPositiveInteger(payload.rdfId ?? payload.eid),
            sentences: payload.sentences.map((text, index) => ({
                sentenceIndex: index,
                sentence: typeof text === 'string' ? text : '',
                rejectionReason: normalizeOptionalText(rejectionReasons[index])
            }))
        };
    }

    return {
        mode: 'legacy',
        rdfId: toPositiveInteger(payload),
        sentences: [{
            sentenceIndex: 0,
            sentence: typeof sentence === 'string' ? sentence : '',
            rejectionReason: normalizeOptionalText(rejectionReason)
        }]
    };
}

function normalizeOptionalText(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toPositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

const defaultSpanishService = createSpanishService();

module.exports = {
    ...defaultSpanishService,
    createSpanishService
};
