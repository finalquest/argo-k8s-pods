# Backend - Sistema de Autenticación

## 📋 Visión General

El sistema de autenticación de Appium Orchestrator Web está implementado utilizando **Google OAuth 2.0** con Passport.js, proporcionando una capa de seguridad robusta y una experiencia de usuario fluida. Este sistema garantiza que solo usuarios autorizados puedan acceder y operar la plataforma.

## 🔧 Componentes del Sistema

### 1. Configuración de Passport.js

#### Estrategia Google OAuth 2.0

```javascript
// server.js - Configuración principal de Passport
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
      hostedDomain: process.env.GOOGLE_HOSTED_DOMAIN,
    },
    (accessToken, refreshToken, profile, done) => {
      // Validación del perfil del usuario
      return done(null, profile);
    },
  ),
);
```

#### Variables de Entorno Requeridas

```javascript
// .env - Variables de configuración
GOOGLE_CLIENT_ID = tu - client - id - de - google;
GOOGLE_CLIENT_SECRET = tu - client - secret - de - google;
GOOGLE_HOSTEDDomain = tu - dominio - empresarial.com;
SESSION_SECRET = tu - secreto - de - sesion - muy - seguro;
```

### 2. Serialización y Deserialización de Usuarios

```javascript
// server.js - Manejo de sesiones de usuario
passport.serializeUser((user, done) => {
  // Almacenar el perfil completo del usuario en la sesión
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  // Recuperar el perfil del usuario desde la sesión
  done(null, obj);
});
```

## 🌐 Flujo de Autenticación

### 1. Inicio del Flujo

```javascript
// server.js - Ruta de inicio de autenticación
app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    // Forzar selección de cuenta si hay múltiples sesiones
    prompt: 'select_account',
  }),
);
```

### 2. Callback de Google

```javascript
// server.js - Manejo del callback de Google
app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login',
    failureFlash: true,
  }),
  (req, res) => {
    // Autenticación exitosa, redirigir al dashboard
    res.redirect('/');
  },
);
```

### 3. Middleware de Protección

```javascript
// server.js - Middleware para rutas protegidas
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  // Para API endpoints, devolver error JSON
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({
      error: 'No autorizado',
      message: 'Debe iniciar sesión para acceder a este recurso',
    });
  }

  // Para peticiones web, redirigir al login
  res.redirect('/login');
}
```

## 📡 Integración con Socket.IO

### 1. Middleware de Sesión para Socket.IO

```javascript
// server.js - Integración de sesiones con Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.use((socket, next) => {
  passport.initialize()(socket.request, {}, next);
});

io.use((socket, next) => {
  passport.session()(socket.request, {}, next);

  if (socket.request.user) {
    // Asignar ID de usuario al socket para tracking
    socket.userId = socket.request.user.id;
    socket.userEmail = socket.request.user.email;
    socket.userName = socket.request.user.displayName;
    next();
  } else {
    next(new Error('No autorizado'));
  }
});
```

### 2. Eventos de Autenticación en Socket.IO

