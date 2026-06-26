# MEMORY-PROBLEMS-3 - Auditoria viva de la memoria del TFM

Fecha de reevaluacion: 2026-06-24.

Este documento sustituye a `MEMORY-PROBLEMS-2.md`. Se ha revisado el estado actual de la memoria, la documentacion tecnica y el codigo de la aplicacion. Los hallazgos ya subsanados se han eliminado; los que siguen abiertos se han reformulado segun su manifestacion actual; y se han anadido problemas nuevos detectados tras las correcciones recientes.

## Cambios respecto a MEMORY-PROBLEMS-2

Hallazgos eliminados por estar resueltos en la memoria actual:

- Erratas originales: `manteniene`, `2020 y2023`, `Trabajo Fin de Master`, `BLEURT (solo en)`.
- Concordancia `este limitacion`.
- Coma en `modelos, prompts, versiones, y`.
- Referencia vaga `Seccion posterior`.
- Espacios originales antes de `\cite` y `\ref` detectados en Introduccion y Anexos.
- Falta de acronimos principales: RGPD/GDPR, GEM, SHACL/ShEx, MQM, SUS, EUPL, SaaS, SFT/RLHF, RPM/TPM/TPD y licencias CC ya figuran en el glosario.
- El uso original de `ground truth` en `05_Experimento.tex` fue sustituido.

Hallazgos que siguen abiertos, pero con manifestacion modificada:

- Los problemas de estilo ya no estan en las ubicaciones originales, pero han aparecido usos nuevos de `solo/ground truth` en `06_Resultados.tex`.
- La discrepancia de proveedores LLM ahora debe mencionar tambien la documentacion tecnica: el codigo soporta catalogos de OpenAI-compatible y Anthropic, pero `documentation/TECHNICAL-DESIGN.md` conserva texto antiguo que dice lo contrario.
- La discrepancia de revisiones adicionales afecta ahora a mas fuentes: memoria, `documentation/USER-STORIES.md` y `documentation/USER-STORIES-2.md` las tratan como inertes/pending, mientras el codigo y parte de `TECHNICAL-DESIGN.md` las describen como implementadas.

## Resumen ejecutivo actual

La memoria ha mejorado en redaccion formal, pero sigue desalineada con el estado funcional real de la aplicacion en varios puntos: recuento de pruebas, revisiones adicionales, proveedores personalizados, catalogos de modelos, criterios de evaluacion, permisos de propietario/administrador e invitaciones.

Los problemas mas urgentes antes de cierre son:

1. Actualizar la memoria y `documentation/TESTS.md` al recuento real de pruebas: 729 unitarias + 51 de integracion = 780.
2. Sincronizar la memoria con el codigo en revisiones adicionales y proveedores LLM.
3. Resolver la contradiccion de invitaciones: son trabajo futuro pero aparecen en escenarios manuales como si fueran ejecutables.
4. Matizar US-24: hay CRUD administrativo y tabla persistida, pero el flujo de revision sigue usando criterios fijos.
5. Revisar afirmaciones legales/licencias y el titulo para evitar sobrepromesa o afirmaciones sin soporte suficiente.

## Pasada 1 - Forma, formato y significado basico

### Estilo, ortografia y LaTeX

| Tipo | Ubicacion actual | Problema | Propuesta |
| --- | --- | --- | --- |
| Estilo RAE / consistencia | `memory/secciones/05_Experimento.tex:283`, `memory/secciones/06_Resultados.tex:102`, `06_Resultados.tex:201`, `06_Resultados.tex:230` | Persisten usos de `Sólo`/`sólo` introducidos o mantenidos fuera de TM1. | Unificar a `Solo`/`solo`, salvo que se decida conscientemente mantener la tilde diacritica por ambiguedad. |
| Anglicismo | `memory/secciones/06_Resultados.tex:232` | Nuevo uso de `\textit{ground truth}` tras haber sustituido el anterior en Experimento. | Usar `referencia de verdad`, `referencia humana` o definir el anglicismo una sola vez. |
| Formato LaTeX | `memory/secciones/06_Resultados.tex:51-52` | La referencia queda partida como `en` + nueva linea + `~\ref{...}`, equivalente al patron `en ~\ref`. | Escribir `en~\ref{sec:proposito-objetivos-trabajo}` en la misma unidad textual. |
| Comentario de plantilla | `memory/include/Preambulo.tex:3` | Comentario `Plantilla para TFG`. No afecta al PDF, pero sigue siendo ruido en fuentes TFM. | Cambiar a TFM o eliminar. |

### Titulo, alcance y naturalidad

