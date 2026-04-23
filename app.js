'use strict';

const express = require('express');
const path = require('path');
const createError = require('http-errors');
const pinoHttp = require('pino-http');

const config = require('./config');
const middlewareSession = require('./routes/session');
const publicRouter = require('./routes/public');
const datasetsRouter = require('./routes/datasets');
const administratorRouter = require('./routes/administrator');
const annotationsRouter = require('./routes/annotations');
const { requestLogMiddleware } = require('./middlewares/request-log-middleware');
const { createUsersRouter } = require('./routes/users');
const { createDatasetsApiRouter } = require('./routes/datasets-api');
const { createAnnotationsRouter } = require('./routes/annotations-api');
const { createSessionApiRouter } = require('./routes/session-api');
const { createReviewerRouter } = require('./routes/reviewer');
const { createAnnotationsController } = require('./business/annotations-controller');
const { createDatasetsController } = require('./business/datasets-controller');
const { createUsersController } = require('./business/users-controller');

function createControllers(overrides = {}) {
    return {
        annotationsController: overrides.annotationsController || createAnnotationsController(),
        datasetsController: overrides.datasetsController || createDatasetsController(),
        usersController: overrides.usersController || createUsersController()
    };
}

function createApp({ controllers: controllerOverrides, sessionMiddleware } = {}) {
    const app = express();
    const controllers = createControllers(controllerOverrides);
    const publicDirectory = path.join(__dirname, 'public');

    if (config.session.cookie.secure)
        app.set('trust proxy', 1);

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    const pinoHttpMiddleware = pinoHttp({ autoLogging: false });
    app.use(pinoHttpMiddleware);

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(requestLogMiddleware);
    app.use(express.static(publicDirectory));
    app.use(sessionMiddleware || middlewareSession);

    app.use('/', publicRouter);
    app.get('/forbidden', (_request, response) => {
        response.status(403).sendFile(path.join(publicDirectory, 'forbidden.html'));
    });
    app.use('/datasets', datasetsRouter);
    app.use('/api/datasets', createDatasetsApiRouter({ datasetsController: controllers.datasetsController }));
    app.use('/api/administrator', administratorRouter);
    app.use('/annotations', annotationsRouter);
    app.use('/api/annotations', createAnnotationsRouter({ annotationsController: controllers.annotationsController }));
    app.use('/api/session', createSessionApiRouter());
    app.use('/reviewer', createReviewerRouter());
    app.use('/', createUsersRouter({ usersController: controllers.usersController }));

    app.use((req, res, next) => {
        next(createError(404));
    });

    app.use(createErrorHandler({ publicDirectory }));

    return app;
}

function createErrorHandler({ publicDirectory } = {}) {
    const resolvedPublicDirectory = publicDirectory || path.join(__dirname, 'public');

    return function errorHandler(err, req, res, next) {
        if (res.headersSent)
            return next(err);

        const status = normalizeErrorStatus(err);

        if (status === 404)
            return res.status(404).sendFile(path.join(resolvedPublicDirectory, 'no-encontrada.html'));

        if (status === 400)
            return res.status(400).sendFile(path.join(resolvedPublicDirectory, 'bad-request.html'));

        res.locals.serverErrorReason = err && err.message
            ? err.message
            : 'Error interno del servidor genérico';

        return res
            .status(status >= 500 ? status : 500)
            .sendFile(path.join(resolvedPublicDirectory, 'problema.html'));
    };
}

function normalizeErrorStatus(error) {
    if (!error || !Number.isInteger(error.status))
        return 500;

    return error.status;
}

const app = createApp();

function startServer(port = config.port) {
    return app.listen(port, function (error) {
        if (error) {
            let message = 'Error: No se ha podido iniciar el servidor';
            if (error.message)
                message += `- Reason: ${error.message}`;
            console.error(message);
        } else {
            console.log(`> Servidor arrancado en el puerto ${port}`);
        }
    });
}

if (require.main === module)
    startServer();

module.exports = {
    app,
    createApp,
    createErrorHandler,
    startServer
};
