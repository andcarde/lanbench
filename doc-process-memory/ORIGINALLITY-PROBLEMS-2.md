# ORIGINALLITY-PROBLEMS-2

## Propósito

Inventario vivo de fragmentos de la memoria con riesgo elevado de ser marcados
por herramientas de detección de plagio (Turnitin, Compilatio, Copyleaks, etc.)
o por detectores de texto generado por LLM (Originality.ai, GPTZero,
Copyleaks AI Detector).

Esta versión se ha generado siguiendo la metodología de documentos vivos del
repositorio:

1. Primero se ha realizado una revisión independiente de la memoria actual,
   usando el mismo formato de `ORIGINALLITY-PROBLEMS-1.md`.
2. Después se ha evaluado `ORIGINALLITY-PROBLEMS-1.md`: los problemas ya
   solucionados se descatalogan y los no solucionados se incorporan aquí.
3. Una vez completada la reconciliación, `ORIGINALLITY-PROBLEMS-1.md` queda
   sustituido por este documento y debe eliminarse.

## Metadatos de revisión

- **Fecha:** 2026-06-25.
- **Repositorio:** rama `main`, commit base `baa9d2ed`.
- **Alcance auditado:**
  - `memory/secciones/00_Resumen.tex`
  - `memory/secciones/01_Introducción.tex`
  - `memory/secciones/02_Desarrollo.tex`
  - `memory/secciones/03_Herramientas.tex`
  - `memory/secciones/04_Aplicación.tex`
  - `memory/secciones/05_Experimento.tex`
  - `memory/secciones/06_Resultados.tex`
  - `memory/secciones/07_Anexos.tex`

## Convenciones de uso

- Este documento no afirma que exista copia literal; señala pasajes que conviene
  **reescribir defensivamente** antes de pasar la memoria por Turnitin,
  Compilatio o detectores de IA.
- Cada entrada indica fichero, rango aproximado de líneas, nivel de riesgo
  (`ALTO` / `MEDIO` / `BAJO`), causa y sugerencia.
- Se descataloga una entrada cuando el fragmento ha desaparecido, ha sido
  reescrito de forma sustancial o queda suficientemente anclado en material
  propio del TFM.

---

## 1. Resumen y Abstract — `memory/secciones/00_Resumen.tex`

### 1.1 Apertura sobre WebNLG (líneas 4-10 y 61-66)  ·  MEDIO

> «WebNLG es uno de los \textit{benchmarks} de referencia para la generación de
> lenguaje natural a partir de tripletas RDF de DBpedia...»

- **Causa.** Fórmula introductoria muy próxima a la redacción habitual de los
  artículos y páginas descriptivas de WebNLG: definición del benchmark,
  enumeración de ediciones e idiomas y cierre con la ausencia del español. El
  Abstract replica la misma estructura en inglés, por lo que un detector puede
  compararlo dos veces contra literatura WebNLG.
- **Sugerencia.** Abrir desde el problema propio del TFM: la construcción de una
  infraestructura reproducible para generar y revisar verbalizaciones españolas,
  dejando la ficha histórica de WebNLG para el capítulo introductorio.

---

## 2. Introducción — `memory/secciones/01_Introducción.tex`

### 2.1 Descripción inicial de WebNLG (líneas 8-33)  ·  MEDIO

- **Causa.** La definición de WebNLG y la lista 2017/2020/2023 siguen una
  estructura de ficha académica muy común en los papers del challenge. No es el
  bloque más peligroso porque hay citas, pero la prosa es poco propia.
- **Sugerencia.** Fusionar con la tabla de ediciones del capítulo 2 o reducirlo
  a una transición breve que explique por qué WebNLG es el corpus elegido.

### 2.2 Definición de DBpedia (líneas 37-52)  ·  ALTO

- **Causa.** Mantiene expresiones canónicas: extracción automática de Wikipedia,
  fichas de datos multilingües, tripletas RDF, SPARQL y nodo central de Linked
  Open Data. Es una formulación muy cercana a páginas de DBpedia, Wikipedia y
  Auer/Lehmann.
