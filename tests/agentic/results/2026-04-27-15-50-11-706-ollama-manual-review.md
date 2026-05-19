# Ollama Manual Review

Generated at: 2026-04-27T15:50:11.706Z
Mode: annotations-service.checkSentences
Model: llama3.2:3b
Cases: 1

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

