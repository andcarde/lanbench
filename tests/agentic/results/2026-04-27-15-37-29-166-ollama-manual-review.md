# Ollama Manual Review

Generated at: 2026-04-27T15:37:29.166Z
Mode: annotations-service.checkSentences
Model: qwen3-vl:8b
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
        "code": "sentence_review",
        "severity": "warning",
        "message": "Falta un signo de puntuación final.",
        "suggestion": "La provincia de Pakistan."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "Punjab, Pakistan is led by the Provincial Assembly of the Punjab.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  },
  {
    "sentence": "La asamblea de Punjab gobierna Punjab, Pakistan.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

