'use strict';

/**
 * @file Casos de uso para el smoke-test manual de Ollama.
 *
 * Cada caso define un id legible, una oracion en espanol y el contexto RDF
 * minimo para que el LLM disponga de la informacion que tendria en
 * produccion. Sirve para diagnosticar regresiones del prompt.
 */

module.exports = [
    {
        id: 'punjab-leader-title-mixed-quality',
        title: 'Punjab leaderTitle con fragmento, ingles y traduccion parcial',
        request: {
            sentences: [
                'La provincia de Pakistan',
                'Punjab, Pakistan is led by the Provincial Assembly of the Punjab.',
                'La asamblea de Punjab gobierna Punjab, Pakistan.'
            ],
            entryContext: {
                entryId: 1,
                category: 'Place',
                englishSentences: [
                    'The Punjab, Pakistan, is led by the Provincial Assembly of the Punjab.',
                    'Punjab, Pakistan is led by the Provincial Assembly of the Punjab.'
                ],
                sectionIndex: 1,
                triples: [
                    {
                        subject: 'Punjab,_Pakistan',
                        predicate: 'leaderTitle',
                        object: 'Provincial_Assembly_of_the_Punjab'
                    }
                ]
            }
        },
        expectedReview: [
            'La primera frase es un fragmento incompleto y omite la relacion de liderazgo.',
            'La segunda frase esta en ingles y no debe aceptarse como anotacion espanola.',
            'La tercera frase cubre la idea general, pero deberia preferir Asamblea Provincial del Punjab y una formulacion mas fiel.'
        ]
    },
    {
        id: 'punjab-leader-title-active-vs-passive',
        title: 'Punjab leaderTitle: voz activa valida, pasivas rechazadas',
        request: {
            sentences: [
                'El Punjab, Pakistán, está dirigido por la Asamblea Provincial de Punjab.',
                'Punjab en Pakistán, está dirigido por la Asamblea Provincial de Punjab.',
                'La Asamblea Provincial de Punjab gobierna Punjab, Pakistán.'
            ],
            entryContext: {
                entryId: 1,
                category: 'Place',
                englishSentences: [
                    'The Punjab, Pakistan, is led by the Provincial Assembly of the Punjab.',
                    'Punjab, Pakistan is led by the Provincial Assembly of the Punjab.'
                ],
                sectionIndex: 1,
                triples: [
                    {
                        subject: 'Punjab,_Pakistan',
                        predicate: 'leaderTitle',
                        object: 'Provincial_Assembly_of_the_Punjab'
                    }
                ]
            }
        },
        expectedReview: [
            'Debe rechazarse: "esta dirigido por" describe liderazgo, pero el predicado es leaderTitle ("titulo del lider"), por lo que la pasiva no verbaliza correctamente el triple.',
            'Debe rechazarse por la misma razon: la voz pasiva con "esta dirigido por" no expresa el titulo del lider sino la accion de liderar.',
            'Debe aceptarse: la voz activa "La Asamblea Provincial de Punjab gobierna Punjab, Pakistan" identifica el organo que ostenta el titulo y cubre el triple sin ambigüedad.'
        ]
    },
    {
        id: 'madrid-country-correct',
        title: 'Madrid country correcto',
        request: {
            sentences: ['Madrid esta en Espana.'],
            entryContext: {
                entryId: 2,
                category: 'City',
                englishSentences: ['Madrid is located in Spain.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Madrid', predicate: 'country', object: 'Spain' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse: cubre sujeto, relacion y objeto.']
    },
    {
        id: 'madrid-country-wrong-object',
        title: 'Madrid country con pais equivocado',
        request: {
            sentences: ['Madrid esta en Francia.'],
            entryContext: {
                entryId: 3,
                category: 'City',
                englishSentences: ['Madrid is located in Spain.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Madrid', predicate: 'country', object: 'Spain' }
                ]
            }
        },
        expectedReview: ['Debe marcar error semantico: Francia contradice Spain.']
    },
    {
        id: 'ada-birthplace-correct',
        title: 'Ada Lovelace birthPlace correcto',
        request: {
            sentences: ['Ada Lovelace nacio en Londres.'],
            entryContext: {
                entryId: 4,
                category: 'Person',
                englishSentences: ['Ada Lovelace was born in London.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Ada_Lovelace', predicate: 'birthPlace', object: 'London' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse.']
    },
    {
        id: 'ada-birthplace-wrong-city',
        title: 'Ada Lovelace birthPlace con ciudad incorrecta',
        request: {
            sentences: ['Ada Lovelace nacio en Paris.'],
            entryContext: {
                entryId: 5,
                category: 'Person',
                englishSentences: ['Ada Lovelace was born in London.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Ada_Lovelace', predicate: 'birthPlace', object: 'London' }
                ]
            }
        },
        expectedReview: ['Debe marcar error semantico: Paris contradice London.']
    },
    {
        id: 'university-established-number-mismatch',
        title: 'Universidad established con fecha incorrecta',
        request: {
            sentences: ['La Universidad de Lagos fue establecida en 1951.'],
            entryContext: {
                entryId: 6,
                category: 'University',
                englishSentences: ['The University of Lagos was established in 1962.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'University_of_Lagos', predicate: 'established', object: '1962' }
                ]
            }
        },
        expectedReview: ['Debe marcar error semantico: 1951 contradice 1962.']
    },
    {
        id: 'film-director-correct',
        title: 'Film director correcto',
        request: {
            sentences: ['Inception fue dirigida por Christopher Nolan.'],
            entryContext: {
                entryId: 7,
                category: 'Film',
                englishSentences: ['Inception was directed by Christopher Nolan.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Inception', predicate: 'director', object: 'Christopher_Nolan' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse.']
    },
    {
        id: 'film-director-wrong-person',
        title: 'Film director con persona incorrecta',
        request: {
            sentences: ['Inception fue dirigida por Steven Spielberg.'],
            entryContext: {
                entryId: 8,
                category: 'Film',
                englishSentences: ['Inception was directed by Christopher Nolan.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Inception', predicate: 'director', object: 'Christopher_Nolan' }
                ]
            }
        },
        expectedReview: ['Debe marcar error semantico: Steven Spielberg contradice Christopher Nolan.']
    },
    {
        id: 'book-author-correct',
        title: 'Book author correcto',
        request: {
            sentences: ['Don Quijote fue escrito por Miguel de Cervantes.'],
            entryContext: {
                entryId: 9,
                category: 'Book',
                englishSentences: ['Don Quixote was written by Miguel de Cervantes.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Don_Quixote', predicate: 'author', object: 'Miguel_de_Cervantes' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse aunque traduzca Don Quixote como Don Quijote.']
    },
    {
        id: 'book-author-missing-object',
        title: 'Book author omite autor',
        request: {
            sentences: ['Don Quijote es una novela espanola.'],
            entryContext: {
                entryId: 10,
                category: 'Book',
                englishSentences: ['Don Quixote was written by Miguel de Cervantes.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Don_Quixote', predicate: 'author', object: 'Miguel_de_Cervantes' }
                ]
            }
        },
        expectedReview: ['Debe marcar que falta el autor Miguel de Cervantes.']
    },
    {
        id: 'chemical-formula-correct',
        title: 'Formula quimica correcta',
        request: {
            sentences: ['El agua tiene la formula quimica H2O.'],
            entryContext: {
                entryId: 11,
                category: 'ChemicalCompound',
                englishSentences: ['Water has the chemical formula H2O.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Water', predicate: 'chemicalFormula', object: 'H2O' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse.']
    },
    {
        id: 'chemical-formula-wrong',
        title: 'Formula quimica incorrecta',
        request: {
            sentences: ['El agua tiene la formula quimica CO2.'],
            entryContext: {
                entryId: 12,
                category: 'ChemicalCompound',
                englishSentences: ['Water has the chemical formula H2O.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Water', predicate: 'chemicalFormula', object: 'H2O' }
                ]
            }
        },
        expectedReview: ['Debe marcar error semantico: CO2 contradice H2O.']
    },
    {
        id: 'river-mouth-correct',
        title: 'River mouth correcto',
        request: {
            sentences: ['El Amazonas desemboca en el oceano Atlantico.'],
            entryContext: {
                entryId: 13,
                category: 'River',
                englishSentences: ['The Amazon River flows into the Atlantic Ocean.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Amazon_River', predicate: 'mouthPlace', object: 'Atlantic_Ocean' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse.']
    },
    {
        id: 'river-mouth-wrong',
        title: 'River mouth incorrecto',
        request: {
            sentences: ['El Amazonas desemboca en el oceano Indico.'],
            entryContext: {
                entryId: 14,
                category: 'River',
                englishSentences: ['The Amazon River flows into the Atlantic Ocean.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Amazon_River', predicate: 'mouthPlace', object: 'Atlantic_Ocean' }
                ]
            }
        },
        expectedReview: ['Debe marcar error semantico: Indico contradice Atlantic Ocean.']
    },
    {
        id: 'company-founder-correct',
        title: 'Company founder correcto',
        request: {
            sentences: ['Microsoft fue fundada por Bill Gates.'],
            entryContext: {
                entryId: 15,
                category: 'Company',
                englishSentences: ['Microsoft was founded by Bill Gates.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Microsoft', predicate: 'founder', object: 'Bill_Gates' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse para el triple dado.']
    },
    {
        id: 'company-founder-untranslated',
        title: 'Company founder sin traducir',
        request: {
            sentences: ['Microsoft was founded by Bill Gates.'],
            entryContext: {
                entryId: 16,
                category: 'Company',
                englishSentences: ['Microsoft was founded by Bill Gates.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Microsoft', predicate: 'founder', object: 'Bill_Gates' }
                ]
            }
        },
        expectedReview: ['Debe marcar error de idioma: la frase esta en ingles.']
    },
    {
        id: 'person-deathplace-correct',
        title: 'Person deathPlace correcto',
        request: {
            sentences: ['Albert Einstein murio en Princeton.'],
            entryContext: {
                entryId: 17,
                category: 'Person',
                englishSentences: ['Albert Einstein died in Princeton.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Albert_Einstein', predicate: 'deathPlace', object: 'Princeton,_New_Jersey' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse o, como mucho, avisar de que falta New Jersey.']
    },
    {
        id: 'person-deathplace-too-vague',
        title: 'Person deathPlace demasiado vago',
        request: {
            sentences: ['Albert Einstein murio en Estados Unidos.'],
            entryContext: {
                entryId: 18,
                category: 'Person',
                englishSentences: ['Albert Einstein died in Princeton, New Jersey.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Albert_Einstein', predicate: 'deathPlace', object: 'Princeton,_New_Jersey' }
                ]
            }
        },
        expectedReview: ['Debe marcar aviso o error: Estados Unidos es demasiado vago frente a Princeton, New Jersey.']
    },
    {
        id: 'multi-triple-album',
        title: 'Album con dos triples correctos en una frase',
        request: {
            sentences: ['Thriller fue grabado por Michael Jackson y publicado por Epic Records.'],
            entryContext: {
                entryId: 19,
                category: 'Album',
                englishSentences: ['Thriller was recorded by Michael Jackson and released by Epic Records.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Thriller_(album)', predicate: 'artist', object: 'Michael_Jackson' },
                    { subject: 'Thriller_(album)', predicate: 'recordLabel', object: 'Epic_Records' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse: cubre ambos triples.']
    },
    {
        id: 'multi-triple-album-partial',
        title: 'Album con un triple omitido',
        request: {
            sentences: ['Thriller fue grabado por Michael Jackson.'],
            entryContext: {
                entryId: 20,
                category: 'Album',
                englishSentences: ['Thriller was recorded by Michael Jackson and released by Epic Records.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Thriller_(album)', predicate: 'artist', object: 'Michael_Jackson' },
                    { subject: 'Thriller_(album)', predicate: 'recordLabel', object: 'Epic_Records' }
                ]
            }
        },
        expectedReview: ['Debe marcar que falta Epic Records o el triple recordLabel.']
    },
    {
        id: 'capital-language-mix',
        title: 'Capital con mezcla de ingles y espanol',
        request: {
            sentences: ['Espana has capital Madrid.'],
            entryContext: {
                entryId: 21,
                category: 'Country',
                englishSentences: ['Spain has Madrid as its capital.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Spain', predicate: 'capital', object: 'Madrid' }
                ]
            }
        },
        expectedReview: ['Debe marcar error de idioma/mezcla: no es una frase espanola correcta.']
    },
    {
        id: 'genre-correct',
        title: 'Music genre correcto',
        request: {
            sentences: ['Johann Sebastian Bach compuso musica barroca.'],
            entryContext: {
                entryId: 22,
                category: 'MusicalArtist',
                englishSentences: ['Johann Sebastian Bach is associated with Baroque music.'],
                sectionIndex: 1,
                triples: [
                    { subject: 'Johann_Sebastian_Bach', predicate: 'genre', object: 'Baroque_music' }
                ]
            }
        },
        expectedReview: ['Debe aceptarse.']
    }
];