```javascript
// server.js - Manejo de conexiones autenticadas
io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.userName} (${socket.userEmail})`);

  // Enviar datos iniciales del usuario
  socket.emit('user_authenticated', {
    user: {
      id: socket.userId,
      name: socket.userName,
      email: socket.userEmail,
      avatar: socket.request.user.photos?.[0]?.value,
    },
    config: {
      maxWorkers: process.env.MAX_WORKERS || 5,
      timeout: process.env.JOB_TIMEOUT || 300000,
    },
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.userName}`);
  });
});
```

## 🔒 Seguridad y Validaciones

### 1. Validación de Dominio

```javascript
// server.js - Validación de dominio empresarial
const validateUserDomain = (profile) => {
  const hostedDomain = process.env.GOOGLE_HOSTED_DOMAIN;
  if (hostedDomain && profile.emails?.[0]?.value) {
    const email = profile.emails[0].value;
    const emailDomain = email.split('@')[1];

    if (emailDomain !== hostedDomain) {
      throw new Error(`Dominio ${emailDomain} no autorizado`);
    }
  }
  return true;
};

// Modificar la estrategia de Passport para incluir validación
passport.use(
  new GoogleStrategy(
    {
      // ... configuración existente
    },
    (accessToken, refreshToken, profile, done) => {
      try {
        validateUserDomain(profile);
        return done(null, profile);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);
```

### 2. Configuración de Sesión Segura

```javascript
// server.js - Configuración de sesión mejorada
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    secure: process.env.NODE_ENV === 'production', // HTTPS en producción
    httpOnly: true, // Prevenir acceso JavaScript
    sameSite: 'lax', // Protección CSRF
  },
  store: new MemoryStore({
    // En producción usar Redis o similar
    checkPeriod: 86400000, // Limpiar sesiones expiradas
  }),
});
```

## 🎥 Manejo de Estados en el Frontend

### 1. Verificación de Estado de Autenticación

```javascript
// public/js/api.js - Funciones de autenticación
export async function getCurrentUser() {
  try {
    const response = await fetch('/api/auth/current-user');
    if (!response.ok) {
      if (response.status === 401) {
        return null; // No autenticado
      }
      throw new Error('Error al verificar autenticación');
    }
    return await response.json();
  } catch (error) {
    console.error('Error verificando autenticación:', error);
    return null;
  }
}

export async function checkAuthStatus() {
  const user = await getCurrentUser();
  if (user) {
    // Usuario autenticado
    document.getElementById('user-info').innerHTML = `
      <img src="${user.avatar}" alt="${user.name}" class="user-avatar">
      <span class="user-name">${user.name}</span>
      <button onclick="logout()" class="logout-btn">Cerrar Sesión</button>
    `;
    return true;
  } else {
    // Usuario no autenticado
    window.location.href = '/login';
    return false;
  }
}
```

### 2. Logout de Usuario

```javascript
// public/js/api.js - Cierre de sesión
export async function logout() {
  try {
    await fetch('/auth/logout', { method: 'POST' });
    // Limpiar estado local
    localStorage.clear();
    // Redirigir al login
    window.location.href = '/login';
  } catch (error) {
    console.error('Error durante logout:', error);
  }
}

// server.js - Ruta de logout
app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error durante logout' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Error destruyendo sesión' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});
```

## 📊 Logging y Auditoría

### 1. Registro de Actividad de Usuario

```javascript
// server.js - Logging de autenticación
function logAuthActivity(userId, action, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    details,
    ip: details.ip || 'unknown',
  };

  // Escribir a archivo de log
  fs.appendFile(
    path.join(__dirname, 'logs', 'auth.log'),
    JSON.stringify(logEntry) + '\n',
    (err) => {
      if (err) console.error('Error escribiendo log de autenticación:', err);
    },
  );
}

// Middleware para logging de autenticación
app.use((req, res, next) => {
  if (req.isAuthenticated()) {
    logAuthActivity(req.user.id, 'request', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
  }
  next();
});
```

## 🔧 Configuración de Producción

### 1. Variables de Entorno de Producción

```bash
# .env.production - Configuración de producción
NODE_ENV=production
GOOGLE_CLIENT_ID=produccion-client-id
GOOGLE_CLIENT_SECRET=produccion-client-secret
GOOGLE_HOSTED_DOMAIN=empresa.com
SESSION_SECRET=secreto-muy-largo-y-aleatorio

# Configuración de sesión
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict

# Configuración de servidor
PORT=443
TRUST_PROXY=true
```

### 2. Configuración HTTPS

```javascript
// server.js - Configuración HTTPS para producción
if (process.env.NODE_ENV === 'production') {
  const https = require('https');
  const fs = require('fs');

  const options = {
    key: fs.readFileSync('/path/to/private.key'),
    cert: fs.readFileSync('/path/to/certificate.crt'),
    ca: fs.readFileSync('/path/to/ca_bundle.crt'),
  };

  const server = https.createServer(options, app);
  const io = new Server(server);

  server.listen(PORT, () => {
    console.log(`Servidor HTTPS corriendo en puerto ${PORT}`);
  });
} else {
  // Desarrollo con HTTP
  const server = http.createServer(app);
  const io = new Server(server);

  server.listen(PORT, () => {
    console.log(`Servidor HTTP corriendo en puerto ${PORT}`);
  });
}
```

## 🚨 Manejo de Errores

### 1. Errores de Autenticación

```javascript
// server.js - Manejo de errores de autenticación
app.use((err, req, res, next) => {
  if (err.name === 'AuthenticationError') {
    logAuthActivity('unknown', 'auth_error', {
      error: err.message,
      ip: req.ip,
    });

    if (req.xhr) {
      return res.status(401).json({
        error: 'Error de autenticación',
        message: err.message,
      });
    }

    return res.redirect('/login?error=' + encodeURIComponent(err.message));
  }

  next(err);
});
```

## 📖 Documentos Relacionados

- [01-server-architecture.md](./01-server-architecture.md) - Arquitectura general del servidor
- [03-socket-events.md](./03-socket-events.md) - Eventos Socket.IO y comunicación en tiempo real
- [04-worker-system.md](./04-worker-system.md) - Sistema de workers y ejecución de tests
- [03-frontend/01-module-overview.md](../03-frontend/01-module-overview.md) - Módulos del frontend
