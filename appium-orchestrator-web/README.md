# Appium Orchestrator Web

Una interfaz web para orquestar la ejecución de tests de Appium en paralelo, con soporte para dispositivos locales y una granja de emuladores remotos.

## Características Principales
- **Interfaz Web:** Gestiona y visualiza la ejecución de tests desde el navegador.
- **Ejecución en Paralelo:** Utiliza un sistema de workers para correr múltiples tests simultáneamente.
- **Autenticación Segura:** Acceso restringido a miembros de una organización a través de Google OAuth 2.0.
- **Modo de Desarrollo Dual:** Soporte para ejecutar tests tanto en una granja de dispositivos remotos como en dispositivos locales conectados por ADB.

---

## Configuración del Entorno

Antes de comenzar, necesitas configurar tu archivo de entorno.

1.  **Copia el archivo de ejemplo:**
    ```bash
    cp .env.example .env
    ```
2.  **Edita el archivo `.env`** y rellena las siguientes variables:

    -   **Para Git:** `GIT_REPO_URL`, `GIT_USER`, `GIT_PAT`.
    -   **Para Autenticación de Google:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `APP_BASE_URL`, `GOOGLE_HOSTED_DOMAIN`.
    -   **Para el Modo de Ejecución:**
        -   `DEVICE_SOURCE`: Establécelo a `local` para usar dispositivos conectados por ADB. Déjalo sin definir o con otro valor para usar la granja de emuladores remotos.

---

## Guía de Desarrollo Local

### Opción 1: Ejecutar con Node.js (Recomendado para desarrollo de backend)

Este método es el más simple y rápido. El servidor se ejecuta directamente en tu máquina.

**Requisitos:**
- Node.js instalado.
- `adb` instalado y accesible en el PATH de tu sistema.

**Pasos:**
1.  `npm install`
2.  `node server.js`

### Opción 2: Ejecutar con Docker (Simula el entorno de producción)

Este método ejecuta la aplicación en un contenedor aislado.

**Pasos:**

1.  **Prepara tu Servidor ADB:** Para que el contenedor pueda comunicarse con los dispositivos de tu máquina, debes reiniciar el servidor ADB para que acepte conexiones de red.
    ```bash
    # Detiene el servidor actual
    adb kill-server
    # Inicia el servidor escuchando en todas las interfaces
    adb -a -P 5037 start-server
    ```
    > **⚠️ Advertencia:** Esto expone tu servidor ADB a tu red local. Úsalo solo en redes seguras.

2.  **Ejecuta el Contenedor:** Usa el siguiente comando, que descarga la imagen de Docker Hub y la configura para el desarrollo local.
    ```bash
    docker run --rm -it 
      -p 3000:3000 
      -e DEVICE_SOURCE=local 
      -e ADB_SERVER_SOCKET=tcp:host.docker.internal:5037 
      -v "$(pwd)/.env:/app/.env" 
      ferbas/appium-orchestrator:0.0.1
    ```

3.  **Cuando termines,** es una buena práctica restaurar el servidor ADB a su modo por defecto por seguridad:
    ```bash
    adb kill-server
    ```

---

## Construcción de la Imagen de Docker (Opcional)

Si prefieres construir tu propia imagen en lugar de usar la de Docker Hub, puedes usar los siguientes comandos.

### Construcción Simple
```bash
docker build -t appium-orchestrator .
```

### Construcción Multi-Plataforma (Avanzado)

Usa `docker buildx` para construir imágenes para arquitecturas `linux/amd64` (Intel/AMD) y `linux/arm64` (Apple Silicon M1/M2, etc.).

```bash
# Reemplaza "tu-usuario" con tu usuario de Docker Hub
DOCKER_HUB_USER="tu-usuario"
IMAGE_TAG="latest"

docker buildx build 
  --platform linux/amd64,linux/arm64 
  -t ${DOCKER_HUB_USER}/appium-orchestrator:${IMAGE_TAG} 
  --push .
```
> **Nota:** `--push` es obligatorio para la construcción multi-plataforma.

```
