# ORIGINALLITY-PROBLEMS-1

## Propósito

Inventario de fragmentos de la memoria con riesgo elevado de ser marcados por
herramientas de detección de plagio (Turnitin, Compilatio, Copyleaks, etc.) o
de detección de texto generado por LLM (Originality.ai, GPTZero,
Copyleaks AI Detector). Se priorizan tres patrones:

1. **Definiciones genéricas de conceptos estándar** (RDF, DBpedia, BLEU,
   METEOR, HITL, MQM, etc.) cuya formulación canónica circula en numerosas
   fuentes y suele tener una huella léxica reconocible.
2. **Paráfrasis ligeras de fuentes citadas**: párrafos que reformulan
   directamente el artículo o documento referenciado sin reestructurar la
   redacción.
3. **Boilerplate de descripción de herramientas** (Express, Prisma, Multer,
   Bootstrap, Toloka, …): coincide casi literalmente con las páginas
   oficiales de cada producto.

Cada entrada indica el fichero, el rango aproximado de líneas, el nivel de
riesgo (`ALTO` / `MEDIO`), la causa y una sugerencia de reescritura.

## Convenciones de uso

- Este documento no implica que los fragmentos sean copia literal; señala los
  pasajes que conviene **reescribir defensivamente** antes de pasar la
  memoria por Turnitin/Compilatio y por un detector de IA.
- Las entradas se cierran (marcándolas como resueltas) cuando el fragmento
  ha sido reescrito y se ha verificado con la herramienta correspondiente.

---

## 1. Resumen y Abstract — `memory/secciones/00_Resumen.tex`

### 1.1 Apertura sobre WebNLG (líneas 4–10 y 52–58)

> «WebNLG es uno de los \textit{benchmarks} de referencia para la generación
> de lenguaje natural a partir de tripletas RDF de DBpedia. A lo largo de
> sus sucesivas ediciones (2017, 2020 y 2023) el corpus se ha publicado en
> inglés, ruso y un conjunto de lenguas con recursos limitados, pero no en
> español.»

- **Riesgo: MEDIO.** Fórmula de presentación de WebNLG muy similar a la
  empleada en los artículos oficiales de Gardent y Castro Ferreira. El
  Abstract en inglés replica la misma estructura, que es lo que un detector
  comparará con la literatura WebNLG.
- **Sugerencia.** Reescribir desde el ángulo del problema concreto del TFM
  («la ausencia de cobertura del español en WebNLG motivó…»), en vez de
  abrir con una definición posicional del corpus.

---

## 2. Introducción — `memory/secciones/01_Introducción.tex`

### 2.1 Definición de DBpedia (líneas 33–48)  ·  ALTO

> «DBpedia es una base de conocimiento multilingüe construida mediante la
> extracción automática de información estructurada de Wikipedia,
> principalmente de sus fichas de datos (\textit{infoboxes}). El
> conocimiento extraído se publica como tripletas RDF conformes a una
> ontología común y es accesible mediante consultas SPARQL…»

- **Causa.** Definición prácticamente idéntica a la que aparece en la
  página de Wikipedia sobre DBpedia, en la propia web del proyecto y en
  Auer 2007 / Lehmann 2015. Sintagmas como
  *«extracción automática de información estructurada de Wikipedia»* y
  *«nodos centrales de la iniciativa Linked Open Data»* son fórmulas
  recurrentes.
- **Sugerencia.** Reformular destacando **por qué importa para este TFM**
  (es la fuente de URIs de WebNLG) y comprimir la parte enciclopédica a una
  o dos frases con cita explícita.

### 2.2 Definición de RDF y tripletas (líneas 50–69)  ·  ALTO

> «RDF (\textit{Resource Description Framework}) es un modelo de
> representación de datos estandarizado por el W3C, basado en tripletas de
> la forma (Sujeto, Predicado, Objeto). Cada tripleta representa un hecho
> atómico e indivisible…»

- **Causa.** Definición canónica W3C, reproducida en cientos de manuales y
  tutoriales. La descomposición sujeto/predicado/objeto con el énfasis en
  *«hecho atómico»* es un patrón inmediatamente reconocible para Turnitin.
- **Sugerencia.** Mantener la formalización mínima (la tripleta y la URI) y
  desplazar la explicación discursiva a una sola frase que reenvíe a la
  norma del W3C.

