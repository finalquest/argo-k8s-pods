# Plan de Implementación: Runner Job de Appium (Real)

## 1. Objetivo

Ejecutar un único test de Appium de forma atómica, aislada y efímera. Este script es la implementación "real" que reemplaza al simulador y es invocado por el Orquestador Web.

## 2. Tecnología

*   **Unidad de Ejecución:** Proceso de Bash (`feature-runner.sh`) para pruebas locales (Fase 1) o un `Job` de Kubernetes (Fase 2).
*   **Entorno:** Contenedor Docker o máquina local con todas las dependencias requeridas.
*   **Dependencias Clave:** `git`, `yarn`, `node`, `adb`, `oras`, `redis-cli`, `appium`.

## 3. Lógica del Script `feature-runner.sh`

El script recibe 3 argumentos: `BRANCH`, `CLIENT`, `FEATURE_NAME`.

1.  **Validación en Redis:** El script siempre intenta conectarse a Redis para validar que puede encontrar un emulador `idle`. Informa del resultado de esta validación.
2.  **Decisión de Host:** Comprueba si la variable de entorno `LOCAL_ADB_HOST` está definida.
    *   Si está definida, la usa como el host de ejecución final. Esto permite bypassear Redis para la ejecución real y usar un emulador local.
    *   Si no está definida, usa el host que encontró en Redis.
3.  **Modificación de Estado en Redis:** El script solo marca un emulador como `busy` y posteriormente `idle` si efectivamente está usando el host obtenido de Redis.
4.  **Clonado del Repositorio:** Clona la `BRANCH` especificada.
5.  **Instalación de Dependencias y APK:** Ejecuta `yarn install` y descarga el APK con `oras`.
6.  **Ejecución del Test:** Inicia un servidor Appium y ejecuta el `FEATURE_NAME` específico con `wdio`.
7.  **Limpieza:** Detiene Appium y, si aplica, libera el emulador en Redis.

## 4. Salida y Logs

El script es verboso e imprime su progreso usando `logger.sh` en cada paso. Toda la salida se emite a `stdout`, permitiendo que el Orquestador Web la capture y la retransmita en tiempo real al usuario.