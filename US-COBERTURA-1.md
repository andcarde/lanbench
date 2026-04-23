# Auditoria De Cobertura De Historias De Usuario 1

Fecha: 2026-04-22

Alcance:
- Analisis estatico del repositorio actual.
- Evidencia basada en codigo, modelo de datos, rutas, front existente y tests ya presentes en el repo.
- No se ha ejecutado la bateria de tests por peticion explicita del usuario.

Criterio usado:
- `Cubierta`: existe soporte funcional suficiente de extremo a extremo para la historia.
- `Parcial`: existe implementacion en alguna(s) capa(s), pero faltan piezas clave, restricciones funcionales o el flujo real esta desacoplado.
- `No cubierta`: no se ha encontrado implementacion identificable para la historia.

## Resumen Ejecutivo

- Cobertura global sobre US-01..US-24: 2 cubiertas, 10 parciales, 12 no cubiertas.
- Los subrequisitos `US-04-R-01`, `US-08-R-01`, `US-13-R-01` y `US-13-R-02` se auditan aparte y no entran en ese conteo.
- El backend tiene mas cobertura que la experiencia real del front: `public/js/annotations.js:9` y `public/js/dataset-view.js:4` siguen trabajando en modo `DEBUG`, asi que varias pantallas no consumen el flujo real por defecto.
- No existe una capa funcional de revision humana, gestion de roles, estadisticas operativas, descarga de avances anotados ni configuracion de criterios.
- La administracion hoy esta reducida, en la practica, a `logout` y a una subida de datasets accesible a cualquier usuario autenticado.

## 1. Cobertura Por Historia De Usuario

