# Plan de pruebas de sistema con usuarios reales

> **Documento de planificación experimental.** Define el protocolo para
> validar empíricamente la plataforma **Lanbench** con participantes humanos.
> Complementa la batería de pruebas automatizadas inventariada en
> [`TESTS.md`](TESTS.md) y se apoya en el catálogo de historias de usuario
> consolidado en [`USER-STORIES.md`](USER-STORIES.md). Es la versión
> ejecutable del esbozo académico que figura en
> `memory/secciones/06_Resultados.tex`, §«Plan de pruebas manuales de sistema
> con usuarios reales».

---

## 1. Propósito y posicionamiento del documento

La validación de un sistema informático no se agota en la verificación de su
corrección funcional. Las pruebas unitarias y de integración descritas en
[`TESTS.md`](TESTS.md) demuestran que cada flujo, examinado de forma aislada,
se comporta conforme al contrato. Sin embargo, no responden a tres preguntas
ineludibles en un trabajo orientado a usuarios finales:

1. ¿Pueden los tres roles operativos del sistema —administrador, anotador y
   revisor— completar sus tareas críticas **sin intervención externa**?
2. ¿Cuál es el **coste cognitivo y temporal** real de cada flujo, y cómo
   evoluciona con el uso repetido?
3. ¿Qué **fricciones percibidas** existen en la interfaz, y qué propuestas
   formula el usuario para resolverlas?

Este documento articula un protocolo experimental orientado a contestar esas
tres preguntas con instrumentos estandarizados, datos cuantitativos y
testimonio cualitativo. Se alinea con la clasificación clásica de validación
empírica de sistemas software propuesta por Wohlin et al.
[\cite{Wohlin2012}], y con las guías contemporáneas de evaluación de
usabilidad de la **ISO 9241-11** [\cite{ISO9241_11_2018}] y la **ISO/IEC
25022** [\cite{ISOIEC25022_2016}].

---

## 2. Objetivos del estudio

El estudio persigue cuatro objetivos jerárquicos. Cada uno se asocia a un
conjunto de métricas concretas detalladas en §7.

| Cód. | Objetivo                                                                                                                                                                                                              |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| O1   | **Cobertura funcional efectiva.** Verificar que cada historia de usuario incluida en el alcance del estudio (cf. §5) es ejecutable por un usuario no entrenado siguiendo únicamente la interfaz.                       |
| O2   | **Eficiencia temporal.** Cuantificar el tiempo medio por tarea, su varianza intersujeto e intrasujeto, y caracterizar la **curva de aprendizaje** del usuario.                                                         |
| O3   | **Detección de incidencias.** Catalogar defectos funcionales, fallos de robustez y comportamientos sorprendentes que las pruebas automatizadas no han revelado.                                                        |
| O4   | **Recogida de \emph{feedback} subjetivo.** Inventariar disconformidades con la interfaz gráfica y recoger propuestas de mejora priorizables, junto con una medida estandarizada de usabilidad percibida (SUS, UEQ-S).  |

Los objetivos O1 y O3 son de naturaleza **confirmatoria** —prueban hipótesis
formuladas a priori sobre la corrección del sistema—; O2 y O4 son
**exploratorios** —generan conocimiento sobre la experiencia de uso que
retroalimentará iteraciones posteriores—.

---

## 3. Marco metodológico

El diseño combina tres tradiciones bien establecidas en ingeniería del
software empírica:

- **\emph{Usability testing} de laboratorio**, en la línea de Nielsen
  [\cite{Nielsen1994_UsabilityEngineering}] y Rubin & Chisnell
  [\cite{RubinChisnell2008_HandbookUsability}], con cinco a ocho
  participantes por rol como umbral pragmático para detectar la mayoría de
  problemas de usabilidad significativos, conforme al modelo matemático de
  detección de defectos de Nielsen & Landauer
  [\cite{NielsenLandauer1993}].
- **Estudios longitudinales de aprendizaje** mediante \emph{within-subjects
  design} de tres sesiones, que permiten ajustar la curva de aprendizaje a
  un modelo de potencia $T_n = T_1 \cdot n^{-b}$ (ley empírica de la
  práctica formalizada por Newell & Rosenbloom
  [\cite{NewellRosenbloom1981_PowerLaw}]), donde $T_n$ es el tiempo de la
  $n$-ésima ejecución y $b$ el coeficiente de aprendizaje.
