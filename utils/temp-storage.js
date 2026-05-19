'use strict';

/**
 * @file Almacenamiento temporal de uploads.
 *
 * Aisla los ficheros subidos por la aplicacion en `<tmpdir>/lanbench/uploads`,
 * y ofrece helpers para descubrir candidatos en directorios temporales
 * legacy (`/tmp`) durante migraciones.
 */

const { mkdirSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

/** Directorio temporal especifico de la aplicacion (creado bajo demanda). */
const TEMP_STORAGE_DIR = path.join(tmpdir(), 'lanbench', 'uploads');
/** Directorio temporal legacy compatible con sistemas Unix. */
const LEGACY_TEMP_DIR = '/tmp';

/**
 * Garantiza que el directorio temporal de uploads existe y devuelve su ruta.
 *
 * @returns {string}
 */
function ensureTempStorageDir() {
    mkdirSync(TEMP_STORAGE_DIR, { recursive: true });
    return TEMP_STORAGE_DIR;
}

/**
 * Valida y normaliza un nombre de fichero temporal usando solo su basename.
 * @param {*} filename - Nombre o ruta recibida.
 * @returns {string} Basename seguro.
 */
function normalizeFilename(filename) {
    if (typeof filename !== 'string' || filename.trim().length === 0)
        throw new Error('El nombre del fichero temporal es inválido.');

    return path.basename(filename.trim());
}

/**
 * Construye la ruta canonica para un fichero temporal en el directorio de la app.
 * @param {*} filename - Nombre del fichero.
 * @returns {string} Ruta absoluta.
 */
function resolveTempFilePath(filename) {
    return path.join(ensureTempStorageDir(), normalizeFilename(filename));
}

/**
 * Devuelve las rutas candidatas (app + legacy /tmp) para encontrar un fichero temporal.
 * @param {*} filename - Nombre del fichero.
 * @returns {Array<string>} Rutas candidatas en orden de preferencia.
 */
function listCandidateTempFilePaths(filename) {
    const normalizedFilename = normalizeFilename(filename);

    return [
        path.join(ensureTempStorageDir(), normalizedFilename),
        path.join(LEGACY_TEMP_DIR, normalizedFilename)
    ];
}

/**
 * Devuelve la primera ruta candidata existente o la canonica si no existe ninguna.
 * @param {*} filename - Nombre del fichero.
 * @returns {string} Ruta a usar para lecturas.
 */
function resolveExistingTempFilePath(filename) {
    const candidates = listCandidateTempFilePaths(filename);
    const existingPath = candidates.find((/** @type {*} */ candidate) => existsSync(candidate));

    if (existingPath)
        return existingPath;

    return candidates[0];
}

module.exports = {
    TEMP_STORAGE_DIR,
    ensureTempStorageDir,
    resolveTempFilePath,
    resolveExistingTempFilePath,
    listCandidateTempFilePaths
};
