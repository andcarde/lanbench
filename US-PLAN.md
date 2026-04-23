# Planificacion De Historias De Usuario

Fecha: 2026-04-22

Base usada:
- Auditoria funcional en `US-COBERTURA-1.md`.
- Historias de usuario en `documentation/user_stories.txt`.
- No se han ejecutado tests en esta planificacion.

Objetivo del plan:
- Ordenar la implementacion de `US-01..US-24`.
- Segmentar cada US en tareas.
- Detectar dependencias entre historias.
- Separar tareas comunes reutilizables.
- Agrupar la ejecucion en bloques de `TAREAS EPICAS`.
- Pasar de granularidad gruesa a granularidad fina.

## 1. Vista Gruesa

La planificacion recomendada se organiza en 7 bloques de `TAREAS EPICAS`:

| Bloque | Tarea Epica | US principales | Resultado esperado |
| --- | --- | --- | --- |
| E0 | Estabilizacion del nucleo y arquitectura transversal | US-01, US-02, US-03, US-05, US-06, US-19 | El flujo ya existente deja de depender de `DEBUG`, se fijan contratos de dominio y se prepara la base para roles, revision y metricas. |
| E1 | Gobierno de acceso, roles y permisos | US-22, soporte para US-13, US-19, US-20, US-21, US-23, US-24 | La app distingue anotador, revisor y admin, y cada ruta queda protegida por autorizacion real. |
| E2 | Flujo base del anotador extremo a extremo | US-03, US-04, US-04-R-01, US-05, US-06 | El anotador puede trabajar sobre datasets reales, por secciones reales, sin mocks. |
| E3 | Asistencia IA y validacion avanzada | US-07, US-08, US-08-R-01, US-09, US-10, US-15, US-16, US-17, US-18 | El sistema genera borradores, valida cobertura y diversidad, y propone correcciones trazables. |
| E4 | Flujo de revision humana | US-12, US-13, US-13-R-01, US-13-R-02 | Existe cola de revision, evaluacion por criterios, correccion comentada y retorno al anotador. |
| E5 | Administracion funcional de datasets y configuracion | US-19, US-20, US-24 | El admin puede importar, exportar avances reales y configurar criterios de evaluacion. |
| E6 | Estadisticas, reporting y monitorizacion | US-11, US-14, US-21, US-23 | La plataforma expone metricas por rol, progreso de trabajo y actividad operativa. |

Orden recomendado de ejecucion:
1. `E0`
2. `E1`
3. `E2`
4. `E3`
5. `E4`
6. `E5`
7. `E6`

Justificacion del orden:
- Primero hay que convertir el nucleo actual en una base fiable y quitar el desacoplamiento por `DEBUG`.
- Despues hay que introducir roles para que las historias de revisor y administrador no nazcan sobre autenticacion plana.
- Luego conviene cerrar el flujo del anotador de extremo a extremo.
- Sobre ese flujo ya estable, tiene sentido montar IA avanzada y luego revision humana.
- Exportacion, configuracion y reporting deben apoyarse en anotaciones y revisiones ya persistidas.

## 2. Dependencias Entre Historias

### 2.1 Dependencias fuertes

| Historia | Depende de | Motivo |
| --- | --- | --- |
| US-03 | US-02, US-19 | Para ver triples antes debe existir dataset importado y seleccionable. |
| US-04 | US-03, US-19 | La seleccion por complejidad actua sobre entries ya visibles de un dataset real. |
| US-04-R-01 | US-04 | La unidad de trabajo por secciones es una restriccion del mecanismo de seleccion. |
| US-05 | US-03, US-04 | No se puede anotar sin ver entries y sin decidir la unidad de trabajo. |
| US-06 | US-03, US-04 | La traduccion asistida requiere contexto RDF y referencia inglesa cargada. |
| US-07 | US-15, US-16, US-05, US-06 | Editar sentencias generadas automaticamente exige que antes existan borradores generados y una UI de edicion. |
| US-08 | US-07, US-09, US-10, US-17, US-18 | Las alertas utiles dependen de validaciones, reglas de calidad y deteccion de discrepancias. |
| US-09 | US-03, US-05, US-06 | Validar cobertura necesita triples visibles y texto candidato. |
| US-10 | US-08, US-18 | La correccion avanzada reutiliza alertas y deteccion de baja diversidad. |
| US-11 | US-05, US-06, US-07, US-08 | Las estadisticas del anotador dependen de eventos reales de anotacion. |
| US-12 | US-13 | El anotador solo puede ver errores corregidos si existe previamente un flujo de revision. |
| US-13 | US-22, US-05, US-06, US-07, US-08 | La revision necesita textos anotados y un rol revisor habilitado. |
| US-13-R-01 | US-13 | La aceptacion secuencial por criterios es una restriccion del flujo de revision. |
| US-13-R-02 | US-13 | Editar y comentar correcciones forma parte del proceso de revision. |
| US-14 | US-13 | Las estadisticas del revisor dependen del trabajo de revision. |
| US-15 | US-03, US-19 | La generacion de texto necesita triples y datasets reales disponibles. |
| US-16 | US-03, US-19 | La generacion de traducciones parte del mismo contexto de datos. |
| US-17 | US-16 | La discrepancia se define respecto a una traduccion generada. |
| US-18 | US-05, US-06, US-15, US-16 | La baja diversidad requiere un conjunto de frases comparables. |
| US-20 | US-19, US-05, US-13 | Exportar avances reales depende de que existan datasets cargados y trabajo guardado. |
| US-21 | US-05, US-13, US-15, US-16, US-17, US-18, US-20 | El reporting del admin depende de los flujos de anotacion, revision, IA y exportacion. |
| US-23 | US-22, US-05, US-13, US-19, US-20 | Monitorizar actividad necesita roles y eventos funcionales ya instrumentados. |
| US-24 | US-13, US-22 | Configurar criterios tiene sentido cuando el flujo de revision y los roles ya existen. |