### 2.3 Relaciones n-arias y ejemplo de Plutón (líneas 87–135)  ·  ALTO

> «Conviene aclarar de partida que RDF solo admite de forma nativa
> relaciones binarias: las relaciones en las que intervienen más de dos
> entidades deben codificarse mediante grupos de tripletas que se articulan
> en torno a un nodo intermedio…»

- **Causa.** Paráfrasis muy cercana a la *Working Group Note* del W3C
  sobre relaciones n-arias (Noy & Rector, 2006). El ejemplo de Plutón es
  un caso de escuela ampliamente reutilizado en tutoriales de web
  semántica.
- **Sugerencia.** Sustituir el ejemplo de Plutón por uno **propio del
  dominio WebNLG** (p. ej. una reclasificación administrativa o un cambio
  de marca usado por DBpedia) y reducir la prosa expositiva.

### 2.4 Naturaleza de los lenguajes naturales (líneas 137–154)  ·  MEDIO

> «A diferencia de los lenguajes formales de la lógica o de la matemática,
> donde la sintaxis y la semántica se definen explícitamente, los lenguajes
> naturales carecen de una especificación formal cerrada…»

- **Causa.** Reformulación cercana a Bender & Koller (2020) y a fórmulas
  estándar de introducción a la lingüística computacional.
- **Sugerencia.** Acortar a dos o tres frases que enlacen directamente
  con la justificación operativa («…lo que motiva el uso de varias
  lexicalizaciones por entrada»).

### 2.5 Limitaciones de los LLMs (líneas 175–194)  ·  ALTO

> «Errores semánticos…», «Pérdida de información…», «Alucinaciones:
> generación de información inexistente o no soportada por la fuente…»,
> «Errores de contexto…»

- **Causa.** Lista de cuatro viñetas con esos mismos rótulos y
  formulaciones aparece en innumerables introducciones de papers sobre
  LLMs (Ji 2023, Bender 2021 y derivados). Es uno de los patrones más
  típicos de output de LLM y los detectores de IA lo reconocen con
  facilidad.
- **Sugerencia.** Personalizar el catálogo: nombrar las limitaciones tal y
  como se manifiestan en el experimento de este TFM (con ejemplos
  observados en `eval-output/`), no en abstracto.

### 2.6 Definiciones de métricas (líneas 226–285)  ·  ALTO

Subapartados BLEU, METEOR, TER, BERTScore, COMET, chrF++.

- **Causa.** Cada subapartado parafrasea el paper original
  correspondiente. En particular:
  - **BLEU**: la fórmula y el comentario sobre conteo recortado y
    penalización por brevedad replican casi al pie de la letra Papineni
    et al. (2002).
  - **COMET**: la descripción («modelo neuronal entrenado para predecir
    juicios humanos…») es una glosa estándar del paper de Rei et al.
    (2020).
  - **chrF++**: el matiz «útil en lenguas flexivas, donde diferentes
    formas comparten una raíz común» reproduce las motivaciones
    publicadas por Popović.
- **Sugerencia.** Reducir cada métrica a una sola frase que indique
  **qué mide**, **qué limitación tiene en el contexto WebNLG-español** y
  cuándo se usa en este TFM. Trasladar las fórmulas y los detalles
  enciclopédicos a un anexo, citando los papers originales con literal
  reconocido.

---

## 3. Desarrollo (WebNLG) — `memory/secciones/02_Desarrollo.tex`

### 3.1 Descripción de las tres ediciones (líneas 12–48)  ·  MEDIO

> «El WebNLG Challenge 2017 constituyó la primera competición en la que el
> conjunto de datos WebNLG fue empleado formalmente como referencia…»

- **Causa.** Estructura tripartita (2017, 2020, 2023) con descripciones
  muy próximas a los papers de presentación de cada edición. No es
  estrictamente plagio si las citas están bien, pero la prosa tiene aire
  de ficha enciclopédica.
- **Sugerencia.** Consolidar en un único párrafo introductorio + tabla
  (la Tabla 3.1 ya existente) y eliminar redundancia.

### 3.2 Estructura del dataset (líneas 73–131)  ·  MEDIO

> «Cada \textit{entry} constituye un ejemplo independiente y posee cinco
> atributos principales: category, eid, size, shape, shape\_type…»

