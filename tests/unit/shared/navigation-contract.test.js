'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('navigation contract', () => {
    it('datasets.js mantiene el contrato de navegación con datasetId y sectionIndex', () => {
        const filePath = path.join(__dirname, '..', '..', '..', 'public', 'js', 'datasets.js');
        const content = fs.readFileSync(filePath, 'utf8');

        assert.ok(content.includes('sectionIndex='), 'datasets.js debe propagar sectionIndex en la URL');
        assert.ok(content.includes('datasetId='), 'datasets.js debe propagar datasetId en la URL');
        assert.ok(content.includes('/annotations?'), 'datasets.js debe construir la navegación a /annotations');
        assert.ok(content.includes('/view?datasetId='), 'datasets.js debe construir la navegación a la vista del dataset');
    });

    it('annotations.js solo lee datasetId de la URL y delega seccion/entry al servidor', () => {
        const annotationsJs = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'public', 'js', 'annotations.js'),
            'utf8'
        );
        const annotationsActionsJs = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'public', 'js', 'actions', 'annotations-actions.js'),
            'utf8'
        );

        assert.ok(annotationsJs.includes("params.get('datasetId')"), 'annotations.js debe leer datasetId');
        assert.ok(!annotationsJs.includes("params.get('sectionIndex')"), 'annotations.js no debe leer sectionIndex (lo decide el servidor vía /continue + /next)');
        assert.ok(!annotationsJs.includes("params.get('entryId')"), 'annotations.js no debe leer entryId (lo decide el servidor vía /next)');
        assert.ok(annotationsJs.includes('history.replaceState'), 'annotations.js debe estabilizar la URL del datasetId');
        assert.ok(annotationsJs.includes('fetchContinueAnnotation'), 'annotations.js debe arrancar la sesión vía fetchContinueAnnotation');
        assert.ok(annotationsJs.includes('fetchNextEntry'), 'annotations.js debe leer la entry actual vía fetchNextEntry');
        assert.ok(annotationsActionsJs.includes('/api/annotations/'), 'annotations-actions.js debe consumir el surface /api/annotations');
    });

    it('dataset-view es un visor de solo lectura y no expone CTA de anotación', () => {
        const htmlPath = path.join(__dirname, '..', '..', '..', 'public', 'dataset-view.html');
        const jsPath = path.join(__dirname, '..', '..', '..', 'public', 'js', 'dataset-view.js');
        const html = fs.readFileSync(htmlPath, 'utf8');
        const script = fs.readFileSync(jsPath, 'utf8');

        assert.ok(html.includes('href="/datasets"'), 'dataset-view.html debe volver al listado canónico');
        assert.ok(!html.includes('id="openAnnotationsLink"'), 'dataset-view.html no debe exponer una CTA a anotación');
        assert.ok(!script.includes('/annotations?'), 'dataset-view.js no debe construir navegación a anotación');
    });

    it('annotations.html ofrece un botón de vuelta estable al listado', () => {
        const htmlPath = path.join(__dirname, '..', '..', '..', 'public', 'annotations.html');
        const html = fs.readFileSync(htmlPath, 'utf8');

        assert.ok(html.includes('id="backToTasksLink"'));
        assert.ok(html.includes('href="/datasets"'));
    });
});
