# EPIC-1-PLAN — E1: Gobierno De Acceso, Roles Y Permisos

Fecha: 2026-04-23

Fuentes usadas:
- `US-PLAN.md` — planificacion de historias de usuario y desglose de E1.
- `US-COBERTURA-1.md` — auditoria funcional del estado actual.
- `documentation/user_stories.txt` — historias de usuario originales.
- `EPIC-PLAN.md` — formato y salida del bloque E0.

---

## Resumen Del Bloque

| Campo | Valor |
| --- | --- |
| Bloque | E1 |
| Nombre | Gobierno de acceso, roles y permisos |
| Prioridad | P0 |
| Dependencias de entrada | E0 |
| Dependencias de salida | E2, E4, E5, E6 |
| Tareas comunes activadas | C2, C8 |

---

## US Incluidas

| US | Titulo | Estado actual |
| --- | --- | --- |
| US-22 | Roles de usuario (anotador, revisor, admin) | Sin implementar |
| US-13 (prerequisito) | Flujo de revision humana | Bloqueada sin rol revisor |
| US-19 (prerequisito) | Subida de datasets | Accesible sin restriccion de rol |
| US-20 (prerequisito) | Exportacion de avances | Bloqueada sin rol admin |
| US-21 (prerequisito) | Reporting del admin | Bloqueada sin rol admin |
| US-23 (prerequisito) | Monitorizacion de actividad | Bloqueada sin rol admin |
| US-24 (prerequisito) | Configuracion de criterios | Bloqueada sin rol admin |

Nota: Las US-13, US-19, US-20, US-21, US-23 y US-24 solo se habilitan aqui a nivel de rol y permiso. Su cierre funcional corresponde a E4, E5 y E6.

---

## Estado Actual Relevante

Problemas identificados en auditoria y en E0 que este bloque debe resolver:

1. `prisma/schema.prisma:44` — el modelo `User` ya contiene el campo `role` con default `annotator` (preparado en T0.4), pero no hay seeds ni bootstrap para crear administradores reales.
2. `repositories/users-repository.js:10-19` — `findByEmail` no incluye `role` en la proyeccion `select`, por lo que el rol nunca viaja desde la base de datos hasta la sesion.
3. `entities/user.js` — ya soporta el campo `role` en `fromPersistence`, `fromSession` y `toSession`, y tiene default `annotator`.
4. `middlewares/auth.js:1-40` — solo expone `requirePageAuth` y `requireApiAuth`. No existe ningun middleware de autorizacion por rol.
5. `routes/datasets-api.js:14-20` — la subida de datasets (`POST /api/datasets`) esta solo protegida por `requireApiAuth`, cualquier anotador puede subir datasets.
6. `routes/administrator.js:8-25` — el router de administrador solo exige autenticacion, no rol de admin.
7. `routes/annotations-api.js`, `routes/annotations.js`, `routes/datasets.js`, `routes/users.js` — ninguno distingue entre rol anotador y rol revisor.
8. `public/js/toolbar.js:10-22` — la toolbar es identica para todos los roles; no hay acciones diferenciadas por capacidad.
9. No existe endpoint que permita al front conocer el rol de la sesion actual sin reautenticar.
10. No hay constantes centralizadas para los nombres de rol (`annotator`, `reviewer`, `admin`), lo que abre la puerta a errores tipograficos silenciosos.

---

## Objetivos Del Bloque

1. Introducir autorizacion real por rol sobre los puntos de entrada sensibles.
2. Propagar el rol desde la base de datos hasta la sesion y desde la sesion hasta el front.
3. Fijar un catalogo unico de roles y una API estable para consultarlos y exigirlos.
4. Dejar preparada la superficie de revisor y admin (rutas placeholder protegidas) para que E4 y E5 no necesiten tocar middleware.

Nota de no-colision: en paralelo ChatGPT ejecuta T0.5 (unificar mensajes de error) y tocara `business/datasets-controller.js`, `business/annotations-controller.js`, `business/users-controller.js`, `public/js/annotations.js` y `public/js/datasets.js`. Las tareas de este bloque se disenan para no modificar esos ficheros.

---

## Tareas

Las tareas se ordenan en orden de ejecucion recomendado. Cada tarea es independiente del resto salvo donde se indica una dependencia explicita.

---

### T1.1 — Constantes de roles y propagacion desde DB

**Alcance:** C2, C8

**Problema que resuelve:** Los nombres de rol estan dispersos como strings magicos y el `role` de la DB nunca llega a la sesion porque `findByEmail` no lo proyecta.

**Archivos afectados:**
- `constants/roles.js` — nuevo
- `repositories/users-repository.js` — incluir `role` en la proyeccion de `findByEmail`