- **Causa.** Reproducción muy directa de la documentación oficial del
  consorcio WebNLG (README del repositorio público y data card de GEM).
- **Sugerencia.** Mantener la enumeración (es necesaria para entender el
  XML), pero introducirla como cita explícita de la documentación oficial.
  La prosa explicativa («El atributo size permite medir la complejidad
  semántica…») puede comprimirse o eliminarse.

---

## 4. Estado del arte — `memory/secciones/03_Herramientas.tex`

### 4.1 Ampliación multilingüe / metodología WebNLG+ 2020 (líneas 4–8)  ·  MEDIO

> «El desarrollo de versiones multilingües del conjunto de datos WebNLG ha
> seguido una metodología iterativa que combina procesos de revisión
> humana estructurada con uso de herramientas de traducción automática
> neuronal…»

- **Causa.** Paráfrasis directa de Castro Ferreira et al. (2020). La frase
  *«traducidas por sistemas neuronales y, a continuación, sometidas a
  posedición humana en la plataforma de \textit{crowdsourcing}
  Yandex.Toloka»* reproduce un fragmento informativo del paper.
- **Sugerencia.** Reformular en clave de lecciones aprendidas para este
  TFM: qué de esa metodología se adopta y qué se rechaza.

### 4.2 Validación de RDF (líneas 10–22)  ·  ALTO

> «la validez sintáctica implica que las tripletas generadas puedan ser
> correctamente segmentadas, es decir, parseadas por herramientas
> estándar de RDF, tales como Apache Jena o Eclipse RDF4J… SHACL
> (\textit{Shapes Constraint Language}) o ShEx (\textit{Shape
> Expressions})…»

- **Causa.** Es un listado de herramientas con descripciones funcionales
  prácticamente idénticas a las de sus páginas oficiales y a tutoriales
  académicos estándar. La división en niveles (sintáctico, estructural,
  semántico) es un esquema muy repetido en surveys de validación RDF.
- **Sugerencia.** Comprimir en una sola frase por nivel y eliminar las
  descripciones de Jena/RDF4J/SHACL/ShEx, citándolas por referencia.

### 4.3 Definición de Human-in-the-Loop (líneas 32–47)  ·  ALTO

> «En el ámbito de la inteligencia artificial, el enfoque
> \textit{Human-in-the-Loop} (HITL) se define como una característica
> metodológica en la que la intervención humana se integra de manera
> explícita dentro de un proceso automatizado con el propósito de
> incrementar la calidad del resultado…»

- **Causa.** Definición de manual, muy próxima a la divulgación de
  IBM/Google Cloud (las dos referencias citadas) y al *survey* de Wu et al.
  (2021). La estructura «definición → fases del ciclo de vida → mejora
  continua → cita a Lean» es un patrón típico de LLM cuando se pide
  explicar HITL.
- **Sugerencia.** Reescribir abriendo con un caso concreto («En
  \texttt{lanbench}, el HITL se materializa cuando…») y dejar la
  definición canónica para una nota a pie con la cita.

### 4.4 Toloka (líneas 56–63)  ·  MEDIO

> «Toloka es una empresa con sede en Ámsterdam (Países Bajos) y oficinas
> adicionales en Estados Unidos, Israel, Suiza y Serbia, originada dentro
> del ecosistema Yandex y constituida como entidad independiente en
> 2022…»

- **Causa.** Reproduce casi literalmente la página *About* de Toloka. La
  enumeración de oficinas y la frase sobre la independencia respecto a
  Yandex son una huella obvia para Turnitin.
- **Sugerencia.** Reducir a la información estrictamente relevante para
  el TFM (que sirve para tareas de generación lingüística multilingüe y
  qué modelo de precios se aplicó) y eliminar los datos corporativos.

### 4.5 LLM-as-judge (líneas 96–101)  ·  MEDIO

> «El paradigma \textit{LLM-as-a-judge}, popularizado por Zheng et al.,
> propone delegar parte del proceso de evaluación de texto generado a
> otros modelos de lenguaje de gran escala. En su trabajo seminal, los
> autores demostraron que jueces como GPT-4 alcanzan más del 80\,\% de
> acuerdo con preferencias humanas…»

