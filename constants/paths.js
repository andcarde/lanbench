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
 * Directory that contains the test datasets (`test-datasets/`).
 * @type {string}
 */
const TEST_DATA_PATH = path.resolve(__dirname, '..', 'test-datasets');

module.exports = {
    TEST_DATA_PATH
};