- **Recogida cualitativa estructurada** mediante protocolo \emph{think-aloud}
  concurrente, fundamentado en la teoría del análisis de protocolos verbales
  de Ericsson & Simon [\cite{EricssonSimon1993_ProtocolAnalysis}] y
  matizado por las recomendaciones prácticas de Boren & Ramey
  [\cite{BorenRamey2000_ThinkAloud}], complementado por entrevista
  semiestructurada post-sesión.

La triangulación de datos cuantitativos (tiempo, errores, incidencias),
escalas estandarizadas (SUS [\cite{Brooke1996_SUS}], UEQ-S
[\cite{Schrepp2017_UEQS}]) y testimonio cualitativo proporciona la
robustez metodológica exigible a un trabajo académico de máster
[\cite{SauroLewis2016_QuantifyingUX}], sin demandar el tamaño muestral
característico de un estudio inferencial.

---

## 4. Participantes

### 4.1 Tamaño y composición de la muestra

Se reclutarán **nueve participantes**, distribuidos en tres cohortes
correspondientes a los roles del sistema:

| Cohorte           | Tamaño | Perfil requerido                                                                              |
|-------------------|:------:|------------------------------------------------------------------------------------------------|
| C-ADMIN           |   2    | Experiencia previa en gestión de campañas de anotación, traducción o crowdsourcing.            |
| C-ANOTADOR        |   4    | Hispanohablante nativo. Sin requisito previo de experiencia en anotación lingüística.          |
| C-REVISOR         |   3    | Hispanohablante con criterio lingüístico explícito (filólogo, traductor, lingüista, docente).  |

El tamaño es coherente con el umbral pragmático de **5 ± 2 participantes por
perfil** identificado por Nielsen & Landauer como punto de retornos
decrecientes en la detección de defectos de usabilidad
[\cite{NielsenLandauer1993,Nielsen1994_UsabilityEngineering}], y
suficiente para ajustar curvas de aprendizaje por sujeto (cf. §7.2).

### 4.2 Diversidad dialectal

La selección procurará incorporar al menos dos variantes dialectales del
español (peninsular, rioplatense, mexicana o caribeña), con el fin de
recoger sensibilidades léxicas y morfológicas distintas frente a las
verbalizaciones generadas por el LLM.

### 4.3 Ética y tratamiento de datos

La participación se regulará mediante **consentimiento informado por
escrito**, con cláusula explícita sobre grabación de audio y de pantalla. Se
remunerará conforme a los criterios de remuneración justa documentados en
el capítulo de ética del TFM
[\cite{Whiting2019_FairWork,Shmueli2021_BeyondFairPay}]. El tratamiento de
datos personales se ajustará al **RGPD** [\cite{GDPR2016}]: las grabaciones
se anonimizarán antes del análisis y los datos brutos se destruirán tras la
defensa del trabajo.

---

## 5. Cobertura: del catálogo de historias de usuario a las tareas

Las pruebas no se diseñan «a partir de la GUI», sino **derivadas del
catálogo de historias de usuario** consolidado en
[`USER-STORIES.md`](USER-STORIES.md). Esta trazabilidad permite afirmar que
una historia ha sido **validada empíricamente** y no únicamente
implementada.

La Tabla 1 enumera los escenarios de prueba, cada uno asociado a una o más
historias y a un rol responsable. Los escenarios marcados como **críticos
(*)** son los que cubren caminos imprescindibles del producto: su fallo en
las pruebas equivale a un defecto bloqueante.

### Tabla 1. Mapeo de escenarios a historias de usuario

