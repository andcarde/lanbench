# MEMORY-PROBLEMS-4 — Auditoría de la memoria del TFM independiente

- **Fecha:** 2026-06-25.
- **Estado del repositorio:** rama `main`, último commit `baa9d2ed v0.5.1`.
- **Naturaleza:** auditoría **independiente**. No se ha consultado `MEMORY-PROBLEMS-2.md` ni `MEMORY-PROBLEMS-3.md`; los hallazgos se han generado leyendo la memoria de cero y cruzando con el código y la documentación técnica únicamente cuando había una afirmación verificable. La reconciliación con `MEMORY-PROBLEMS-3.md` queda pendiente como tarea aparte (convención de documentos vivos).
- **Alcance auditado:**
    - `memory/include/Portada.tex`
    - `memory/include/Preambulo.tex`
    - `memory/_DatosTFM.tex`
    - `memory/secciones/00_Resumen.tex`
    - `memory/secciones/01_Introducción.tex`
    - `memory/secciones/02_Desarrollo.tex`
    - `memory/secciones/03_Herramientas.tex`
    - `memory/secciones/04_Aplicación.tex`
    - `memory/secciones/05_Experimento.tex`
    - `memory/secciones/06_Resultados.tex`
    - `memory/secciones/07_Anexos.tex`
    - `memory/include/referencias.bib`
- **Convención de identificadores:** `P<n>` para los hallazgos. Cada uno indica fichero, línea aproximada (referida al estado actual del repositorio) y severidad (`alta`, `media`, `baja`).

---

## 8. Pendiente de reconciliación con MEMORY-PROBLEMS-3.md

Esta auditoría es independiente y deliberadamente no ha consultado `MEMORY-PROBLEMS-3.md`. Una vez aprobada por el usuario, la convención de documentos vivos de `CLAUDE.md` exige:

1. Marcar en `MEMORY-PROBLEMS-3.md` los hallazgos ya cubiertos por esta versión o ya resueltos.
2. Migrar a `MEMORY-PROBLEMS-4.md` cualquier hallazgo de -3 que siga abierto y no esté aquí.
3. Eliminar `MEMORY-PROBLEMS-3.md` cuando todos sus puntos estén cerrados o trasladados.

Esa tarea se trazará como subtarea aparte (no incluida en la presente auditoría).
