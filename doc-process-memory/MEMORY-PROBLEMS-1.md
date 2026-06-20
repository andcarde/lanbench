# MEMORY-PROBLEMS-1 — Auditoría de forma de la memoria del TFM

> Auditoría realizada sobre `memory/secciones/00_Resumen.tex`, `01_Introducción.tex`,
> `02_Desarrollo.tex`, `03_Herramientas.tex`, `04_Aplicación.tex`, `05_Experimento.tex`,
> `06_Anexos.tex` y `07_Resultados.tex`, así como `memory/include/plantilla_TFM.tex`
> en lo relativo al orden y a la inclusión de las secciones.
> Las referencias a líneas son aproximadas al estado actual del repositorio en `main`.

## Alcance de esta auditoría

**Sí se analiza**:

1. Ortografía, gramática y sintaxis del castellano.
2. Registro: adecuación al estilo académico formal (anglicismos no marcados,
   coloquialismos, hedge informal, primera persona inadecuada, marcadores
   demasiado conversacionales).
3. Ambigüedades y redacción pobre: frases largas, pronombres sin antecedente
   claro, calcos del inglés, gerundios mal usados, etc.
4. Estructura del documento: orden de capítulos, mezclas temáticas dentro
   del mismo capítulo, títulos de capítulo/sección poco descriptivos o
   incoherentes con su contenido, duplicidades.
5. Citas faltantes en afirmaciones de terceros (no de diseño propio).
6. Convenciones de TFM: existencia de resumen/abstract, capítulo de
   conclusiones, listas de figuras/tablas, índices, anexos esperables, etc.
7. Densidad y longitud por capítulo: párrafos demasiado largos, capítulos
   notoriamente cortos o sobredimensionados.
8. Faltas de tablas/figuras donde el convenio editorial lo exige
   (diagramas de arquitectura, ER, flujos, capturas en el manual).
9. Contenido referenciado en el texto pero no presente (etiquetas `\ref`
   colgantes, tablas/figuras prometidas y no aportadas).

**No se analiza** (queda explícitamente fuera de esta pasada):

- Validez sustantiva de las afirmaciones técnicas (¿es BLEU realmente
  «muy poco robusta»? ¿es 70B el umbral correcto?). El revisor humano debe
  comprobarlo aparte.
- Relevancia o vigencia del contenido: si una métrica es obsoleta, si falta
  un trabajo reciente, si MQM es realmente lo apropiado para WebNLG.
- Línea argumental: si el hilo de razonamiento entre capítulos es la mejor
  manera de presentar el trabajo; si el TFM contesta a la pregunta que se
  plantea; si hay afirmaciones que se contradicen entre capítulos.
- Defectos de contenido tipo «elemento referenciado pero no explicado»
  (esto, según el enunciado, queda fuera de esta auditoría y se considera
  problema de contenido).
- Existencia o no de una pregunta de investigación, hipótesis bien
  formuladas en sentido fuerte, etc.

---

## 1. Faltas ortográficas, gramaticales y sintácticas

### 1.1 Faltas ortográficas y de acentuación

| Archivo | Lugar | Problema |
|---|---|---|
| `02_Desarrollo.tex` | l. 151 | «cuando **éste** inicia una tarea de anotación» — desde Ortografía RAE 2010 el demostrativo pronominal *este/esta/aquel* ya no se tilda; revisar el resto del documento por consistencia. |
| `07_Resultados.tex` | l. 4 | «Resumen de resultados obtenidos en el **TFG**.» — debe ser **TFM** (Trabajo de Fin de Máster). |

### 1.2 Faltas gramaticales y sintácticas

