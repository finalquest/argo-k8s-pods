# Plan de Fortalecimiento de Seguridad: Autenticación en Backend

## 1. Diagnóstico del Problema

La implementación actual de la autenticación se concentra en el frontend. Se muestra una capa (overlay) que bloquea la UI si el usuario no está logueado. Sin embargo, esta protección es superficial y puede ser omitida por un usuario con conocimientos técnicos (usando las herramientas de desarrollador del navegador).

La vulnerabilidad principal es que el **backend no valida la sesión del usuario** en las peticiones a la API ni en los eventos de Socket.IO después del login inicial. Esto permitiría a un usuario no autenticado ejecutar acciones críticas, como correr tests o interactuar con Wiremock.

## 2. Objetivo

Asegurar que **todas las interacciones sensibles con el backend** (tanto llamadas a la API REST como eventos de Socket.IO) requieran una sesión de usuario válida y autenticada. Un usuario que no haya iniciado sesión no debe poder leer datos ni ejecutar ninguna acción.

## 3. Plan de Acción

El plan se divide en dos frentes principales: proteger los endpoints HTTP y proteger la comunicación por WebSockets.

### Parte A: Proteger Endpoints de la API REST (HTTP)

**Acción:** Aplicar el middleware `ensureAuthenticated` que ya creamos en `server.js` a todas las rutas de la API que lo requieran.

**Rutas a proteger:**

- `/api/branches`
- `/api/apk/versions`
- `/api/features`
- `/api/history/branches`
- `/api/history`
- Todos los endpoints bajo `/api/wiremock/*`
- Todos los endpoints bajo `/api/mappings/*`

**Ejemplo de implementación:**

```javascript
// Antes
app.get('/api/branches', async (req, res) => {
  // ...
});

// Después
app.get('/api/branches', ensureAuthenticated, async (req, res) => {
  // ...
});
```

Esto se puede hacer de forma más eficiente aplicando el middleware a un grupo de rutas:

```javascript
app.use('/api', ensureAuthenticated);
```
Sin embargo, esto protegería también `/api/current-user`, que debe ser público para que el frontend pueda verificar el estado de la sesión. Lo marcaremos como una excepción o lo definiremos antes de aplicar el middleware general.

### Parte B: Proteger Conexiones y Eventos de Socket.IO

**Acción:** Implementar un middleware de Socket.IO para que valide la sesión del usuario en el momento de la conexión.

**Cómo funciona:**

1.  Haremos que el middleware de `express-session` sea compatible con Socket.IO.
2.  Socket.IO utilizará este middleware para acceder a los datos de la sesión de Passport.js asociados con la petición del socket.
3.  Si la sesión no existe o el usuario no está autenticado, la conexión del socket será rechazada con un error de "unauthorized".

**Ejemplo de implementación:**

```javascript
// 1. Envolver el middleware de sesión para que sea reutilizable
const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
});

// 2. Aplicarlo a Express
app.use(sessionMiddleware);

// ... inicialización de passport ...

// 3. Aplicarlo a Socket.IO
io.use((socket, next) => {
    // Usar el middleware de sesión de Express para Socket.IO
    sessionMiddleware(socket.request, {}, next);
});

io.use((socket, next) => {
    // Ahora la sesión de passport está disponible en socket.request.user
    if (socket.request.user && socket.request.user.id) {
        next();
    } else {
        next(new Error('unauthorized'));
    }
});

// 4. Solo después de la validación, se establece el listener de conexión
io.on('connection', (socket) => {
  // ... toda la lógica de sockets que ya existe
});
```

## 4. Resultado Esperado

- Cualquier intento de llamar a un endpoint de la API sin una cookie de sesión válida resultará en un error `401 Unauthorized`.
- Cualquier intento de establecer una conexión de Socket.IO sin una sesión válida será rechazado por el servidor.
- La aplicación será segura contra intentos de bypass de la UI del frontend.
