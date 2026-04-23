'use strict';

const defaultSpanishService = require('../business/spanish-service');
const {
    mapSavedAnnotationDTO,
    mapSentenceValidationDTOs
} = require('../contracts/dto-mappers');

function createAnnotationsService({ spanishService } = {}) {
    const deps = {
        spanishService: spanishService || defaultSpanishService
    };

    async function checkSentences(sentences, entryContext) {
        const validations = [];

        for (const [index, sentence] of sentences.entries()) {
            const result = await deps.spanishService.check(
                sentence,
                buildSentenceContext(entryContext, index)
            );

            validations.push(normalizeCheckResult(result));
        }

        return mapSentenceValidationDTOs(sentences, validations);
    }

    async function saveSentences({ idUser, idDataset, rdfId, sentences, rejectionReasons }) {
        const result = await deps.spanishService.save({
            idUser,
            idDataset,
            rdfId,
            sentences,
            rejectionReasons
        });

        finalizeSavedSentence(result);
        return mapSavedAnnotationDTO({
            entryId: rdfId,
            datasetId: idDataset,
            sentences,
            savedAt: new Date().toISOString()
        });
    }

    return {
        checkSentences,
        saveSentences
    };
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

function buildSentenceContext(entryContext, sentenceIndex) {
    if (!entryContext)
        return {};

    return {
        eid: entryContext.entryId ?? entryContext.eid,
        category: entryContext.category,
        triples: entryContext.triples,
        referenceSentence: (entryContext.englishSentences || entryContext.sourceSentences || [])[sentenceIndex] || null
    };
}

function finalizeSavedSentence(result) {
    if (result && typeof result === 'object' && result.error)
        throw result.error;
}

module.exports = {
    createAnnotationsService
};