| Archivo | Lugar | Problema |
|---|---|---|
| `01_Introducción.tex` | l. 226 | «no capturando adecuadamente sinónimos…» — gerundio de posterioridad/causal calcado del inglés; sustituir por «ya que no captura adecuadamente…». |
| `01_Introducción.tex` | l. 234 | «en las que **encontramos** sinónimos…» — primera persona del plural en un texto que sigue la pauta impersonal; reescribir como «en las que se encuentran». |
| `01_Introducción.tex` | l. 257 | «Esta comparación por caracteres **se trata de** una heurística» — construcción agramatical: «se trata de» exige sujeto cero. Reescribir: «Esta comparación constituye una heurística» o «Se trata de una heurística que…». |
| `01_Introducción.tex` | l. 173 | «de modo que **habilite** la tarea de conversión» — subjuntivo sin sujeto claro; reescribir «de modo que se habilite». |
| `03_Herramientas.tex` | l. 38 | «permite reducir los errores cometidos por los expertos, **permitiendo** un registro de errores que podrían mejorar **tanto** la calidad de evaluadores automáticos **que mejoren** la capacidad de las métricas usuales» — frase con doble «permitir/permitiendo» (cacofonía y razonamiento confuso), gerundio causal calcado, y correlación «tanto X como Y» incompleta: falta el «como». Reescribir entero. |
| `05_Experimento.tex` | l. 643–646 | «los desacuerdos dominantes sobre la franja de warnings de fluidez **los recategoriza** como error» — desacuerdo de sujeto: «los desacuerdos … los recategoriza» (sujeto plural, verbo singular y doblado de complemento incoherente). Reescribir como «los desacuerdos dominantes están en la franja de warnings de fluidez, que el pipeline recategoriza como error». |
| `01_Introducción.tex` | l. 143 | Frase de 5 líneas con un inciso entre rayas y un «por ello» mal colocado; reorganizar y partirla en dos. |
| `02_Desarrollo.tex` | l. 139–141 | Las dos primeras frases de la sección «Integración de modelos de lenguaje en la anotación y revisión» son de 4 líneas cada una y encadenan tres subordinadas. Cortarlas. |
| `02_Desarrollo.tex` | l. 167–181 | Mezcla de tiempos verbales: alternan presente («se contempla», «podrán consultar»), futuro («será», «podrán generar») y subjuntivo. Uniformar al presente expositivo de TFM. |
| `04_Aplicación.tex` | l. 33 | «un perfil lingüístico —capaz de detectar patrones del lenguaje y de disociarlos por dominio o contexto— o un perfil de ingeniería en *natural language processing* (NLP)» — frase muy larga y con incisos anidados; además, el anglicismo *natural language processing* sin marcar entre comillas/cursiva en el cuerpo y con la sigla NLP en inglés, mientras que el glosario reconoce PLN. Estandarizar. |

### 1.3 Redacción pobre, ambigüedades y calcos