- **Sugerencia.** Reescribir desde su función en este TFM: fuente de URIs y
  relaciones usadas por WebNLG. La explicación enciclopédica puede quedar en una
  frase con cita.

### 2.3 Definición de RDF y tripletas (líneas 56-73)  ·  ALTO

- **Causa.** Descripción W3C estándar: modelo de representación, tripleta
  sujeto-predicado-objeto, hecho atómico y URI. Es uno de los patrones más
  repetidos en manuales y tutoriales.
- **Sugerencia.** Mantener solo la notación mínima y desplazar la explicación a
  una frase operativa: en `lanbench`, cada entrada se procesa como un conjunto de
  relaciones binarias DBpedia que debe verbalizarse sin omitir hechos.

### 2.4 Relaciones n-arias y ejemplo de Plutón (líneas 91-140)  ·  ALTO

- **Causa.** El bloque reproduce el esquema explicativo de la nota del W3C sobre
  relaciones n-arias. El ejemplo de Plutón es reconocible como ejemplo de escuela
  de web semántica y conserva un tono de tutorial.
- **Sugerencia.** Sustituir por un ejemplo procedente de una entrada real del
  corpus usado en el experimento o reducirlo a una nota aclaratoria, ya que las
  entradas de WebNLG se tratan como conjuntos planos de tripletas binarias.

### 2.5 Naturaleza de los lenguajes naturales (líneas 144-159)  ·  MEDIO

- **Causa.** La oposición entre lenguajes formales y naturales, forma y
  significado, contexto y conocimiento compartido es una formulación estándar en
  lingüística computacional y recuerda a Bender & Koller.
- **Sugerencia.** Conservar únicamente la consecuencia operativa: varias
  lexicalizaciones españolas pueden ser válidas para la misma entrada RDF.

### 2.6 Limitaciones de los LLMs (líneas 186-202)  ·  ALTO

- **Causa.** Lista de alucinaciones, errores semánticos, pérdida de información
  y errores de contexto. Aunque está citada, la taxonomía es una de las señales
  más típicas de texto generado por LLM.
- **Sugerencia.** Cambiar el catálogo abstracto por ejemplos observados en el
  experimento (`servir a`, cardinalidad de relaciones, cláusulas largas,
  gentilicios y cargos), conectando cada límite con evidencia propia.

### 2.7 Métricas automáticas (líneas 248-367)  ·  ALTO

- **Causa.** BLEU, METEOR, TER, BERTScore, COMET y chrF++ se describen con el
  estilo y los elementos habituales de los papers originales. BLEU y COMET son
  especialmente sensibles por la fórmula, el conteo recortado, la penalización
  por brevedad y la predicción de juicios humanos.
- **Sugerencia.** Convertir el bloque en una tabla más aplicada: qué mide cada
  métrica, qué pierde en WebNLG-español y por qué se prioriza la revisión humana
  en el experimento. Si se mantienen fórmulas, presentarlas explícitamente como
  material tomado del paper original.

### 2.8 Plataformas de evaluación GERBIL/BENG (líneas 361-367)  ·  MEDIO

- **Causa.** Mini-definición genérica de plataforma estandarizada y leaderboard
  reproducible, con léxico muy parecido a la documentación oficial.
- **Sugerencia.** Reducir a una mención funcional o mover a la tabla de ediciones.

---

## 3. WebNLG — `memory/secciones/02_Desarrollo.tex`

### 3.1 Ediciones del challenge (líneas 3-51)  ·  MEDIO

- **Causa.** El capítulo repite información ya introducida y sigue la secuencia
  esperable de las publicaciones oficiales: primera competición, edición
  bilingüe/bidireccional, lenguas con pocos recursos, métricas y repositorios.
- **Sugerencia.** Mantener la tabla como síntesis y eliminar parte de la prosa
  previa, o enfocar cada edición en la decisión que afecta al TFM.

### 3.2 Estructura del dataset (líneas 78-150)  ·  MEDIO

- **Causa.** La enumeración de `category`, `eid`, `size`, `shape`,
  `shape_type`, `originaltripleset`, `modifiedtripleset` y `lex` sigue de cerca
  la documentación oficial de WebNLG.
