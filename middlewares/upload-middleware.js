'use strict';

/**
 * @file Multer-based upload middleware.
 *
 * Builds a Multer middleware that stores the uploaded file in a `namespaced`
 * temporary directory of the application (resolved on each invocation so as
 * not to couple `require()` to a specific disk), accepting only XML by mime or
 * extension.
 */

const multer = require('multer');
const { randomBytes } = require('node:crypto');
const { ensureTempStorageDir } = require('../utils/temp-storage');

/** @type {number} Default maximum accepted size (50 MiB). */
const DEFAULT_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

/**
 * Options accepted by {@link createUploadMiddleware}.
 *
 * @typedef {Object} UploadMiddlewareOptions
 * @property {string} [destinationDirectory] - Destination directory. If
 *   omitted, `utils/temp-storage#ensureTempStorageDir` is used.
 * @property {number} [fileSizeLimit]        - Maximum size (bytes). Default: 50 MiB.
 */

/**
 * Builds a Multer middleware configured to receive XML.
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
 * Multer filter: only accepts XML files detected by mime or by the `.xml`
 * extension.
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
