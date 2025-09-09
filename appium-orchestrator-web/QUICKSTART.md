# Guía de Inicio Rápido

Bienvenido a Appium Orchestrator Web! Esta guía te ayudará a configurar y utilizar la plataforma rápidamente para ejecutar tus tests de Appium.

## 🚀 ¿Qué es Appium Orchestrator Web?

Appium Orchestrator Web es una plataforma web que te permite:
- Ejecutar tests de Appium en dispositivos móviles
- Gestionar múltiples dispositivos en paralelo
- Integrar servicios mock con WireMock
- Visualizar el progreso de los tests en tiempo real
- Gestionar versiones de APKs y features

## 📋 Prerrequisitos

### Antes de Empezar
Asegúrate de tener lo siguiente:

1. **Node.js** (versión >= 18.0.0)
2. **Android SDK** con ADB instalado
3. **Un dispositivo móvil** o emulador para testing
4. **Acceso a un repositorio Git** con tus tests de Appium
5. **Credenciales de Google OAuth** para autenticación (opcional)

### Verificar Prerrequisitos
```bash
# Verificar Node.js
node --version
npm --version

# Verificar ADB
adb version

# Verificar dispositivos conectados
adb devices
```

## 🏗️ Instalación Rápida

### 1. Clonar el Proyecto
```bash
git clone <URL-del-repositorio>
cd appium-orchestrator-web
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Variables de Entorno
```bash
# Copiar archivo de configuración
cp .env.example .env

# Editar configuración básica
nano .env
```

Configura al menos estas variables:
```bash
# Configuración básica
PORT=3000
NODE_ENV=development

# Repositorio de tests
GIT_REPO_URL=https://github.com/tu-usuario/tu-repo-tests.git
GIT_USER=tu-usuario-git
GIT_PAT=tu-personal-access-token

# Directorio de APKs
LOCAL_APK_DIRECTORY=./apks
```

### 4. Crear Directorios Necesarios
```bash
mkdir -p ./apks ./reports ./workspaces
```

### 5. Iniciar la Aplicación
```bash
npm start
```

## 🎯 Primeros Pasos

### 1. Acceder a la Interfaz Web
Abre tu navegador y visita: `http://localhost:3000`

### 2. Preparar tus APKs
Copia tus archivos APK al directorio `./apks`:
```bash
# Ejemplo
cp /ruta/a/tu/app.apk ./apks/
cp /ruta/a/tu/app-debug.apk ./apks/
```

### 3. Seleccionar Configuración Básica
En la interfaz web:
1. **Selecciona una Branch**: Elige la rama de tu repositorio
2. **Selecciona un Cliente**: Elige el cliente/aplicación
3. **Selecciona un Dispositivo**: Elige un dispositivo conectado
4. **Selecciona una APK**: Elige la versión de la aplicación

### 4. Preparar el Workspace
Haz clic en **"Preparar Workspace"** para:
- Clonar el repositorio de tests
- Instalar dependencias
- Preparar el entorno de ejecución

### 5. Buscar Features
Haz clic en **"Buscar Features"** para cargar la lista de features disponibles.

## 🧪 Ejecutar tu Primer Test

### Ejecución Individual
1. **Selecciona una Feature** de la lista
2. **Configura opciones** (si es necesario):
   - Grabar Mappings: Para capturar interacciones
   - Usar Mappings Existentes: Para usar mocks previos
3. **Haz clic en "Run"** para ejecutar el test

### Ejecución en Lote
1. **Selecciona múltiples features** usando los checkboxes
2. **Configura opciones** para el lote
3. **Haz clic en "Ejecutar Selección"**

### Monitorear Ejecución
- **Consola de Logs**: Ver salida en tiempo real
- **Indicadores de Progreso**: Visualizar avance en el editor
- **Estado de Workers**: Monitorear workers activos

## 🔧 Configuración Avanzada

### WireMock para Mocking
Appium Orchestrator Web incluye integración con WireMock para mocking de servicios:

1. **Habilitar WireMock**: Asegúrate que WireMock esté corriendo
2. **Grabar Mappings**: 
   - Activa "Grabar Mappings" al ejecutar un test
   - El sistema capturará las interacciones
3. **Usar Mappings**: 
   - Activa "Usar Mappings Existentes"
   - Selecciona el mapping a utilizar

### Workspaces Persistentes
Para optimizar el desarrollo iterativo:

```bash
# Configurar workspaces persistentes
echo "PERSISTENT_WORKSPACES_ROOT=./workspaces" >> .env
```

Esto permite:
- Reutilizar directorios de trabajo
- Ahorrar tiempo en instalaciones
- Mantener cambios locales

### Múltiples Dispositivos
Para ejecutar tests en paralelo:

```bash
# Configurar múltiples workers
echo "MAX_PARALLEL_TESTS=4" >> .env
```

El sistema gestionará automáticamente:
- Asignación de dispositivos
- Ejecución paralela
- Gestión de recursos

## 📊 Ver Resultados

### Reportes de Ejecución
- **Reportes Automáticos**: Se generan automáticamente después de cada test
- **Allure Reports**: Accede a reportes detallados con Allure
- **Histórico**: Consulta ejecuciones anteriores

### Acceder a Reportes
1. **En la Interfaz**: Haz clic en el botón de reportes
2. **Directorio de Reports**: Los reportes se guardan en `./reports/`
3. **Allure**: Ejecuta `allure serve ./reports` para ver reportes interactivos

## 🐛 Solución de Problemas Comunes

### Problemas de Conexión
```bash
# Verificar que el servidor está corriendo
curl http://localhost:3000/health

# Verificar dispositivos
adb devices -l
```

### Problemas con APKs
```bash
# Verificar que los APKs existen
ls -la ./apks/

# Verificar instalación de APK
adb install -r ./apks/tu-app.apk
```

### Problemas con Git
```bash
# Verificar conexión al repositorio
git ls-remote <TU_REPO_URL>

# Verificar credenciales
git config --list
```

### Problemas con Workers
```bash
# Verificar procesos de workers
ps aux | grep worker

# Reiniciar aplicación
npm start
```

## 📚 Recursos Adicionales

### Documentación
- [README Principal](README.md) - Documentación completa
- [Guía de Contribución](CONTRIBUTING.md) - Para desarrolladores
- [Documentación Detallada](docs/) - Guías técnicas

### Comandos Útiles
```bash
# Ver logs del servidor
npm run dev

# Ejecutar tests
npm test

# Verificar sintaxis
npm run lint

# Construir para producción
npm run build
```

### Configuración de Docker
```bash
# Usar Docker
docker-compose up --build

# Ver estado de contenedores
docker-compose ps
```

## 🆘 Ayuda y Soporte

Si encuentras problemas:
1. **Revisa esta guía** para soluciones comunes
2. **Consulta la documentación** en `docs/`
3. **Crea un issue** en el repositorio
4. **Contacta al equipo de desarrollo**

---

## 🎉 ¡Felicidades!

Has completado la configuración inicial de Appium Orchestrator Web. Ahora estás listo para:

- ✅ Ejecutar tests de Appium
- ✅ Gestionar múltiples dispositivos
- ✅ Utilizar WireMock para mocking
- ✅ Visualizar resultados en tiempo real
- ✅ Generar reportes detallados

¡Explora la interfaz y comienza a optimizar tu flujo de testing! 🚀