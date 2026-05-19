# Ollama Manual Review

Generated at: 2026-04-27T15:46:30.321Z
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
        "code": "semantic_mismatch",
        "severity": "error",
        "message": "La referencia no coincide con la candidata \"La provincia de Pakistan\".",
        "suggestion": "Verificar la relación entre la provincia y el gobierno."
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
      },
      {
        "code": "mixed_language",
        "severity": "error",
        "message": "La candidata contiene un fragmento en inglés.",
        "suggestion": "Revisar la candidata y eliminar el fragmento en inglés."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "La asamblea de Punjab gobierna Punjab, Pakistan.",
    "isValid": false,
    "alerts": [
      {
        "code": "relation_missing",
        "severity": "error",
        "message": "La candidata omite la relación del triple.",
        "suggestion": "Revisar la relación entre la asamblea y el gobierno."
      }
    ],
    "rejectionReasons": []
  }
]
```