| ID    | Rol           | Escenario                                                                                          | Historias cubiertas       |
|-------|---------------|----------------------------------------------------------------------------------------------------|---------------------------|
| S1\*  | Administrador | Crear un *dataset* importando un XML WebNLG, asignar nombre y descripción                          | US-19, US-32, US-34       |
| S2    | Administrador | Configurar las credenciales de IA del *dataset* y seleccionar el modelo a usar                     | US-31, US-35              |
| S3    | Administrador | Asignar roles de anotador y revisor a otros usuarios sobre el *dataset*                            | US-22                     |
| S4    | Administrador | Generar y verificar la URL de invitación pública (registro de moderador, cuando aplique)           | US-27, US-28              |
| S5    | Administrador | Consultar estadísticas globales y de actividad del *dataset*                                       | US-21, US-23              |
| S6    | Administrador | Descargar el XML original y, tras completar, el XML extendido con anotaciones                      | US-29, US-30              |
| S7\*  | Anotador      | Aceptar invitación, reservar una sección y completar diez verbalizaciones                          | US-01, US-04, US-05       |
| S8    | Anotador      | Editar una verbalización sugerida por el LLM, resolviendo las alertas semánticas                   | US-06, US-07, US-08, US-10|
| S9    | Anotador      | Solicitar generación automática por IA y aceptar/rechazar las propuestas                           | US-15, US-33              |
| S10   | Anotador      | Reanudar trabajo tras desconexión y consultar el *feedback* dejado por un revisor                  | US-12, US-14              |
| S11\* | Revisor       | Revisar diez verbalizaciones, asignar veredicto y dejar comentarios estructurados                  | US-12, US-13              |
| S12   | Revisor       | Identificar una falsa aceptación preparada por el experimentador (LLM defectuoso) y reclasificarla | US-17                     |
| S13   | Revisor       | Consultar estadísticas personales de revisión                                                      | US-14                     |
| S14\* | Multi-rol     | Recorrido completo: alta de *dataset*, anotación, revisión y exportación final del XML extendido   | (recorrido transversal)   |

Cada escenario es ejecutable de forma autónoma sobre una instancia limpia
desplegada con `docker compose up` y poblada con el *seed* documentado en
[`TESTS.md`](TESTS.md), §«Run commands». Los escenarios marcados con
asterisco **(S1, S7, S11, S14)** son **críticos** y participarán en las
sesiones repetidas necesarias para la estimación de la curva de aprendizaje
(cf. §7.2).

---

## 6. Diseño experimental

### 6.1 Estructura general

El estudio se articula como un **diseño longitudinal de tres sesiones por
participante**, separadas entre cinco y diez días naturales. La cadencia
balancea dos restricciones opuestas: tiempo suficiente para que se atenúe
el aprendizaje inmediato sin que se produzca olvido relevante, y agenda
viable para completar el estudio en un plazo de cinco semanas.

| Sesión | Duración   | Foco principal                                                                          |
|--------|------------|------------------------------------------------------------------------------------------|
| T1     | 75 min     | Toma de contacto. Ejecución completa de los escenarios del rol con \emph{think-aloud}. |
| T2     | 45 min     | Repetición de los escenarios **críticos** del rol. Detección de incidencias residuales. |
| T3     | 45 min     | Tercera repetición de los escenarios críticos. Entrevista semiestructurada extendida.   |

Las sesiones T1 incluyen todos los escenarios del rol y permiten cubrir la
totalidad del catálogo de historias de usuario. Las sesiones T2 y T3
repiten únicamente los escenarios marcados con asterisco en la Tabla 1, que
son los únicos viables para una estimación longitudinal robusta.

### 6.2 Independencia entre sesiones

Para evitar contaminación entre sesiones, en cada repetición de un
escenario crítico se utilizará una **réplica del entorno** con datos
distintos (otros *triplesets*, otro nombre de *dataset*, otra invitación)
pero topología y complejidad equivalentes. Las réplicas se preparan
previamente y se rotulan T1·S7·a, T2·S7·b, T3·S7·c, etc., para garantizar
que la curva de aprendizaje refleje **habilidad con la herramienta** y no
familiaridad con un contenido específico.

### 6.3 Asignación de escenarios

| Rol           | T1 (todos)                            | T2 / T3 (críticos)        |
|---------------|---------------------------------------|---------------------------|
| Administrador | S1, S2, S3, S4, S5, S6                | S1, S14                   |
| Anotador      | S7, S8, S9, S10                       | S7                        |
| Revisor       | S11, S12, S13                         | S11                       |

El escenario multi-rol **S14** se ejecutará una sola vez por participante
de C-ADMIN en T2, dado que su duración impide repetirlo en T3 sin exceder
el presupuesto de tiempo.

---

## 7. Métricas e instrumentos

### 7.1 Métricas cuantitativas por escenario

Para cada par (participante, ejecución) se registran:

- **Tasa de éxito** ($\in \{0, 1\}$): el participante completa el escenario
  sin asistencia del experimentador.
- **Tiempo en tarea** ($t$, en segundos): desde la lectura del enunciado
  hasta el cumplimiento del estado objetivo.
- **Número de errores del usuario** ($e$): acciones que requieren
  *undo*, retroceso o reinicio del flujo.
