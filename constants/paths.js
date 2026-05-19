'use strict';

/**
 * @file Path helpers anchored at the project root.
 *
 * Centralising these here prevents accidental drift when modules live deep in
 * nested directories: they should always resolve paths against the project
 * root rather than `__dirname`.
 */

const path = require('node:path');

/**
 * Directorio raiz del proyecto (un nivel por encima de `constants/`).
 * @type {string}
 */
const PROJECT_ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Directorio que contiene los datasets de prueba (`test_datasets/`).
 * @type {string}
 */
const TEST_DATA_PATH = path.join(PROJECT_ROOT_DIR, 'test_datasets');

/**
 * Resuelve una ruta a partir de la raiz del proyecto.
 *
 * @param {...string} segments - Segmentos de ruta relativos a la raiz.
 * @returns {string} Ruta absoluta resultante.
 */
function fromProjectRoot(...segments) {
    return path.join(PROJECT_ROOT_DIR, ...segments);
}

module.exports = {
    PROJECT_ROOT_DIR,
    TEST_DATA_PATH,
    fromProjectRoot
};
