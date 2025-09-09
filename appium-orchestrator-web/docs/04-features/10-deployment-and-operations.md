# Features - Despliegue y Operaciones

## 📋 Visión General

El sistema de despliegue y operaciones proporciona las herramientas y procedimientos necesarios para desplegar, mantener y operar la aplicación de Appium Orchestrator Web en diferentes entornos. Incluye configuraciones para Docker, gestión de dependencias, monitoreo y resolución de problemas comunes.

## 🏗️ Arquitectura de Despliegue

### 1. Componentes de Despliegue

```javascript
// Arquitectura de despliegue
const DeploymentArchitecture = {
  Containerization: {
    Docker: 'Contenedores para desarrollo y producción',
    Compose: 'Orquestación multi-servicio',
    Configuration: 'Gestión de variables de entorno',
  },
  Infrastructure: {
    Dependencies: 'Herramientas del sistema',
    Networking: 'Configuración de red',
    Storage: 'Gestión de volúmenes y archivos',
  },
  Operations: {
    Monitoring: 'Monitoreo de salud y rendimiento',
    Maintenance: 'Tareas de mantenimiento',
    Troubleshooting: 'Diagnóstico y resolución de problemas',
  },
};
```

### 2. Estrategias de Despliegue

```javascript
// Estrategias disponibles
const DeploymentStrategies = {
  Local: {
    Development: 'npm start',
    Dependencies: 'Node.js local',
    Environment: 'Variables de entorno locales',
  },
  Docker: {
    Development: 'docker-compose up --build',
    Production: 'Docker Swarm / Kubernetes',
    Environment: 'Configuración en contenedor',
  },
  Cloud: {
    Providers: ['AWS', 'GCP', 'Azure'],
    Services: ['Container Registry', 'Load Balancer', 'Database'],
    Environment: 'Configuración en la nube',
  },
};
```

## 🐳 Dockerización

### 1. Dockerfile

```dockerfile
# Dockerfile para la aplicación
FROM node:18-bullseye

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    git \
    android-tools-adb \
    curl \
    wget \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./
COPY .env.example .env.example

# Instalar dependencias de Node.js
RUN npm install

# Copiar código fuente
COPY . .

# Crear directorios necesarios
RUN mkdir -p /app/apks /app/reports /app/workspaces /app/wiremock/mappings

# Exponer puerto
EXPOSE 3000

# Configurar variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV DEVICE_SOURCE=local

# Comando de inicio
CMD ["node", "server.js"]
```

### 2. Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  orchestrator:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DEVICE_SOURCE=local
      - LOCAL_APK_DIRECTORY=/app/apks
      - MAX_PARALLEL_TESTS=2
      - MAX_REPORTS_PER_FEATURE=5
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./apks:/app/apks
      - ./reports:/app/reports
      - ./workspaces:/app/workspaces
      - ./wiremock:/app/wiremock
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    restart: unless-stopped

  wiremock:
    image: wiremock/wiremock:latest
    ports:
      - '8080:8080'
    volumes:
      - ./wiremock/mappings:/home/wiremock/mappings
      - ./wiremock/files:/home/wiremock/__files
    command: --global-response-templating --verbose
    restart: unless-stopped

volumes:
  redis_data:
```

### 3. Archivo de Entorno

```bash
# .env.example - Variables de entorno
# ========================================
# Configuración del Servidor
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000

# Autenticación Google OAuth
GOOGLE_CLIENT_ID=tu-client-id-google
GOOGLE_CLIENT_SECRET=tu-client-secret-google
SESSION_SECRET=tu-session-secret-seguro

# Integración Git
GIT_REPO_URL=https://github.com/tu-usuario/tu-repo.git
GIT_USER=tu-usuario-git
GIT_PAT=tu-personal-access-token

# Configuración de Dispositivos
DEVICE_SOURCE=local
LOCAL_APK_DIRECTORY=/app/apks
ANDROID_ADB_SERVER_HOST=host.docker.internal
ANDROID_ADB_SERVER_PORT=5555

# WireMock Integration
WIREMOCK_URL=http://wiremock:8080
WIREMOCK_ADMIN_URL=http://wiremock:8080/__admin

# Workspaces Persistentes
PERSISTENT_WORKSPACES_ROOT=/app/workspaces

