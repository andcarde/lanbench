
// app.js
'use strict';

// Establecimiento del servidor
const express = require('express');
const app = express();

// Útiles para las rutas
const path = require('path');

// Definición del motor EJS y del directorio donde están los documentos dinámicos
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

//Ficheros estáticos
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Registro de peticiones
const pinoHttp = require('pino-http');
const pinoHttpMiddleware = pinoHttp({ autoLogging: false });
app.use(pinoHttpMiddleware);

// Útiles para que funcionen las peticiones POST
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { requestLogMiddleware } = require('./middlewares/request-log-middleware');
app.use(requestLogMiddleware);

// Devolución automática de recursos públicos y estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Usar de cookies
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Uso de sesiones
const middlewareSession = require('./routes/session');
app.use(middlewareSession);

// Enrutador de páginas públicas
const publicRouter = require('./routes/public');
app.use('/', publicRouter);

const Usuario = require('./entities/usuario');

// <DEBUG> Enable a trap login
app.get('/fake-login', function(request, response) {
    const usuario = new Usuario({
        id: 1,
        correo: 'tom@email.com',
        contrasena: '1234',
        nombre: 'Tom',
        apellido1: 'Cruise',
        apellido2: null,
        activo: true
    });
    request.session.usuario = usuario;
    response.status(200).redirect('/');
});
// </DEBUG>

// Control de sesión activa
const checkSession = function (request, response, next) {
    const isPublicAuthRoute = request.method === 'POST'
        && (request.path === '/register' || request.path === '/crear-sesion');

    if (isPublicAuthRoute) {
        next();
        return;
    }

    if (typeof request.session.usuario === 'undefined') {
        response.cookie('message',
            { title: 'Acceso denegado', message: 'Es necesario que se identifique para acceder a dicha dirección' },
            { maxAge: 5000 }
        );
        response.redirect('/login');
    } else {
        next();
    }
}
app.use(checkSession);

// Uso de enrutadores
const usuariosRouter = require('./routes/usuarios');
app.use('/', usuariosRouter);

// Cierre de sesion
app.get('/cerrar-sesion', function(request, response) {
    // Alternativa: delete request.session.user;
    request.session.destroy(function(error) {
        if (error) {
            // Establece una cookie con el mensaje de error
            response.cookie('message',
                { title: 'Cierre de sesión fallido', message: 'Se ha producido un error inesperadoal cerrar la sesión.' },
                { maxAge: 5000 }
            );
        } else {
            // Redireccionar al usuario a la página de inicio de sesión
            response.clearCookie('connect.sid', { path: '/' });
            // Establece una cookie con el mensaje de éxito
            response.cookie('message',
                { title: 'Sesión cerrada', message: 'La sesión se ha cerrado con éxito.' },
                { maxAge: 5000 }
            );
        }
        // Redirige a la página de login
        response.status(200).redirect('/login');
    });
});

const createError = require('http-errors');

// Middleware que lanza un error 404
const error404launcher = (req, res, next) => {
    next(createError(404));
};
app.use(error404launcher);

// Manejador del error 404
const error404handler = (err, req, res, next) => {
    if (err.status && err.status !== 404) {
        next(err);
    } else {
        res.status(404).sendFile(__dirname + '/public/no-encontrada.html');
    }
}
app.use(error404handler);

// Manejador del error 400
const error400handler = (err, req, res, next) => {
    if (err.status && err.status !== 400) {
        next(err);
    } else {
        res.status(400).sendFile(__dirname + '/public/bad-request.html');
    }
}
app.use(error400handler);

// Manejador de un error genérico
const error500handler = (err, req, res, next) => {
    res.locals.serverErrorReason = err && err.message ? err.message : 'Error interno del servidor genérico';
    res.status(err.status || 500);
    res.sendFile(__dirname + '/public/problema.html');
}
app.use(error500handler);

// Puerto del servidor
const config = require('./config');

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
    startServer
};
