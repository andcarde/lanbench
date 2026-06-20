# AUDIT-CITATIONS-1 — Cierre de la sección §3 de MEMORY-PROBLEMS-1

> Bitácora de la pasada de auditoría sobre las afirmaciones de terceros sin
> citación detalladas en `MEMORY-PROBLEMS-1.md` §3 («Afirmaciones no
> respaldadas por citación»). Cada fila documenta la afirmación, la fuente
> incorporada y la acción ejecutada sobre el `.tex` correspondiente.
> Fecha de ejecución: 2026-06-15.

## Resumen de acciones

- **9 afirmaciones** marcadas como sin cita en la auditoría original se
  resuelven en esta pasada.
- **3 afirmaciones** ya estaban resueltas en el estado vivo del repositorio
  (la auditoría se redactó contra una versión anterior).
- **0 afirmaciones** se han suprimido por imposibilidad de respaldo: en el
  único caso candidato (la caracterización filosófica de los lenguajes
  naturales) la solución elegida fue **atemperar** el texto y reanclarlo
  en una referencia académica concreta.
- **8 entradas BibTeX nuevas** añadidas a `memory/include/referencias.bib`.

## Detalle por afirmación

### Capítulo 1 (Introducción)

| Lugar (estado vivo) | Afirmación original | Fuente añadida | Acción |
|---|---|---|---|
| §«DBpedia», l. 43–48 | Existencia del capítulo en español de DBpedia | `DBpediaSpanish` (es.dbpedia.org, OEG-UPM) | Añadida cita; precisado el mantenedor (OEG-UPM) |
| §«Tripletas RDF», l. 50–69 | Definición formal de RDF como modelo de tripletas y de URI | `W3CRDF11` (ya en la `.bib`) | Añadida cita W3C RDF 1.1 a la definición y al concepto de URI |
| §«Lenguajes naturales», l. 132–148 | «definiciones circulares», «toleran la incompletitud y la inconsistencia», «redundancias» | `BenderKoller2020_NLU` | Reescrita la subsección. Se eliminan las afirmaciones filosóficas no respaldadas y se reanclaje en la distinción forma/significado de Bender & Koller 2020. Se añade una transición operativa hacia las métricas |
| §«Limitaciones de los modelos automáticos», l. 169–193 | Lista de limitaciones de los LLM | `Ji2023` (alucinaciones, ya en la `.bib`), `Bender2021_StochasticParrots`, `BenderKoller2020_NLU` | Añadidas citas a la lista; precisado el origen de cada limitación |
| §«Plataformas de evaluación», l. 304 | GERBIL/BENG en WebNLG+ 2020 | `GERBIL`, `Usbeck2015` (ya citadas) | **Ya resuelto** en el estado vivo |

### Capítulo 2 (WebNLG: ediciones, estructura del *dataset* y extensión al español)

| Lugar (estado vivo) | Afirmación original | Fuente añadida | Acción |
|---|---|---|---|
| §«Estructura del dataset», l. 48–62 | Estructura `entry` (atributos, `shape_type`), evaluación data-to-text / text-to-data | `Gardent2017`, `CastroFerreira2020`, `WebNLGGitHub` | Añadidas citas al párrafo de apertura y nota de procedencia documental |
| §«Contenido interno de una entry», ejemplo l. 108–129 | Ejemplo bilingüe inglés–ruso | `CastroFerreira2020` | Atribución explícita a WebNLG+ 2020 |
| §«Integración de modelos de lenguaje…» (cap. 4, l. 79, 85) | Observaciones empíricas Ollama / Llama 3 7B / Qwen 3B / umbral 70B | — | **No requiere cita externa**. El texto ya está atemperado («pruebas preliminares realizadas», «pruebas exploratorias mostraron»). Es observación propia del autor, admisible como justificación de diseño |

### Capítulo 3 (Estado del arte: construcción colaborativa de corpus y métricas de evaluación)