| Archivo | Lugar | Problema |
|---|---|---|
| `01_Introducción.tex` | l. 133–137 («Lenguajes naturales») | Párrafo con repetición léxica («lenguajes naturales son aquellos lenguajes…»), afirmaciones filosóficas no desarrolladas («declaraciones circulares», «toleran la incompletitud»), uso informal de «muy dependientes», frase final débil. La sección es además anómalamente corta y conceptualmente superficial. Reescribir entera. |
| `01_Introducción.tex` | l. 257 | El ejemplo «"bastón" y "pastón"» introduce el coloquialismo *pastón* (dinero) en un párrafo formal; cambiar por un par natural y neutro («catón / gatón», «sosa / cosa», etc.). |
| `02_Desarrollo.tex` | l. 3 | «El **perfil oficial** de WebNLG se encuentra disponible en el repositorio público de GitHub» — «perfil oficial» es ambiguo (suena a perfil de usuario). El término correcto es «organización» u «organización oficial» de GitHub. |
| `02_Desarrollo.tex` | l. 139, 141 | «modelos de menor tamaño, como Llama 3 **de 7 mil millones** de parámetros o Qwen **de 3 mil millones**» — el registro académico prefiere «Llama 3 (7B)» o «Llama 3 con 7\,000 millones de parámetros»; la forma «de N mil millones» queda informal y, en el caso de Llama 3, es además factualmente discutible (el modelo base más pequeño es 8B). El revisor de contenido decidirá lo segundo; lo primero es de forma. |
| `04_Aplicación.tex` | l. 33 | «requieren conocimiento de español (C1 mínimo) e inglés (B2 mínimo)» — formulación telegráfica; mejor «requieren un nivel de español equivalente a C1 del MCER y un nivel de inglés equivalente a B2». |
| `05_Experimento.tex` | l. 31 («ground truth») | Anglicismo sin marcar ni traducir. Resto del capítulo italiza *pipeline*, *harness*, *back-off*, *score*, etc. Decidir una política: traducir («referencia anotada») o, como mínimo, *ground truth* en cursiva. |
| `05_Experimento.tex` | l. 99 | Título de subsección «Resolución previa: corrección del cliente OpenAI-compatible». «OpenAI-compatible» calcado y sin marcar. Mejor «cliente compatible con la API de OpenAI». |
| `05_Experimento.tex` | l. 285 | «el `spanish-service` degrada silenciosamente **a solo-reglas**» — calco; mejor «degrada a un modo basado únicamente en reglas» o «a la pasada determinista». |
| `05_Experimento.tex` | l. 524 | «**Es decir**, Gemini detecta una imprecisión semántica…» — *es decir* al inicio de párrafo final es informal; reescribir. |
| `05_Experimento.tex` | l. 549–551 | «el ajuste del prompt … es **más suave** y dependiente del modelo» — «más suave» es informal; sustituir por «más limitado», «menos robusto» o similar. |
| `05_Experimento.tex` | l. 660 | «requeriría un *tier* pago de Gemini» — anglicismo sin marcar y calco semántico («tier pago»); mejor «un plan de pago» o «el *tier* de pago». |
| `05_Experimento.tex` | l. 696 | «Ocho *specs* de Mocha» — *specs* anglicismo; usar «especificaciones» o «pruebas» («ocho ficheros de prueba de Mocha»). |
| `05_Experimento.tex` | tabla l. 134, 569 | Cabeceras y celdas con anglicismos sin marcar: «Pausa entre entries», «tokens-per-day». Italizar al menos los términos en lengua inglesa. |
| `05_Experimento.tex` | l. 540 | «según el contrato `ejerce-liderazgo`» — el identificador `ejerce-liderazgo` aparece sin explicación en el cuerpo de la memoria; ambiguo para el lector. |

### 1.4 Inconsistencias tipográficas y de estilo de cita

| Problema | Detalle |
|---|---|
| Estilo de cita mezclado | `01_Introducción.tex` usa `~\cite{...}` (sin espacio, con tilde de no-ruptura). `02_Desarrolo.tex` (l. 11, 17, 22) usa « \cite{...}» (con espacio normal). `03_Herramientas.tex` (l. 38) cita al modo Harvard, «(Castro Ferreira et al., 2020)», mezclado con el resto en estilo IEEE numérico. Unificar a `~\cite{…}`. |
| Italización irregular de *dataset* | A lo largo del documento aparecen `dataset` (sin formato), `\textit{dataset}` y `\texttt{dataset}`. Decidir una política: técnicamente todo va en cursiva como anglicismo, o se traduce a «conjunto de datos». |
| Italización irregular de *pipeline*, *harness*, *prompt*, *workflow*, *crowdsourcing*, *benchmark* | En unos sitios se italizan, en otros no. Pase con `grep`. |
| Comillas dobles | Mezcla de comillas tipográficas `` `` … '' `` y, por error, comillas rectas en `02_Desarrollo.tex` l. 70 («good», «toFix»). Coherenciar. |
| Decimales con coma vs. punto | El cuerpo usa coma decimal en la mayoría de cifras pero «0.1» en l. 547 (`temperature 0.1`), «20.0», «40.0», «68.0», «18.0», «100.0» en tablas. Como notación de configuración técnica se acepta el punto, pero hay que aclarar el criterio. |
| Negritas para enfatizar resultados | `05_Experimento.tex` l. 339, 391 usan `\textbf{60\%}`, `\textbf{85\%}` para destacar el dato — la convención académica desaconseja la negrita como recurso enfático en el cuerpo. Quitar o reservar para nombres de hipótesis (H1, H2). |
| Comentarios `% TODO` en la memoria | `04_Aplicación.tex` l. 123–125 deja un `% TODO: implementar US-24` visible en el fuente. Revisar y mover a `doc-planning/`. |

