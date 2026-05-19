# Ollama Manual Review

Generated at: 2026-04-27T15:43:17.977Z
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
        "code": "grammar|orthography",
        "severity": "error",
        "message": "Punjab, Pakistan is led by the Provincial Assembly of the Punjab.",
        "suggestion": "La asamblea provincial de Punjab gobierna a Punjab, Pakistán."
      },
      {
        "code": "sentence_review",
        "severity": "warning",
        "message": "La oración requiere revisión."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "La asamblea de Punjab gobierna Punjab, Pakistan.",
    "isValid": false,
    "alerts": [
      {
        "code": "llm_missing_validation",
        "severity": "warning",
        "message": "Ollama no devolvio una validacion para esta oracion.",
        "suggestion": "La asamblea de Punjab gobierna Punjab, Pakistan."
      }
    ],
    "rejectionReasons": []
  }
]
```

