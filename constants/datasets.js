'use strict';

/**
 * @file Constantes globales relacionadas con la presentacion y el particionado
 * de datasets.
 */

/**
 * Clases CSS rotativas asignadas a los datasets para distinguirlos visualmente.
 * @type {string[]}
 */
const DATASET_COLORS = ['dataset-purple', 'dataset-violet', 'dataset-green-progress'];

/**
 * Tamano objetivo de cada seccion (numero de entries por bloque de trabajo).
 * @type {number}
 */
const SECTION_SIZE = 10;

/**
 * Idiomas declarados por defecto en un dataset cuando el origen no aporta
 * la lista explicitamente.
 * @type {string[]}
 */
const DEFAULT_LANGUAGES = ['Spanish', 'English'];

module.exports = {
    DATASET_COLORS,
    SECTION_SIZE,
    DEFAULT_LANGUAGES
};