### 2.2 Dependencias blandas

| Historia | Historia relacionada | Lectura recomendada |
| --- | --- | --- |
| US-01 | US-22 | Se puede mantener el login actual, pero el modelo de usuario deberia adaptarse despues a roles. |
| US-02 | US-21 | El listado puede mostrar despues metricas calculadas por reporting. |
| US-08 | US-12 | El valor de rechazar alertas crece mucho cuando el revisor puede revalidarlas. |
| US-19 | US-22 | La importacion ya existe, pero deberia quedar protegida por rol admin antes de darla por cerrada. |

## 3. Tareas Comunes Transversales

Estas tareas no pertenecen a una sola US y conviene ejecutarlas como base compartida:

| Codigo | Tarea comun | Reutilizada por |
| --- | --- | --- |
| C1 | Eliminar el acoplamiento a `DEBUG` en front y sustituirlo por configuracion de entorno real | US-03, US-05, US-06, US-07, US-08, US-19 |
| C2 | Definir modelo de roles y permisos en dominio, DB, sesion y middleware | US-13, US-19, US-20, US-21, US-22, US-23, US-24 |
| C3 | Definir estados canonicos del ciclo de vida de una entry: pendiente, en anotacion, anotada, en revision, revisada, en disputa | US-04-R-01, US-12, US-13, US-20, US-21 |
| C4 | Crear trazabilidad de eventos funcionales: alta de dataset, asignacion, anotacion, alerta, revision, exportacion | US-11, US-14, US-21, US-23 |
| C5 | Crear agregados y recalculo de metricas de progreso | US-11, US-21 |
| C6 | Unificar contratos DTO y APIs entre front, routers, controladores y servicios | US-03 a US-10, US-13, US-20 |
| C7 | Gestionar resiliencia del motor IA: timeouts, fallback, reintentos y auditoria de decisiones | US-08, US-15, US-16, US-17, US-18 |
| C8 | Diseñar entidades faltantes del dominio: `Role`, `Review`, `ReviewCriterion`, `ReviewDecision`, `ActivityLog`, `ExportJob` o equivalentes | US-12, US-13, US-14, US-21, US-22, US-23, US-24 |

## 4. Mapa De US A TAREAS EPICAS

| US | Tarea Epica principal | Tipo de trabajo |
| --- | --- | --- |
| US-01 | E0 | Consolidacion |
| US-02 | E0 | Consolidacion |
| US-03 | E2 | Cierre funcional |
| US-04 | E2 | Nueva funcionalidad |
| US-04-R-01 | E2 | Regla de negocio |
| US-05 | E2 | Cierre funcional |
| US-06 | E2 | Cierre funcional |
| US-07 | E3 | Nueva funcionalidad |
| US-08 | E3 | Nueva funcionalidad |
| US-08-R-01 | E3 | Regla de negocio |
| US-09 | E3 | Nueva funcionalidad |
| US-10 | E3 | Nueva funcionalidad |
| US-11 | E6 | Reporting |
| US-12 | E4 | Nueva funcionalidad |
| US-13 | E4 | Nueva funcionalidad |
| US-13-R-01 | E4 | Regla de negocio |
| US-13-R-02 | E4 | Regla de negocio |
| US-14 | E6 | Reporting |
| US-15 | E3 | Nueva funcionalidad |
| US-16 | E3 | Nueva funcionalidad |
| US-17 | E3 | Nueva funcionalidad |
| US-18 | E3 | Nueva funcionalidad |
| US-19 | E5 | Cierre funcional y gobierno |
| US-20 | E5 | Nueva funcionalidad |
| US-21 | E6 | Reporting |
| US-22 | E1 | Nueva funcionalidad estructural |
| US-23 | E6 | Nueva funcionalidad operativa |
| US-24 | E5 | Nueva funcionalidad de configuracion |

