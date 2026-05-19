'use strict';

/**
 * @file Express application bootstrap.
 *
 * This module is intentionally side-effect-light: it exports factories
 * (`createApp`, `createControllers`, `createErrorHandler`) so that integration
 * tests can build an isolated app instance with mocked controllers. The real
 * server only spins up when this file is invoked directly (`node app.js`).
 *
 * Layering: routes -> controllers -> services -> repositories. Cross-cutting
 * concerns (request logging, session middleware) are attached in `createApp`.
 *
 * @typedef {import('express').Application} ExpressApplication
 * @typedef {import('express').RequestHandler} ExpressRequestHandler
 * @typedef {import('express').ErrorRequestHandler} ExpressErrorRequestHandler
 */

const express = require('express');
const path = require('node:path');
const createError = require('http-errors');

const config = require('./config');
const { createSessionMiddleware } = require('./routes/session');
const publicRouter = require('./routes/public');
const datasetsRouter = require('./routes/datasets');
const annotationsRouter = require('./routes/annotations');
const {
    createRequestLogMiddleware,
} = require('./middlewares/request-log-middleware');
const { createUsersRouter } = require('./routes/users');
const { createDatasetsApiRouter } = require('./routes/datasets-api');
const { createAnnotationsRouter } = require('./routes/annotations-api');
const { createSessionApiRouter } = require('./routes/session-api');
const { createReviewerRouter } = require('./routes/reviewer');
const { createAdminApiRouter } = require('./routes/admin-api');
const { createReviewsRouter } = require('./routes/reviews-api');
const {
    createAnnotationsController,
} = require('./controllers/annotations-controller');
const { createDatasetsController } = require('./controllers/datasets-controller');
const { createAdminController } = require('./controllers/admin-controller');
const { createUsersController } = require('./controllers/users-controller');
const { createReviewsController } = require('./controllers/reviews-controller');
const { createAnnotationsService } = require('./services/annotations-service');
const { createDatasetsService } = require('./services/datasets-service');
const { createAdminService } = require('./services/admin-service');
const {
    createSectionAssignmentService,
} = require('./services/section-assignment-service');
const {
    createContinueDatasetService,
} = require('./services/continue-dataset-service');
const { createReviewsService } = require('./services/reviews-service');
const {
    createSectionAssignmentsRepository,
} = require('./repositories/section-assignments-repository');
const {
    createReviewsRepository,
} = require('./repositories/reviews-repository');
const {
    createDatasetsRepository,
} = require('./repositories/datasets-repository');
const { warnIfDatabaseInactive } = require('./utils/database-health');

/**
 * Coleccion de controllers cableados con sus dependencias.
 * @typedef {Object} ControllerBundle
 * @property {ReturnType<typeof createAnnotationsController>} annotationsController
 * @property {ReturnType<typeof createDatasetsController>} datasetsController
 * @property {ReturnType<typeof createAdminController>} adminController
 * @property {ReturnType<typeof createReviewsController>} reviewsController
 * @property {ReturnType<typeof createUsersController>} usersController
 */

/**
 * Overrides aceptados por {@link createControllers} y {@link createApp}.
 * Cada override sustituye al controller real (util en tests).
 *
 * @typedef {Partial<ControllerBundle>} ControllerOverrides
 */

/**
 * Opciones aceptadas por {@link createApp}.
 * @typedef {Object} CreateAppOptions
 * @property {ControllerOverrides} [controllers]
 * @property {ExpressRequestHandler} [sessionMiddleware]
 */

/**
 * Construye los controllers de la aplicacion con sus servicios y
 * repositorios. Acepta un objeto de `overrides` para inyectar dobles
 * (mocks/stubs) en pruebas.
 *
 * @param {ControllerOverrides} [overrides]
 * @returns {ControllerBundle}
 */
function createControllers(overrides = {}) {
    const sectionAssignmentsRepository = createSectionAssignmentsRepository();
    const sectionAssignmentService = createSectionAssignmentService({
        sectionAssignmentsRepository,
    });
    const reviewsRepository = createReviewsRepository();
    const datasetsRepository = createDatasetsRepository();
    const datasetsService = createDatasetsService({ datasetsRepository });
    const continueDatasetService = createContinueDatasetService({
        sectionAssignmentsRepository,
        sectionAssignmentService,
        datasetsRepository,
        datasetsService,
    });

    return {
        annotationsController:
            overrides.annotationsController ||
            createAnnotationsController({
                annotationsService: createAnnotationsService({
                    sectionAssignmentsRepository,
                    sectionAssignmentService,
                    datasetsRepository,
                    continueDatasetService,
                }),
                continueDatasetService,
            }),
        datasetsController:
            overrides.datasetsController ||
            createDatasetsController({
                datasetsService,
            }),
        adminController:
            overrides.adminController ||
            createAdminController({
                adminService: createAdminService(),
            }),
        reviewsController:
            overrides.reviewsController ||
            createReviewsController({
                reviewsService: createReviewsService({ reviewsRepository }),
            }),
        usersController: overrides.usersController || createUsersController(),
    };
}