---

## 2. Estructura, separación por secciones y títulos

### 2.1 Defectos de capítulo

| Defecto | Detalle |
|---|---|
| **Capítulo 5 todavía muy cargado** | `05_Experimento.tex` se titula ahora «Experimentación y discusión», lo que corrige parte del problema, pero sigue concentrando diseño experimental, resultados, discusión, análisis MQM, amenazas a la validez, comparación con trabajos publicados, coste-beneficio, infraestructura, reproducción y conclusiones del experimento. Conviene valorar si todo debe vivir en un único capítulo de 907 líneas. |
| **Anexos con `\chapter{}` cuando lo natural es `\section{}`** | Bajo `\appendix` cada `\chapter{}` se convierte en Anexo A, B, C… (correcto). Pero un anexo de tres páginas como «Catálogo completo de códigos de validación» convive con un anexo monumental como «Manual de usuario». Considerar nivelar (varios anexos pequeños o varios capítulos de anexo). |

### 2.2 Defectos de sección y subsección

| Archivo | Lugar | Problema |
|---|---|---|
| `01_Introducción.tex` | l. 342 | Subsección «Plataformas de evaluación» sigue teniendo un único párrafo breve. O se desarrolla o se integra en la sección de métricas. |
| `02_Desarrollo.tex` | l. 148 | «Ejemplo ilustrativo» sigue como `\subsubsection` suelta dentro de «Estructura del dataset»; la convención académica prefiere meterlo como párrafo de ejemplo o como cuadro/figura. |
| `04_Aplicación.tex` | l. 469–473 | La subsección «Configuración» contiene únicamente US-24, que está marcada como pendiente en el catálogo y en conclusiones. Podría moverse al bloque de trabajo futuro o rotularse aquí también como pendiente. |

---

## 3. Afirmaciones no respaldadas por citación (que no son de diseño propio)

Se excluyen del listado las afirmaciones sobre el diseño de la aplicación
`lanbench`, que son aportación del autor y no requieren cita.

Tras contrastar los capítulos actuales, no quedan incidencias activas en las
tablas de citas: RDF, DBpedia, WebNLG, GERBIL/BENG, herramientas RDF, LEAN,
proveedores de *crowdsourcing* y limitaciones de LLM ya aparecen respaldados o
han sido reformulados como diseño propio / caracterización del autor.

---

## 4. Convenciones de TFM, longitud, densidad y referencias

### 4.1 Faltas críticas frente al convenio de TFM ETSIINF

| Faltante | Detalle |
|---|---|
| **Lista de acrónimos al inicio** | Está como anexo, pero el convenio ETSIINF suele pedir que aparezca al frente, tras el índice. Discrecional, pero conviene reubicarla. |

### 4.2 Falta de figuras (no de tablas)

No quedan incidencias activas en esta tabla. La memoria actual ya incluye
diagrama de arquitectura, diagrama ER, *pipelines*, capturas de interfaz,
mapas de calor y cronograma/Gantt.

### 4.3 Tablas u otros elementos numerados ausentes que el convenio recomienda

No quedan incidencias activas en esta tabla. Ya existen tablas comparativas de
métricas, ediciones de WebNLG, roles/permisos, catálogo de historias, pruebas y
matrices de confusión numeradas.

### 4.4 Longitud insuficiente o excesiva por capítulo

| Capítulo | Líneas `.tex` | Diagnóstico de longitud |
|---|---|---|
| 5 Experimentación y discusión | 907 | **Largo** y heterogéneo. Incluye diseño experimental, resultados, discusión, comparativa, validez, coste-beneficio, infraestructura, reproducción y conclusiones del experimento. Aunque el título ya reconoce la discusión, conviene valorar si dividirlo mejoraría la lectura. |

### 4.5 Párrafos demasiado densos (necesitan partición)