- **Número de solicitudes de ayuda** ($a$): intervenciones explícitas al
  experimentador.
- **Número de incidencias detectadas** ($i$): defectos del sistema
  observados, según taxonomía de §8.

### 7.2 Curva de aprendizaje

Para cada escenario crítico (S1, S7, S11, S14) y cada participante, se
ajusta un modelo de potencia a los tiempos $(t_1, t_2, t_3)$ medidos en las
sesiones T1, T2 y T3:

$$ t_n = t_1 \cdot n^{-b} $$

con $b \in [0, 1]$ el **coeficiente de aprendizaje individual**, conforme
a la ley de la práctica de Newell & Rosenbloom
[\cite{NewellRosenbloom1981_PowerLaw}]. Valores típicos en aplicaciones de
productividad oscilan entre $0{,}15$ y $0{,}40$.

A nivel agregado se reportan:

- $\bar b$ medio por cohorte (anotador, revisor, administrador) con
  intervalo de confianza al 95 %.
- **Ratio de mejora** $r = t_3 / t_1$, que indica cuánta proporción del
  tiempo inicial sobrevive tras dos repeticiones. Un $r \leq 0{,}60$ se
  considerará indicador de **aprendizaje saludable**.
- **Tiempo asintótico estimado** $t_\infty$, extrapolado del modelo, como
  referencia para futuros estudios de productividad.

Conceptualmente, la curva de aprendizaje responde a la afirmación recogida
en el enunciado del estudio: *cuanto más usa la herramienta un usuario,
menos tarda en ejecutar cada tarea*. El presente protocolo la
**cuantifica** y la convierte en evidencia empírica.

### 7.3 Métricas subjetivas

- **System Usability Scale (SUS)** [\cite{Brooke1996_SUS}]: se administra
  al final de T1 y al final de T3. La interpretación de los valores
  obtenidos sigue la escala adjetival de Bangor, Kortum & Miller
  [\cite{Bangor2009_SUS}] y la revisión consolidada de Lewis
  [\cite{Lewis2018_SUSReview}]. La comparación T3 − T1 mide el
  desplazamiento de la usabilidad percibida con el dominio de la
  herramienta.
- **User Experience Questionnaire Short (UEQ-S)**
  [\cite{Schrepp2017_UEQS}]: se administra al final de T1. Mide
  pragmatismo y hedonía con ocho ítems Likert.
- **NASA-TLX simplificado (RTLX)** [\cite{HartStaveland1988_NASATLX}]: se
  administra tras cada sesión, por rol. Permite caracterizar el coste
  cognitivo de cada flujo.
- **Net Promoter Score (NPS) interno** [\cite{Reichheld2003_NPS}]: una
  pregunta única al cierre de T3. Sin valor inferencial, pero útil como
  indicador agregado.

### 7.4 Métricas cualitativas

- **Transcripción \emph{think-aloud}.** Las verbalizaciones de T1 se
  transcriben y se codifican \emph{a posteriori} en categorías de
  fricción (descubribilidad, terminología, *feedback* del sistema,
  concordancia con el modelo mental, etc.), siguiendo el procedimiento de
  análisis de protocolos verbales descrito por Ericsson & Simon
  [\cite{EricssonSimon1993_ProtocolAnalysis}] y las recomendaciones
  prácticas de Boren & Ramey [\cite{BorenRamey2000_ThinkAloud}].
- **Entrevista semiestructurada (T3).** Diez preguntas abiertas que
  exploran (i) la mayor dificultad encontrada, (ii) la mayor sorpresa
  positiva, (iii) tres propuestas concretas de mejora de la interfaz, (iv)
  comparación con herramientas equivalentes que el participante haya
  utilizado antes.

---

## 8. Recogida de incidencias

Cada incidencia se documenta en una ficha estandarizada con los campos
siguientes:

| Campo            | Descripción                                                                       |
|------------------|------------------------------------------------------------------------------------|
| `id`             | Identificador secuencial (`INC-001`, `INC-002`, …).                                |
| `participante`   | Código anónimo del participante.                                                   |
| `sesion`         | `T1`, `T2` o `T3`.                                                                 |
| `escenario`      | ID de escenario afectado (S1, S7, …).                                              |
| `paso`           | Paso concreto del escenario en el que se observó la anomalía.                      |
| `descripcion`    | Descripción objetiva de los síntomas observados.                                   |
| `clasificacion`  | Una de: `defecto-funcional`, `defecto-usabilidad`, `defecto-cosmético`, `confuso`. |
| `severidad`      | `crítica`, `alta`, `media`, `baja`, según rúbrica de la Tabla 2.                   |
| `reproducible`   | `sí` / `no` / `intermitente`.                                                      |
| `evidencia`      | Ruta del fragmento de grabación o captura asociada.                                |
| `historia`       | Historia de usuario afectada, cuando proceda.                                      |

