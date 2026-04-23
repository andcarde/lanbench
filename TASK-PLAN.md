# TASK-PLAN — T0.1: Externalizar DEBUG a variable de entorno

Fecha: 2026-04-23

Referencia épica: `EPIC-PLAN.md` — Bloque E0, tarea T0.1

---

## Contexto

T0.1 resuelve el problema documentado en `EPIC-PLAN.md`:

> `public/js/annotations.js:9` y `public/js/dataset-view.js:4` tienen `DEBUG = true` como constante fija. Eso hace que en cualquier despliegue el front use datos mock, ignorando el backend real.

---

## Enfoque elegido

Separar la lógica de `public/js/` en dos capas:

1. **Ficheros JS normales** (`public/js/`) — lógica de UI sin llamadas AJAX.
2. **Ficheros de acciones** (`public/js/actions/`) — todas las peticiones AJAX al servidor.

Para el modo debug/demo se crea la carpeta `front-mocks/` con ficheros que replican la misma interfaz de funciones que `public/js/actions/` pero devuelven datos mock estáticos.

El mecanismo de toggle es un comando `npm run front-debug` que intercambia las carpetas:

- **Activar modo debug:** mueve `public/js/actions/` → `front-mocks/` y `ajax/` → `public/js/actions/`
- **Desactivar modo debug:** operación inversa

Criterios que guiaron la elección:
- Sin dependencias adicionales (MSW requiere reconfigurar arquitectura; json-server añade un servidor externo).
- Compatibilidad con paradigma "Only One Page" (HTML + CSS para constantes, lógica en JS).
- Las páginas siguen funcionando con doble-click sin levantar servidor (modo debug).
- La carpeta `front-mocks/` no se despliega en producción; es solo un artefacto de desarrollo local.

---

## Plan de subtareas

| # | Subtarea | Archivos afectados | Estado |
|---|---|---|---|
| ST0.1.1 | Extraer las 3 llamadas AJAX de `annotations.js` a `public/js/actions/annotations-actions.js` con interfaz de funciones limpia; actualizar `annotations.html` para incluir el nuevo script | `annotations.js`, `annotations.html`, nuevo `actions/annotations-actions.js` | **HECHA** |
| ST0.1.2 | Extraer la llamada AJAX de `dataset-view.js` a `public/js/actions/dataset-view-actions.js`; actualizar `dataset-view.html` | `dataset-view.js`, `dataset-view.html`, nuevo `actions/dataset-view-actions.js` | **HECHA** |
| ST0.1.3 | Crear `front-mocks/annotations-actions.js` y `front-mocks/dataset-view-actions.js` con los datos mock actuales (`MOCK_SECTION`, `DEBUG_DATASET_TEXT`) replicando la misma interfaz de funciones | nuevos ficheros en `front-mocks/` | **HECHA** |
| ST0.1.4 | Eliminar de `annotations.js` y `dataset-view.js` las constantes `DEBUG`, `MOCK_SECTION`, `DEBUG_DATASET_TEXT` y todos los bloques `if (DEBUG)` ya extraídos | `annotations.js`, `dataset-view.js` | **HECHA** |
| ST0.1.5 | Crear `scripts/front-debug.js` (Node.js) con la lógica de toggle e integrarlo en `package.json` como `npm run front-debug` | `package.json`, nuevo `scripts/front-debug.js` | **HECHA** |

**Todas las subtareas completadas.**

---

## Condición de verificación (de EPIC-PLAN.md)

Con `DEBUG_MODE=false` (es decir, carpeta `public/js/actions/` con los ficheros reales activos), las pantallas de anotación y vista XML llaman a los endpoints reales y no cargan datos estáticos.
