# Plan de Implementación: Conexión Directa a ADB Server

### 1. Requisitos Previos (Configuración Manual del Host)

Esta es la parte que el usuario deberá realizar manually en su máquina antes de iniciar el contenedor.

1.  **Asegurar que `adb` esté instalado** y accesible en el PATH del sistema.
2.  **Iniciar el servidor ADB en modo de red:** El usuario debe ejecutar los siguientes comandos en su terminal:
    ```bash
    # 1. Detener cualquier instancia actual del servidor ADB
    adb kill-server

    # 2. Iniciar el servidor para que acepte conexiones de red
    adb -a -P 5037 start-server
    ```
    **Importante:** Este paso deberá documentarse claramente, incluyendo la advertencia de seguridad de que expone el servidor ADB a la red local.

### 2. Configuración del Contenedor

1.  **Variable de Entorno `DEVICE_SOURCE`:** En el archivo `.env` que se use para la configuración del contenedor, se debe establecer `DEVICE_SOURCE=local`.

2.  **Comando `docker run`:** Al iniciar el contenedor, se debe pasar una variable de entorno para que el cliente `adb` del interior sepa a dónde conectarse.
    ```bash
    docker run -e DEVICE_SOURCE=local -e ADB_SERVER_SOCKET=tcp:host.docker.internal:5037 -p 3000:3000 tu-imagen
    ```

### 3. Implementación en el Código (`server.js`)

1.  **Crear el Endpoint `GET /api/local-devices`:**
    -   Este endpoint comprobará si `process.env.DEVICE_SOURCE === 'local'`.
    -   Ejecutará el comando `exec('adb devices')`.
    -   **Funcionamiento:** Gracias a la variable `ADB_SERVER_SOCKET` (en modo Docker) o a la ejecución nativa (en modo local), este comando devolverá la lista de dispositivos.
    -   La lógica para parsear la salida y devolver un JSON con los números de serie se implementará en este paso.

2.  **Actualizar Lógica de Jobs:**
    -   El frontend enviará el `deviceSerial` seleccionado.
    -   El backend pasará este `deviceSerial` al worker como parte del objeto del job.

### 4. Implementación en el Worker (`worker.js`)

-   **Acción:** El worker recibirá el `deviceSerial` del job y lo inyectará como una variable de entorno al proceso del script que ejecuta el test.
-   **Mecanismo:** Se usará la opción `env` de la función `exec` o `fork` de Node.js para pasar `ANDROID_SERIAL=valor_del_serial` al entorno del script.
-   **Ejemplo Conceptual en `worker.js`:**
    ```javascript
    const { exec } = require('child_process');
    const job = getJobFromQueue(); // Contiene { deviceSerial: 'emulator-5554' }

    exec('scripts/feature-runner.sh', {
      env: {
        ...process.env,
        ANDROID_SERIAL: job.deviceSerial // ADB usará esta variable automáticamente
      }
    });
    ```

### 5. Implementación en los Scripts (`scripts/*.sh`)

-   **Acción:** No se requieren cambios significativos en los scripts existentes.
-   **Mecanismo:** La herramienta de línea de comandos `adb` está diseñada para detectar y usar automáticamente la variable de entorno `ANDROID_SERIAL` si existe. Esto significa que comandos como `adb install ...` o `adb shell ...` se dirigirán al dispositivo correcto sin necesidad de añadir el flag `-s <serial>` manualmente. Esta es la principal ventaja y la razón de este enfoque.

### 6. Documentación (Crucial)

Crearemos un nuevo archivo, `LOCAL_SETUP_GUIDE.md`, o actualizaremos el `README.md` para explicar este proceso, cubriendo tanto el modo local con `node` como el modo con Docker.

### 7. Coexistencia con el Modo Remoto (Dispositivos de Granja)

El diseño propuesto permite que la nueva funcionalidad de "modo local" coexista con el flujo de trabajo existente de "modo remoto" (usando dispositivos de una granja, gestionados por Redis o similar) sin conflictos. La clave es la variable de entorno `DEVICE_SOURCE`.

| Componente | `DEVICE_SOURCE=local` | `DEVICE_SOURCE=remote` (o no definida) |
| :--- | :--- | :--- |
| **UI** | Muestra dropdown con dispositivos de `adb devices`. | Oculta el dropdown de dispositivos locales. |
| **Server.js** | Espera un `deviceSerial` del UI. | Usa la lógica existente (ej: Redis) para buscar un device. |
| **Worker.js** | Recibe `deviceSerial` y lo pone en `ANDROID_SERIAL`. | Recibe `host:port`, hace `adb connect` y lo pone en `ANDROID_SERIAL`. |
| **Resultado** | El test corre en el PC local. | El test corre en un emulador remoto de la granja. |

En resumen, la variable `DEVICE_SOURCE` actúa como una **bifurcación en el camino**. Todo el flujo de la aplicación, desde la UI hasta el worker, mirará esta variable para decidir qué camino tomar. De esta manera, el flujo "remoto" actual permanece intacto y sin modificaciones, y el nuevo flujo "local" solo se activa cuando se lo pedimos explícitamente.