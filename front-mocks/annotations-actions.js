// @ts-nocheck
/**
 * @file Mocks of the annotation actions for frontend development without a
 * backend (`front-debug` mode).
 *
 * Replicates the public signature of
 * `public/js/actions/annotations-actions.js` but returning deterministic
 * synthetic data. It is swapped with the real version via
 * `scripts/front-debug.js`.
 */

const MOCK_SECTION = {
    datasetId: 1,
    datasetName: 'WebNLG Debug Dataset',
    totalSections: 5,
    sectionIndex: 1,
    sectionSize: 10,
    startEntry: 1,
    endEntry: 10,
    isLastSection: false,
    totalEntries: 10,
    entries: [
        {
            entryId: 1, sectionIndex: 1, category: 'Airport',
            triples: [
                { subject: 'Aarhus_Airport', predicate: 'cityServed', object: 'Aarhus,_Denmark' },
                { subject: 'Aarhus_Airport', predicate: 'elevationAboveTheSeaLevel', object: '25' }
            ],
            englishSentences: [
                'Aarhus Airport serves the city of Aarhus, Denmark and is located 25 metres above sea level.',
                'The airport serving Aarhus, Denmark sits 25 metres above sea level.'
            ]
        },
        {
            entryId: 2, sectionIndex: 1, category: 'Astronaut',
            triples: [
                { subject: 'Alan_Bean', predicate: 'nationality', object: 'United_States' },
                { subject: 'Alan_Bean', predicate: 'occupation', object: 'Test_pilot' }
            ],
            englishSentences: [
                'Alan Bean is an American test pilot.',
                'Alan Bean, of United States nationality, works as a test pilot.'
            ]
        },
        {
            entryId: 3, sectionIndex: 1, category: 'Building',
            triples: [
                { subject: 'Adare_Manor', predicate: 'location', object: 'Adare,_County_Limerick' },
                { subject: 'Adare_Manor', predicate: 'architect', object: 'Philip_Charles_Hardwick' }
            ],
            englishSentences: [
                'Adare Manor in County Limerick was designed by Philip Charles Hardwick.',
                'Philip Charles Hardwick was the architect of Adare Manor, located in Adare, County Limerick.'
            ]
        },
        {
            entryId: 4, sectionIndex: 1, category: 'City',
            triples: [
                { subject: 'Acharacle', predicate: 'country', object: 'Scotland' }
            ],
            englishSentences: [
                'Acharacle is a village located in Scotland.'
            ]
        },
        {
            entryId: 5, sectionIndex: 1, category: 'Food',
            triples: [
                { subject: 'Amatriciana_sauce', predicate: 'ingredient', object: 'Guanciale' },
                { subject: 'Amatriciana_sauce', predicate: 'ingredient', object: 'Pecorino_Romano' },
                { subject: 'Amatriciana_sauce', predicate: 'region', object: 'Lazio' }
            ],
            englishSentences: [
                'Amatriciana sauce from the Lazio region is made with guanciale and Pecorino Romano.',
                'The Lazio-origin Amatriciana sauce contains guanciale and Pecorino Romano cheese.'
            ]
        },
        {
            entryId: 6, sectionIndex: 1, category: 'MeanOfTransportation',
            triples: [
                { subject: 'Amos_6', predicate: 'launchSite', object: 'Cape_Canaveral' },
                { subject: 'Amos_6', predicate: 'operator', object: 'Spacecom' }
            ],
            englishSentences: [
                'Amos 6, operated by Spacecom, was launched from Cape Canaveral.'
            ]
        },
        {
            entryId: 7, sectionIndex: 1, category: 'Athlete',
            triples: [
                { subject: 'Alan_Shepard', predicate: 'birthPlace', object: 'New_Hampshire' },
                { subject: 'Alan_Shepard', predicate: 'almaMater', object: 'United_States_Naval_Academy' }
            ],
            englishSentences: [
                'Alan Shepard was born in New Hampshire and graduated from the United States Naval Academy.',
                'Alan Shepard, born in New Hampshire, is a graduate of the United States Naval Academy.'
            ]
        },
        {
            entryId: 8, sectionIndex: 1, category: 'WrittenWork',
            triples: [
                { subject: '1_Corinthians_13', predicate: 'author', object: 'Paul_the_Apostle' }
            ],
            englishSentences: [
                '1 Corinthians 13 was written by Paul the Apostle.'
            ]
        },
        {
            entryId: 9, sectionIndex: 1, category: 'Monument',
            triples: [
                { subject: 'Acueducto_de_Segovia', predicate: 'location', object: 'Segovia,_Spain' },
                { subject: 'Acueducto_de_Segovia', predicate: 'material', object: 'Granite' }
            ],
            englishSentences: [
                'The Aqueduct of Segovia, located in Segovia, Spain, is built of granite.',
                'Granite was used to construct the Aqueduct of Segovia in Segovia, Spain.'
            ]
        },
        {
            entryId: 10, sectionIndex: 1, category: 'University',
            triples: [
                { subject: 'Acharya_Institute_of_Technology', predicate: 'city', object: 'Bangalore' },
                { subject: 'Acharya_Institute_of_Technology', predicate: 'established', object: '2000' }
            ],
            englishSentences: [
                'Acharya Institute of Technology was established in 2000 in Bangalore.',
                'Founded in 2000, the Acharya Institute of Technology is based in Bangalore.'
            ]
        }
    ]
};