| Archivo | Lugar | Comentario |
|---|---|---|
| `03_Herramientas.tex` | l. 6 | Párrafo único de ~15 líneas con la metodología bilingüe WebNLG+ 2020 (MTurk + Toloka). Romper en 2 párrafos. |
| `04_Aplicación.tex` | l. 15 | Párrafo único de ~12 líneas sobre historias de usuario e INVEST. |
| `05_Experimento.tex` | l. 268 | Párrafo único denso sobre `providerConfig`, reintentos, *back-off*, `LLM_FAIL` y degradación a reglas. |

### 4.6 Etiquetas, referencias y catálogo de entidades numeradas

- **`\ref` colgantes**: la revisión actual confirma una etiqueta no definida
  que produciría «??» en el PDF:
  - `sec:etica-crowdsourcing` se referencia cuatro veces (`06_Resultados.tex`
    en la subsección «Pruebas manuales de sistema con usuarios reales»
    y dos veces en «Líneas de continuación a medio plazo»; `07_Anexos.tex`
    l. 710) pero no se define en ningún fichero de `memory/secciones/`
    ni de `memory/include/`. Las cuatro referencias presuponen una sección
    sobre ética del *crowdsourcing* que existió en un borrador anterior
    y que en la versión actual sólo se aproxima a través de
    `sec:crowdsourcing-alternativas` (`03_Herramientas.tex` l. 175).
    Acción: o bien añadir `\label{sec:etica-crowdsourcing}` en el punto
    donde se discuten las consideraciones éticas (probablemente
    `03_Herramientas.tex` §«Ética en el *crowdsourcing*» o equivalente,
    creando la subsección si no existe), o bien sustituir las cuatro
    llamadas por la etiqueta vigente más cercana.
- **Convenio numérico de cifras**: tabla `tab:resultados-50-resumen` da
  «34/50 = 68.0\%», otras tablas dan «20.0», «18.0»; el cuerpo da «68\%»,
  «91\%», «60\%», «85\%». Decidir 0 o 1 decimales y usarlo de forma estable.

### 4.7 Anexos

| Anexo | Problemas |
|---|---|
| A — Glosario y acrónimos | Revisar que todas las siglas usadas en el cuerpo aparezcan. Siguen faltando, entre otras, INVEST, RGPD/GDPR, MQM, RPM, TPM, TPD, SHACL, ShEx y GEM. |
| E — Instrucciones de sistema (*system prompts*) utilizadas con los LLM | Falta el *system prompt* del flujo de generación (`auto-annotation-service.js`), que sí se cita en el cuerpo pero no se reproduce en el anexo. |

---

## 5. Problemas de la aplicación reflejados en la memoria

Esta sección excede el alcance puramente formal de la auditoría, pero se
incluye porque condiciona la coherencia entre lo que la memoria describe
y lo que la aplicación realmente implementa.

### 5.1 US-24 — Configuración dinámica de criterios de evaluación no implementada

- **Síntoma actual**: la memoria ya marca US-24 como pendiente en el catálogo
  consolidado de historias (`04_Aplicación.tex` l. 312 y caption de
  `tab:us-catalogo`) y en el capítulo de resultados (`06_Resultados.tex`
  l. 120–123). Sin embargo, todavía aparece como elemento ordinario en la
  subsección «Configuración» (`04_Aplicación.tex` l. 469–473) y la matriz de
  roles/permisos sigue mostrando «Gestión de criterios de evaluación» como
  capacidad del administrador (`04_Aplicación.tex` l. 71).
- **Realidad**: la funcionalidad no existe en el repositorio. La propia
  memoria reconoce la carencia como trabajo futuro.
- **Consecuencia para la memoria**:
  1. Coherencia interna: la marca de pendiente existe, pero no está aplicada en
     todos los puntos donde US-24 o su permiso asociado aparecen.
  2. Trazabilidad: el catálogo de historias de usuario pierde su
     condición de «fuente de verdad funcional» (descrita en la propia
     sección §«Documentación oficial del proyecto»), porque el detalle textual
     todavía mezcla historias entregadas con historias pendientes.
  3. Evaluación experimental: el capítulo 5 («Experimentación y discusión») no
     reporta ningún experimento sobre criterios configurables, lo cual
     es coherente con su no implementación pero refuerza la sensación
     de que la US-24 está colgando del documento.