### Tabla 2. Rúbrica de severidad

| Severidad  | Definición operativa                                                                                  |
|------------|--------------------------------------------------------------------------------------------------------|
| Crítica    | Impide completar el escenario. Pérdida de datos. Falla de seguridad o de control de acceso.            |
| Alta       | El escenario se completa solo con ayuda. Compromete la confianza del usuario en los veredictos del LLM. |
| Media      | El escenario se completa, pero el flujo exige reintentos previsibles o desvíos no documentados.        |
| Baja       | Defecto cosmético, errata, contraste insuficiente, copia inconsistente. No bloquea el flujo.            |

Las incidencias críticas se notifican al equipo de desarrollo en el plazo
de 24 horas; el resto, en el informe consolidado al cierre de la campaña.

---

## 9. Recogida de \emph{feedback} y propuestas de mejora

La obtención de propuestas de mejora se separa deliberadamente del flujo de
incidencias. Una incidencia describe lo que **el sistema hace mal**; una
propuesta describe lo que **el usuario querría que hiciese**. Ambas
categorías son valiosas pero su tratamiento es distinto.

### 9.1 Canales de recogida

- **\emph{Think-aloud} concurrente.** Las verbalizaciones espontáneas
  durante la ejecución capturan fricciones que el participante no llegaría
  a articular a posteriori.
- **Diario de campo del experimentador.** Cuaderno paralelo donde se
  registran observaciones del propio experimentador (gestos, vacilaciones,
  micro-expresiones de frustración), sin interferir con el participante.
- **Entrevista semiestructurada de T3.** Espacio formal para que el
  participante formule propuestas con la perspectiva del uso repetido.
- **Formulario libre asíncrono.** Un enlace al cierre de T3 permite añadir
  comentarios adicionales durante las 72 horas siguientes a la sesión.

### 9.2 Codificación de propuestas

Cada propuesta se codifica en una taxonomía de cuatro dimensiones:

| Dimensión        | Valores posibles                                                                     |
|------------------|--------------------------------------------------------------------------------------|
| `ambito`         | `gui`, `flujo`, `terminologia`, `comportamiento-llm`, `documentacion`.               |
| `componente`     | Página o módulo afectado (anotación, revisión, administración de *dataset*, …).      |
| `tipo`           | `simplificación`, `descubribilidad`, `consistencia`, `nueva-funcionalidad`, `otro`.  |
| `coste-estimado` | `bajo` (<1 d), `medio` (1–5 d), `alto` (>5 d). Estimación del experimentador.        |

### 9.3 Priorización

Las propuestas se priorizan en una matriz **impacto × coste** mediante el
criterio:

$$ \text{prioridad} = \frac{\text{frecuencia} \cdot \text{severidad-percibida}}{\text{coste-estimado}} $$

donde frecuencia es el número de participantes distintos que formulan la
propuesta y severidad-percibida es la mediana de un Likert 1–5 sobre
«importancia de resolver esto», recogido en el formulario asíncrono.

---

## 10. Criterios de aceptación

Se considera que el sistema supera la campaña de pruebas con usuarios
reales cuando se cumplen simultáneamente las cuatro condiciones siguientes:

1. **Cobertura.** Cada escenario crítico (S1, S7, S11, S14) alcanza una
   tasa de éxito sin asistencia ≥ 90 % en T1, agregada sobre los
   participantes asignados al rol. Los escenarios no críticos requieren
   ≥ 75 %.
2. **Aprendizaje.** El ratio de mejora medio $\bar r = \bar t_3 / \bar t_1$
   en escenarios críticos satisface $\bar r \leq 0{,}60$, evidenciando que
   la herramienta no es opaca ante el uso repetido.
3. **Usabilidad percibida.** La SUS media por cohorte en T3 es ≥ 70
   (umbral de usabilidad **buena** según la escala adjetival de Bangor,
   Kortum & Miller [\cite{Bangor2009_SUS}] y los baremos de Sauro &
   Lewis [\cite{SauroLewis2016_QuantifyingUX}]) y muestra una mejora ≥ 5
   puntos respecto a T1.
