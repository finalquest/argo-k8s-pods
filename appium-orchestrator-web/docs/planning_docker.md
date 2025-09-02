# Plan de Dockerización Local

## Objetivo

Crear una configuración de Docker que permita levantar toda la aplicación de orquestación con un solo comando para facilitar el desarrollo y las pruebas locales. La configuración usará por defecto el modo de "Directorio Local de APKs".

---

### Etapa 1: El `Dockerfile`

Se creará un `Dockerfile` que defina la imagen autocontenida de la aplicación.

1.  **Imagen Base:** Usar una imagen oficial de Node.js, como `node:18-bullseye`.
2.  **Dependencias del SO:** Instalar las herramientas de línea de comandos necesarias: `git`, `adb`, `oras`, `redis-cli`.
3.  **Código de la App:** Copiar los archivos de la aplicación a un directorio de trabajo dentro de la imagen (ej: `/app`).
4.  **Dependencias de Node.js:** Ejecutar `npm install`.
5.  **Puerto y Comando de Inicio:** Exponer el puerto `3000` y definir `CMD ["node", "server.js"]`.

---

### Etapa 2: Archivos de Configuración

1.  **`.dockerignore`:** Excluirá archivos y carpetas innecesarios (`node_modules`, `.git`, `*.md`, etc.).
2.  **`.env.example`:** Un archivo de ejemplo con las variables de entorno requeridas por la aplicación. **Ya no es necesario que el usuario defina `LOCAL_APK_DIRECTORY` aquí**, ya que se gestionará en `docker-compose.yml`. Las variables a incluir son:
    *   `GIT_REPO_URL`, `GIT_USER`, `GIT_PAT`
    *   `WIREMOCK_ADMIN_URL`
    *   `MAX_PARALLEL_TESTS`
    *   `LOCAL_ADB_HOST` (ej: `host.docker.internal:5555`)

---

### Etapa 3: Orquestación con `docker-compose.yml`

Se utilizará Docker Compose para definir y ejecutar el contenedor de forma declarativa.

1.  **Definir el Servicio:** Se creará un archivo `docker-compose.yml` con un servicio `orchestrator`.
2.  **Build y Puertos:** Se configurará para que construya la imagen desde el `Dockerfile` y mapee el puerto `3000:3000`.
3.  **Variables de Entorno:**
    *   Se configurará para que cargue las variables generales desde un archivo `.env`.
    *   Se definirá explícitamente la variable `LOCAL_APK_DIRECTORY` para que apunte a la ruta *dentro* del contenedor donde se montarán los APKs (ej: `LOCAL_APK_DIRECTORY=/app/apks`).
4.  **Volumen de APKs:**
    *   Se añadirá una sección de `volumes`.
    *   Se mapeará una carpeta local del host (ej: `./apks`) a la ruta definida en `LOCAL_APK_DIRECTORY` dentro del contenedor (`/app/apks`). Esto permite que los archivos `.apk` que pongas en la carpeta `./apks` de tu máquina estén disponibles para la aplicación dentro de Docker.

---

### Flujo de Uso para el Desarrollador

1.  Crear una carpeta llamada `apks` en la raíz del proyecto.
2.  Colocar uno o más archivos `.apk` dentro de esa carpeta `apks`.
3.  Copiar `.env.example` a `.env` y rellenar las variables (asegurándose de que `LOCAL_ADB_HOST` apunte a `host.docker.internal:5555`).
4.  Ejecutar `docker-compose up --build`.
5.  Acceder a la aplicación en `http://localhost:3000`. El selector de "Versión APK" debería mostrar los archivos de tu carpeta `apks`.