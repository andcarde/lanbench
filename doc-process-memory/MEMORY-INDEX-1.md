Reestructura propuesta
Estructura canónica de TFM (UPM/ETSIINF) aplicada a tu contenido. 7 capítulos + anexos + bibliografía. Entre paréntesis indico de dónde viene el material actual.

Front matter
Resumen / Abstract — 00_Resumen.tex
Cap. 1 — Introducción (≈ 4-6 pp)
1.1. Contexto y motivación (de 01 §Propósito + WebNLG)
1.2. Planteamiento del problema (de 01 §Propósito: combinatoria del español)
1.3. Objetivos
1.3.1. Objetivo general
1.3.2. Objetivos específicos (OE1, OE2, OE3) (de 01 §Propósito y objetivos)
1.4. Alcance y limitaciones
1.5. Estructura de la memoria

Cap. 2 — Marco teórico (≈ 10-14 pp)
2.1. Web semántica y linked data
2.1.1. RDF y tripletas (de 01 §Tripletas RDF + ejemplos)
2.1.2. Eventos n-arios (de 01 §Ejemplo complejo)
2.1.3. DBpedia (de 01 §DBpedia)
2.2. Generación de lenguaje natural a partir de RDF
2.2.1. Lenguajes naturales y su complejidad (de 01 §Lenguajes naturales)
2.2.2. Tarea data-to-text y text-to-data
2.3. Métricas de evaluación (unificar de 01 §Evaluación)
2.3.1. Métricas léxicas: BLEU, METEOR, TER
2.3.2. Métricas basadas en caracteres: chrF++ (una sola vez)
2.3.3. Métricas semánticas: BERTScore, COMET
2.3.4. Plataformas de evaluación (GERBIL/BENG)
2.4. Modelos de lenguaje de gran escala (LLMs)
2.4.1. Capacidades en NLG
2.4.2. Limitaciones: alucinaciones, errores semánticos (de 01 §Limitaciones)
2.5. Human-in-the-Loop (de 03 §HITL + §HITL en WebNLG)
2.6. Crowdsourcing para anotación lingüística
2.6.1. Toloka (de 03 §Toloka)
2.6.2. Amazon Mechanical Turk
2.7. Validación de datos RDF (de 03 §Validación de RDF)
2.7.1. Sintáctica (Jena, RDF4J)
2.7.2. Estructural (SHACL, ShEx)
2.7.3. Semántica

Cap. 3 — El corpus WebNLG (≈ 6-8 pp)
3.1. Historia y ediciones del challenge (unificar 01 §WebNLG + 02 §WebNLG Challenge 2017/2020/2023)
3.1.1. WebNLG 2017
3.1.2. WebNLG+ 2020 (bilingüe y bidireccional)
3.1.3. WebNLG 2023 (lenguas con pocos recursos)
3.2. Estructura del dataset (de 02 §Estructura)
3.2.1. La entry como unidad básica (de 02)
3.2.2. shape y shape_type (de 02)
3.2.3. originaltripleset vs. modifiedtripleset (de 02 §Diferenciación)
3.2.4. Lexicalizaciones
3.3. Ejemplo ilustrativo (de 02)
3.4. Estandarización: GEM y data cards (de 03 §Estandarización)

Cap. 4 — Metodología de ampliación al español (≈ 6-8 pp)
4.1. Antecedente: ampliación al ruso en WebNLG+ 2020 (de 03 §Ampliación multilingüe)
4.2. Pipeline propuesto para el español
4.2.1. Traducción automática inicial
4.2.2. Posedición humana
4.2.3. Validación experta
4.3. Formato de extensión: <lex lang="es"> y <link> (de 02 §Extensión al español)
4.4. Taxonomía de errores (de 02 §Integración LLMs: ortográfico, gramatical, sintáctico, traducción, RDF, diversidad)
4.5. Selección de modelos LLM (de 02: Ollama vs Groq, umbral Llama-3-70B)

Cap. 5 — Análisis y diseño de la aplicación (≈ 8-10 pp)
5.1. Metodología de captura de requisitos (de 04 §Metodología)
5.2. Roles del sistema (consolidar de 02 §Roles generales + 04 §Roles — una sola vez)
5.2.1. Investigador y asociado (roles globales)
5.2.2. Anotador, revisor, administrador (roles por dataset)
5.2.3. Agente IA: modos none, correction, generation (de 02)
5.3. Historias de usuario (de 04 §Historias)
5.3.1. Anotador (US-01 a US-12)
5.3.2. Revisor (US-13, US-14)
5.3.3. Agente IA (US-15 a US-18)
5.3.4. Administrador (US-19 a US-24)
5.4. Decisiones de diseño
5.4.1. Concurrencia por secciones (de 02 §Concurrencia)
5.4.2. Permisos y gobernanza del dataset (de 02 §Permisos)
5.4.3. Trazabilidad y estadísticas (de 02 §Estadísticas)

Cap. 6 — Implementación (nuevo — ≈ 8-10 pp)
6.1. Arquitectura (Node/Express, MariaDB, Prisma, Docker)
6.2. Modelo de datos (esquema Prisma)
6.3. Integración con Groq y compatibilidad con Ollama
6.4. Flujo de anotación
6.5. Flujo de revisión
6.6. Panel de administración

Cap. 7 — Resultados y conclusiones (de 06)
7.1. Resultados de la ampliación (volumen, cobertura por shape, por categoría)
7.2. Calidad del dataset (métricas automáticas + revisión humana)
7.3. Evaluación de la aplicación
7.4. Conclusiones
7.5. Trabajo futuro (ownership formal, URLs de invitación, parametrización de secciones)

Bibliografía
Anexos (de 05)
A. Glosario
B. Esquema Prisma completo
C. Manual de usuario