const EXAMPLE_SENTENCES = [
    'Yo resumo pero dame un lápiz.',
    'Yo hago el resumen pero necesito un lápiz.',
    'Con un lápiz puedo hacer el resumen.'
];

/**
 * Mocks the annotation check and returns deterministic validations.
 * @param {Array} sentences - Candidate sentences.
 * @param {object} entryContext - Entry context (unused in the mock).
 * @returns {*} Promise resolving to the mock validations.
 */
function checkAnnotations(sentences, _entryContext) {
    const mockValidations = sentences.map(function (s, index) {
        const trimmed = s.trim();
        const example = EXAMPLE_SENTENCES[index] || '';

        if (trimmed === example)
            return { sentence: trimmed, isValid: true, alerts: [], rejectionReasons: [] };

        if (trimmed.length >= 25) {
            return {
                sentence: trimmed,
                isValid: false,
                alerts: [{
                    code: 'example_mismatch',
                    severity: 'warning',
                    message: 'La oración tiene longitud suficiente pero no coincide con el ejemplo.',
                    suggestion: trimmed
                }],
                rejectionReasons: []
            };
        }

        return {
            sentence: trimmed,
            isValid: false,
            alerts: [{
                code: 'sentence_too_short',
                severity: 'error',
                message: 'Oración demasiado corta (mínimo 25 caracteres).',
                suggestion: trimmed
            }],
            rejectionReasons: []
        };
    });
    return $.Deferred().resolve(mockValidations).promise();
}

/**
 * Mocks persisting annotations and echoes back a saved-annotation payload.
 * @param {object} datasetId - Dataset identifier.
 * @param {number} rdfId - RDF entry identifier.
 * @param {Array} sentences - Sentences to save.
 * @param {Array} rejectionReasons - Rejection reasons (unused in the mock).
 * @returns {Promise<*>} Promise resolving to the mock saved annotation.
 */
function postAnnotations(datasetId, rdfId, sentences, _rejectionReasons) {
    return $.Deferred().resolve({
        entryId: rdfId,
        datasetId,
        sentences,
        savedAt: new Date().toISOString()
    }).promise();
}

/**
 * Mock of continue-annotation: simulates case 5 (new assignment in section 1).
 * @param {number} datasetId - Dataset identifier (unused in the mock).
 * @returns {Promise<*>} Promise resolving to the mock continuation result.
 */
function fetchContinueAnnotation(_datasetId) {
    return $.Deferred().resolve({
        caseNumber: 5,
        sectionNumber: 1,
        entryPosition: 0,
        entryId: 1,
        entryIndexInSection: 0
    }).promise();
}

/**
 * Mock of getting the entry pointed to by the active session.
 * @param {number} datasetId - Dataset identifier (unused in the mock).
 * @returns {Promise<*>} Promise resolving to the mock current entry.
 */
function fetchNextEntry(_datasetId) {
    const entries = Array.isArray(MOCK_SECTION.entries) ? MOCK_SECTION.entries : [];
    const entry = entries[0] || null;
    return $.Deferred().resolve({
        datasetId: MOCK_SECTION.datasetId,
        datasetName: MOCK_SECTION.datasetName,
        totalSections: MOCK_SECTION.totalSections,
        sectionNumber: MOCK_SECTION.sectionIndex,
        sectionSize: MOCK_SECTION.sectionSize,
        totalEntriesInSection: entries.length,
        entryIndexInSection: 0,
        isLastEntryInSection: entries.length === 1,
        entry
    }).promise();
}

/**
 * Gets the mock dataset options.
 * @returns {Promise<*>} Promise resolving to the mock dataset options.
 */
function fetchDatasetOptions() {
    return $.Deferred().resolve({ llmMode: 'correction' }).promise();
}

/**
 * Gets the mock debug params (datasetId + sectionNumber).
 * @returns {*} Mock debug params.
 */
function getDebugParams() {
    return { datasetId: 1, sectionNumber: 1 };
}

globalThis.checkAnnotations = checkAnnotations;
globalThis.postAnnotations = postAnnotations;
globalThis.fetchContinueAnnotation = fetchContinueAnnotation;
globalThis.fetchNextEntry = fetchNextEntry;
globalThis.fetchDatasetOptions = fetchDatasetOptions;
globalThis.getDebugParams = getDebugParams;
