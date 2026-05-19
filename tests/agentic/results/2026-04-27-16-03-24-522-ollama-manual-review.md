# Ollama Manual Review

Generated at: 2026-04-27T16:03:24.522Z
Mode: annotations-service.checkSentences
Model: llama3.2:3b
Cases: 22

## punjab-leader-title-mixed-quality

Punjab leaderTitle con fragmento, ingles y traduccion parcial

Expected manual review:
- La primera frase es un fragmento incompleto y omite la relacion de liderazgo.
- La segunda frase esta en ingles y no debe aceptarse como anotacion espanola.
- La tercera frase cubre la idea general, pero deberia preferir Asamblea Provincial del Punjab y una formulacion mas fiel.

Output:
```json
[
  {
    "sentence": "La provincia de Pakistan",
    "isValid": false,
    "alerts": [
      {
        "code": "incomplete_sentence",
        "severity": "error",
        "message": "La oracion es un fragmento y no verbaliza la relacion RDF."
      },
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Punjab,_Pakistan | leaderTitle | Provincial_Assembly_of_the_Punjab."
      },
      {
        "code": "punctuation_missing",
        "severity": "warning",
        "message": "Falta un signo de puntuación final.",
        "suggestion": "La provincia de Pakistan."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "Punjab, Pakistan is led by the Provincial Assembly of the Punjab.",
    "isValid": false,
    "alerts": [
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La oración debe estar escrita en español, no en inglés ni mezclando idiomas."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "La asamblea de Punjab gobierna Punjab, Pakistan.",
    "isValid": false,
    "alerts": [
      {
        "code": "imprecise_entity_name",
        "severity": "warning",
        "message": "La relacion principal esta cubierta, pero la denominacion de la asamblea puede ser mas precisa.",
        "suggestion": "Punjab, Pakistan, esta liderado por la Asamblea Provincial del Punjab."
      }
    ],
    "rejectionReasons": []
  }
]
```

## madrid-country-correct

Madrid country correcto

Expected manual review:
- Debe aceptarse: cubre sujeto, relacion y objeto.