4. **Estabilidad.** Ninguna incidencia de severidad **crítica** queda sin
   resolver entre T1 y T3.

El incumplimiento de cualquiera de las cuatro condiciones convierte la
campaña en **diagnóstica**: sus resultados se reportan íntegramente y
alimentan una nueva iteración del producto, pero no se afirma superación
de la prueba.

---

## 11. Protocolo de sesión (operativa)

### 11.1 Bloques de la sesión T1 (75 min)

1. **Briefing** (5 min). Presentación del propósito, firma del
   consentimiento informado, verificación del entorno (audio, pantalla,
   compartición).
2. **Calentamiento** (5 min). Pequeño escenario neutro no puntuable, para
   familiarizar al participante con el protocolo *think-aloud*.
3. **Ejecución cronometrada con \emph{think-aloud}** (45 min). El
   participante completa los escenarios asignados a su rol verbalizando
   sus decisiones. El experimentador observa sin intervenir, salvo
   bloqueo absoluto del flujo.
4. **Cuestionario post-sesión** (10 min). SUS + UEQ-S + RTLX.
5. **Entrevista semiestructurada breve** (10 min). Tres preguntas:
   dificultad mayor, sorpresa positiva, propuesta de mejora prioritaria.

### 11.2 Bloques de las sesiones T2 y T3 (45 min)

1. **Briefing breve** (3 min). Recapitulación del propósito.
2. **Ejecución cronometrada** (25 min). Solo escenarios críticos del rol.
3. **Cuestionario post-sesión** (7 min). RTLX (siempre) y SUS (solo T3).
4. **Entrevista semiestructurada** (10 min). En T3, ampliada a diez
   preguntas (cf. §7.4).

### 11.3 Entorno técnico

- Despliegue: `docker compose up` sobre un host dedicado.
- Población inicial: *seed* documentado en `TESTS.md`, §«Run commands».
- Reiniciado entre participantes: `docker compose down -v && docker compose up`
  (purga total del volumen `mariadb_data`).
- Grabación: pantalla + audio del participante, mediante OBS Studio. Las
  grabaciones se almacenan cifradas en disco local.
- Cronometraje: el reloj se inicia cuando el participante lee el enunciado
  y se detiene cuando el sistema muestra el estado terminal del
  escenario; queda inscrito automáticamente en el registro de eventos
  del *runner* de pruebas (carpeta `logs/user-tests/`).

---

## 12. Análisis de datos

### 12.1 Cuantitativo

- Estadísticos descriptivos por escenario y cohorte: media, mediana,
  desviación típica, $p_{25}$ y $p_{75}$.
- Ajuste de la ley de potencia (§7.2) por participante y por cohorte,
  reportando $b$, $r$, $t_\infty$ y bondad de ajuste ($R^2$).
- Para SUS y UEQ-S: valores por participante, agregado por cohorte, y
  diferencia T3 − T1 en SUS con prueba de rangos con signo de Wilcoxon
  [\cite{Wilcoxon1945}] (no se asume normalidad dado el tamaño muestral).

### 12.2 Cualitativo

- Codificación abierta de las transcripciones *think-aloud* y de las
  entrevistas [\cite{EricssonSimon1993_ProtocolAnalysis,BorenRamey2000_ThinkAloud}],
  con consolidación de códigos en categorías de fricción.
- Triangulación: cada categoría se cruza con incidencias registradas (§8)
  y con propuestas codificadas (§9.2). El acuerdo entre los dos
  codificadores se cuantifica con el coeficiente $\kappa$ de Cohen
  [\cite{Cohen1960}], interpretado según los baremos de Landis & Koch
  [\cite{LandisKoch1977}], y con el $\alpha$ de Krippendorff
  [\cite{Krippendorff2004}] cuando la unidad de codificación admita más
  de dos codificadores.
- Síntesis final en forma de **mapa de fricciones**, un diagrama que
  proyecta cada categoría sobre el flujo afectado.

---

## 13. Riesgos del estudio y mitigaciones