- **Sugerencia.** Presentarlo como especificación citada y añadir una capa propia:
  qué campos persiste `lanbench`, cuáles usa el experimento y cuáles se conservan
  solo por compatibilidad.

### 3.3 Ejemplo XML bilingüe y extensión al español (líneas 152-210)  ·  MEDIO

- **Causa.** El ejemplo de `Aarhus_Airport` procede del material WebNLG+ y el
  patrón de extensión con `<lex lang="es">` tiene forma de documentación técnica
  oficial.
- **Sugerencia.** Sustituir por una entrada del `experiment-dataset.xml` y mostrar
  el antes/después real producido por el flujo de `lanbench`.

---

## 4. Estado del arte — `memory/secciones/03_Herramientas.tex`

### 4.1 Ampliación multilingüe WebNLG+ 2020 (líneas 6-30)  ·  MEDIO

- **Causa.** Paráfrasis directa de Castro Ferreira et al. (2020): traducción
  neuronal, posedición humana en Yandex.Toloka, rondas de retroalimentación y
  entity pointers.
- **Sugerencia.** Reformular en términos de herencia metodológica: qué se adopta
  en `lanbench`, qué se cambia y qué no se reproduce.

### 4.2 Validación RDF (líneas 34-64)  ·  ALTO

- **Causa.** División sintáctica/estructural/semántica, listados de Jena/RDF4J,
  SHACL/ShEx y validación humana/LLM. Es una explicación de manual, con alta
  probabilidad de coincidencia parcial.
- **Sugerencia.** Reducir a tres frases operativas y evitar describir las
  herramientas; citarlas basta.

### 4.3 Definición de Human-in-the-Loop (líneas 87-116)  ·  ALTO

- **Causa.** Bloque definicional genérico con finalidad, ciclo de vida,
  mitigación de errores, mejora continua y Lean. Es muy reconocible como texto de
  divulgación o salida de LLM.
- **Sugerencia.** Abrir con el caso concreto: en `lanbench`, HITL significa que
  el modelo propone, el humano corrige/rechaza y el sistema conserva autoría,
  discrepancias y tiempos.

### 4.4 Toloka (líneas 132-166)  ·  MEDIO

- **Causa.** Mezcla información corporativa, métodos de calidad, benchmarks y
  precios con un tono cercano a páginas de producto. Los datos de sede/oficinas y
  comisiones son especialmente detectables.
- **Sugerencia.** Conservar solo lo necesario para comparar modelos de campaña:
  tipo de tarea, filtros de idioma, control de calidad y razón por la que se
  prefirió plataforma propia.

### 4.5 Plataformas alternativas de crowdsourcing (líneas 190-230)  ·  MEDIO

- **Causa.** La tabla Toloka/MTurk/Prolific/Appen y el párrafo posterior condensan
  descripciones corporativas y literatura de forma muy estándar.
- **Sugerencia.** Reescribir desde criterios de selección propios: cobertura de
  español, control sobre revisores, integración XML WebNLG, coste y trazabilidad.

### 4.6 LLM-as-a-judge (líneas 235-245)  ·  MEDIO

- **Causa.** Paráfrasis cercana de Zheng et al. (2023), incluyendo GPT-4, acuerdo
  superior al 80 %, MT-Bench y preferencias humanas.
- **Sugerencia.** Enfocar el párrafo en la decisión negativa del TFM: no se usa el
  LLM como juez final porque la autoridad se reserva al revisor humano.

### 4.7 Sesgos de LLM-as-a-judge y decisión de diseño (líneas 247-256)  ·  MEDIO

- **Causa.** Lista clásica de sesgos: preferencia por respuestas largas,
  sensibilidad al prompt e inconsistencia por orden. Aunque sirve al argumento,
  está formulada como resumen de survey.
- **Sugerencia.** Añadir una frase que conecte esos sesgos con un riesgo concreto
  del corpus WebNLG-español.

---

## 5. Aplicación — `memory/secciones/04_Aplicación.tex`

