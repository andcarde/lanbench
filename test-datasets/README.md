# test-datasets — corpus index

Ordered, documented fixtures used by the unit and integration suites (and by
manual/maturity testing). Every XML file is a **WebNLG benchmark** the importer
accepts (`utils/xml-reader.js#parseDatasetImport`): a `<benchmark><entries>` of
`<entry>` blocks, each with an `originaltripleset` / `modifiedtripleset` and one
or more `<lex>` sentences.

## Naming convention

- `test-N.xml` — small, ordered fixtures for fast tests and manual walk-throughs.
- `ru_dev*.xml` — **production-like** files (hundreds of entries, several
  sections), used by the maturity ("madure") lifecycle suite.
- `correction-example-*-{input,expected}.xml` — paired fixtures for the **AI
  correction** flow (a flawed Spanish candidate vs. its corrected form).
- `correction-N-input.xml` + `correction-N-expected.json` (N ∈ {10,20,30,40}) —
  the **AI-correction evaluation corpus**: N entries to correct plus their
  ground-truth verdicts (acceptance / warning / error). Generated from
  `correction-suite.master.json` by `scripts/build-correction-suite.js`; scored
  by `scripts/eval-correction-quality.js`. See `documentation/CORRECTION-QUALITY-EVAL.md`.
- `*generation_example*.txt` — legacy **generation** examples (JSON / free text).

## Files

| File | Scale | Sections @ size 10 | Purpose / flow exercised |
|------|------:|-------------------:|--------------------------|
| `ru_dev.xml` | 790 entries | 79 | Production-scale #1. Full lifecycle + the `xml-reader` parsing test. |
| `ru_dev_2.xml` | 240 entries | 24 | Production-scale #2 (derived slice of `ru_dev.xml`, renumbered eids). Lets the madure suite run over **≥2** production-like files. |
| `test.xml` | 20 entries | 2 | Medium fixture; drives `annotation-workflow.test.js`. |
| `test-1.xml` | 12 entries | 2 | Small lifecycle fixture: enough for a full section (10) plus a partial one. |
| `test-2.xml` | 8 entries | 1 | Small single-section fixture. |
| `test_input_1.txt` | 2 contexts | — | Expected humanized triples for `test.xml` entries 1–2 (annotation-workflow assertions). |
| `correction-example-1-input.xml` | 2 entries | — | AI-correction **input**: triples + a flawed Spanish candidate (`lex lang="es"`). |
| `correction-example-1-expected.xml` | 2 entries | — | AI-correction **expected**: the same triples with the corrected Spanish sentence. |
| `correction-suite.master.json` | 40 entries | — | Single source of truth for the eval corpus (triples, candidate, ground-truth verdict, corrected form, rationale). |
| `correction-{10,20,30,40}-input.xml` | 10/20/30/40 | — | AI-correction eval **inputs**: entries to correct (nested: 10 ⊂ 20 ⊂ 30 ⊂ 40). |
| `correction-{10,20,30,40}-expected.json` | 10/20/30/40 | — | AI-correction eval **ground truth**: per-entry `expectedSeverity` (ok/warning/error), `expectedCodes`, `corrected`, `rationale`. |
| `input_generation_example_1.txt` | — | — | Legacy generation example (JSON: eid, triples, `phrases_en`). |
| `output_generation_example_2.txt` | — | — | Legacy generation output example. |
| `basic_format.txt`, `basic_output.txt` | — | — | Free-text format scratch notes (not parsed by tests). |

## Validation

`node scripts/validate-test-datasets.js` parses every declared XML file, asserts
it is valid WebNLG, and prints its entry count. CI-friendly: non-zero exit on any
malformed/empty file.

## Section size

The number of sections above assumes the default section size of 10. Section size
is now **declarative per dataset** (`Dataset.sectionSize`, default 10) — see
`documentation/USER-STORIES.md` `US-04`.
