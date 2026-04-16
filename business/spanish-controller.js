'use strict';

class SpanishController {
    static check(sentence, callback) {
        const result = SpanishController.runRuleBasedCheck(sentence);

        if (typeof callback === 'function') {
            process.nextTick(() => callback(null, result));
            return;
        }

        return result;
    }

    static save(rdfId, sentence, rejectionReason, callback) {
        const result = {
            ok: true,
            rdfId,
            sentence,
            rejectionReason: rejectionReason || null
        };

        if (typeof callback === 'function') {
            process.nextTick(() => callback(null, result));
            return;
        }

        return result;
    }

    static runRuleBasedCheck(sentence) {
        if (typeof sentence !== 'string' || sentence.trim().length === 0) {
            return {
                valid: false,
                reason: 'La oración está vacía.',
                suggestion: 'Escribe una oración antes de validar.'
            };
        }

        const trimmed = sentence.trim();
        const lowerCase = trimmed.toLowerCase();

        if (/\bago\b/i.test(lowerCase)) {
            return {
                valid: false,
                reason: 'Hay un posible error ortográfico en el verbo.',
                suggestion: trimmed.replace(/\bago\b/i, 'hago')
            };
        }

        if (/\buna\s+l[aá]piz\b/i.test(lowerCase)) {
            return {
                valid: false,
                reason: 'Hay una discordancia de género en el sintagma nominal.',
                suggestion: trimmed.replace(/\buna\s+l[aá]piz\b/i, 'un lápiz')
            };
        }

        if (!/[.!?…]$/.test(trimmed)) {
            return {
                valid: false,
                reason: 'Falta un signo de puntuación final.',
                suggestion: `${trimmed}.`
            };
        }

        return {
            valid: true,
            reason: null,
            suggestion: null
        };
    }

    static build(rawResponse) {
        if (typeof rawResponse !== 'string')
            throw new Error('La respuesta del OCR debe ser una cadena de texto.');

        const startIndex = rawResponse.indexOf('{');
        const endIndex = rawResponse.lastIndexOf('}');
        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex)
            throw new Error('No se detectó un JSON válido en la respuesta del OCR.');

        const jsonPayload = rawResponse.substring(startIndex, endIndex + 1);
        try {
            const response = JSON.parse(jsonPayload);
            if (typeof response !== 'object' || response === null)
                throw new Error('La respuesta parseada no es un objeto.');
            return response;
        } catch (error) {
            throw new Error(`No se pudo parsear la respuesta como JSON: ${error.message}`);
        }
    }
}

module.exports = SpanishController;