### 5.1 Historias de usuario, Cohn e INVEST (líneas 16-29)  ·  MEDIO

- **Causa.** Reproduce la plantilla canónica `como <rol>, quiero <capacidad>,
  para <beneficio>` y el desglose completo de INVEST, fórmulas presentes en
  Cohn y en multitud de blogs ágiles.
- **Sugerencia.** Citar a Cohn sin copiar la plantilla completa, o pasar
  directamente al catálogo propio de historias.

### 5.2 Roles funcionales (líneas 83-140)  ·  MEDIO

- **Causa.** Las definiciones de anotador, revisor y administrador son genéricas
  y podrían coincidir con documentación de sistemas de anotación.
- **Sugerencia.** Reescribir cada rol con operaciones concretas de `lanbench`
  (`Permit`, cola de revisión, credenciales por dataset, estadísticas).

### 5.3 Recomendación de modelos y OpenAI-compatible (líneas 152-179)  ·  MEDIO

- **Causa.** El bloque sobre Ollama, Groq, Google API, compatibilidad tipo OpenAI
  y umbral Llama 3 70B tiene forma de recomendación técnica genérica.
- **Sugerencia.** Anclarlo a evidencias del proyecto: pruebas preliminares
  realizadas, síntomas observados y decisión exacta tomada.

### 5.4 Taxonomía jerárquica de errores (líneas 181-199)  ·  MEDIO

- **Causa.** La lista ortográfico/gramatical/sintáctico/traducción/RDF/diversidad
  puede parecer un catálogo estándar de evaluación lingüística.
- **Sugerencia.** Enlazar cada categoría con los códigos reales de
  `constants/validation-codes.js` y con ejemplos del experimento.

### 5.5 Concurrencia por secciones (líneas 216-251)  ·  BAJO

- **Causa.** El contenido es propio de la aplicación, pero expresiones como
  bloqueo de grano fino, reserva temporal y escalabilidad operativa son
  boilerplate de ingeniería.
- **Sugerencia.** Mantener; riesgo bajo. Solo conviene reforzar referencias a
  `Section`, `SectionAssignment` y `ActiveSession`.

### 5.6 Catálogo de historias de usuario (líneas 303-538)  ·  MEDIO

- **Causa.** El formato repetitivo de historias de usuario puede ser marcado por
  detectores de IA por regularidad, aunque el contenido sea propio del proyecto.
- **Sugerencia.** No reescribir necesariamente. Si preocupa Turnitin/IA, explicar
  antes de la tabla que se trata de un artefacto de requisitos del repositorio y
  remitir a `documentation/USER-STORIES-2.md`.

### 5.7 Documentación del proyecto (líneas 567-604)  ·  MEDIO

- **Causa.** Descripción de documentos funcionales/técnicos/auditorías con tono
  de manual de proceso. Es propio del repo, pero la redacción es muy genérica.
- **Sugerencia.** Añadir referencias explícitas a nombres reales de ficheros y
  eliminar definiciones abstractas que no aporten.

### 5.8 Arquitectura por capas (líneas 608-648 y 722-725)  ·  MEDIO

- **Causa.** Rutas, middlewares, controladores, servicios, contratos,
  repositorios y entidades se describen con definiciones muy estándar.
- **Sugerencia.** Mantener la figura y sustituir parte de las definiciones por
  ejemplos de endpoints y módulos reales.

### 5.9 Modelo de datos (líneas 732-775)  ·  BAJO

- **Causa.** Es bastante específico de `lanbench`, pero conserva fórmulas típicas
  de ORM declarativo, cliente tipado e invariantes de dominio.
- **Sugerencia.** Riesgo bajo; no priorizar salvo que se busque minimizar el tono
  boilerplate.

### 5.10 Seguridad, OWASP y gestión de sesiones (líneas 780-833)  ·  MEDIO

- **Causa.** `express-session`, `HttpOnly`, `SameSite`, bcrypt, mínimo privilegio,
  Top 10 OWASP e inyección forman un bloque de seguridad muy reconocible.
