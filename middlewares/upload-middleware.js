'use strict';

/**
 * Middleware Multer que almacena el fichero subido en un directorio temporal
 * namespaced de la aplicación dentro del tmp del sistema.
 */

const multer = require('multer');
const { randomBytes } = require('node:crypto');
const { ensureTempStorageDir } = require('../utils/temp-storage');

const destinationDirectory = ensureTempStorageDir();

const storage = multer.diskStorage({
  destination: destinationDirectory,

    filename(req, file, cb) {
        const prefix = randomBytes(8).toString('hex');
        const filename = `${prefix}_${file.originalname}`;
        cb(null, filename);
    }
});

function xmlFilter(req, file, cb) {
    const isXmlMime = file.mimetype === 'text/xml'
        || file.mimetype === 'application/xml';
    const isXmlExt = file.originalname.toLowerCase().endsWith('.xml');

    if (isXmlMime || isXmlExt) {
        cb(null, true);
    } else {
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Solo se admiten ficheros XML.'));
    }
}

const upload = multer({
    storage,
    fileFilter: xmlFilter,
    limits: { fileSize: 50 * 1024 * 1024 }
});

module.exports = upload;