**Trabajo concreto:**
1. Crear `constants/roles.js` con `ROLE_ANNOTATOR`, `ROLE_REVIEWER`, `ROLE_ADMIN`, un array `ALL_ROLES` y un helper `isValidRole(value)`.
2. Ampliar `select` de `findByEmail` para devolver tambien `role`.
3. No se toca `entities/user.js` porque ya soporta el campo `role` con default `annotator`.

**Condicion de verificacion:** Tras `authenticateUser`, el objeto de sesion contiene el `role` real persistido en DB y no un default inferido.

---

### T1.2 — Middleware de autorizacion por rol

**Alcance:** C2

**Problema que resuelve:** No existe forma declarativa de proteger una ruta por rol. Cualquier chequeo ad-hoc en cada handler seria fragil y facil de olvidar.

**Archivos afectados:**
- `middlewares/auth.js` — anadir `requirePageRole` y `requireApiRole`

**Trabajo concreto:**
1. Anadir `requirePageRole(...allowedRoles)` que devuelve un middleware. Si el usuario no tiene rol permitido, redirige a `/forbidden` (o a `/login` si no hay sesion).
2. Anadir `requireApiRole(...allowedRoles)` que devuelve un middleware. Si el usuario no tiene rol permitido, responde `403` con payload JSON uniforme `{ error: true, message, code: 'forbidden_role' }`; si no hay sesion, `401`.
3. Ambos middlewares componen la verificacion de autenticacion antes del chequeo de rol.
4. Aceptar los roles como varargs o como array.

**Condicion de verificacion:** Una ruta protegida con `requireApiRole(ROLE_ADMIN)` devuelve `403` si el usuario es anotador y `200` si es admin.

**Dependencia:** T1.1 aporta las constantes que se usaran como argumentos.

---

### T1.3 — Proteger subida de datasets y rutas de administracion

**Alcance:** C2

**Problema que resuelve:** La subida de datasets y las rutas de administracion son accesibles a cualquier usuario autenticado.

**Archivos afectados:**
- `routes/datasets-api.js` — aplicar `requireApiRole(ROLE_ADMIN)` al `POST /`
- `routes/administrator.js` — aplicar `requireApiRole(ROLE_ADMIN)` al router (salvo `logout`, que sigue solo autenticado)

**Trabajo concreto:**
1. En `routes/datasets-api.js`, dejar `GET` accesibles a cualquier autenticado y exigir `ROLE_ADMIN` solo en `POST /`.
2. En `routes/administrator.js`, envolver el router en un chequeo de rol admin para las rutas administrativas futuras (exportacion, monitorizacion), manteniendo `POST /logout` accesible para cualquier autenticado porque es una accion de cierre de sesion.
3. No se toca `business/datasets-controller.js` (colision con T0.5).

**Condicion de verificacion:** Un anotador recibe `403` al intentar `POST /api/datasets`; un admin puede subir datasets normalmente.

**Dependencia:** T1.1 y T1.2.

---

### T1.4 — Endpoint de sesion para el front

**Alcance:** C2, C6 (parcial)

**Problema que resuelve:** El front no puede adaptarse al rol del usuario sin un endpoint que exponga su sesion actual.

**Archivos afectados:**
- `routes/session-api.js` — nuevo
- `app.js` — montar `/api/session` en `createApp`

**Trabajo concreto:**
1. Crear router `routes/session-api.js` con `GET /me` que responde `{ idUser, email, role }` si hay sesion y `401` si no.
2. Registrarlo en `app.js` antes del catch-all 404.
3. No crear logica duplicada: reutilizar `User.fromSession` para validar la sesion.

**Condicion de verificacion:** `GET /api/session/me` devuelve `{ idUser, email, role }` para un usuario autenticado y `401` si no hay sesion.

**Dependencia:** Ninguna tecnica, recomendable T1.1 para que `role` sea real.

---

### T1.5 — Placeholder de router de revisor

**Alcance:** C2, C8

**Problema que resuelve:** E4 (flujo de revision) necesitara rutas protegidas por rol revisor. Dejar ya el router y el middleware aplicado evita retrabajo.

**Archivos afectados:**
- `routes/reviewer.js` — nuevo
- `app.js` — montar `/reviewer` bajo `requirePageRole(ROLE_REVIEWER, ROLE_ADMIN)`

**Trabajo concreto:**
1. Crear router `routes/reviewer.js` protegido por `requirePageRole(ROLE_REVIEWER, ROLE_ADMIN)`. Expondra `GET /` que responde por ahora `204 No Content` (placeholder limpio) para que los tests puedan verificar la proteccion.
2. Registrar el router en `app.js`.
3. No se crean vistas en este bloque; eso es E4.

**Condicion de verificacion:** `GET /reviewer` responde `204` para un revisor o admin y redirige a `/forbidden` para un anotador.

**Dependencia:** T1.2.

---

### T1.6 — Toolbar consciente del rol

**Alcance:** C2

