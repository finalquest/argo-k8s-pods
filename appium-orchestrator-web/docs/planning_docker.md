# Plan de Dockerización Local

## Objetivo

Crear una configuración de Docker que permita levantar toda la aplicación de orquestación con un solo comando para facilitar el desarrollo y las pruebas locales. La configuración se centrará en un setup sin Redis, utilizando la variable `LOCAL_ADB_HOST` para la conexión con el emulador.

---

### Etapa 1: El `Dockerfile`

Se creará un `Dockerfile` que defina la imagen autocontenida de la aplicación.

1.  **Imagen Base:** Usar una imagen oficial de Node.js, como `node:18-bullseye`, que incluye un sistema base Debian para facilitar la instalación de dependencias.
2.  **Dependencias del SO:** Instalar todas las herramientas de línea de comandos que los scripts de la aplicación necesitan para funcionar:
    *   `git`
    *   `adb` (a través de `android-sdk-platform-tools`)
    *   `oras`
    *   `redis-cli`
3.  **Código de la App:** Copiar los archivos de la aplicación (`server.js`, `worker.js`, `package.json`, `scripts/`, `public/`, etc.) a un directorio de trabajo dentro de la imagen.
4.  **Dependencias de Node.js:** Ejecutar `npm install` para descargar e instalar las dependencias de Node.js definidas en `package.json`.
5.  **Puerto y Comando de Inicio:**
    *   Exponer el puerto `3000` para permitir el acceso a la interfaz web.
    *   Definir `CMD ["node", "server.js"]` como el comando por defecto para iniciar el servidor cuando se lance un contenedor.

---

### Etapa 2: Archivos de Configuración

Para gestionar la configuración de forma limpia y evitar hardcodear valores, se crearán los siguientes archivos:

1.  **`.dockerignore`:** Excluirá archivos y carpetas que no son necesarios en la imagen final (`node_modules`, `.git`, `*.md`, etc.). Esto reduce el tamaño de la imagen y acelera el proceso de build.
2.  **`.env.example`:** Un archivo de ejemplo que servirá como plantilla y documentación de las variables de entorno requeridas. El usuario deberá copiarlo a `.env` y completarlo. Las variables a incluir son:
    *   `GIT_REPO_URL`, `GIT_USER`, `GIT_PAT`
    *   `WIREMOCK_ADMIN_URL`
    *   `MAX_PARALLEL_TESTS`
    *   `APK_REGISTRY`, `APK_PATH`
    *   `LOCAL_ADB_HOST` (ej: `host.docker.internal:5555`)

---

### Etapa 3: Orquestación con `docker-compose.yml`

Se utilizará Docker Compose para simplificar el proceso de levantar el entorno local.

1.  **Definir el Servicio:** Se creará un archivo `docker-compose.yml` con un único servicio llamado `orchestrator`.
2.  **Configuración del Build:** Se especificará que el servicio se construye a partir del `Dockerfile` en el directorio actual.
3.  **Mapeo de Puertos:** Se mapeará el puerto `3000` del host al puerto `3000` del contenedor para acceder a la UI desde el navegador.
4.  **Variables de Entorno:** Se configurará para que cargue automáticamente las variables desde el archivo `.env` en la raíz del proyecto.

---

### Flujo de Uso para el Desarrollador

1.  Copiar `.env.example` a `.env` y rellenar las variables.
2.  Asegurarse de que el emulador de Android esté corriendo en la máquina host.
3.  En la variable `LOCAL_ADB_HOST` del archivo `.env`, poner el valor `host.docker.internal:5555` (o el puerto que corresponda).
4.  Ejecutar `docker-compose up --build` desde la raíz del proyecto.
5.  Acceder a la aplicación en `http://localhost:3000`.
