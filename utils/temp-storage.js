'use strict';

/**
 * @file Temporary storage for uploads.
 *
 * Isolates files uploaded by the application in `<tmpdir>/lanbench/uploads`,
 * and offers helpers to discover candidates in legacy temporary directories
 * (`/tmp`) during migrations.
 */

const { mkdirSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

/** Application-specific temporary directory (created on demand). */
const TEMP_STORAGE_DIR = path.join(tmpdir(), 'lanbench', 'uploads');
/** Legacy temporary directory compatible with Unix systems. */
const LEGACY_TEMP_DIR = '/tmp';

/**
 * Ensures the temporary uploads directory exists and returns its path.
 *
 * @returns {string}
 */
function ensureTempStorageDir() {
    mkdirSync(TEMP_STORAGE_DIR, { recursive: true });
    return TEMP_STORAGE_DIR;
}

/**
 * Validates and normalizes a temporary filename using only its basename.
 * @param {*} filename - Received name or path.
 * @returns {string} Safe basename.
 */
function normalizeFilename(filename) {
    if (typeof filename !== 'string' || filename.trim().length === 0)
        throw new Error('El nombre del fichero temporal es inválido.');

    return path.basename(filename.trim());
}

/**
 * Builds the canonical path for a temporary file in the app's directory.
 * @param {*} filename - File name.
 * @returns {string} Absolute path.
 */
function resolveTempFilePath(filename) {
    return path.join(ensureTempStorageDir(), normalizeFilename(filename));
}

/**
 * Returns the candidate paths (app + legacy /tmp) to find a temporary file.
 * @param {*} filename - File name.
 * @returns {Array<string>} Candidate paths in order of preference.
 */
function listCandidateTempFilePaths(filename) {
    const normalizedFilename = normalizeFilename(filename);

    return [
        path.join(ensureTempStorageDir(), normalizedFilename),
        path.join(LEGACY_TEMP_DIR, normalizedFilename)
    ];
}

/**
 * Returns the first existing candidate path, or the canonical one if none exist.
 * @param {*} filename - File name.
 * @returns {string} Path to use for reads.
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