- **Causa.** Paráfrasis cercana del abstract de Zheng et al. (2023). El
  número *«80\,\%»* y la mención a *MT-Bench* son los dos disparadores
  habituales de Turnitin.
- **Sugerencia.** Reformular en términos de la decisión de diseño de este
  TFM (por qué no se adopta LLM-as-judge como autoridad final), citando
  el paper sin reproducir su frase resumen.

### 4.6 Consideraciones éticas (líneas 105–120)  ·  MEDIO

> «la literatura ha documentado de forma recurrente que en plataformas
> abiertas como Amazon Mechanical Turk las retribuciones efectivas se
> sitúan con frecuencia por debajo del salario mínimo de referencia…»

- **Causa.** Frase típica de toda introducción al *crowdsourcing* ético.
  El triplete *Fair Work / Turkopticon / RGPD* aparece en numerosos
  trabajos previos con redacción muy similar.
- **Sugerencia.** Comprimir a dos frases con citas y trasladar el grueso
  argumentativo a una decisión operativa (qué se hizo en \texttt{lanbench}
  para mitigar estas cuestiones).

---

## 5. Aplicación — `memory/secciones/04_Aplicación.tex`

### 5.1 Historias de usuario, INVEST y Cohn (líneas 6–10)  ·  MEDIO

> «Su formulación canónica, popularizada por Cohn, sigue la estructura
> ``como~\langle rol \rangle, quiero~\langle capacidad \rangle,
> para~\langle beneficio \rangle''… INVEST (\textit{Independent,
> Negotiable, Valuable, Estimable, Small, Testable})…»

- **Causa.** Reproduce la fórmula canónica de Cohn (2004) tal cual aparece
  en su libro y en cientos de blogs ágiles. El acrónimo INVEST con su
  desglose tiene una huella reconocida.
- **Sugerencia.** Mantener la cita pero comprimir a una sola frase de
  contextualización («…siguiendo la formulación canónica de Cohn~\cite{}»)
  sin reproducir la plantilla ni todo el desglose de INVEST.

### 5.2 Catálogo de tecnologías (líneas 419–435)  ·  ALTO

> «Express.js: marco web minimalista para Node.js…»,
> «Prisma: \textit{ORM} declarativo…»,
> «Multer: \textit{middleware} de Express especializado en la subida de
> archivos…»,
> «Bootstrap: marco de componentes y rejilla CSS…»

- **Causa.** Cada viñeta reproduce el *one-liner* que las propias páginas
  oficiales (`expressjs.com`, `prisma.io`, `getbootstrap.com`, …) usan
  para describirse. Es uno de los patrones más detectables tanto por
  Turnitin como por detectores de IA: estilo enciclopédico, descripciones
  intercambiables, ausencia de aportación propia.
- **Sugerencia.** Reescribir en una sola frase por tecnología, sustituyendo
  la descripción genérica por **el uso concreto en este TFM**
  («Express.js soporta las rutas `/api/datasets` y `/api/reviews`, junto
  con el ciclo de \textit{middlewares} de autenticación»). Las
  descripciones genéricas tipo «marco web minimalista» pueden suprimirse
  por completo.

---

## 6. Experimentación — `memory/secciones/05_Experimento.tex`

Riesgo global **BAJO**: el grueso del capítulo es específico de este
trabajo (corpora propios, scripts propios, resultados numéricos). Solo dos
pasajes merecen revisión.

### 6.1 Marco MQM (líneas 735–771)  ·  MEDIO

> «MQM organiza las dimensiones de calidad en categorías jerárquicas
> (precisión, fluidez, terminología, estilo y diseño) y asigna a cada
> incidencia un peso en función de su gravedad.»

- **Causa.** Explicación canónica del marco MQM (Lommel 2014, Freitag
  2021). El listado de cinco dimensiones es la firma habitual del marco
  en cualquier paper de evaluación de traducción.
- **Sugerencia.** Sustituir la prosa explicativa por una referencia
  directa al artículo y mantener únicamente la tabla de mapeo, que sí es
  aportación propia.

### 6.2 Validez interna/externa/conclusión (líneas 782–819)  ·  MEDIO

> «Siguiendo la clasificación propuesta por Wohlin et al., las amenazas a
> la validez del presente estudio se agrupan en cuatro categorías.»