## 5. Desglose Afinado Por TAREAS EPICAS

## E0. Estabilizacion Del Nucleo Y Arquitectura Transversal

US incluidas:
- US-01
- US-02
- soporte de base para US-03, US-05, US-06, US-19

Dependencias de entrada:
- Ninguna.

Tareas comunes activadas:
- C1
- C6

### Objetivos del bloque

- Convertir el flujo actual en una base realmente operativa.
- Quitar las rutas felices soportadas solo por mocks.
- Congelar contratos de API antes de crecer en funcionalidad.

### Tareas de grano medio

1. Consolidar el contrato de sesion y usuario.
2. Externalizar `DEBUG` a configuracion real y apagarlo en produccion.
3. Unificar contratos de datasets y annotations entre front y backend.
4. Documentar estados actuales y huecos conocidos.

### Tareas finas

1. Revisar `public/js/annotations.js` y `public/js/dataset-view.js` para sustituir mocks por consumo real de API.
2. Mantener un modo demo opcional, pero desacoplado del modo real.
3. Definir un DTO canonico para `DatasetList`, `DatasetSection`, `EntryContext`, `SentenceValidation` y `SavedAnnotation`.
4. Alinear mensajes de error entre front y backend.
5. Revisar navegacion entre `/tasks`, `/datasets/:id/view` y `/annotations`.
6. Dejar cerrada la compatibilidad entre session, auth y futuras claims de rol.

Definition of done del bloque:
- La app puede ejecutarse sin depender funcionalmente de mocks en las pantallas nucleares.
- Las APIs canonicas quedan estables para los siguientes bloques.

## E1. Gobierno De Acceso, Roles Y Permisos

US incluidas:
- US-22
- prerequisito funcional para US-13, US-19, US-20, US-21, US-23, US-24

Dependencias de entrada:
- E0

Tareas comunes activadas:
- C2
- C8

### Objetivos del bloque

- Introducir autorizacion real por rol.
- Separar responsabilidades entre anotador, revisor y admin.

### Tareas de grano medio

1. Ampliar el modelo de usuario con roles.
2. Incorporar autorizacion por rol en middleware y routers.
3. Adaptar sesion, login y front a capacidades por rol.
4. Preparar permisos por dataset y por bloque de trabajo.

### Tareas finas

1. Diseñar tabla o relacion de roles y migracion correspondiente.
2. Decidir si un usuario tiene un rol unico o multiples roles.
3. Extender `User.toSession()` para incluir rol o claims.
4. Crear middlewares `requireRole` o equivalentes.
5. Restringir subida, exportacion, configuracion y monitorizacion a admin.
6. Restringir vistas y APIs de revision a revisor.
7. Ajustar toolbar, landing y navegacion segun rol.
8. Preparar seeds o bootstrap de admin inicial.

Definition of done del bloque:
- Ninguna funcionalidad de admin o revisor queda accesible solo por estar autenticado.

## E2. Flujo Base Del Anotador Extremo A Extremo

US incluidas:
- US-03
- US-04
- US-04-R-01
- US-05
- US-06

Dependencias de entrada:
- E0
- E1 recomendado
- US-19 como capacidad de carga disponible

Tareas comunes activadas:
- C3
- C6

### Objetivos del bloque

- Cerrar el workflow real del anotador con datasets reales, secciones reales y persistencia real.
- Reemplazar el corte por `slice` por una asignacion funcional de trabajo.

### Tareas de grano medio

1. Rediseñar la seleccion de trabajo por dataset, seccion y entry.
2. Implementar agrupacion por complejidad.
3. Implementar asignacion exclusiva o reserva temporal de bloques.
4. Persistir avance de anotacion por entry y por bloque.
5. Mostrar en front triples, referencias y estado real del bloque.

### Tareas finas