- **Sugerencia.** Conservar los controles concretos, pero reducir las frases de
  manual y citar OWASP solo donde sea imprescindible.

### 5.11 Catálogo de tecnologías (líneas 948-1004)  ·  ALTO

- **Causa.** Viñetas de Express, express-session, Prisma, MariaDB, Docker, Multer,
  Bootstrap, jQuery, Mocha, Chai, testdouble, proxyquire y ESLint con one-liners
  cercanos a sus páginas oficiales.
- **Sugerencia.** Reescribir cada punto desde el uso concreto en `lanbench` y
  eliminar definiciones del tipo «marco web minimalista» o «ORM declarativo».

---

## 6. Experimentación — `memory/secciones/05_Experimento.tex`

### 6.1 Pregunta, variable binaria e hipótesis (líneas 19-53)  ·  BAJO

- **Causa.** El formato es académico y regular, pero la pregunta, las hipótesis y
  las cifras son propias.
- **Sugerencia.** No priorizar.

### 6.2 Muestreo estratificado e intervalo Wilson (líneas 84-141)  ·  MEDIO

- **Causa.** Explicación de muestreo sin reposición, estratos, asignación
  equitativa e intervalo Wilson. Son fórmulas estadísticas estándar con
  redacción de manual.
- **Sugerencia.** Mantener fórmulas con citas, pero introducir primero la decisión
  propia: por qué 99 entradas, por qué 33 por estrato y qué sesgo acepta el TFM.

### 6.3 Métrica principal y kappa de Cohen (líneas 197-210)  ·  MEDIO

- **Causa.** Definición de tasa de aceptación e intervalo de confianza es
  estándar. La justificación de no calcular kappa sí es propia.
- **Sugerencia.** Conservar la justificación y comprimir la definición.

### 6.4 Amenazas a la validez (líneas 324-349)  ·  BAJO

- **Causa.** Aunque el encabezado es canónico, las amenazas están conectadas con
  este experimento.
- **Sugerencia.** No priorizar. Corregir estilo y gramática si se revisa la
  memoria, pero no por originalidad.

---

## 7. Resultados y trabajo futuro — `memory/secciones/06_Resultados.tex`

### 7.1 Síntesis de aportaciones (líneas 11-52)  ·  BAJO

- **Causa.** Texto propio, apoyado en resultados y artefactos del repositorio.
- **Sugerencia.** No priorizar.

### 7.2 Propuesta de campaña con margen ±5 % (líneas 268-351)  ·  MEDIO

- **Causa.** El dimensionado con Wilson, peor caso `p=0,5`, corrección por
  población finita y asignación de Neyman es material estadístico estándar.
- **Sugerencia.** Mantener como propuesta aplicada, pero evitar tono de manual:
  explicitar qué decisión tomaría el proyecto y qué queda como cálculo auxiliar.

### 7.3 Plan de pruebas manuales con usuarios reales (líneas 385-508)  ·  MEDIO

- **Causa.** Protocolo de participantes, escenarios, think-aloud, SUS, Likert,
  métricas de tarea y criterios de aceptación. Es un patrón muy usado en estudios
  de usabilidad.
- **Sugerencia.** Acortarlo o moverlo a anexo/protocolo. En el cuerpo, resumir el
  plan y destacar qué escenarios son específicos de `lanbench`.

### 7.4 Escala SUS y Bangor et al. (líneas 462-496)  ·  MEDIO

- **Causa.** La definición de SUS y el umbral 70/Good son frases habituales en
  trabajos de usabilidad.
- **Sugerencia.** Citar sin desarrollar tanto la escala; basta con indicar el
  instrumento y el criterio.

### 7.5 Evaluación social en bucle (líneas 524-665)  ·  ALTO

- **Causa.** Bloque largo que resume sabiduría de las multitudes, Elo,
  Bradley-Terry, TrueSkill, Community Notes, MACE, descriptivismo lingüístico y
  Chatbot Arena. Aunque es una propuesta interesante, combina muchas
  definiciones de literatura con un tono ensayístico muy detectable por
  Turnitin y detectores de IA.
