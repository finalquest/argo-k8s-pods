# Nuevas Funcionalidades

## Feature: Selección Dinámica de Versión de APK

Esta funcionalidad eliminará la necesidad de tener la variable de entorno `APK_PATH` fija en el servidor.

### Etapa 1: Crear la API en el Backend

**Objetivo:** Crear un endpoint que pueda consultar a `oras` y devolver la lista de versiones disponibles.

1.  Crear una nueva ruta en `server.js`: `GET /api/apk/versions`.
2.  Esta ruta recibirá un parámetro, por ejemplo: `?repo=apks/chaco/int`.
3.  Ejecutará el comando `oras repo tags harbor:8080/${repo} --plain-http`.
4.  Procesará la salida y la devolverá como un JSON con la lista de versiones.

### Etapa 2: Construir la Interfaz en el Frontend

**Objetivo:** Añadir los elementos visuales para que el usuario pueda ver y seleccionar una versión.

1.  **Modificar `index.html`:** Añadir un nuevo menú desplegable (select) llamado "Versión APK" y un botón "Buscar Versiones".
2.  **Modificar `js/api.js` y `js/ui.js`:** Crear las funciones para:
    *   Llamar al nuevo endpoint `/api/apk/versions`.
    *   Poblar el nuevo menú desplegable con las versiones recibidas.

### Etapa 3: Conectar el Flujo Completo

**Objetivo:** Usar la versión seleccionada en la UI para la ejecución del test.

1.  **Modificar Frontend (`js/socket.js`):** Al enviar un test para ejecutar, se leerá la versión seleccionada del nuevo menú y se incluirá en los datos del "job".
2.  **Modificar Backend (`server.js` y `worker.js`):
    *   El `job` ahora contendrá la ruta del APK a usar.
    *   Esta información se pasará al worker.
    *   El worker la usará para pasársela al script `install-apk.sh`, que a su vez la usará para descargar el APK correcto.
