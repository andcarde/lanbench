# Ollama Manual Review

Generated at: 2026-04-27T15:50:37.659Z
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
    "isValid": false,
    "alerts": [
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La referencia disponible no coincide con la candidata.",
        "suggestion": "Verificar la relación entre Madrid y Espana."
      }
    ],
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
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La frase debe expresar la relación del triple.",
        "suggestion": "Verbaliza el predicado."
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
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "La relación 'birthPlace' no está verbalizada en la candidata.",
        "suggestion": "Verbaliza la relación 'nacimiento' o 'lugar de nacimiento'."
      }
    ],
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
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La palabra 'nacio' no es la forma correcta de expresar el verbo 'to be' en español.",
        "suggestion": "Utilice la forma correcta 'nació'"
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
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La palabra 'fue' no es la forma correcta de expresar el tiempo en este contexto.",
        "suggestion": "Utilizar 'establecida' o 'fundada'"
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
    "isValid": false,
    "alerts": [
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La frase debe expresar la relación RDF.",
        "suggestion": "Verbaliza el predicado."
      }
    ],
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
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La palabra 'Spielberg' es en inglás.",
        "suggestion": "Utilice el nombre del director en español."
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
    "isValid": false,
    "alerts": [
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La palabra 'Quixote' no es una entidad concreta en español.",
        "suggestion": "Reemplaza por 'Quijote'"
      }
    ],
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
        "code": "relation_missing",
        "severity": "error",
        "message": "La relación del triple no está verbalizada en la candidata.",
        "suggestion": "Verbaliza el predicado 'author' en la candidata."
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
    "isValid": false,
    "alerts": [
      {
        "code": "semantic_mismatch",
        "severity": "error",
        "message": "La referencia no coincide con la candidata.",
        "suggestion": "Verificar la precisión de la entidad en la candidata."
      }
    ],
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
        "code": "semantic_mismatch",
        "severity": "error",
        "message": "La referencia no coincide con el triple RDF.",
        "suggestion": "Verificar la relación entre el agua y su formula quimica."
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
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "La relación 'desemboca' no está verbalizada en la candidata.",
        "suggestion": "Verbalice la relación 'desembocar' o 'venir a' para completar la oración."
      }
    ],
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
        "code": "relation_missing",
        "severity": "error",
        "message": "La relación 'desemboca' no está verbalizada.",
        "suggestion": "Verbaliza la relación como 'El Amazonas desemboca en el oceano Indico.'"
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
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "La frase no verbaliza la relación de fundación.",
        "suggestion": "Verbalice la relación como 'fue fundada' o 'funda' en lugar de 'fue fundada por'."
      }
    ],
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
      },
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La frase debe expresar la relación RDF de manera completa en español.",
        "suggestion": "Verbalice el predicado y mantenga la entidad principal."
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
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "La relación entre Albert Einstein y Princeton no está verbalizada.",
        "suggestion": "Verbaliza la relación de muerte en el triple."
      }
    ],
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
        "code": "relation_missing",
        "severity": "error",
        "message": "La frase no verbaliza la relación de muerte en Princeton, New Jersey.",
        "suggestion": "Verbalice la relación de muerte como 'murió' o 'falleció'."
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
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "La frase no verbaliza la relación entre Michael Jackson y Epic Records.",
        "suggestion": "Añadir una palabra que indique el tipo de relación (por ejemplo, 'fue lanzado por')"
      }
    ],
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
        "code": "relation_missing",
        "severity": "error",
        "message": "La frase no verbaliza la relación entre Michael Jackson y Epic Records.",
        "suggestion": "Añadir una palabra que indique la relación, como &quot;con&quot;, &quot;de&quot; o &quot;para&quot;"
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
      },
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La frase debe expresar la relación RDF de capitalidad.",
        "suggestion": "Espana tiene Madrid como capital."
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
    "isValid": false,
    "alerts": [
      {
        "code": "language_not_spanish",
        "severity": "error",
        "message": "La frase debe expresar la relación del triple.",
        "suggestion": "Verbaliza el predicado."
      }
    ],
    "rejectionReasons": []
  }
]
```

