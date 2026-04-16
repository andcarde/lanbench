'use strict';

const datasetColors = ['dataset-purple', 'dataset-violet', 'dataset-green-progress'];

let nextDatasetId = 4;
const datasets = [
    {
        idDataset: 1,
        id: 'dataset-1',
        name: 'DATASET 1',
        description: 'Conjunto de ejemplo para tareas de generación y revisión en español.',
        source: 'Lanbench Curated',
        languagePair: 'RDF -> ES',
        records: 3000,
        status: 'ready',
        updatedAt: '2026-03-10',
        sentenceLabel: 'Oración 1:',
        triplesRDF: 3000,
        languages: ['Spanish', 'English'],
        completedPercent: 100,
        withoutReviewPercent: 0,
        remainPercent: 0,
        colorClass: 'dataset-purple'
    },
    {
        idDataset: 2,
        id: 'dataset-2',
        name: 'DATASET 2',
        description: 'Partición de validación para control de calidad de anotaciones.',
        source: 'Lanbench Curated',
        languagePair: 'RDF -> ES',
        records: 3000,
        status: 'ready',
        updatedAt: '2026-03-21',
        sentenceLabel: 'Oración 2:',
        triplesRDF: 3000,
        languages: ['Spanish', 'English'],
        completedPercent: 100,
        withoutReviewPercent: 0,
        remainPercent: 0,
        colorClass: 'dataset-violet'
    },
    {
        idDataset: 3,
        id: 'dataset-3',
        name: 'DATASET 3',
        description: 'Dataset en progreso con muestras para revisión asistida.',
        source: 'Lanbench Curated',
        languagePair: 'RDF -> ES',
        records: 3000,
        status: 'in_progress',
        updatedAt: '2026-03-30',
        sentenceLabel: 'Oración 3:',
        triplesRDF: 3000,
        languages: ['Spanish', 'English'],
        completedPercent: 33,
        withoutReviewPercent: 42,
        remainPercent: 25,
        colorClass: 'dataset-green-progress'
    }
];

function listDatasets(request, response) {
    return response.status(200).json(datasets);
}

function getDatasetById(request, response) {
    const idDataset = toInteger(request.params.id);
    if (idDataset === null)
        return response.status(400).json({ message: 'El id del dataset es inválido.' });

    const dataset = findDatasetById(idDataset);
    if (!dataset)
        return response.status(404).json({ message: 'Dataset no encontrado.' });

    return response.status(200).json(dataset);
}

function createDataset(request, response) {
    const payload = {
        name: request.body.name,
        entries: request.body.entries
    };

    const validationError = validateCreateDatasetPayload(payload);
    if (validationError)
        return response.status(400).json({ message: validationError });

    const normalizedName = payload.name.trim();
    const index = datasets.length + 1;
    const dataset = {
        idDataset: nextDatasetId++,
        id: buildSlug(normalizedName, index),
        name: normalizedName,
        description: 'Dataset creado desde la interfaz web.',
        source: 'Lanbench User',
        languagePair: 'RDF -> ES',
        records: payload.entries,
        status: 'ready',
        updatedAt: new Date().toISOString().slice(0, 10),
        sentenceLabel: `Oración ${index}:`,
        triplesRDF: payload.entries,
        languages: ['Spanish', 'English'],
        completedPercent: 0,
        withoutReviewPercent: 0,
        remainPercent: 100,
        colorClass: datasetColors[(index - 1) % datasetColors.length]
    };

    datasets.push(dataset);
    return response.status(201).json({
        ok: true,
        idDataset: dataset.idDataset,
        dataset
    });
}

function validateCreateDatasetPayload(payload) {
    if (typeof payload.name !== 'string')
        return 'El nombre del dataset es obligatorio.';

    const normalizedName = payload.name.trim();
    if (normalizedName.length === 0 || normalizedName.length > 128)
        return 'El nombre del dataset debe tener entre 1 y 128 caracteres.';

    if (!Number.isInteger(payload.entries) || payload.entries < 0)
        return 'El campo entries debe ser un entero positivo o cero.';

    return null;
}

function buildSlug(name, index) {
    const baseSlug = name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

    return baseSlug.length > 0 ? baseSlug : `dataset-${index}`;
}

function findDatasetById(idDataset) {
    return datasets.find(dataset => dataset.idDataset === idDataset) || null;
}

function toInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed))
        return null;
    return parsed;
}

module.exports = {
    listDatasets,
    getDatasetById,
    createDataset
};