| Historia | Estado | Resultado de auditoria | Evidencia principal |
| --- | --- | --- | --- |
| US-01 | Cubierta | Hay registro, login, logout, sesion persistida y proteccion de rutas privadas. | `routes/users.js:10-15`, `business/users-controller.js:8-59`, `services/users-service.js:14-58`, `middlewares/auth.js:5-26`, `routes/administrator.js:10-23`, `prisma/schema.prisma:40-46` |
| US-02 | Cubierta | Se listan datasets accesibles y se puede navegar a su vista o a la tarea. | `public/js/datasets.js:250-314`, `business/datasets-controller.js:25-35`, `services/datasets-service.js:36-52`, `repositories/datasets-repository.js:10-30` |
| US-03 | Parcial | La UI puede mostrar triples y frases fuente, pero la pantalla de anotacion carga datos mock en `DEBUG`; la vista XML tambien esta en `DEBUG`. | `public/js/annotations.js:171-177`, `public/js/annotations.js:240-294`, `public/js/annotations.js:724-742`, `public/js/dataset-view.js:4-6`, `public/js/dataset-view.js:120-129`, `services/datasets-service.js:54-103` |
| US-04 | Parcial | Existe troceado por secciones de 10 entries, pero no hay agrupacion por complejidad ni asignacion exclusiva real por anotador. | `constants/datasets.js:4`, `services/datasets-service.js:54-92`, `prisma/schema.prisma:9-17` |
| US-04-R-01 | Parcial | Se cumple el tamano de seccion (`10`), pero no la exclusividad multiusuario: las secciones se calculan por `slice`, no se reservan. | `services/datasets-service.js:65-92`, `repositories/datasets-repository.js:32-64` |
| US-05 | Parcial | Existe formulario de anotacion y persistencia de frases, pero el front por defecto no usa el flujo real porque `send` esta puenteado por `DEBUG`. | `public/js/annotations.js:240-276`, `public/js/annotations.js:659-707`, `public/js/annotations.js:734-742`, `routes/annotations-api.js:12-15`, `business/annotations-controller.js:23-41`, `repositories/annotations-repository.js:10-53` |
| US-06 | Parcial | Se muestran frases inglesas de referencia y se pasan al validador semantico, pero la experiencia real sigue en `DEBUG`. | `public/js/annotations.js:228-294`, `services/annotations-service.js:10-23`, `services/annotations-service.js:55-64`, `business/ollama-spanish-checker.js:26-45` |
| US-07 | Parcial | Hay flujo para aceptar o rechazar sugerencias de correccion, pero no existe generacion automatica inicial de frases en espanol para editar. | `public/annotations.html:150-170`, `public/js/annotations.js:427-607`, `public/js/annotations.js:783-821` |
| US-08 | Parcial | Existen alertas automaticas y guardado del motivo de rechazo, pero se disparan en `CHECK`, no tras finalizar el trabajo, y no hay revalidacion por revisor. | `public/annotations.html:150-170`, `public/js/annotations.js:532-607`, `public/js/annotations.js:610-651`, `business/rule-checker.js:5-45`, `business/ollama-spanish-checker.js:15-78`, `prisma/schema.prisma:165-181` |
| US-08-R-01 | Parcial | Hay cobertura ortografica, gramatical basica y semantica apoyada en Ollama; el motivo de rechazo se recoge, pero no existe flujo posterior de revision humana. | `business/rule-checker.js:17-38`, `business/ollama-spanish-checker.js:17-45`, `public/js/annotations.js:569-577`, `public/js/annotations.js:805-821` |
| US-09 | Parcial | Se valida cada frase contra triples y frase inglesa de referencia, pero no existe motor determinista de cobertura de triples ni verificacion explicita de completitud. | `services/annotations-service.js:13-20`, `services/annotations-service.js:55-64`, `business/ollama-spanish-checker.js:26-45` |
| US-10 | Parcial | Se corrigen algunos errores ortograficos/gramaticales y parte de la adecuacion semantica, pero no hay logica especifica para variedad linguistica ni para errores RDF especializados. | `business/rule-checker.js:17-38`, `business/ollama-spanish-checker.js:17-45` |
| US-11 | No cubierta | No hay endpoints, servicios ni consultas para estadisticas personales de anotacion. Los porcentajes de dataset existen, pero solo se leen y no se recalculan. | `services/datasets-service.js:124-149`, `services/datasets-service.js:253-265`, busqueda de `completedPercent/withoutReviewPercent/remainPercent` |
| US-12 | No cubierta | No existe subsistema de revision que devuelva al anotador los errores corregidos. | `app.js:52-58`, ausencia de modelos/rutas/controladores de revision |
| US-13 | No cubierta | No existe rol ni flujo de revisor, ni criterios secuenciales, ni formulario de evaluacion humana. | `app.js:52-58`, `prisma/schema.prisma` sin modelos de revision/criterios, ausencia de rutas dedicadas |
| US-13-R-01 | No cubierta | No hay checks por criterio, ni fases encadenadas de aceptacion, ni gating secuencial en front o backend. | ausencia de implementacion en `public`, `routes`, `business`, `services`, `repositories` |
| US-13-R-02 | No cubierta | No hay capa de revision que permita editar textos revisados con comentario obligatorio para re-correccion. | ausencia de modelo `Review`/`Comment` y de APIs asociadas |
| US-14 | No cubierta | No existen estadisticas del trabajo de revision. | ausencia de rutas, servicios y persistencia de revision |
| US-15 | No cubierta | No existe generacion automatica de texto en espanol a partir de triples RDF; solo validacion. | `business/spanish-service.js:19-29`, `business/ollama-spanish-checker.js:5-12` |
| US-16 | No cubierta | No existe generacion automatica de traducciones a partir de triples RDF. Las frases inglesas llegan del dataset importado, no de un generador. | `utils/xml-reader.js:116-127`, `services/datasets-service.js:185-199` |
| US-17 | Parcial | El sistema puede marcar como invalida una frase frente a triples y referencia inglesa, pero no hay workflow propio de "discrepancia con traduccion generada". | `business/spanish-service.js:19-29`, `business/ollama-spanish-checker.js:26-45`, `public/js/annotations.js:610-651` |
| US-18 | No cubierta | No hay deteccion de baja diversidad linguistica entre varias frases; la validacion es frase a frase. | `services/annotations-service.js:10-23`, `business/rule-checker.js:5-45` |
| US-19 | Parcial | La subida e importacion de datasets RDF existe, pero no esta restringida a administradores: cualquier usuario autenticado puede usarla. | `public/datasets.html:25`, `public/js/datasets.js:349-373`, `routes/datasets-api.js:14-20`, `business/datasets-controller.js:96-111`, `services/datasets-service.js:105-149`, `middlewares/auth.js:19-26`, `prisma/schema.prisma:40-46` |
| US-20 | No cubierta | Hay lectura del XML del dataset, pero no exporta los avances de anotacion guardados en `Annotation`, ni existe flujo de descarga real ni restriccion de admin. | `services/datasets-service.js:95-103`, `services/datasets-service.js:201-228`, `repositories/datasets-repository.js:32-64`, `repositories/annotations-repository.js:10-53` |
| US-21 | No cubierta | No hay calculo ni visualizacion de estadisticas de triples, cobertura, errores corregidos o disputas. Los campos de progreso no se actualizan. | `services/datasets-service.js:124-149`, `services/datasets-service.js:253-265`, `public/js/datasets.js:128-157` |
| US-22 | No cubierta | No existe gestion de roles. El modelo `User` solo tiene `email` y `password`, y las rutas usan autenticacion simple sin autorizacion por rol. | `prisma/schema.prisma:40-46`, `middlewares/auth.js:19-26`, `routes/datasets-api.js:14-20` |
| US-23 | No cubierta | Existe logging tecnico de peticiones/errores, pero no una funcionalidad de monitorizacion accesible por administrador. | `middlewares/request-log-middleware.js:119-155` |
| US-24 | No cubierta | No existe persistencia, API ni interfaz para configurar criterios de evaluacion personalizados. | ausencia de modelos/rutas/controladores/servicios de criterios |