| Riesgo                                                                                     | Mitigación                                                                                       |
|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| Tamaño muestral insuficiente para inferencia estadística.                                  | El estudio se presenta como exploratorio y diagnóstico; no se afirma significación inferencial.  |
| Sesgo del experimentador al codificar *think-aloud*.                                       | Codificación doble por dos revisores e índice de acuerdo $\kappa$ de Cohen [\cite{Cohen1960}] reportado, con interpretación según Landis & Koch [\cite{LandisKoch1977}]. |
| Efecto novedad confunde la curva de aprendizaje.                                           | Sesión de calentamiento neutra; el cronómetro se reinicia solo a partir del escenario evaluado.  |
| Variabilidad dialectal influye en la percepción de calidad del LLM.                        | Composición dialectal de la muestra reportada; análisis estratificado cuando proceda.            |
| Fallos del LLM externo (cuota agotada, latencia anómala) durante una sesión.               | Disponer de cuenta de respaldo y plan de contingencia: posponer el escenario afectado.           |
| Abandono de participantes entre sesiones.                                                  | Sobre-reclutar un 20 % y mantener un grupo de reserva.                                            |

---

## 14. Entregables de la campaña

Al cierre de la campaña, el estudio produce los siguientes artefactos:

1. **Conjunto de datos brutos anonimizados** (CSV) con métricas por
   participante, sesión y escenario.
2. **Informe consolidado** (PDF) con análisis cuantitativo, cualitativo y
   conclusiones por objetivo (O1–O4).
3. **Lista priorizada de incidencias**, exportable al *tracker* del
   proyecto.
4. **Lista priorizada de propuestas de mejora**, organizada por matriz
   impacto × coste.
5. **Curvas de aprendizaje** por participante y por cohorte, con sus
   parámetros ajustados.
6. **Apéndice del TFM** que sintetiza el informe para integrarlo en el
   capítulo de Resultados.

---

## 15. Trazabilidad con otros documentos del repositorio

- [`USER-STORIES.md`](USER-STORIES.md): origen del catálogo de historias
  cubiertas por los escenarios de la Tabla 1.
- [`TESTS.md`](TESTS.md): inventario de pruebas automatizadas; este
  documento es su contraparte humana.
- [`TECHNICAL-DESIGN.md`](TECHNICAL-DESIGN.md): justifica las decisiones
  arquitectónicas que las pruebas con usuarios validan en su uso real.
- `memory/secciones/06_Resultados.tex`, §«Plan de pruebas manuales de
  sistema con usuarios reales»: versión académica condensada,
  incorporable al cuerpo del TFM.
- `doc-planning/TASKS.md`, tarea **T6b**: pista de auditoría de la
  redacción de este documento.

---

## 16. Referencias bibliográficas

Todas las obras citadas a lo largo del documento están registradas en
`memory/include/referencias.bib` y son por tanto reutilizables desde el
manuscrito LaTeX del TFM mediante los comandos habituales (`\cite{}`,
`\citep{}`, `\citet{}`). La lista que sigue es exhaustiva respecto a las
citas que aparecen en este plan y respeta el orden alfabético por clave
\textsc{BibTeX}.

### 16.1 Métodos de evaluación de usabilidad y experiencia de usuario

- `Bangor2009_SUS` — Bangor, A.; Kortum, P. T.; Miller, J. T. (2009).
  *Determining What Individual SUS Scores Mean: Adding an Adjective Rating
  Scale*. **Journal of Usability Studies**, 4(3), 114–123.
- `Brooke1996_SUS` — Brooke, J. (1996). *SUS: A 'Quick and Dirty'
  Usability Scale*. En Jordan et al. (eds.), **Usability Evaluation in
  Industry**, Taylor & Francis, 189–194.
- `HartStaveland1988_NASATLX` — Hart, S. G.; Staveland, L. E. (1988).
  *Development of NASA-TLX (Task Load Index): Results of Empirical and
  Theoretical Research*. En Hancock & Meshkati (eds.), **Human Mental
  Workload**, Advances in Psychology 52, 139–183.
- `Lewis2018_SUSReview` — Lewis, J. R. (2018). *The System Usability
  Scale: Past, Present, and Future*. **International Journal of
  Human-Computer Interaction**, 34(7), 577–590.
- `Nielsen1994_UsabilityEngineering` — Nielsen, J. (1994). **Usability
  Engineering**. Morgan Kaufmann.
- `NielsenLandauer1993` — Nielsen, J.; Landauer, T. K. (1993). *A
  Mathematical Model of the Finding of Usability Problems*. **Proceedings
  of INTERCHI '93**, ACM, 206–213.