| Lugar (estado vivo) | Afirmación original | Fuente añadida | Acción |
|---|---|---|---|
| §«Validación de RDF», l. 14–18 | Apache Jena y Eclipse RDF4J como *parsers* RDF estándar | `ApacheJena`, `EclipseRDF4J` | Añadidas citas a las webs oficiales (Apache Software Foundation; Eclipse Foundation) |
| §«Human-in-the-Loop / Definición y enfoque», l. 38–47 | «enfoque metodológico LEAN» | `WomackJones1996_LeanThinking` | Añadida cita a Womack & Jones 1996. Se cambia «LEAN» (mayúsculas, acrónimo) por «*lean*» y se explicita la atribución a los autores formuladores del concepto |
| §«Plataformas alternativas y comparativa», tabla l. 70–95 | Caracterizaciones de Toloka, MTurk, Prolific, Appen | `TolokaAbout`, `Fort2011_MTurk`, `PalanSchitter2018_Prolific`, `Appen2024Coverage` (las dos primeras y la última ya en `.bib`) | Añadidas citas en la cabecera de cada columna. Reescrita la *caption* de la tabla para indicar que la comparativa se elabora a partir de la documentación pública y de la literatura citada, en línea con la recomendación de la auditoría |
| §«Consideraciones éticas y de remuneración», l. 109–117 | Turkopticon como canal de denuncia | `IraniSilberman2013_Turkopticon` (CHI 2013, *Best Paper*) | Añadida cita; reescrita la frase para enmarcar Turkopticon como sistema activista descrito formalmente en CHI 2013 |
| §«Consideraciones éticas y de remuneración», MTurk por debajo del salario mínimo | `Fort2011_MTurk`, `Shmueli2021_BeyondFairPay` | — | **Ya resuelto** en el estado vivo |
| §«Ampliación multilingüe» (Castro Ferreira et al., 2020 en Harvard) | Cita Harvard mezclada con IEEE numérico | — | **Ya resuelto** en el estado vivo: las apariciones usan `\cite{CastroFerreira2020}` de forma uniforme |

## Nuevas entradas BibTeX

Insertadas al final de `memory/include/referencias.bib`:

- `Bender2021_StochasticParrots` — Bender, Gebru, McMillan-Major,
  Shmitchell. *On the Dangers of Stochastic Parrots: Can Language Models
  Be Too Big?* FAccT 2021. DOI 10.1145/3442188.3445922.
- `BenderKoller2020_NLU` — Bender & Koller. *Climbing towards NLU: On
  Meaning, Form, and Understanding in the Age of Data*. ACL 2020. DOI
  10.18653/v1/2020.acl-main.463.
- `IraniSilberman2013_Turkopticon` — Irani & Silberman. *Turkopticon:
  Interrupting Worker Invisibility in Amazon Mechanical Turk*. CHI 2013.
  DOI 10.1145/2470654.2470742.
- `PalanSchitter2018_Prolific` — Palan & Schitter. *Prolific.ac—A subject
  pool for online experiments*. J. Behavioral and Experimental Finance
  17, 22–27. DOI 10.1016/j.jbef.2017.12.004.
- `WomackJones1996_LeanThinking` — Womack & Jones. *Lean Thinking: Banish
  Waste and Create Wealth in Your Corporation*. Simon & Schuster, 1996.
- `ApacheJena` — Apache Software Foundation. Página oficial del proyecto.
- `EclipseRDF4J` — Eclipse Foundation. Página oficial del proyecto.
- `DBpediaSpanish` — Spanish chapter of DBpedia, mantenido por el OEG-UPM.

## Cobertura del listado original

Tras esta pasada, todos los puntos enumerados en
`MEMORY-PROBLEMS-1.md` §3.1, §3.2 y §3.3 quedan respaldados, atemperados
o ya resueltos. §3.4 (cap. 4) no requería acción adicional; §3.5 (cap. 5)
ya estaba citado; §3.6 (anexos) tampoco contenía afirmaciones de
terceros sin cita.

## Verificación pendiente del usuario

1. Compilar la memoria con `pdflatex` + `biber` para confirmar que no
   queda ninguna cita rota.
2. Validar la traducción de etiqueta «*lean*» y la reescritura del
   párrafo de la subsección «Lenguajes naturales» del cap. 1 (cambio
   más sustantivo de redacción).
3. Revisar si el revisor académico del TFM desea citas adicionales
   (Saussure, Halliday) para reforzar la subsección de lenguajes
   naturales; la opción adoptada aquí ha sido la mínima sustentada en
   literatura de PLN reciente (Bender & Koller 2020).