Output:
```json
[
  {
    "sentence": "Madrid esta en Espana.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## madrid-country-wrong-object

Madrid country con pais equivocado

Expected manual review:
- Debe marcar error semantico: Francia contradice Spain.

Output:
```json
[
  {
    "sentence": "Madrid esta en Francia.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Madrid | country | Spain."
      }
    ],
    "rejectionReasons": []
  }
]
```

## ada-birthplace-correct

Ada Lovelace birthPlace correcto

Expected manual review:
- Debe aceptarse.

Output:
```json
[
  {
    "sentence": "Ada Lovelace nacio en Londres.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## ada-birthplace-wrong-city

Ada Lovelace birthPlace con ciudad incorrecta

Expected manual review:
- Debe marcar error semantico: Paris contradice London.

Output:
```json
[
  {
    "sentence": "Ada Lovelace nacio en Paris.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Ada_Lovelace | birthPlace | London."
      }
    ],
    "rejectionReasons": []
  }
]
```

## university-established-number-mismatch

Universidad established con fecha incorrecta

Expected manual review:
- Debe marcar error semantico: 1951 contradice 1962.

Output:
```json
[
  {
    "sentence": "La Universidad de Lagos fue establecida en 1951.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple University_of_Lagos | established | 1962."
      }
    ],
    "rejectionReasons": []
  }
]
```

## film-director-correct

Film director correcto

Expected manual review:
- Debe aceptarse.

Output:
```json
[
  {
    "sentence": "Inception fue dirigida por Christopher Nolan.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## film-director-wrong-person

Film director con persona incorrecta

Expected manual review:
- Debe marcar error semantico: Steven Spielberg contradice Christopher Nolan.

Output:
```json
[
  {
    "sentence": "Inception fue dirigida por Steven Spielberg.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Inception | director | Christopher_Nolan."
      }
    ],
    "rejectionReasons": []
  }
]
```

## book-author-correct

Book author correcto

Expected manual review:
- Debe aceptarse aunque traduzca Don Quixote como Don Quijote.

Output:
```json
[
  {
    "sentence": "Don Quijote fue escrito por Miguel de Cervantes.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## book-author-missing-object

Book author omite autor

Expected manual review:
- Debe marcar que falta el autor Miguel de Cervantes.

Output:
```json
[
  {
    "sentence": "Don Quijote es una novela espanola.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Don_Quixote | author | Miguel_de_Cervantes."
      }
    ],
    "rejectionReasons": []
  }
]
```

## chemical-formula-correct

Formula quimica correcta

Expected manual review:
- Debe aceptarse.

Output:
```json
[
  {
    "sentence": "El agua tiene la formula quimica H2O.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## chemical-formula-wrong

Formula quimica incorrecta

Expected manual review:
- Debe marcar error semantico: CO2 contradice H2O.

Output:
```json
[
  {
    "sentence": "El agua tiene la formula quimica CO2.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Water | chemicalFormula | H2O."
      },
      {
        "code": "semantic_mismatch",
        "severity": "error",
        "message": "La referencia no coincide. La formula quimica es H2O, no CO2.",
        "suggestion": "El agua tiene la formula quimica H2O."
      }
    ],
    "rejectionReasons": []
  }
]
```

## river-mouth-correct

River mouth correcto

Expected manual review:
- Debe aceptarse.

Output:
```json
[
  {
    "sentence": "El Amazonas desemboca en el oceano Atlantico.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## river-mouth-wrong

River mouth incorrecto

Expected manual review:
- Debe marcar error semantico: Indico contradice Atlantic Ocean.

Output:
```json
[
  {
    "sentence": "El Amazonas desemboca en el oceano Indico.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Amazon_River | mouthPlace | Atlantic_Ocean."
      }
    ],
    "rejectionReasons": []
  }
]
```

## company-founder-correct

Company founder correcto

Expected manual review:
- Debe aceptarse para el triple dado.

Output:
```json
[
  {
    "sentence": "Microsoft fue fundada por Bill Gates.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## company-founder-untranslated

Company founder sin traducir

Expected manual review:
- Debe marcar error de idioma: la frase esta en ingles.

Output:
```json
[
  {
    "sentence": "Microsoft was founded by Bill Gates.",
    "isValid": false,
    "alerts": [
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La oración debe estar escrita en español, no en inglés ni mezclando idiomas."
      }
    ],
    "rejectionReasons": []
  }
]
```

## person-deathplace-correct

Person deathPlace correcto

Expected manual review:
- Debe aceptarse o, como mucho, avisar de que falta New Jersey.

Output:
```json
[
  {
    "sentence": "Albert Einstein murio en Princeton.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## person-deathplace-too-vague

Person deathPlace demasiado vago

Expected manual review:
- Debe marcar aviso o error: Estados Unidos es demasiado vago frente a Princeton, New Jersey.

Output:
```json
[
  {
    "sentence": "Albert Einstein murio en Estados Unidos.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Albert_Einstein | deathPlace | Princeton,_New_Jersey."
      }
    ],
    "rejectionReasons": []
  }
]
```

## multi-triple-album

Album con dos triples correctos en una frase

Expected manual review:
- Debe aceptarse: cubre ambos triples.

Output:
```json
[
  {
    "sentence": "Thriller fue grabado por Michael Jackson y publicado por Epic Records.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

## multi-triple-album-partial

Album con un triple omitido

Expected manual review:
- Debe marcar que falta Epic Records o el triple recordLabel.

Output:
```json
[
  {
    "sentence": "Thriller fue grabado por Michael Jackson.",
    "isValid": false,
    "alerts": [
      {
        "code": "missing_triple",
        "severity": "error",
        "message": "Falta informacion del triple Thriller_(album) | recordLabel | Epic_Records."
      }
    ],
    "rejectionReasons": []
  }
]
```

## capital-language-mix

Capital con mezcla de ingles y espanol

Expected manual review:
- Debe marcar error de idioma/mezcla: no es una frase espanola correcta.

Output:
```json
[
  {
    "sentence": "Espana has capital Madrid.",
    "isValid": false,
    "alerts": [
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La oración debe estar escrita en español, no en inglés ni mezclando idiomas."
      }
    ],
    "rejectionReasons": []
  }
]
```

## genre-correct

Music genre correcto

Expected manual review:
- Debe aceptarse.

Output:
```json
[
  {
    "sentence": "Johann Sebastian Bach compuso musica barroca.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

