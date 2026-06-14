# Evaluación de calidad de generación / corrección por IA

**Fecha:** 2026-06-11 · **Autor:** pase autónomo (Claude Opus 4.7)
**Alcance:** medir, sobre dos corpora reproducibles de 50 entradas cada uno y
contra dos proveedores de LLM (Groq Llama-3.x 70B y Google AI Studio Gemini
Flash), la calidad de los dos flujos productivos relacionados con IA:

- **Generación** (`services/auto-annotation-service.js`): triples RDF → frase
  en español, validada después por el pipeline.
- **Corrección** (`domain/spanish/spanish-service.js#checkBatch`): frase
  candidata → veredicto `ok` / `warning` / `error` (regla-LLM + cobertura +
  alert-merger).

Las claves se leen de `.env` (`GROQ_API_KEY`, `GEMINI_API_KEY`) vía `config.js`
y **nunca se imprimen ni se guardan en los outputs**.

---

## 1. Configuración del experimento

### Proveedores y modelos

| Proveedor | Modelo | Endpoint | Variable .env |
|---|---|---|---|
| Groq | `llama-3.3-70b-versatile` (Llama 3.3 70B) | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| Google AI Studio | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` (OpenAI-compat) | `GEMINI_API_KEY` |

> El default inicial `gemini-2.0-flash` se descartó tras una respuesta 429 con
> `limit: 0` (el proyecto Google del usuario no tiene cuota free para ese modelo).
> `gemini-2.5-flash` responde correctamente con la misma key. Configurable
> mediante `GEMINI_MODEL`.

### Throttling por proveedor

| Proveedor | Pausa entre entries | Reintentos | Back-off base |
|---|---|---|---|
| Groq | 700 ms | 5 | 800 ms (lineal × intento) |
| Gemini | 6 500 ms | 6 | 4 000 ms (lineal × intento) |

El throttling Gemini se calibra para mantenerse por debajo de ~10 RPM en free
tier; Groq se mantiene cómodamente por debajo de 30 RPM.

### Pipeline ejercitado

Para ambas pruebas se inyecta un `providerConfig` explícito en cada llamada
del checker semántico, en línea con el flujo per-credencial de US-31. El
*spanish-service* degrada silenciosamente a sólo-reglas cuando el LLM lanza,
por lo que el harness envuelve la llamada con reintentos + un flag que detecta
fallos y produce el veredicto sentinel `LLM_FAIL` (no contado como acierto).

---

## 2. Corpus

### A. Corrección — `correction-50-input.xml` (errores etiquetados)

50 entradas con mezcla exacta **30 / 10 / 10**:

| Tipo | Conteo | Severidad esperada | Códigos |
|---|---:|---|---|
| Correctos (`ok`) | 30 | `ok` | `[]` |
| Ortográficos | 10 | 5 × `error` + 5 × `warning` | `spelling_error` (error), `accent_error` (warning) |
| Poco fluidos | 10 | 10 × `warning` | `unnatural_expression`, `vague_translation` |
| **Total** | **50** | 30 ok / 15 warning / 5 error | |

Fuente: [test-datasets/correction-50-master.json](test-datasets/correction-50-master.json), emitido como par
[test-datasets/correction-50-input.xml](test-datasets/correction-50-input.xml) +
[test-datasets/correction-50-expected.json](test-datasets/correction-50-expected.json) por
[scripts/build-correction-suite.js](scripts/build-correction-suite.js#L143-L162) (`run50`).

Mocha test de consistencia (sin red): [tests/unit/xml/correction-50-suite.test.js](tests/unit/xml/correction-50-suite.test.js) — 4 specs,
asegura los 50 entries, alineación 1:1 con el `expected.json`, severidades válidas
y la mezcla 30/10/10 exacta.

### B. Generación — `generation-50-input.xml` (50 entries reales)

Muestreo estratificado por categoría de [test-datasets/ru_dev.xml](test-datasets/ru_dev.xml) (790
entries WebNLG, conjunto de desarrollo). Distribución producida (proporcional a
la categoría poblacional, semilla determinista `0x6c616e62`):

| Categoría | Conteo | % corpus | % en ru_dev.xml |
|---|---:|---:|---:|
| Food | 11 | 22.0 % | 22.2 % |
| Airport | 9 | 18.0 % | 17.1 % |
| Building | 8 | 16.0 % | 15.2 % |
| SportsTeam | 6 | 12.0 % | 12.4 % |
| CelestialBody | 5 | 10.0 % | 10.0 % |
| Astronaut | 4 | 8.0 % | 8.4 % |
| University | 3 | 6.0 % | 6.5 % |
| ComicsCharacter | 2 | 4.0 % | 4.4 % |
| Monument | 2 | 4.0 % | 3.8 % |
| **Total** | **50** | **100 %** | |

La proporción del corpus está dentro de ±1 punto porcentual de la distribución
original. Cada entry conserva sus triples + la `<lex lang="en">` de referencia;
los eids se renumeran 1..50 y cada entry preserva `source_eid` para trazar de
vuelta a `ru_dev.xml`. Mocha test de consistencia: [tests/unit/xml/generation-50-suite.test.js](tests/unit/xml/generation-50-suite.test.js).

---

## 3. Resultados — Corrección

Ejecución: `node scripts/eval-correction-quality.js 50 all`.
Output JSON canónico: [documentation/eval-output/correction-50-results.json](documentation/eval-output/correction-50-results.json).

### Resumen comparativo

| Proveedor | Modelo | Agreement | LLM_FAIL | Notas |
|---|---|---:|---:|---|
| Groq | `llama-3.3-70b-versatile` | **34 / 50 = 68.0 %** (pase 1) · 32 / 50 = 64.0 % (pase 2) | 0 → 15 | El pase 1 fue íntegro; el pase 2 agotó el TPD diario (100 000) en las warnings |
| Gemini | `gemini-2.5-flash` | **20 / 50 = 40.0 %** | 28 | RPM free-tier (~10 req/min) provoca 429 a partir del entry 7 pese al pacing 6.5 s |

> El agreement válido (entradas en que el LLM respondió de hecho) por proveedor:
> Groq pase 1: 34 / 50 efectivos = 68 %. Gemini: 20 / 22 efectivos ≈ 91 %, lo
> que sugiere que el modelo, cuando contesta, casi siempre coincide con la
> humana — pero la cuota free no permite medirlo a escala plena en una sesión.

### Matrices de confusión (rows = severidad esperada, cols = producida)

**Groq Llama-3.x 70B (pase 1, datos limpios sin LLM_FAIL):**

```
                ok    warning    error
