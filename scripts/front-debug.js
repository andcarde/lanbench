'use strict';

/**
 * @file `node scripts/front-debug.js` — toggles between the real frontend
 * actions and the mocks (frontend disconnected from the backend).
 *
 * Repository state:
 *   - "real" mode:  `public/js/actions/` contains the real modules.
 *                    `ajax/` does not exist. `front-mocks/` may or may not exist.
 *   - "debug" mode: `public/js/actions/` contains the mocks. `ajax/`
 *                    temporarily holds the real modules and is deleted when
 *                    returning to real mode.
 *
 * The script detects the current state by checking whether `ajax/` exists and
 * applies the inverse transition, swapping files between the three directories.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ACTIONS = path.join(ROOT, 'public', 'js', 'actions');
const FRONT_MOCKS = path.join(ROOT, 'front-mocks');
const AJAX = path.join(ROOT, 'ajax');

/**
 * Moves each file from the `from` directory to the `to` directory. It is not
 * recursive (intentional: both directories are flat).
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