| Tipo | Ubicacion actual | Problema | Propuesta |
| --- | --- | --- | --- |
| Titulo potencialmente desalineado | `memory/_DatosTFM.tex:15` | `Conjunto de Datos WebNLG en Espanol` puede sobreprometer un dataset espanol acabado. La memoria actual enfatiza plataforma, metodologia HITL y experimento reproducible. | Mantener solo si se explica que el producto principal es la infraestructura y una muestra/extension experimental; si no, valorar un titulo centrado en Lanbench/metodologia HITL. |
| Alcance ambiguo | `memory/secciones/01_Introducción.tex:205` | El objetivo aun dice que el trabajo habilita la tarea RDF->espanol "como la inversa". El codigo y experimento ejecutado se centran en generacion/verbalizacion en espanol. | Reformular la inversa como contexto o posibilidad futura, no como alcance funcional demostrado. |
| Referencia interna incorrecta | `memory/secciones/06_Resultados.tex:18` | La arquitectura por capas se dice descrita en el capitulo de experimentacion (`cha:experimentacion`). La arquitectura esta en el capitulo de aplicacion y en `fig:arquitectura-capas`. | Referenciar el capitulo/seccion/figura de arquitectura real. |

### Informacion externa o no atribuida suficientemente

| Tipo | Ubicacion actual | Problema | Propuesta |
| --- | --- | --- | --- |
| Cita/modelo exacto | `memory/secciones/04_Aplicación.tex:132` | `Llama~3 con 7\,000 millones de parametros` sigue siendo impreciso: la referencia tecnica comun de Llama 3 es 8B/70B, y la bibliografia nueva apunta a `Llama-3.3-70B-Versatile`, no a un 7B. | Verificar el modelo local realmente probado y citarlo/nombrarlo con precision. |
| Tono juridico/cita | `memory/secciones/07_Anexos.tex:682-717` | Las afirmaciones sobre EUPL, AGPL, compatibilidad y SaaS siguen formuladas con mucha seguridad juridica. | Citar texto oficial/FAQ de EUPL o rebajar a "criterio de seleccion" no juridico. |
| Licencia del corpus | `memory/secciones/07_Anexos.tex:722-727` | Se afirma que WebNLG se distribuye bajo Creative Commons BY-SA y que la extension espanola se publica bajo licencia identica, pero no se cita fuente concreta. | Anadir cita al repositorio/dataset/licencia oficial o matizar si solo se esta proponiendo una licencia derivada. |
| Reproducibilidad de prompts | `memory/secciones/06_Resultados.tex:71-74`, `memory/secciones/07_Anexos.tex:614-643` | Se habla de `prompts`/instrucciones suministradas, pero el anexo reproduce literalmente solo el prompt de sistema de generacion; el `user prompt` se describe y no quedan igualmente reproducidos prompts de correccion/validacion si forman parte del flujo. | Ajustar singular/plural o anadir los prompts faltantes. |

## Pasada 2 - Verificacion contra la aplicacion

### Arquitectura y proveedores LLM

| Area | Memoria/documentacion | Codigo verificado | Problema actual |
| --- | --- | --- | --- |
| Proveedores personalizados | `memory/secciones/04_Aplicación.tex:92-93`, `07_Anexos.tex:541-555` | `prisma/schema.prisma` incluye `DatasetCustomProvider`; existen rutas `/api/datasets/:id/custom-providers`, controlador, servicio, repositorio y UI en `public/js/dataset-admin.js`. | La memoria sigue omitiendo una funcionalidad real: proveedores personalizados por dataset. |
| Catalogo de modelos | `memory/secciones/04_Aplicación.tex:441-442` limita US-35 a Groq/Google. | `utils/llm-model-catalog.js` soporta Groq, Google AI Studio, OpenAI-compatible y Anthropic. | La memoria esta desactualizada para US-35. |
| Anthropic y OpenAI-compatible | `memory/secciones/06_Resultados.tex:35-36` presenta Anthropic como intercambiable via cliente OpenAI-compatible. | `utils/llm-client.js` enruta Anthropic a `utils/anthropic-client.js`; OpenAI-compatible usa cliente generico. | Debe hablarse de abstraccion/despachador por proveedor, no de una unica compatibilidad OpenAI. |
| Documentacion tecnica desactualizada | `documentation/TECHNICAL-DESIGN.md:886-899` | El codigo ya soporta catalogos de Anthropic/OpenAI-compatible, pero esa seccion dice que no tienen soporte de catalogo. | Nuevo problema: la documentacion tecnica contradice al codigo en catalogos de modelos. |

### Modelo de datos, roles y permisos