/**
 * Construye la aplicacion Express con todos sus routers, middlewares y
 * handler global de errores. Permite inyectar un `sessionMiddleware`
 * alternativo (util para tests sin BD) y overrides de controllers.
 *
 * @param {CreateAppOptions} [options]
 * @returns {ExpressApplication}
 */
function createApp({
    controllers: controllerOverrides,
    sessionMiddleware,
} = {}) {
    const app = express();
    const controllers = createControllers(controllerOverrides);
    const publicDirectory = path.join(__dirname, 'public');

    if (config.session.cookie.secure) app.set('trust proxy', 1);

    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(createRequestLogMiddleware());
    app.use(express.static(publicDirectory));
    app.use(sessionMiddleware || createSessionMiddleware());

    app.use('/', publicRouter);
    app.get('/forbidden', (_request, response) => {
        response
            .status(403)
            .sendFile(path.join(publicDirectory, 'forbidden.html'));
    });
    app.use('/datasets', datasetsRouter);
    app.use(
        '/api/datasets',
        createDatasetsApiRouter({
            datasetsController: controllers.datasetsController,
        })
    );
    app.use(
        '/api/admin',
        createAdminApiRouter({ adminController: controllers.adminController })
    );
    app.use('/annotations', annotationsRouter);
    app.use(
        '/api/annotations',
        createAnnotationsRouter({
            annotationsController: controllers.annotationsController,
        })
    );
    app.use(
        '/api/reviews',
        createReviewsRouter({
            reviewsController: controllers.reviewsController,
        })
    );
    app.use('/api/session', createSessionApiRouter({
        usersController: controllers.usersController
    }));
    app.use('/reviewer', createReviewerRouter());
    app.use(
        '/',
        createUsersRouter({ usersController: controllers.usersController })
    );

    app.use((request, response, next) => {
        next(createError(404));
    });

    app.use(createErrorHandler({ publicDirectory }));

    return app;
}

/**
 * Construye el `errorHandler` final de Express. Devuelve paginas HTML para
 * 404 y 400, y `problema.html` para cualquier error >= 500.
 *
 * @param {{ publicDirectory?: string }} [options]
 * @returns {ExpressErrorRequestHandler}
 */
function createErrorHandler({ publicDirectory } = {}) {
    const resolvedPublicDirectory =
        publicDirectory || path.join(__dirname, 'public');

    return function errorHandler(err, _req, response, next) {
        if (response.headersSent) return next(err);

        const status = normalizeErrorStatus(err);

        if (status === 404)
            return response
                .status(404)
                .sendFile(path.join(resolvedPublicDirectory, 'not-found.html'));

        if (status === 400)
            return response
                .status(400)
                .sendFile(
                    path.join(resolvedPublicDirectory, 'bad-request.html')
                );

        response.locals.serverErrorReason = err?.message
            ? err.message
            : 'Error interno del servidor genérico';

        return response
            .status(Math.max(500, status))
            .sendFile(path.join(resolvedPublicDirectory, 'problema.html'));
    };
}

/**
 * Extrae el status numerico de un error. Devuelve 500 si el error no
 * declara un `status` entero.
 *
 * @param {Error & { status?: number }} error
 * @returns {number}
 */
function normalizeErrorStatus(error) {
    if (!error || !Number.isInteger(error.status)) return 500;

    return /** @type {number} */ (error.status);
}

/**
 * Arranca el servidor HTTP en el puerto indicado (por defecto el de
 * configuracion). Muestra un aviso si la BD parece inactiva tras el arranque.
 *
 * @param {number} [port] - Puerto en el que escuchar.
 * @returns {import('node:http').Server}
 */
function startServer(port = config.port) {
    const app = createApp();
    return app.listen(port, function (error) {
        if (error) {
            let message = 'Error: No se ha podido iniciar el servidor';
            if (error.message) message += `- Reason: ${error.message}`;
            console.error(message);
        } else {
            console.log(`> Servidor arrancado en el puerto ${port}`);
            warnIfDatabaseInactive();
        }
    });
}

if (require.main === module) startServer();

module.exports = {
    createApp,
    createErrorHandler,
    startServer
};