- **Acciones recomendadas (a decidir por el autor)**:
  1. **Implementar US-24** y completar el capítulo 5 con la prueba
     correspondiente: cerrar el desfase desde la aplicación.
  2. **Marcar US-24 explícitamente como pendiente** también en la subsección
     «Configuración» y ajustar la matriz de roles/permisos para que no sugiera
     una capacidad ya entregada.
  3. **Eliminar US-24 del cuerpo principal** y mencionarla únicamente en
     trabajo futuro: cerrar el desfase desde la documentación.
- **Pendiente análogo (mismo problema, mismo capítulo)**: la opción
  «revisiones adicionales tras corrección» se documenta como parámetro del
  formulario de creación de *dataset* (`04_Aplicación.tex` l. 453) y se reconoce
  como trabajo futuro en `06_Resultados.tex` l. 124–128. Aplica el mismo
  razonamiento: la memoria expone una capacidad persistida pero no ejercida.

## 6. Resumen ejecutivo para guiar la siguiente pasada de escritura

Recomendaciones priorizadas tras la revisión actual:

1. **Bloqueante técnico de compilación**: resolver la etiqueta colgante
   `sec:etica-crowdsourcing` o sustituir sus cuatro referencias por la etiqueta
   vigente más cercana.
2. **Coherencia funcional**: decidir el tratamiento final de US-24 y de
   «revisiones adicionales tras corrección» para que todas sus apariciones
   indiquen claramente que son trabajo futuro o funcionalidad entregada.
3. **Estructural**: valorar si el capítulo 5 debe dividirse o descargarse; sigue
   siendo el capítulo más largo y heterogéneo.
4. **Convenio**: decidir si la lista de acrónimos debe ir al frente, tras el
   índice, y completar las siglas que faltan en el anexo.
5. **Limpieza**: reproducir en el Anexo E el *system prompt* de generación
   usado por `auto-annotation-service.js`.
6. **Estilo menor**: homogeneizar porcentajes y partir los párrafos densos que
   siguen listados en §4.5.

---

## 8. Tareas de investigación y elaboración pendientes

Esta sección recoge únicamente tareas que siguen abiertas tras contrastar el
estado actual de `memory/`.

### 8.1 Figuras a producir

No quedan figuras pendientes en esta auditoría. Las entradas previas de
arquitectura, ER, *pipelines*, capturas, mapas de calor y Gantt ya están
materializadas en la memoria.

### 8.2 Tablas a producir o completar a partir de fuentes externas

No quedan tablas externas pendientes en esta auditoría. La trazabilidad de
pruebas, el catálogo de historias y la justificación de huecos de numeración ya
están incorporados.

### 8.3 Contenido académico que exige fuente externa

No quedan tareas bibliográficas abiertas en esta auditoría. Las filas previas
han sido retiradas porque las citas ya están presentes o la afirmación fue
reformulada.

### 8.4 Recordatorios de redacción derivados de §4

- §4.6 — La etiqueta `sec:etica-crowdsourcing` sigue sin definición. Tarea
  editorial **W-ETICA-LABEL-01**: añadir la etiqueta donde corresponda o
  sustituir las referencias por `sec:crowdsourcing-alternativas`.
- §4.7 — El anexo de acrónimos sigue incompleto. Tarea editorial
  **W-ACRONIMOS-COMPLETAR-01**: añadir INVEST, RGPD/GDPR, MQM, RPM, TPM, TPD,
  SHACL, ShEx y GEM si se mantienen en el cuerpo.
- §4.7 — En el Anexo E falta el \textit{system prompt} del flujo de
  generación (`auto-annotation-service.js`). Tarea editorial
  **W-ANEXO-E-GENPROMPT-01**: reproducir literalmente el \textit{prompt}
  vigente al cierre del experimento.
