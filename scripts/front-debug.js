const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ACTIONS = path.join(ROOT, 'public', 'js', 'actions');
const FRONT_MOCKS = path.join(ROOT, 'front-mocks');
const AJAX = path.join(ROOT, 'ajax');

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
