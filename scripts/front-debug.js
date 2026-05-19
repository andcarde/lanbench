'use strict';

/**
 * @file `node scripts/front-debug.js` — alterna entre las acciones reales
 * del frontend y los mocks (frontend desconectado del backend).
 *
 * Estado del repositorio:
 *   - Modo "real":  `public/js/actions/` contiene los modulos reales.
 *                    No existe `ajax/`. `front-mocks/` puede existir o no.
 *   - Modo "debug": `public/js/actions/` contiene los mocks. `ajax/`
 *                    guarda temporalmente los modulos reales y se borrara
 *                    al volver a modo real.
 *
 * El script detecta el estado actual observando si existe `ajax/` y aplica
 * la transicion inversa, intercambiando ficheros entre los tres directorios.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ACTIONS = path.join(ROOT, 'public', 'js', 'actions');
const FRONT_MOCKS = path.join(ROOT, 'front-mocks');
const AJAX = path.join(ROOT, 'ajax');

/**
 * Mueve cada fichero del directorio `from` al directorio `to`. No es
 * recursivo (intencional: ambos directorios son planos).
 *
 * @param {string} from
 * @param {string} to
 * @returns {void}
 */
function moveFiles(from, to) {
    fs.readdirSync(from).forEach(file => {
        fs.renameSync(path.join(from, file), path.join(to, file));
    });
}

const isDebugActive = fs.existsSync(AJAX);

if (isDebugActive) {
    fs.mkdirSync(FRONT_MOCKS);
    moveFiles(ACTIONS, FRONT_MOCKS);
    moveFiles(AJAX, ACTIONS);
    fs.rmSync(AJAX, { recursive: true });
    console.log('Modo debug DESACTIVADO — ficheros reales activos en public/js/actions/');
} else {
    if (!fs.existsSync(FRONT_MOCKS)) {
        console.error('Error: no existe front-mocks/. No hay mocks disponibles para activar.');
        process.exit(1);
    }
    fs.mkdirSync(AJAX);
    moveFiles(ACTIONS, AJAX);
    moveFiles(FRONT_MOCKS, ACTIONS);
    fs.rmSync(FRONT_MOCKS, { recursive: true });
    console.log('Modo debug ACTIVADO — mocks activos en public/js/actions/');
}
