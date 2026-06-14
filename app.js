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
const { createMeRouter } = require('./routes/me');
const { createAdminApiRouter } = require('./routes/admin-api');
const { createReviewsRouter } = require('./routes/reviews-api');
const { createMeApiRouter } = require('./routes/me-api');
const {
    createAnnotationsController,
} = require('./controllers/annotations-controller');
const { createAutoAnnotationController } = require('./controllers/auto-annotation-controller');
const { createDatasetsController } = require('./controllers/datasets-controller');
const { createDatasetLlmCredentialsController } = require('./controllers/dataset-llm-credentials-controller');
const { createAdminController } = require('./controllers/admin-controller');
const { createUsersController } = require('./controllers/users-controller');
const { createReviewsController } = require('./controllers/reviews-controller');
const { createMeController } = require('./controllers/me-controller');
const { createAnnotationsService } = require('./services/annotations-service');
const { createAutoAnnotationService } = require('./services/auto-annotation-service');
const { createMeStatisticsService } = require('./services/me-statistics-service');
const { createDatasetsService } = require('./services/datasets-service');
const { createDatasetLlmCredentialsService } = require('./services/dataset-llm-credentials-service');
const { createDatasetsPermissionsService } = require('./services/datasets-permissions-service');
const { createDatasetsStatisticsService } = require('./services/datasets-statistics-service');
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
const {
    createDatasetsPermissionsRepository,
} = require('./repositories/datasets-permissions-repository');
const {
    createDatasetsStatisticsRepository,
} = require('./repositories/datasets-statistics-repository');
const {
    createDatasetLlmCredentialsRepository,
} = require('./repositories/dataset-llm-credentials-repository');
const { warnIfDatabaseInactive } = require('./utils/database-health');

/**
 * Collection of controllers wired with their dependencies.
 * @typedef {Object} ControllerBundle
 * @property {ReturnType<typeof createAnnotationsController>} annotationsController
 * @property {ReturnType<typeof createAutoAnnotationController>} autoAnnotationController
 * @property {ReturnType<typeof createDatasetsController>} datasetsController
 * @property {ReturnType<typeof createDatasetLlmCredentialsController>} datasetLlmCredentialsController
 * @property {ReturnType<typeof createAdminController>} adminController
 * @property {ReturnType<typeof createReviewsController>} reviewsController
 * @property {ReturnType<typeof createUsersController>} usersController
 * @property {ReturnType<typeof createMeController>} meController
 */

/**
 * Overrides accepted by {@link createControllers} and {@link createApp}.
 * Each override replaces the real controller (useful in tests).
 *
 * @typedef {Partial<ControllerBundle>} ControllerOverrides
 */

/**
 * Options accepted by {@link createApp}.
 * @typedef {Object} CreateAppOptions
 * @property {ControllerOverrides} [controllers]
 * @property {ExpressRequestHandler} [sessionMiddleware]
 * @property {ExpressRequestHandler} [requestLogMiddleware]
 */

/**
 * Builds the application's controllers with their services and repositories.
 * Accepts an `overrides` object to inject test doubles (mocks/stubs).
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
    const datasetsPermissionsRepository = createDatasetsPermissionsRepository();
    const datasetsStatisticsRepository = createDatasetsStatisticsRepository();
    const datasetLlmCredentialsRepository = createDatasetLlmCredentialsRepository();
    const datasetsService = createDatasetsService({
        datasetsRepository,
        datasetsPermissionsRepository,
        datasetLlmCredentialsRepository,
    });
    const datasetsPermissionsService = createDatasetsPermissionsService({ datasetsPermissionsRepository });
    const datasetsStatisticsService = createDatasetsStatisticsService({ datasetsRepository, datasetsStatisticsRepository });
    const continueDatasetService = createContinueDatasetService({
        sectionAssignmentsRepository,
        sectionAssignmentService,
        datasetsRepository,
        datasetsService,
        datasetLlmCredentialsRepository,
    });

    const datasetLlmCredentialsService = createDatasetLlmCredentialsService({
        datasetsPermissionsRepository,
        credentialsRepository: datasetLlmCredentialsRepository,
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
        autoAnnotationController:
            overrides.autoAnnotationController ||
            createAutoAnnotationController({
                autoAnnotationService: createAutoAnnotationService({
                    datasetsPermissionsRepository,
                    datasetLlmCredentialsService,
                    datasetsService,
                    datasetsRepository,
                    sectionAssignmentsRepository,
                    sectionAssignmentService,
                }),
            }),
        datasetsController:
            overrides.datasetsController ||
            createDatasetsController({
                datasetsService,
                datasetsPermissionsService,
                datasetsStatisticsService,
            }),
        datasetLlmCredentialsController:
            overrides.datasetLlmCredentialsController ||
            createDatasetLlmCredentialsController({
                datasetLlmCredentialsService,
            }),
        adminController:
            overrides.adminController ||
            createAdminController({
                adminService: createAdminService(),
            }),
        reviewsController:
            overrides.reviewsController ||
            createReviewsController({
                reviewsService: createReviewsService({ reviewsRepository, datasetsPermissionsRepository }),
            }),
        usersController: overrides.usersController || createUsersController(),
        meController:
            overrides.meController ||
            createMeController({
                meStatisticsService: createMeStatisticsService(),
            }),
    };
}

/**
 * Builds the Express application with all its routers, middlewares and global
 * error handler. Allows injecting an alternative `sessionMiddleware` (useful
 * for tests without a DB) and controller overrides.
 *
 * @param {CreateAppOptions} [options]
 * @returns {ExpressApplication}
 */
function createApp({
    controllers: controllerOverrides,
    sessionMiddleware,
    requestLogMiddleware,
} = {}) {
    const app = express();
    app.disable('x-powered-by'); // don't disclose framework/version via the X-Powered-By header
    const controllers = createControllers(controllerOverrides);
    const publicDirectory = path.join(__dirname, 'public');

    if (config.session.cookie.secure) app.set('trust proxy', 1);

    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(requestLogMiddleware || createRequestLogMiddleware());
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
            datasetLlmCredentialsController: controllers.datasetLlmCredentialsController,
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
            autoAnnotationController: controllers.autoAnnotationController,
        })
    );
    app.use(
        '/api/reviews',
        createReviewsRouter({
            reviewsController: controllers.reviewsController,
        })
    );
    app.use(
        '/api/me',
        createMeApiRouter({ meController: controllers.meController })
    );
    app.use('/api/session', createSessionApiRouter({
        usersController: controllers.usersController
    }));
    app.use('/reviewer', createReviewerRouter());
    app.use('/my-stats', createMeRouter());
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
 * Builds Express's final `errorHandler`. Returns HTML pages for 404 and 400,
 * and `problema.html` for any error >= 500.
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
 * Extracts the numeric status from an error. Returns 500 if the error does not
 * declare an integer `status`.
 *
 * @param {Error & { status?: number }} error
 * @returns {number}
 */
function normalizeErrorStatus(error) {
    if (!error || !Number.isInteger(error.status)) return 500;

    return /** @type {number} */ (error.status);
}

/**
 * Starts the HTTP server on the given port (the configured one by default).
 * Shows a warning if the DB appears inactive after startup.
 *
 * @param {number} [port] - Port to listen on.
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