- **Sugerencia.** Dividirlo en dos partes: una motivación breve en el capítulo y
  un anexo de diseño futuro. Reescribir desde `lanbench`: qué tablas cambiarían,
  qué pantalla cambiaría y qué métrica se computaría.

---

## 8. Anexos — `memory/secciones/07_Anexos.tex`

### 8.1 Glosario (líneas 12-77)  ·  ALTO

- **Causa.** Entradas como alucinación, benchmark, crowdsourcing, DBpedia,
  embedding, Linked Open Data, semantic parsing y tripleta RDF son definiciones
  de manual. Los glosarios suelen producir muchas coincidencias parciales con
  Wikipedia, documentación técnica y manuales de PLN.
- **Sugerencia.** Personalizar cada término al uso en este TFM. Si una definición
  no aporta nada frente al uso general, eliminarla.

### 8.2 Acrónimos y abreviaturas (líneas 81-131)  ·  MEDIO

- **Causa.** Expansiones de siglas como BLEU, COMET, RDF, SPARQL, SHACL, TER,
  URI, XML o SUS son necesariamente canónicas.
- **Sugerencia.** Riesgo aceptable si se mantiene como tabla de consulta. Evitar
  definiciones largas en la segunda columna.

### 8.3 Esquema entidad-relación y entidades (líneas 133-365)  ·  BAJO

- **Causa.** El contenido es propio del esquema Prisma de `lanbench`.
- **Sugerencia.** No priorizar.

### 8.4 Manual de usuario (líneas 367-574)  ·  BAJO

- **Causa.** Describe pantallas y flujos propios. El tono procedimental puede
  parecer generado, pero no debería activar plagio significativo.
- **Sugerencia.** No priorizar.

### 8.5 Catálogo de códigos de validación (líneas 576-614)  ·  BAJO

- **Causa.** Reproduce un catálogo declarado en código propio. Puede parecer
  tabla genérica de errores, pero la atribución al repositorio es clara.
- **Sugerencia.** Mantener.

### 8.6 System prompt de generación (líneas 616-648)  ·  BAJO

- **Causa.** Es texto de prompt usado en producción/experimento. Puede marcarse
  como texto de IA, pero su inclusión está justificada por reproducibilidad.
- **Sugerencia.** Mantener y dejar claro que es una instrucción ejecutada por el
  sistema, no prosa académica.

### 8.7 Licencias CC BY-NC-SA y EUPL (líneas 674-741)  ·  ALTO

- **Causa.** La explicación de CC BY-NC-SA y EUPL reproduce conceptos y
  formulaciones de textos oficiales de licencia: reproducción, distribución,
  obras derivadas, NonCommercial, ShareAlike, copyleft, compatibilidad y SaaS
  loophole.
- **Sugerencia.** Citar las licencias y reducir la explicación jurídica. Mantener
  solo la decisión propia: por qué esas licencias se ajustan a memoria, software
  y corpus.

### 8.8 Datos personales y RGPD (líneas 743-752)  ·  MEDIO

- **Causa.** Principio de minimización y lista de datos personales son fórmulas
  reconocibles de documentación RGPD.
- **Sugerencia.** Reescribir en clave operativa: qué datos concretos guarda
  `lanbench`, dónde se usan y qué no se almacena.

---

## 9. Reconciliación con ORIGINALLITY-PROBLEMS-1

### 9.1 Entradas no solucionadas y trasladadas

- **1.1 Apertura WebNLG** → trasladada como 1.1.
- **2.1 DBpedia** → trasladada como 2.2.
- **2.2 RDF y tripletas** → trasladada como 2.3.
- **2.3 Relaciones n-arias / Plutón** → trasladada como 2.4.
- **2.4 Lenguajes naturales** → trasladada como 2.5.
- **2.5 Limitaciones de LLMs** → trasladada como 2.6.
- **2.6 Métricas** → trasladada como 2.7.
- **3.1 Ediciones WebNLG** → trasladada como 3.1.
- **3.2 Estructura del dataset** → trasladada como 3.2.
- **4.1 Ampliación multilingüe** → trasladada como 4.1.
- **4.2 Validación RDF** → trasladada como 4.2.
- **4.3 HITL** → trasladada como 4.3.
- **4.4 Toloka** → trasladada como 4.4.
- **4.5 LLM-as-judge** → trasladada como 4.6.
- **5.1 Historias de usuario / INVEST** → trasladada como 5.1.
- **5.2 Catálogo de tecnologías** → trasladada como 5.11.
- **8.1 Glosario** → trasladada como 8.1.
- **8.3 RGPD** → trasladada como 8.8.