- **Causa.** La taxonomía cuatripartita (constructo, interna, externa,
  conclusión) es de uso estándar en ingeniería de software empírica. Si la
  cita está bien colocada el riesgo es bajo, pero las descripciones de
  cada categoría suelen heredarse casi literalmente del manual.
- **Sugerencia.** Inserta en cada párrafo **el riesgo concreto observado
  en este experimento** antes de la fórmula taxonómica. La cita basta
  para vincular con Wohlin.

---

## 7. Resultados y conclusiones — `memory/secciones/06_Resultados.tex`

Riesgo global **BAJO**. Todo el capítulo gira sobre los resultados
propios. No se identifican fragmentos vulnerables.

---

## 8. Anexos — `memory/secciones/07_Anexos.tex`

### 8.1 Glosario (líneas 12–83)  ·  ALTO

Entradas especialmente sensibles:

- **Alucinación.** *«Fenómeno por el cual un modelo de lenguaje genera
  información inexistente o no respaldada por las tripletas de entrada.»*
- **Benchmark.** *«Conjunto de datos y protocolo de evaluación
  estandarizado que permite entrenar, comparar y clasificar sistemas bajo
  condiciones homogéneas.»*
- **Embedding.** *«Representación vectorial de una palabra o un texto en
  un espacio continuo, utilizada por métricas semánticas como BERTScore.»*
- **DBpedia.** Misma reformulación que en §2.1.
- **Tripleta (RDF).** Misma reformulación que en §2.2.
- **Linked Open Data**, **Semantic parsing**, **Crowdsourcing**: idem.

- **Causa común.** Los glosarios son la primera zona en la que un detector
  de plagio encuentra coincidencias literales con Wikipedia o con
  manuales (Jurafsky & Martin, *Introduction to NLP* de Eisenstein, etc.).
  Adicionalmente, los detectores de IA suelen marcar las definiciones de
  glosario como output de LLM porque el estilo es invariante.
- **Sugerencia.** Personalizar cada definición acotándola al **uso que se
  hace del término en este TFM** (p. ej. *«Alucinación: en este trabajo,
  se considera alucinación toda mención por parte del LLM de una entidad
  ausente del \textit{tripleset}…»*). Si una definición no se diferencia
  del uso académico general, la opción más segura es eliminarla.

### 8.2 Anexo de \textit{system prompts} (líneas 547–600)  ·  BAJO

Los \textit{system prompts} son literalmente los que se ejecutan en
producción: la atribución es directa (el código del repositorio). No
constituyen plagio, aunque sí podrían marcarse como «texto generado por
IA», cosa esperable y declarada.

### 8.3 Sección RGPD (líneas 648–657)  ·  MEDIO

> «Esta política se ajusta al principio de minimización del Reglamento
> General de Protección de Datos…»

- **Causa.** Fórmula muy reconocible. No es plagio si se cita el RGPD,
  pero conviene parafrasear ligeramente.
- **Sugerencia.** Reescribir en clave operativa («se almacena X, no se
  almacena Y, por la razón Z»).

---

## 9. Estrategia recomendada de mitigación

1. **Antes de pasar Turnitin/Compilatio**: priorizar las entradas marcadas
   como `ALTO` (§2.1, §2.2, §2.3, §2.5, §2.6, §4.2, §4.3, §5.2, §8.1).
   Estas concentran la práctica totalidad del riesgo.
2. **Reescritura efectiva.** No basta con cambiar dos o tres palabras: hay
   que reestructurar la frase (voz, orden de cláusulas, granularidad). El
   patrón más seguro es **sustituir la definición enciclopédica por una
   afirmación operativa específica de este TFM**, acompañada de la cita.
3. **Detección de IA.** Pasar los párrafos sospechosos por al menos dos
   detectores distintos (Originality.ai + GPTZero) y descartar veredictos
   discordantes. No confiar en un único resultado, especialmente en
   secciones cortas (glosario).
4. **No tocar** los pasajes ya muy específicos del trabajo (capítulo de
   experimentación, capítulo de resultados, sección de modelo de datos):
   son la principal evidencia de aportación propia.

## 10. Estado de las entradas

Todas las entradas se inician en estado *abierto*. Conforme se reescriba un
fragmento y se compruebe con Turnitin/Compilatio + detector de IA, se
marca aquí como `RESUELTO` indicando la fecha y el resultado del
contraste.
