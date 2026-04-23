'use strict';

const { mkdirSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const TEMP_STORAGE_DIR = path.join(tmpdir(), 'lanbench', 'uploads');
const LEGACY_TEMP_DIR = '/tmp';

function ensureTempStorageDir() {
    mkdirSync(TEMP_STORAGE_DIR, { recursive: true });
    return TEMP_STORAGE_DIR;
}

function normalizeFilename(filename) {
    if (typeof filename !== 'string' || filename.trim().length === 0)
        throw new Error('El nombre del fichero temporal es inválido.');

    return path.basename(filename.trim());
}

function resolveTempFilePath(filename) {
    return path.join(ensureTempStorageDir(), normalizeFilename(filename));
}

function listCandidateTempFilePaths(filename) {
    const normalizedFilename = normalizeFilename(filename);

    return [
        path.join(ensureTempStorageDir(), normalizedFilename),
        path.join(LEGACY_TEMP_DIR, normalizedFilename)
    ];
}

function resolveExistingTempFilePath(filename) {
    const candidates = listCandidateTempFilePaths(filename);
    const existingPath = candidates.find(candidate => existsSync(candidate));

    if (existingPath)
        return existingPath;

    return candidates[0];
}

module.exports = {
    LEGACY_TEMP_DIR,
    TEMP_STORAGE_DIR,
    ensureTempStorageDir,
    resolveTempFilePath,
    resolveExistingTempFilePath,
    listCandidateTempFilePaths
};
