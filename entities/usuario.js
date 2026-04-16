'use strict';

class Usuario {
    constructor(payload = {}) {
        this.id = payload.id || payload.idUser || null;
        this.email = payload.email || payload.correo || '';
        this.password = payload.password || payload.contrasena || '';
        this.name = payload.name || payload.nombre || '';
        this.surname1 = payload.surname1 || payload.apellido1 || '';
        this.surname2 = payload.surname2 || payload.apellido2 || '';
        this.active = typeof payload.active === 'boolean' ? payload.active : Boolean(payload.activo);
    }
}

module.exports = Usuario;