## 2. Cobertura Por Funcionalidad

| Funcion | Estado | Historias afectadas | Observacion |
| --- | --- | --- | --- |
| Acceso, autenticacion y sesion | Cubierta | US-01 | Es el bloque mas consistente del sistema actual y el mejor cubierto por capas. |
| Catalogo de datasets accesibles | Cubierta | US-02 | Existe listado, permisos por dataset y navegacion basica desde la pantalla de tareas. |
| Visualizacion del contenido RDF | Parcial | US-03, US-04 | Se muestran triples y secciones, pero la UX real depende de `DEBUG` y no hay agrupacion por complejidad ni reserva exclusiva de bloques. |
| Escritura de anotaciones | Parcial | US-05, US-06 | El backend puede guardar anotaciones; el front no esta cableado de extremo a extremo por defecto. |
| Correccion asistida y alertas | Parcial | US-07, US-08, US-09, US-10, US-17 | Hay sugerencias, motivos de rechazo y validacion hibrida reglas+Ollama, pero faltan generacion inicial, cobertura determinista de triples y flujo de revisor. |
| Diversidad linguistica | No cubierta | US-10, US-18 | No se compara un conjunto de frases entre si ni se detectan duplicidades o baja variacion. |
| Revision humana | No cubierta | US-12, US-13, US-14 | No hay dominio funcional de revision. |
| Generacion automatica de texto/traduccion | No cubierta | US-15, US-16 | El agente IA solo valida; no genera borradores. |
| Subida de datasets | Parcial | US-19 | La importacion existe, pero sin restriccion por rol administrador. |
| Descarga de avances | No cubierta | US-20 | El XML expuesto no incorpora la tabla `Annotation`, por lo que no representa el avance real de anotacion. |
| Estadisticas y reporting | No cubierta | US-11, US-14, US-21 | Hay campos de progreso en `Dataset`, pero no logica de actualizacion ni dashboards. |
| Gobierno, roles y configuracion | No cubierta | US-22, US-23, US-24 | No hay roles, monitorizacion funcional ni criterios configurables. |

## 3. Cobertura Por Capas

Leyenda:
- `Si`: la capa existe y esta implementada para el area.
- `Parcial`: hay piezas, pero el flujo no esta cerrado o la capa esta desacoplada del uso real.
- `No`: no se ha encontrado implementacion para esa capa en el area.