| Area | Memoria/documentacion | Codigo verificado | Problema actual |
| --- | --- | --- | --- |
| Modelo ER | `memory/secciones/07_Anexos.tex:135-361` | El esquema real incluye `DatasetCustomProvider` y relaciones asociadas. | El anexo ER omite una tabla real de configuracion LLM. |
| Propiedad/admin | `memory/secciones/04_Aplicación.tex:258-270` | `Permit.isOwned` ya existe; `assertDatasetAdminPermission` concede administracion a `isAdmin || isOwned`; `renameDataset` y `deleteDataset` usan ese permiso. | La memoria presenta la propiedad como evolucion futura y afirma que el propietario sera el unico con ciertas capacidades, pero en codigo un admin del dataset tambien puede administrar. |
| Unicidad por propietario | `memory/secciones/04_Aplicación.tex:463`, `07_Anexos.tex:550` | El codigo aplica unicidad por propietario en creacion/renombrado. | Esta parte es coherente, pero debe armonizarse con el punto anterior para no confundir propietario con administrador. |

### Historias de usuario y funcionalidad

| Tema | Memoria/documentacion | Codigo verificado | Problema actual |
| --- | --- | --- | --- |
| US-24 - criterios de evaluacion | `memory/secciones/04_Aplicación.tex:312`, `04_Aplicación.tex:471-473`, `06_Resultados.tex:135-139`; `documentation/USER-STORIES-2.md:932-945` | Hay CRUD administrativo (`/api/admin/evaluation-criteria`) y tabla `EvaluationCriterion`, pero el revisor usa `constants/review-criterion.js`. | La formulacion "pendiente" es demasiado gruesa: debe decir "parcialmente implementado; pendiente de conectar como fuente efectiva del flujo de revision". |
| Revisiones adicionales | `memory/secciones/06_Resultados.tex:140-143`, `07_Anexos.tex:548-549`; `documentation/USER-STORIES.md:1167`, `USER-STORIES-2.md:1010` | `services/reviews-service.js` implementa rondas adicionales con `roundIndex`, `cleanRound` y mutacion de anotacion entre rondas; `TECHNICAL-DESIGN.md:533-569` lo documenta. | Memoria y documentos de historias siguen describiendo la funcion como inerte/pending. |
| Invitaciones | `memory/secciones/06_Resultados.tex:144-146` y escenarios `S2/S4` en `06_Resultados.tex:317-319` | No se ha encontrado flujo de invitacion por URL para dataset/rol; existen codigos de registro de moderador (`RegisterCode`), que son otra cosa. | Contradiccion: se declaran futuras pero se incluyen como pruebas manuales ejecutables. |
| Documentos de historias duplicados/desalineados | `documentation/USER-STORIES.md` y `documentation/USER-STORIES-2.md` | Ambos conviven y no siempre coinciden con codigo ni entre si. | La memoria deberia citar la fuente vigente o el repositorio deberia retirar/marcar obsoleta la version no canonica. |

### Pruebas automatizadas

La memoria y `documentation/TESTS.md` siguen indicando 672 pruebas: 626 unitarias + 46 de integracion.

Verificacion actual ejecutada el 2026-06-24:

- `npx mocha "tests/unit/**/*.test.js" --dry-run --reporter dot --exit`: 729 pruebas unitarias.
- `npx mocha "tests/integration/**/*.test.js" --dry-run --reporter dot --exit`: 51 pruebas de integracion.
- `npx mocha "tests/{unit,integration}/**/*.test.js" --dry-run --reporter dot --exit`: 780 pruebas en total.

Ubicaciones que siguen obsoletas:

- `memory/secciones/04_Aplicación.tex:813`, `04_Aplicación.tex:820`, `04_Aplicación.tex:834`, `04_Aplicación.tex:865-868`, `04_Aplicación.tex:878`.
- `documentation/TESTS.md:38`, `documentation/TESTS.md:654`, `documentation/TESTS.md:1060`.

## Acciones recomendadas actualizadas

1. Corregir las discrepancias funcionales de mayor impacto: revisiones adicionales, proveedores personalizados, catalogos de modelos, permisos propietario/admin, US-24 e invitaciones.
2. Actualizar recuentos de pruebas en memoria y `documentation/TESTS.md` con los 780 casos detectados.
3. Decidir fuente canonica de historias de usuario y sincronizarla con codigo y memoria.
4. Revisar titulo/alcance para no prometer un dataset espanol completo si el resultado central es plataforma + experimento reproducible.
5. Revisar citas legales/licencias y prompts reproducibles.
6. Hacer una pasada final de estilo en `06_Resultados.tex` y recompilar.