1. Decidir la regla de complejidad: por `size`, por numero de triples o por taxonomia propia.
2. Persistir la relacion entre usuario y bloque reservado.
3. Añadir expiracion, liberacion y recuperacion de reservas.
4. Exponer endpoint para solicitar siguiente bloque disponible.
5. Exponer endpoint para reanudar bloque en curso.
6. Mostrar en UI la complejidad, el estado del bloque y el progreso de la seccion.
7. Asegurar que `send` guarda tambien el estado de workflow de la entry.
8. Resolver concurrencia multiusuario sobre el mismo dataset.
9. Añadir navegacion entre entries de un mismo bloque y entre bloques consecutivos.

Definition of done del bloque:
- Un anotador puede entrar, reservar trabajo real, anotar varias frases y continuar exactamente donde lo dejo.

## E3. Asistencia IA Y Validacion Avanzada

US incluidas:
- US-07
- US-08
- US-08-R-01
- US-09
- US-10
- US-15
- US-16
- US-17
- US-18

Dependencias de entrada:
- E2

Tareas comunes activadas:
- C6
- C7

### Objetivos del bloque

- Pasar de validacion basica a asistencia inteligente completa.
- Generar borradores, comparar, detectar baja diversidad y registrar decisiones del usuario.

### Tareas de grano medio

1. Crear motor de generacion automatica de frases en espanol.
2. Crear motor de traduccion o verbalizacion inicial basada en triples.
3. Mejorar el motor de validacion de cobertura de triples.
4. Introducir reglas de diversidad linguistica multi-frase.
5. Convertir alertas en un flujo posterior al borrador y previo al envio final.

### Tareas finas

1. Diseñar endpoint para solicitar borradores IA por entry.
2. Guardar origen de cada frase: manual, generada, editada, revisada.
3. Añadir persistencia de alertas y de su resolucion.
4. Definir estrategia de cobertura de triples:
   - heuristica determinista
   - apoyo de LLM
   - combinacion de ambas
5. Definir estrategia de diversidad:
   - similitud lexica
   - similitud estructural
   - umbrales configurables
6. Diferenciar alertas ortograficas, gramaticales, semanticas, de cobertura y de diversidad.
7. Asociar cada rechazo de alerta a una justificacion persistida.
8. Crear flujo de regeneracion de sugerencia y de aceptacion parcial.
9. Registrar discrepancias entre salida IA y salida final del anotador para reporting posterior.

Definition of done del bloque:
- El anotador recibe borradores, alertas clasificadas y sugerencias trazables antes de enviar la version final.

## E4. Flujo De Revision Humana

US incluidas:
- US-12
- US-13
- US-13-R-01
- US-13-R-02

Dependencias de entrada:
- E1
- E2
- E3

Tareas comunes activadas:
- C3
- C8

### Objetivos del bloque

- Introducir un dominio de revision completo y trazable.
- Hacer visible el feedback del revisor para el anotador.

### Tareas de grano medio

1. Diseñar el modelo de revision y decision por criterio.
2. Construir la cola de trabajo del revisor.
3. Crear UI de evaluacion secuencial por criterios.
4. Permitir edicion del texto revisado con comentario obligatorio.
5. Propagar el feedback al historial del anotador.

### Tareas finas

1. Crear entidades `Review`, `ReviewCriterion`, `ReviewDecision`, `ReviewComment` o equivalentes.
2. Definir estados `annotated`, `under_review`, `reviewed`, `disputed`.
3. Construir endpoint de listado de items pendientes de revision.
4. Mostrar al revisor el contexto completo:
   - triples
   - frases inglesas
   - frase final del anotador
   - alertas rechazadas y motivos
5. Implementar wizard secuencial de criterios para `US-13-R-01`.
6. Bloquear avance al siguiente criterio hasta resolver el actual.
7. Permitir modificar texto revisado solo si se aporta comentario.
8. Guardar comentarios visibles para re-correccion y para el anotador.
9. Crear vista del anotador con errores corregidos y recomendaciones recurrentes.

Definition of done del bloque:
- Un revisor puede aceptar o corregir una anotacion, justificar la correccion y devolver aprendizaje util al anotador.

## E5. Administracion Funcional De Datasets Y Configuracion

US incluidas:
- US-19
- US-20
- US-24

Dependencias de entrada:
- E1
- E2
- E4 recomendado

Tareas comunes activadas:
- C2
- C6
- C8

### Objetivos del bloque

- Completar el rol administrador mas alla del logout.
- Hacer gestionable el ciclo de vida de datasets y criterios.

### Tareas de grano medio

1. Endurecer la importacion de datasets como funcionalidad solo admin.
2. Crear exportacion de avances reales.
3. Configurar criterios de evaluacion reutilizados por el flujo de revision.

### Tareas finas

