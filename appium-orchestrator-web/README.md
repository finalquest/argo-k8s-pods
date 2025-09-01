# Instrucciones de Docker para Appium Orchestrator

Este documento describe cómo construir y ejecutar la aplicación Appium Orchestrator utilizando Docker y Docker Compose. 

## Requisitos Previos

Antes de comenzar, asegúrate de tener lo siguiente:

1.  **Docker Desktop:** Instalado y corriendo en tu máquina (Mac, Windows, o Linux).
2.  **Archivo de Entorno (`.env`):**
    *   Copia el archivo de ejemplo: `cp .env.example .env`.
    *   Edita el archivo `.env` y rellena las variables de entorno requeridas (`GIT_PAT`, `LOCAL_ADB_HOST`, etc.).
3.  **Carpeta de APKs:**
    *   Crea una carpeta llamada `apks` en la raíz del proyecto.
    *   Coloca al menos un archivo `.apk` dentro de esta carpeta.

---

## Uso para Desarrollo Local (Recomendado)

Para levantar la aplicación en tu entorno local, la forma más sencilla es usar Docker Compose. Este método se encargará de construir la imagen, configurar las variables de entorno y montar los volúmenes necesarios.

1.  **Asegúrate de que tu emulador de Android esté corriendo** en tu máquina.

2.  **Configura `LOCAL_ADB_HOST`:** En tu archivo `.env`, asegúrate de que la variable `LOCAL_ADB_HOST` apunte a `host.docker.internal:5555` (o el puerto que corresponda). Esto permite que el contenedor Docker se conecte al emulador que corre en tu máquina.

3.  **Levanta el Contenedor:** Ejecuta el siguiente comando desde la raíz del proyecto:
    ```bash
    docker-compose up --build
    ```
    La opción `--build` reconstruirá la imagen si ha habido cambios en el `Dockerfile` o en el código fuente.

4.  **Accede a la Aplicación:** Abre tu navegador y ve a `http://localhost:3000`.

---

## Construcción Multi-Plataforma (Avanzado)

Cuando necesites distribuir la imagen para que se ejecute en máquinas con una arquitectura diferente a la tuya (ej. construir en una Mac M1 para un servidor Linux con procesador Intel/AMD), debes usar `docker buildx`.

### 1. (Opcional) Crear un Builder

Si es la primera vez que usas `buildx`, es recomendable crear y activar un nuevo "builder" que tenga las capacidades multi-plataforma. Este paso solo se hace una vez:

```bash
docker buildx create --name mybuilder --use
docker buildx inspect --bootstrap
```

### 2. Construir para una Arquitectura Específica (Ej: linux/amd64)

Este caso es útil si solo te interesa un tipo de arquitectura de destino que es diferente a la tuya.

```bash
# Reemplaza "tu-usuario-de-dockerhub" con tu nombre de usuario en Docker Hub
DOCKER_HUB_USER="tu-usuario-de-dockerhub"
IMAGE_TAG="latest-amd64"

docker buildx build --platform linux/amd64 -t ${DOCKER_HUB_USER}/appium-orchestrator:${IMAGE_TAG} --push .
```

*   `--platform linux/amd64`: Le indica a Docker que construya la imagen para esta arquitectura específica.
*   `--push`: Esencial para la compilación multi-plataforma. Construye y empuja la imagen al registro especificado en la etiqueta.

### 3. Construir para Múltiples Arquitecturas (Recomendado para Distribución)

Este es el método más flexible. Crea una única "etiqueta" en el registro que contiene las imágenes para varias arquitecturas. Docker descargará automáticamente la versión correcta para la máquina que la solicite.

```bash
# Reemplaza "tu-usuario-de-dockerhub" con tu nombre de usuario en Docker Hub
DOCKER_HUB_USER="tu-usuario-de-dockerhub"
IMAGE_TAG="latest"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ${DOCKER_HUB_USER}/appium-orchestrator:${IMAGE_TAG} \
  --push .
```

*   `--platform linux/amd64,linux/arm64`: Especifica todas las arquitecturas de destino, separadas por comas.
*   `--push`: Es obligatorio en este caso para subir el "manifest list" que agrupa las imágenes al registro.



---

## Uso con `docker run` (Manual)

Si prefieres no usar `docker-compose` o quieres entender qué hace por debajo, puedes construir y ejecutar la imagen manualmente.

### 1. Construir la Imagen

Primero, construye la imagen de Docker desde el `Dockerfile` y etiquétala (por ejemplo, como `appium-orchestrator`):

```bash
docker build -t appium-orchestrator .
```

### 2. Ejecutar el Contenedor

Una vez construida la imagen, ejecútala con el siguiente comando. Este comando replica la configuración del `docker-compose.yml`:

```bash
docker run --rm -it \
  -p 3000:3000 \
  -v "$(pwd)/apks:/app/apks" \
  -v "$(pwd)/.env:/app/.env" \
  --name appium_orchestrator_manual \
  appium-orchestrator
```

**Desglose de los Parámetros:**

*   `--rm`: Elimina el contenedor automáticamente cuando se detiene.
*   `-it`: Ejecuta el contenedor en modo interactivo para que puedas ver los logs en tu terminal.
*   `-p 3000:3000`: Mapea el puerto 3000 de tu máquina al puerto 3000 del contenedor.
*   `-v "$(pwd)/apks:/app/apks"`: Monta la carpeta de APKs para que la app la lea.
*   `-v "$(pwd)/.env:/app/.env"`: Monta tu archivo `.env` local dentro del contenedor. La aplicación lo leerá al iniciar.
*   `--name ...`: Le da un nombre descriptivo al contenedor.
*   `appium-orchestrator`: El nombre de la imagen que quieres ejecutar.


```