# Configuración de Ejecución
MAX_PARALLEL_TESTS=2
MAX_REPORTS_PER_FEATURE=5

# Redis (opcional, para caché y sesiones)
REDIS_URL=redis://redis:6379

# Logging
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
```

## 🚀 Procedimientos de Despliegue

### 1. Despliegue Local

```bash
# 1. Clonar repositorio
git clone <repositorio>
cd appium-orchestrator-web

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con valores reales

# 4. Iniciar aplicación
npm start

# 5. Acceder a la aplicación
open http://localhost:3000
```

### 2. Despliegue con Docker

```bash
# 1. Preparar entorno
mkdir -p ./apks ./reports ./workspaces ./wiremock/mappings

# 2. Copiar APKs a la carpeta
cp /ruta/a/tus/apks/*.apk ./apks/

# 3. Configurar entorno
cp .env.example .env
# Editar .env con valores reales

# 4. Construir y levantar contenedores
docker-compose up --build -d

# 5. Verificar estado
docker-compose ps
docker-compose logs orchestrator

# 6. Acceder a la aplicación
open http://localhost:3000
```

### 3. Despliegue en Producción

```bash
# 1. Preparar servidor
sudo apt update
sudo apt install -y docker docker-compose git nginx

# 2. Clonar repositorio
git clone <repositorio> /opt/appium-orchestrator
cd /opt/appium-orchestrator

# 3. Configurar entorno
sudo mkdir -p /opt/apk-storage /opt/reports /opt/workspaces
sudo chown -R $USER:$USER /opt/apk-storage /opt/reports /opt/workspaces
cp .env.example .env
# Editar .env con valores de producción

# 4. Configurar Nginx
sudo tee /etc/nginx/sites-available/appium-orchestrator > /dev/null <<EOF
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# 5. Habilitar sitio
sudo ln -s /etc/nginx/sites-available/appium-orchestrator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 6. Configurar SSL (con Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com

# 7. Levantar aplicación
docker-compose up -d
```

## 🔧 Gestión de Dependencias

### 1. Dependencias del Sistema

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
    nodejs \
    npm \
    git \
    android-tools-adb \
    android-sdk-platform-tools \
    default-jdk \
    redis-tools \
    curl \
    wget \
    unzip

# CentOS/RHEL
sudo yum install -y \
    nodejs \
    npm \
    git \
    android-tools \
    java-1.8.0-openjdk \
    redis \
    curl \
    wget \
    unzip

# macOS
brew install node git android-platform-tools
```

### 2. Dependencias de Node.js

```json
{
  "name": "appium-orchestrator-web",
  "version": "1.0.0",
  "description": "Web interface for Appium test orchestration",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest",
    "lint": "eslint .",
    "build": "echo 'No build step required'",
    "docker:build": "docker build -t appium-orchestrator .",
    "docker:dev": "docker-compose up --build",
    "docker:prod": "docker-compose -f docker-compose.prod.yml up -d"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "passport": "^0.6.0",
    "passport-google-oauth20": "^2.0.0",
    "express-session": "^1.17.3",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "archiver": "^6.0.1",
    "simple-git": "^3.20.0",
    "winston": "^3.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "eslint": "^8.50.0",
    "supertest": "^6.3.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 3. Configuración de Android SDK

```bash
# Configurar ANDROID_HOME
echo 'export ANDROID_HOME=$HOME/Android/Sdk' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools' >> ~/.bashrc
source ~/.bashrc

# Verificar instalación
adb version
```

## 📊 Monitoreo y Mantenimiento

### 1. Monitoreo de Salud

```javascript
// server.js - Endpoints de monitoreo
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    environment: process.env.NODE_ENV,
  };

  res.json(health);
});

app.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    environment: process.env.NODE_ENV,
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      wiremock: await checkWiremock(),
      git: await checkGit(),
    },
  };

  const allHealthy = Object.values(health.checks).every(
    (check) => check.healthy,
  );
  health.status = allHealthy ? 'healthy' : 'degraded';

  res.status(allHealthy ? 200 : 503).json(health);
});

async function checkDatabase() {
  // Implementar verificación de base de datos si aplica
  return { healthy: true, message: 'Database connection OK' };
}

async function checkRedis() {
  try {
    const redis = require('redis');
    const client = redis.createClient({ url: process.env.REDIS_URL });
    await client.connect();
    await client.ping();
    await client.disconnect();
    return { healthy: true, message: 'Redis connection OK' };
  } catch (error) {
    return { healthy: false, message: `Redis error: ${error.message}` };
  }
}

async function checkWiremock() {
  try {
    const response = await fetch(`${process.env.WIREMOCK_URL}/__admin/`);
    return {
      healthy: response.ok,
      message: response.ok ? 'WireMock OK' : 'WireMock not responding',
    };
  } catch (error) {
    return { healthy: false, message: `WireMock error: ${error.message}` };
  }
}

async function checkGit() {
  try {
    const { simpleGit } = require('simple-git');
    const git = simpleGit();
    await git.raw(['--version']);
    return { healthy: true, message: 'Git OK' };
  } catch (error) {
    return { healthy: false, message: `Git error: ${error.message}` };
  }
}
```

### 2. Logs y Auditoría

```javascript
// server.js - Configuración de logging
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'appium-orchestrator' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Middleware de logging
const requestLogger = (req, res, next) => {
  if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
    logger.info({
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

app.use(requestLogger);
```

### 3. Tareas de Mantenimiento

```bash
#!/bin/bash
# scripts/maintenance.sh

set -e

echo "Iniciando tareas de mantenimiento..."

# Limpiar logs antiguos
find logs/ -name "*.log" -mtime +30 -delete

# Limpiar reportes antiguos
find public/reports/ -name "*" -type d -mtime +90 -exec rm -rf {} +

# Limpiar workspaces antiguos
if [ -n "$PERSISTENT_WORKSPACES_ROOT" ]; then
    find "$PERSISTENT_WORKSPACES_ROOT" -name "*" -type d -mtime +7 -exec rm -rf {} +
fi

# Limpiar caché de npm
npm cache clean --force

# Reiniciar aplicación si es necesario
if [ "$1" = "restart" ]; then
    echo "Reiniciando aplicación..."
    if command -v docker-compose &> /dev/null; then
        docker-compose restart
    else
        # Implementar lógica de reinicio para otros entornos
        echo "Implementar lógica de reinicio para este entorno"
    fi
fi

echo "Mantenimiento completado."
```

## 🚨 Resolución de Problemas

### 1. Problemas Comunes y Soluciones

```javascript
// docs/troubleshooting.md - Guía de solución de problemas
const troubleshooting = {
  // Problemas de Conexión
  connection: {
    'adb devices not found': {
      symptoms: ['Error: No devices found', 'adb: command not found'],
      solutions: [
        'Verificar instalación de Android SDK',
        'Configurar ANDROID_HOME en PATH',
        'Reiniciar servidor ADB: adb kill-server && adb start-server',
      ],
    },
    'WireMock connection failed': {
      symptoms: ['ECONNREFUSED', 'WireMock service unavailable'],
      solutions: [
        'Verificar que WireMock está corriendo: docker-compose ps wiremock',
        'Revisar configuración de WIREMOCK_URL',
        'Reiniciar WireMock: docker-compose restart wiremock',
      ],
    },
  },

  // Problemas de Rendimiento
  performance: {
    'High memory usage': {
      symptoms: ['Node.js out of memory', 'Slow response times'],
      solutions: [
        'Aumentar límite de memoria: node --max-old-space-size=4096 server.js',
        'Optimizar uso de workers',
        'Monitorear y limpiar memoria periódicamente',
      ],
    },
    'Worker deadlock': {
      symptoms: ['Tests stuck in queue', 'Workers inactive'],
      solutions: [
        'Implementar lógica de detección de deadlock',
        'Reiniciar workers bloqueados',
        'Configurar timeout para jobs',
      ],
    },
  },

  // Problemas de Autenticación
  authentication: {
    'Google OAuth failing': {
      symptoms: ['Authentication error', 'Redirect loop'],
      solutions: [
        'Verificar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET',
        'Configurar correctamente APP_BASE_URL',
        'Verificar configuración de OAuth en Google Cloud Console',
      ],
    },
  },
};
```

### 2. Monitoreo de Recursos

```bash
#!/bin/bash
# scripts/monitor.sh

# Monitorear uso de recursos
echo "=== Monitoreo del Sistema ==="
echo "Fecha: $(date)"
echo ""

# Uso de CPU y Memoria
echo "Uso de Recursos:"
top -bn1 | grep "Cpu(s)" | head -1
free -h
echo ""

# Espacio en Disco
echo "Espacio en Disco:"
df -h /
echo ""

# Procesos de Node.js
echo "Procesos de Node.js:"
ps aux | grep node | grep -v grep
echo ""

# Conexiones de Red
echo "Conexiones de Red:"
netstat -tuln | grep ":3000"
echo ""

# Logs de Errores Recientes
echo "Errores Recientes:"
if [ -f "logs/error.log" ]; then
    tail -n 10 logs/error.log
else
    echo "No se encontró archivo de errores"
fi
```

### 3. Recuperación ante Desastres

```bash
#!/bin/bash
# scripts/backup.sh

set -e

BACKUP_DIR="/backups/appium-orchestrator"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$DATE"

echo "Iniciando backup..."

# Crear directorio de backup
mkdir -p "$BACKUP_PATH"

# Backup de archivos de configuración
cp .env "$BACKUP_PATH/"
cp -r wiremock/mappings "$BACKUP_PATH/"

# Backup de reports (últimos 7 días)
if [ -d "public/reports" ]; then
    find public/reports -name "*" -type d -mtime -7 -exec cp -r {} "$BACKUP_PATH/" \;
fi

# Backup de base de datos (si aplica)
# mysqldump -u user -p database > "$BACKUP_PATH/database.sql"

# Comprimir backup
tar -czf "$BACKUP_PATH.tar.gz" -C "$BACKUP_DIR" "backup_$DATE"
rm -rf "$BACKUP_PATH"

# Limpiar backups antiguos (mantener últimos 30 días)
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +30 -delete

echo "Backup completado: $BACKUP_PATH.tar.gz"
```

## 📈 Métricas y Optimización

### 1. Métricas Clave

```javascript
// public/js/metrics.js - Sistema de métricas
class MetricsCollector {
  constructor() {
    this.metrics = {
      testExecution: {
        total: 0,
        passed: 0,
        failed: 0,
        averageDuration: 0,
      },
      system: {
        uptime: 0,
        memoryUsage: [],
        cpuUsage: [],
      },
      userActivity: {
        activeUsers: 0,
        testsPerHour: [],
        popularFeatures: {},
      },
    };
  }

  recordTestExecution(duration, status) {
    this.metrics.testExecution.total++;

    if (status === 'passed') {
      this.metrics.testExecution.passed++;
    } else if (status === 'failed') {
      this.metrics.testExecution.failed++;
    }

    // Calcular duración promedio
    const current = this.metrics.testExecution.averageDuration;
    const total = this.metrics.testExecution.total;
    this.metrics.testExecution.averageDuration =
      (current * (total - 1) + duration) / total;
  }

  recordSystemMetrics() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    this.metrics.system.uptime = uptime;
    this.metrics.system.memoryUsage.push({
      timestamp: Date.now(),
      ...memUsage,
    });

    // Mantener solo últimos 1000 registros
    if (this.metrics.system.memoryUsage.length > 1000) {
      this.metrics.system.memoryUsage =
        this.metrics.system.memoryUsage.slice(-1000);
    }
  }

  getPerformanceReport() {
    return {
      testExecution: this.metrics.testExecution,
      systemHealth: {
        uptime: this.formatUptime(this.metrics.system.uptime),
        memoryUsage: this.getLatestMemoryUsage(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  getLatestMemoryUsage() {
    const latest = this.metrics.system.memoryUsage.slice(-1)[0];
    return latest
      ? {
          rss: this.formatBytes(latest.rss),
          heapTotal: this.formatBytes(latest.heapTotal),
          heapUsed: this.formatBytes(latest.heapUsed),
          external: this.formatBytes(latest.external),
        }
      : null;
  }

  formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// Instancia global
const metricsCollector = new MetricsCollector();
window.metricsCollector = metricsCollector;
```

## 📖 Documentos Relacionados

- [01-arquitectura-general.md](../01-arquitectura-general.md) - Arquitectura general
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
- [04-features/02-workspace-management.md](./02-workspace-management.md) - Gestión de workspaces
- [planning_docker.md](../planning_docker.md) - Plan de Dockerización
- [issue-worker-deadlock.md](../issue-worker-deadlock.md) - Problemas conocidos y soluciones