| Area | Front | Manejadores / MW | Routers | Controladores | Servicios | Repos / BD | Integracion | Estado global |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acceso y sesion | Si | Si | Si | Si | Si | Si | Si | Cubierta |
| Catalogo de datasets | Si | Si | Si | Si | Si | Si | - | Cubierta |
| Visualizacion de dataset y secciones | Parcial | Si | Si | Si | Si | Si | - | Parcial |
| Flujo de anotacion | Parcial | Si | Si | Si | Si | Si | Parcial | Parcial |
| Validacion automatica / IA | Parcial | Si | Si | Si | Si | No | Parcial | Parcial |
| Revision humana | No | No | No | No | No | No | No | No cubierta |
| Estadisticas y reporting | Parcial | No | No | No | No | Parcial | No | No cubierta |
| Administracion avanzada | Parcial | Parcial | Parcial | Parcial | Parcial | Parcial | No | Parcial / incompleta |

Detalle por capas:
- Front:
  - Hay UI real para login, registro y listado de datasets.
  - La vista de anotacion (`public/js/annotations.js:9`) y la vista XML (`public/js/dataset-view.js:4`) siguen en modo `DEBUG`, por lo que hoy no representan el flujo real por defecto.
- Manejadores / middleware:
  - `middlewares/auth.js:5-26` protege paginas y APIs.
  - `middlewares/request-log-middleware.js:143-155` aporta logging tecnico, pero no una funcionalidad de monitorizacion para administradores.
- Routers:
  - El mapa real de la app se limita a `public`, `users`, `datasets`, `annotations` y `administrator` con `logout` (`app.js:52-58`).
  - No existen routers de revisor, estadisticas, roles, configuracion de criterios ni exportacion de avances.
- Controladores:
  - Hay controladores para usuarios, datasets y anotaciones.
  - No hay controladores para revision, reporting ni gobierno de usuarios.
- Servicios:
  - `services/datasets-service.js` y `services/annotations-service.js` soportan el nucleo actual.
  - `business/spanish-service.js` solo valida y guarda; no genera contenido.
- Repositorios / persistencia:
  - Existen repositorios para `User`, `Dataset` y `Annotation`.
  - No existen repositorios ni tablas para `Review`, `Role`, `Criteria`, `UserActivity` o similares.
  - `Annotation` guarda frases y `rejectionReason`, pero `getDatasetText()` no usa esas anotaciones para exportar avances.
- Integracion:
  - Hay integracion con MySQL/Prisma y con Ollama.
  - La integracion con Ollama sirve para validacion semantica, no para generacion de borradores.

## Hallazgos Estructurales Relevantes

- La cobertura funcional real hoy esta mas cerca de un "MVP de autenticacion + datasets + anotacion asistida" que de la plataforma completa descrita en `documentation/user_stories.txt`.
- El mayor desalineamiento entre backend y producto esta en el front:
  - `public/js/annotations.js:619-629`, `683-687`, `734-742`
  - `public/js/dataset-view.js:126-129`
- El mayor desalineamiento entre historias y dominio de datos esta en la ausencia de entidades de revision, rol, criterios y actividad.
- El mayor desalineamiento entre reporting y persistencia es que los porcentajes del dataset existen, pero no hay logica que los recalcule tras anotar o revisar.

## Soporte De Verificacion Ya Presente En El Repo

Hay tests existentes que respaldan parte de la cobertura tecnica actual, aunque no se han ejecutado en esta auditoria:

- Acceso y sesion:
  - `tests/users-controller.test.js`
  - `tests/users-service.test.js`
  - `tests/users-database.test.js`
  - `tests/login-session.test.js`
  - `tests/auth-routing.test.js`
- Datasets:
  - `tests/datasets-controller.test.js`
  - `tests/datasets-service.test.js`
  - `tests/datasets-router.test.js`
- Anotacion y validacion:
  - `tests/annotations-controller.test.js`
  - `tests/annotations-service.test.js`
  - `tests/annotations-router.test.js`
  - `tests/spanish-service-persistence.test.js`
  - `tests/ollama-spanish-checker.test.js`

No se ha encontrado una bateria funcional equivalente para revision humana, roles, estadisticas, exportacion de avances ni criterios configurables, lo que es coherente con la ausencia de esas capacidades en el codigo.

## Conclusion

El sistema actual cubre bien el acceso y el catalogo de datasets, y cubre de forma parcial la anotacion asistida y la validacion automatica. El resto de la vision funcional definida en las historias de usuario todavia no esta implementada o solo aparece insinuada en piezas tecnicas aisladas.