### 9.2 Entradas descatalogadas

- **4.6 Consideraciones éticas.** El bloque antiguo sobre Fair Work,
  Turkopticon y salario mínimo ya no aparece con esa formulación. La sección
  actual de ética queda reducida a remuneración, consentimiento y RGPD, con
  riesgo menor y cubierta indirectamente por 4.5/8.8.
- **6.1 Marco MQM.** El pasaje explicativo anterior ha desaparecido del capítulo
  experimental; MQM solo se menciona como línea futura.
- **6.2 Validez interna/externa/conclusión.** La clasificación tipo Wohlin ya no
  se presenta con la estructura anterior. Las amenazas actuales son más
  específicas del experimento y quedan en riesgo bajo.
- **8.2 System prompts.** Se mantiene descatalogado como problema: su inclusión
  está justificada por reproducibilidad, aunque pueda ser detectado como texto de
  prompt.
- **7. Resultados y conclusiones sin fragmentos vulnerables.** Se conserva la
  lectura general de riesgo bajo para los resultados propios, salvo los nuevos
  bloques de trabajo futuro incorporados en 7.2-7.5.

### 9.3 Entradas nuevas incorporadas

- **2.1 Descripción inicial de WebNLG.**
- **2.8 GERBIL/BENG.**
- **3.3 Ejemplo XML y extensión al español.**
- **4.5 Plataformas alternativas de crowdsourcing.**
- **4.7 Sesgos de LLM-as-a-judge.**
- **5.2 Roles funcionales.**
- **5.3 Recomendación de modelos y OpenAI-compatible.**
- **5.4 Taxonomía de errores.**
- **5.6 Catálogo de historias de usuario.**
- **5.7 Documentación del proyecto.**
- **5.8 Arquitectura por capas.**
- **5.10 Seguridad y OWASP.**
- **6.2 Muestreo estratificado e intervalo Wilson.**
- **6.3 Métrica principal y kappa.**
- **7.2 Campaña con margen ±5 %.**
- **7.3 Plan de pruebas manuales.**
- **7.4 SUS/Bangor.**
- **7.5 Evaluación social en bucle.**
- **8.2 Acrónimos.**
- **8.7 Licencias.**

---

## 10. Prioridad de mitigación

### Prioridad alta

1. Definiciones canónicas: DBpedia, RDF, relaciones n-arias, HITL, métricas y
   glosario.
2. Catálogo de tecnologías y licencias.
3. Evaluación social en bucle, por acumulación de resúmenes de literatura.

### Prioridad media

1. Ediciones y estructura WebNLG.
2. Toloka, plataformas de crowdsourcing y LLM-as-judge.
3. Seguridad/OWASP, pruebas de usuario y bloques estadísticos.

### Prioridad baja

1. Experimento, resultados propios, artefactos reproducibles y manual de usuario.
2. Catálogo de validación y prompts, siempre que se mantenga la atribución como
   artefactos ejecutados por el sistema.

## 11. Estrategia recomendada de reescritura

1. Sustituir definiciones enciclopédicas por formulaciones operativas propias de
   `lanbench`.
2. Donde se conserve una definición canónica, citar explícitamente la fuente y
   reducir la paráfrasis.
3. Priorizar ejemplos reales del experimento frente a ejemplos genéricos de
   tutorial.
4. Convertir catálogos de herramientas en decisiones de diseño: qué se usó, para
   qué módulo, y qué alternativa se descartó.
5. No tocar de entrada los resultados propios: son la zona con mayor huella de
   aportación original.