1. Añadir pantalla de administracion de datasets.
2. Mostrar estado por dataset: total entries, reservadas, anotadas, revisadas, en disputa.
3. Diseñar formato de exportacion:
   - XML enriquecido
   - XML canonico + anotaciones anexas
   - JSON intermedio de trabajo
4. Decidir si la exportacion se genera bajo demanda o en job asincrono.
5. Incluir en exportacion:
   - frases finales del anotador
   - motivos de rechazo de alertas
   - correcciones del revisor
   - trazabilidad minima
6. Crear UI para crear, activar, ordenar y versionar criterios de evaluacion.
7. Hacer que el flujo de revision consuma esos criterios configurados y no una lista fija en codigo.

Definition of done del bloque:
- El administrador puede gobernar datasets y criterios sin tocar codigo.

## E6. Estadisticas, Reporting Y Monitorizacion

US incluidas:
- US-11
- US-14
- US-21
- US-23

Dependencias de entrada:
- E2
- E3
- E4
- E5 parcial

Tareas comunes activadas:
- C4
- C5

### Objetivos del bloque

- Exponer metricas fiables para anotadores, revisores y administradores.
- Separar observabilidad tecnica de monitorizacion funcional.

### Tareas de grano medio

1. Instrumentar eventos funcionales.
2. Calcular metricas agregadas por usuario, dataset y periodo.
3. Crear dashboards por rol.
4. Crear vistas de monitorizacion operativa para admin.

### Tareas finas

1. Registrar eventos de reserva, anotacion, validacion, rechazo de alerta, revision, disputa y exportacion.
2. Diseñar tablas agregadas o jobs de recalculo para:
   - anotaciones realizadas
   - anotaciones revisadas
   - cobertura por dataset
   - errores IA corregidos
   - errores de anotacion corregidos en revision
   - disputas
3. Actualizar `completedPercent`, `withoutReviewPercent` y `remainPercent` con logica real.
4. Crear dashboard del anotador con volumen, productividad y patrones de error.
5. Crear dashboard del revisor con volumen revisado, tiempos y tipos de correccion.
6. Crear dashboard del admin con embudo completo del dataset.
7. Crear pantalla de actividad de usuarios basada en eventos funcionales, no solo logs tecnicos.
8. Añadir filtros por rango temporal, dataset, usuario y estado.

Definition of done del bloque:
- La plataforma ofrece metricas explicables y consistentes con el trabajo realmente persistido.

## 6. Ruta De Ejecucion Recomendada

### Tramo 1. Convertir lo parcial en base estable

Incluye:
- E0
- E1
- parte de E2

Resultado:
- La app deja de depender de mocks.
- Cada actor tiene permisos reales.
- El anotador ya puede trabajar con flujo real.

### Tramo 2. Completar el producto para anotacion asistida

Incluye:
- resto de E2
- E3

Resultado:
- El producto ya no es solo una UI de edicion, sino una plataforma de asistencia IA con validacion rica.

### Tramo 3. Cerrar el circuito de calidad

Incluye:
- E4
- E5

Resultado:
- El trabajo anotado se revisa, se gobierna y se puede exportar.

### Tramo 4. Explotar la informacion operativa

Incluye:
- E6

Resultado:
- La plataforma gana valor de gestion y seguimiento.

## 7. Priorizacion Practica

Prioridad `P0`:
- E0
- E1
- E2

Prioridad `P1`:
- E3
- E4

Prioridad `P2`:
- E5
- E6

Lectura de la prioridad:
- `P0` convierte el estado actual en un producto operativo minimo coherente.
- `P1` aporta calidad y diferenciacion real.
- `P2` aporta gobierno, exportacion y explotacion de datos.

## 8. Riesgos De Planificacion

1. Implementar revision antes de roles generaria retrabajo en permisos y navegacion.
2. Implementar metricas antes de modelar eventos funcionales llevaria a dashboards poco fiables.
3. Implementar exportacion antes de consolidar el modelo de anotacion y revision produciria formatos transitorios.
4. Mantener `DEBUG` activo mientras crecen funcionalidades aumentaria mucho la deuda de integracion.
5. Resolver la exclusividad de bloques tarde pondria en riesgo `US-04-R-01` y la consistencia multiusuario.

## 9. Recomendacion Final

La mejor secuencia no es implementar las US en orden numerico, sino en orden de dependencia real:

1. estabilizar nucleo
2. introducir roles
3. cerrar flujo del anotador
4. añadir IA avanzada
5. añadir revision humana
6. completar administracion
7. cerrar reporting y monitorizacion

Con esa secuencia, las historias ya parcialmente cubiertas se consolidan primero y las historias hoy ausentes nacen sobre una base coherente, no sobre parches aislados.
