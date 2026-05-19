# Ollama Manual Review

Generated at: 2026-04-28T08:59:44.736Z
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
        "code": "incomplete_sentence",
        "severity": "error",
        "message": "La oración no verbaliza el predicado de liderazgo.",
        "suggestion": "Agregue la relación de liderazgo a la oración."
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

## punjab-leader-title-active-vs-passive

Punjab leaderTitle: voz activa valida, pasivas rechazadas

Expected manual review:
- Debe rechazarse: "esta dirigido por" describe liderazgo, pero el predicado es leaderTitle ("titulo del lider"), por lo que la pasiva no verbaliza correctamente el triple.
- Debe rechazarse por la misma razon: la voz pasiva con "esta dirigido por" no expresa el titulo del lider sino la accion de liderar.
- Debe aceptarse: la voz activa "La Asamblea Provincial de Punjab gobierna Punjab, Pakistan" identifica el organo que ostenta el titulo y cubre el triple sin ambigüedad.

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
      },
      {
        "code": "semantic_mismatch",
        "severity": "error",
        "message": "La traducción utiliza la voz pasiva para describir la acción de liderar en lugar del título del líder.",
        "suggestion": "Utilice una construcción activa para describir el título del líder, como 'La Asamblea Provincial de Punjab gobierna Punjab, Pakistán.'"
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
        "code": "semantic_mismatch",
        "severity": "error",
        "message": "La traducción utiliza la voz pasiva para describir la acción de liderar en lugar del título del líder.",
        "suggestion": "Utilice una construcción activa para describir el título del líder, como 'La Asamblea Provincial de Punjab gobierna Punjab, Pakistán.'"
      },
      {
        "code": "imprecise_entity_name",
        "severity": "warning",
        "message": "La denominación 'Punjab en Pakistán' es menos precisa que la original 'Punjab, Pakistán'.",
        "suggestion": "Utilice la denominación más precisa 'Punjab, Pakistán' para mantener la exactitud."
      }
    ],
    "rejectionReasons": []
  },
  {
    "sentence": "La Asamblea Provincial de Punjab gobierna Punjab, Pakistán.",
    "isValid": true,
    "alerts": [],
    "rejectionReasons": []
  }
]
```