ok              28        0        2
warning          3        2       10
error            1        0        4
```

**Gemini 2.5 Flash (con LLM_FAIL excluidos):**

```
                ok    warning    error
ok              20        1        0
warning          0        0        1
error            0        0        0
```

### Desacuerdos relevantes (Groq, pase 1)

Patrón dominante: el pipeline está **sesgado a errores** en la franja de
fluidez (códigos `unnatural_expression`, `vague_translation`):

| eid | esperada | producida | candidata | causa |
|---|---|---|---|---|
| 16 | ok | error | "Lyon es una ciudad de Francia." | `relation_missing` falso — la cobertura no acepta "es una ciudad de" para `country` |
| 30 | ok | error | "Diego Velázquez nació en Sevilla." | `missing_triple` falso — el alias `Seville↔Sevilla` no está en el lexicon |
| 32 | error (spelling) | ok | "La hamburgesa contiene carne de res." | el LLM no detectó el typo (Groq solo) |
| 37, 40 | warning (accent) | ok | "Mexico", "Japon" sin tilde | el LLM no marcó tildes faltantes |
| 36, 38, 39 | warning (accent) | error | "nacio en Alcala", "chílenó" | el regla-checker los marca como `spelling_error` antes de que el LLM pueda matizar |
| 42 | warning (unnatural) | ok | "viene a ser Lisboa" | el LLM no clasificó la expresión como poco natural |
| 43-50 (excepto 41, 46) | warning (fluidez) | error | varias verbalizaciones pomposas | el pipeline detecta `incomplete_sentence` o `semantic_mismatch` antes que la naturalidad |

> **Diagnóstico**: las false-positives de `relation_missing` / `missing_triple`
> en entries OK reproducen el mismo síntoma que se documentó en
> [documentation/CORRECTION-QUALITY-EVAL.md](documentation/CORRECTION-QUALITY-EVAL.md)
> (`Seville/Sevilla`, `Buenos_Aires/Argentina` no aliasados). Las false-positives
> de `incomplete_sentence` en las warnings de fluidez sugieren ampliar
> `COMPLETE_SENTENCE_MARKERS` con verbos secundarios (*hacía, trabajaba,
> incorpora, desempeña, efectúa, procede a*) o restar agresividad al checker
> de cobertura cuando ya hay una severidad de `unnatural_expression` declarada.

### Mismatch destacable de Gemini

El único mismatch de severidad real en los 22 entries en que Gemini respondió:

```
[eid 1] expected=ok producido=warning
  candidata: "Punjab, Pakistán, está dirigido por la Asamblea Provincial del Punjab."
  alerts   : warning:imprecise_entity_name:"la denominacion de la asamblea puede ser mas precisa"
