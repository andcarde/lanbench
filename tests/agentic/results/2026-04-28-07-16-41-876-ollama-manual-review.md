# Ollama Manual Review

Generated at: 2026-04-28T07:16:41.876Z
Mode: annotations-service.checkSentences
Model: llama3.2:3b
Cases: 2

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
        "code": "semantic_mismatch",
        "severity": "error",
        "message": "La asamblea de Punjab gobierna un lugar, no una provincia.",
        "suggestion": "La Asamblea Provincial del Punjab gobierna Punjab, Pakistán."
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

## punjab-leader-title-all-valid

Punjab leaderTitle: tres reformulaciones validas

Expected manual review:
- La primera frase debe aceptarse: cubre sujeto, relacion y objeto del triple.
- La segunda frase debe aceptarse: misma relacion verbalizada de forma equivalente.
- La tercera frase debe aceptarse: voz activa equivalente; como mucho admite un warning leve si se prefiere "Asamblea Provincial del Punjab", pero no marcar missing_triple ni semantic_mismatch.

Output:
```json
[
  {
    "sentence": "El Punjab, Pakistán, está dirigido por la Asamblea Provincial de Punjab.",
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "Falta informacion del triple Punjab,_Pakistan | leaderTitle | Provincial_Assembly_of_the_Punjab."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "Punjab en Pakistán, está dirigido por la Asamblea Provincial de Punjab.",
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "Falta informacion del triple Punjab,_Pakistan | leaderTitle | Provincial_Assembly_of_the_Punjab."
      },
      {
        "code": "llm_missing_validation",
        "severity": "warning",
        "message": "Ollama no devolvio una validacion para esta oracion.",
        "suggestion": "Punjab en Pakistán, está dirigido por la Asamblea Provincial de Punjab."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "La Asamblea Provincial de Punjab gobierna Punjab, Pakistán.",
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

