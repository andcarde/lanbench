'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('navigation contract', () => {
    it('datasets.js mantiene el contrato de navegación con datasetId y sectionIndex', () => {
        const filePath = path.join(__dirname, '..', 'public', 'js', 'datasets.js');
        const content = fs.readFileSync(filePath, 'utf8');

        assert.ok(content.includes('sectionIndex='), 'datasets.js debe propagar sectionIndex en la URL');
        assert.ok(content.includes('datasetId='), 'datasets.js debe propagar datasetId en la URL');
        assert.ok(content.includes('/annotations?'), 'datasets.js debe construir la navegación a /annotations');
        assert.ok(content.includes('/view?datasetId='), 'datasets.js debe construir la navegación a la vista del dataset');
    });

    it('annotations.js documenta y conserva datasetId, sectionIndex y entryId en la URL', () => {
        const filePath = path.join(__dirname, '..', 'public', 'js', 'annotations.js');
        const content = fs.readFileSync(filePath, 'utf8');

        assert.ok(content.includes("params.get('datasetId')"), 'annotations.js debe leer datasetId');
        assert.ok(content.includes("params.get('sectionIndex')"), 'annotations.js debe leer sectionIndex');
        assert.ok(content.includes("params.get('entryId')"), 'annotations.js debe leer entryId');
        assert.ok(content.includes('history.replaceState'), 'annotations.js debe estabilizar la URL al navegar entre entries');
    });

    it('dataset-view expone volver al listado y transición explícita a anotación', () => {
        const htmlPath = path.join(__dirname, '..', 'public', 'dataset-view.html');
        const jsPath = path.join(__dirname, '..', 'public', 'js', 'dataset-view.js');
        const html = fs.readFileSync(htmlPath, 'utf8');
        const script = fs.readFileSync(jsPath, 'utf8');

        assert.ok(html.includes('href="/tasks"'), 'dataset-view.html debe volver al listado canónico');
        assert.ok(html.includes('id="openAnnotationsLink"'), 'dataset-view.html debe incluir CTA a anotación');
        assert.ok(script.includes('sectionIndex'), 'dataset-view.js debe conservar sectionIndex');
        assert.ok(script.includes('/annotations?'), 'dataset-view.js debe construir la navegación a anotación');
    });

    it('annotations.html ofrece un botón de vuelta estable al listado', () => {
        const htmlPath = path.join(__dirname, '..', 'public', 'annotations.html');
        const html = fs.readFileSync(htmlPath, 'utf8');

        assert.ok(html.includes('id="backToTasksLink"'));
        assert.ok(html.includes('href="/tasks"'));
    });
});