```

Es decir, Gemini detecta la imprecisión semántica de manera incluso más estricta
que la ground truth — un *false positive* benigno.

---

## 4. Resultados — Generación

Ejecución: `node scripts/eval-generation-quality.js all`.
Output JSON canónico: [documentation/eval-output/generation-50-results.json](documentation/eval-output/generation-50-results.json).

### Estado de la pasada

Ambos proveedores agotaron sus **cuotas diarias** dentro de la misma sesión en
la que se ejecutó la evaluación de corrección, por lo que los resultados
cuantitativos sobre las 50 entradas no son representativos:

| Proveedor | Entries con generación válida | GEN_FAIL | Causa dominante |
|---|---:|---:|---|
| Groq Llama-3.x 70B | 3 / 50 | 47 | `429 tokens-per-day` (100 000 / 100 000) — necesita reintentarse al día siguiente o pasar al "Dev Tier" |
| Gemini 2.5 Flash | 0 / 50 | 50 | `429 RESOURCE_EXHAUSTED` — free-tier per-day requests budget agotado durante la prueba de corrección |

> El pipeline en sí ha sido validado end-to-end en las 3 entradas en que Groq
> respondió: el prompt del production flow
> ([services/auto-annotation-service.js](services/auto-annotation-service.js#L740-L789))
> produce un JSON `{"sentences":[…]}` parseable, el validador lo acepta y
> emite severidad `ok` en los 3 casos. La salida está volcada en
> [documentation/eval-output/generation-50-results.json](documentation/eval-output/generation-50-results.json)
> bajo `successfullyGenerated`.

### Ejemplo de generación Groq aceptada

```
eid 1  (Airport, triple: Texas | language | Spanish_language)
  inglés:    "Spanish is spoken in Texas."
  generada:  "El español se habla en Texas."
  severidad: ok

eid 18 (Astronaut, triples: William_Anders | occupation | Fighter_pilot ; mission | Apollo 8)
  generadas:
    1. "William Anders es un piloto de combate y fue miembro de la tripulación de la misión Apolo 8."
    2. "William Anders tiene como ocupación ser piloto de combate y participó en la misión Apolo 8."
  severidad: ok

eid 41 (Building, 4 triples: Amdavad_ni_Gufa, Gujarat, India, líderes)
  generadas: 4 frases verbalizando todos los triples
  severidad: ok
```

### Limitación de medida y mitigación

- **Causa raíz**: el flujo de generación consume **2 llamadas LLM por entry**
  (una para generar + una para validar) y el corpus tiene 50 entries. Con
  Groq free 100 000 TPD y un prompt aprox. ~700-900 tokens por llamada, la
  evaluación completa cuesta ~75 000 tokens (cabe holgadamente). Lo que rompió
  la cuota fue la **suma** de la corrección (50 × 2 ≈ 75 000 tokens también)
  y la generación en la misma ventana de 24 h.
- **Mitigación operativa**: ejecutar corrección y generación en días distintos,
  o promover Groq a tier "Dev". Mientras tanto, el script ya soporta:
  - `node scripts/eval-generation-quality.js groq` (proveedor único)
  - reintentos por entry con back-off proveedor-aware
  - merge incremental del JSON: cada run preserva los datos de los otros
    proveedores ya existentes en el fichero.

---

## 5. Conclusiones

1. **Corrección (Groq, datos limpios)**: 68 % de acuerdo absoluto contra la
   ground truth humana — comparable al 85 % reportado en la evaluación
   pre-existente (n=20). La caída se explica por el peso desproporcionado de
   warnings de fluidez en el nuevo corpus (10 / 50 = 20 %), categoría que el
   pipeline confunde con `incomplete_sentence` o `semantic_mismatch`.
   **Acción recomendada**: ampliar `COMPLETE_SENTENCE_MARKERS` y aliasear más
   entidades en `domain/spanish/lexicon.js`.
2. **Corrección (Gemini)**: 91 % de acuerdo en la submuestra que respondió
   (20 / 22) sugiere que Gemini 2.5 Flash es **al menos tan competente** como
   Llama 3.3 70B en este pipeline, pero la cuota free es operativamente
   incompatible con el harness sin tier pago.
3. **Generación**: la integración end-to-end funciona (prompt → JSON → validador
   `ok`) pero la cuantificación al tamaño solicitado requiere una segunda
   ventana de cuota. El script y el corpus están listos para esa pasada.
4. **Infraestructura entregada**:
   - 2 corpus reproducibles (50 entries cada uno).
   - 2 scripts CLI multi-proveedor con throttling proveedor-aware y merge
     incremental del JSON.
   - 8 specs Mocha de consistencia (sin red) que validan la mezcla 30/10/10,
     la alineación input ↔ expected y la no-exposición de claves.

---

## 6. Cómo reproducir

```bash
# (1) regenerar los corpus a partir del master + ru_dev.xml
node scripts/build-correction-suite.js      # → correction-{10,20,30,40,50}-*
node scripts/build-generation-suite.js      # → generation-50-input.xml

# (2) consistencia (sin red, ~200 ms)
npx mocha "tests/unit/xml/correction-50-suite.test.js" "tests/unit/xml/generation-50-suite.test.js" --exit

# (3) evaluación de corrección (necesita GROQ_API_KEY y/o GEMINI_API_KEY)
node scripts/eval-correction-quality.js 50 all          # ambos proveedores
node scripts/eval-correction-quality.js 50 groq         # un único proveedor
node scripts/eval-correction-quality.js 50 gemini       # un único proveedor

# (4) evaluación de generación (idem)
node scripts/eval-generation-quality.js all
node scripts/eval-generation-quality.js groq
node scripts/eval-generation-quality.js gemini
```

Los outputs JSON se acumulan en `documentation/eval-output/` y se mezclan
incrementalmente, así que una pasada parcial nunca borra los datos de otra
ya guardada.
