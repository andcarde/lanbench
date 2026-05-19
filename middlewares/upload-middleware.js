'use strict';

/**
 * @file Multer-based upload middleware.
 *
 * Construye un middleware Multer que almacena el fichero subido en un
 * directorio temporal `namespaced` de la aplicacion (resuelto en cada
 * invocacion para no acoplar `require()` a un disco concreto), aceptando
 * solo XML por mime o extension.
 */

const multer = require('multer');
const { randomBytes } = require('node:crypto');
const { ensureTempStorageDir } = require('../utils/temp-storage');

/** @type {number} Tamano maximo aceptado por defecto (50 MiB). */
const DEFAULT_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

/**
 * Opciones aceptadas por {@link createUploadMiddleware}.
 *
 * @typedef {Object} UploadMiddlewareOptions
 * @property {string} [destinationDirectory] - Directorio de destino. Si se
 *   omite, se usa `utils/temp-storage#ensureTempStorageDir`.
 * @property {number} [fileSizeLimit]        - Tamano maximo (bytes). Defecto: 50 MiB.
 */

/**
 * Construye un middleware Multer configurado para recibir XML.
 *
 * @param {UploadMiddlewareOptions} [options]
 * @returns {import('multer').Multer}
 */
function createUploadMiddleware({ destinationDirectory, fileSizeLimit = DEFAULT_FILE_SIZE_LIMIT } = {}) {
    const resolvedDestination = destinationDirectory || ensureTempStorageDir();

    const storage = multer.diskStorage({
        destination: resolvedDestination,
        filename(_req, file, cb) {
            const prefix = randomBytes(8).toString('hex');
            cb(null, `${prefix}_${file.originalname}`);
        }
    });

    return multer({
        storage,
        fileFilter: xmlFilter,
        limits: { fileSize: fileSizeLimit }
    });
}

/**
 * Filtro Multer: solo admite ficheros XML detectados por mime o por
 * extension `.xml`.
 *
 * @param {import('express').Request} _req
 * @param {Express.Multer.File} file
 * @param {multer.FileFilterCallback} cb
 * @returns {void}
 */
function xmlFilter(_req, file, cb) {
    const isXmlMime = file.mimetype === 'text/xml'
        || file.mimetype === 'application/xml';
    const isXmlExt = file.originalname.toLowerCase().endsWith('.xml');

    if (isXmlMime || isXmlExt) {
        cb(null, true);
    } else {
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Solo se admiten ficheros XML.'));
    }
}

module.exports = {
    createUploadMiddleware
};