**Problema que resuelve:** La toolbar es identica para los tres roles. Un admin no tiene acceso visible a administracion, un revisor no tiene acceso visible a la cola de revision. Esto se puede resolver en cliente consumiendo `/api/session/me`.

**Archivos afectados:**
- `public/js/toolbar.js` — anadir enlaces condicionales por rol

**Trabajo concreto:**
1. Tras inyectar la toolbar, hacer `fetch('/api/session/me')` y cachear la respuesta.
2. Si `role === 'admin'`, anadir un enlace `Administracion` que apunta a `/tasks` (placeholder) y un badge con el rol.
3. Si `role === 'reviewer'`, anadir un enlace `Revision` que apunta a `/reviewer` y un badge con el rol.
4. Si `role === 'annotator'` (default), no anadir enlaces pero si el badge.
5. Exportar funciones puras (`buildToolbarLinksForRole`) como `module.exports` para poder testearlas sin DOM.
6. No se toca `public/js/datasets.js` ni `public/js/annotations.js` (colision con T0.5).

**Condicion de verificacion:** La toolbar muestra enlaces distintos segun rol al hacer login con un usuario admin, revisor o anotador.

**Dependencia:** T1.4.

---

### T1.7 — Bootstrap de administrador inicial

**Alcance:** C2, C8

**Problema que resuelve:** No hay forma de crear un admin sin editar la base de datos a mano. Eso bloquea cualquier prueba real de E1.

**Archivos afectados:**
- `scripts/bootstrap-admin.js` — nuevo
- `package.json` — opcional, anadir script npm `bootstrap-admin`

**Trabajo concreto:**
1. Crear `scripts/bootstrap-admin.js` que toma email y password de variables de entorno (`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`) y crea (o promueve) un usuario con `role = 'admin'`.
2. Exportar la funcion `bootstrapAdmin({ email, password, deps })` para permitir tests unitarios que inyecten `usersRepository` y `passwordHasher`.
3. No ejecutar automaticamente el script al arrancar la app; es una operacion explicita.
4. Anadir `npm run bootstrap-admin` en `package.json` solo si no introduce fricciones en CI.

**Condicion de verificacion:** Tras ejecutar `node scripts/bootstrap-admin.js` con email y password en el entorno, existe un usuario con `role = 'admin'` y el login con esas credenciales devuelve `role: 'admin'`.

**Dependencia:** T1.1.

---

## Orden De Ejecucion Recomendado

```
T1.1 → T1.2 → T1.3 → T1.4 → T1.5 → T1.6 → T1.7
```

T1.1 primero porque fija el vocabulario de roles y hace que el `role` real llegue desde DB. T1.2 depende de T1.1 para usar las constantes. T1.3 y T1.5 dependen de T1.2. T1.4 puede hacerse en paralelo a T1.3. T1.6 depende de T1.4. T1.7 es independiente de T1.2-T1.6 pero usa las constantes de T1.1.

---

## Definition Of Done Del Bloque

- [ ] Existe un catalogo unico de roles en `constants/roles.js` reutilizado por todo el codigo.
- [ ] El rol persistido en DB llega hasta la sesion y hasta el cliente sin perderse por el camino.
- [ ] Existen middlewares `requirePageRole` y `requireApiRole` usables de forma declarativa.
- [ ] La subida de datasets (`POST /api/datasets`) exige rol admin.
- [ ] El router `/reviewer` existe y exige rol revisor o admin.
- [ ] El front puede conocer el rol actual mediante `GET /api/session/me`.
- [ ] La toolbar se adapta al rol del usuario.
- [ ] Existe un bootstrap ejecutable para crear un admin inicial.
- [ ] Todos los tests unitarios asociados a las tareas pasan.

---

## Riesgos Del Bloque

| Riesgo | Probabilidad | Impacto | Mitigacion |
| --- | --- | --- | --- |
| Sesiones persistidas antes del bloque no contienen `role` y rompen la autorizacion | Media | Medio | `User.fromSession` usa default `annotator`, por lo que sesiones viejas no rompen — pero conviene forzar re-login si se despliega en entorno real |
| Colision con T0.5 en controladores o `datasets.js` del front | Media | Alto | No modificar `business/*-controller.js` ni `public/js/annotations.js` ni `public/js/datasets.js` en este bloque |
| Cambiar proyeccion de `findByEmail` podria filtrar campos sensibles si se amplia sin cuidado | Baja | Medio | Mantener `select` explicito y solo anadir `role` |
| Middlewares de rol aplicados demasiado agresivamente rompen tests existentes de rutas | Media | Medio | Aplicar solo sobre rutas escritas en E1; no envolver routers completos sin revisar sus tests |
| El bootstrap de admin filtra la contrasena en logs | Baja | Alto | Leer la contrasena solo de `process.env` y nunca imprimirla |
