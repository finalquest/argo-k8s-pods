# Plan de Implementación: Runner Job de Appium (Real)

## 1. Objetivo

Ejecutar un único test de Appium de forma atómica, aislada y efímera. Este script es la implementación "real" que reemplaza al simulador y es invocado por el Orquestador Web.

## 2. Tecnología

*   **Unidad de Ejecución:** Proceso de Bash (`feature-runner.sh`) para pruebas locales (Fase 1) o un `Job` de Kubernetes (Fase 2).
*   **Entorno:** Contenedor Docker o máquina local con todas las dependencias requeridas.
*   **Dependencias Clave:** `git`, `yarn`, `node`, `adb`, `oras`, `redis-cli`, `appium`.

## 3. Lógica del Script `feature-runner.sh`

El script recibe 3 argumentos: `BRANCH`, `CLIENT`, `FEATURE_NAME`.

1.  **Clonado del Repositorio:** Clona la `BRANCH` especificada desde el `GIT_REPO_URL` usando las credenciales (`GIT_USER`, `GIT_PAT`).
2.  **Instalación de Dependencias:** Ejecuta `yarn install` en el repositorio clonado.
3.  **Descarga de APK:** Usa `oras` para descargar el APK especificado por `APK_REGISTRY` y `APK_PATH`.
4.  **Búsqueda de Emulador:** Se conecta a Redis (`RHOST`, `RPORT`) y busca un emulador con estado `idle`. Si lo encuentra, lo reserva marcándolo como `busy`.
5.  **Preparación del Emulador:** Se conecta al emulador vía `adb`, desinstala la versión anterior de la app e instala el APK recién descargado.
6.  **Ejecución del Test:**
    a. Inicia un servidor Appium en segundo plano en un puerto disponible.
    b. Genera un archivo de configuración de `wdio` al vuelo, especificando el feature a ejecutar (`specs`), el emulador (`udid`) y los puertos correctos.
    c. Ejecuta `wdio` con esta configuración.
7.  **Limpieza:**
    a. Detiene el proceso del servidor Appium.
    b. Se desconecta del emulador.
    c. Actualiza el estado del emulador en Redis a `idle`, liberándolo para el siguiente test.
8.  **Salida:** El script finaliza con el código de salida de `wdio`, permitiendo saber si el test pasó o falló.

## 4. Salida y Logs

El script es verboso e imprime su progreso usando `logger.sh` en cada paso. Toda la salida se emite a `stdout`, permitiendo que el Orquestador Web la capture y la retransmita en tiempo real al usuario.