- `Reichheld2003_NPS` — Reichheld, F. F. (2003). *The One Number You
  Need to Grow*. **Harvard Business Review**, 81(12), 46–54.
- `RubinChisnell2008_HandbookUsability` — Rubin, J.; Chisnell, D.
  (2008). **Handbook of Usability Testing: How to Plan, Design, and
  Conduct Effective Tests** (2.ª ed.). Wiley.
- `SauroLewis2016_QuantifyingUX` — Sauro, J.; Lewis, J. R. (2016).
  **Quantifying the User Experience: Practical Statistics for User
  Research** (2.ª ed.). Morgan Kaufmann.
- `Schrepp2017_UEQS` — Schrepp, M.; Hinderks, A.; Thomaschewski, J.
  (2017). *Design and Evaluation of a Short Version of the User Experience
  Questionnaire (UEQ-S)*. **IJIMAI**, 4(6), 103–108.

### 16.2 Aprendizaje, análisis cualitativo y método experimental

- `BorenRamey2000_ThinkAloud` — Boren, M. T.; Ramey, J. (2000).
  *Thinking Aloud: Reconciling Theory and Practice*. **IEEE Transactions
  on Professional Communication**, 43(3), 261–278.
- `EricssonSimon1993_ProtocolAnalysis` — Ericsson, K. A.; Simon, H. A.
  (1993). **Protocol Analysis: Verbal Reports as Data** (edición
  revisada). MIT Press.
- `NewellRosenbloom1981_PowerLaw` — Newell, A.; Rosenbloom, P. S.
  (1981). *Mechanisms of Skill Acquisition and the Law of Practice*. En
  Anderson (ed.), **Cognitive Skills and Their Acquisition**, Lawrence
  Erlbaum, 1–55.
- `Wohlin2012` — Wohlin, C.; Runeson, P.; Höst, M.; Ohlsson, M. C.;
  Regnell, B.; Wesslén, A. (2012). **Experimentation in Software
  Engineering**. Springer.

### 16.3 Estadística y acuerdo entre evaluadores

- `Cohen1960` — Cohen, J. (1960). *A Coefficient of Agreement for
  Nominal Scales*. **Educational and Psychological Measurement**, 20(1),
  37–46.
- `Krippendorff2004` — Krippendorff, K. (2004). **Content Analysis: An
  Introduction to Its Methodology**.
- `LandisKoch1977` — Landis, J. R.; Koch, G. G. (1977). *The Measurement
  of Observer Agreement for Categorical Data*. **Biometrics**, 33(1),
  159–174.
- `Wilcoxon1945` — Wilcoxon, F. (1945). *Individual Comparisons by
  Ranking Methods*. **Biometrics Bulletin**, 1(6), 80–83.

### 16.4 Estándares y normativa

- `ISO9241_11_2018` — ISO 9241-11:2018. *Ergonomics of Human-System
  Interaction — Part 11: Usability: Definitions and Concepts*.
- `ISOIEC25022_2016` — ISO/IEC 25022:2016. *Systems and Software
  Engineering — SQuaRE — Measurement of Quality in Use*.
- `GDPR2016` — European Parliament and Council of the EU (2016).
  *Regulation (EU) 2016/679 on the Protection of Natural Persons with
  Regard to the Processing of Personal Data (GDPR)*.

### 16.5 Ética en estudios con participantes humanos remunerados

- `Shmueli2021_BeyondFairPay` — Shmueli, B.; Fell, J.; Ray, S.; Ku, L.-W.
  (2021). *Beyond Fair Pay: Ethical Implications of NLP Crowdsourcing*.
  **NAACL-HLT 2021**.
- `Whiting2019_FairWork` — Whiting, M. E.; Hugh, G.; Bernstein, M. S.
  (2019). *Fair Work: Crowd Work Minimum Wage with One Line of Code*.
  **HCOMP 2019**.

### 16.6 Convención de citación dentro del repositorio

Para mantener coherencia entre este documento y la memoria del TFM, las
citas aparecen en el cuerpo del texto entre corchetes con la sintaxis
`[\cite{ClaveBib}]`. Al integrar este plan en la memoria, basta con
eliminar los corchetes externos para obtener un comando `\cite{}` válido
de LaTeX. Todas las claves listadas en §16.1–§16.5 corresponden a entradas
ya presentes en `memory/include/referencias.bib`.
