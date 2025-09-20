# Inspector Appium Integrado

## 📋 Visión General

El inspector proporciona una vista en tiempo real de las sesiones Appium que se ejecutan en los workers. Permite adjuntar la herramienta a una sesión activa, explorar el árbol UI, capturar screenshots con overlays interactivos y lanzar acciones táctiles sin abandonar el orquestador.

## 🧭 Flujo de Uso en la UI

1. Abrir la pestaña `Inspector` en la barra principal (`public/index.html`).
2. Seleccionar una sesión disponible en la columna izquierda; la lista se alimenta de `/api/inspector/sessions` y muestra si la sesión ya está adjunta.
3. Pulse **Attach** para iniciar la inspección. La UI escucha el evento `inspector_session_attached` e inicializa la vista principal (`public/js/inspector.js`). Si la pestaña se recarga mientras la sesión está adjunta, el inspector detecta automáticamente el estado y vuelve a mostrar los controles sin intervención manual.
4. Utilice los filtros (solo clickables, búsqueda) y el botón de overlay para resaltar nodos en la captura.
5. Habilite “Auto Detect” cuando necesite sondear cambios de UI cada `INSPECT_REFRESH_MS` milisegundos.
6. Puede ejecutar un tap sobre el screenshot; la acción genera un `POST /api/inspector/:sessionId/tap` y el backend emite `inspector_tap_executed` con el resultado. Si no se detectan elementos bajo el click, el modal ofrece la opción “Tap directo” para enviar las coordenadas originales igualmente. Cuando el elemento es un `EditText`, el modal expone además un campo para enviar texto directamente (`POST /api/inspector/:sessionId/type`).

## 🔌 Endpoints Backend

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `GET` | `/api/inspector/health` | Estado del módulo y sesiones activas. |
| `GET` | `/api/inspector/sessions` | Lista de sesiones Appium expuestas por `WorkerPoolManager.getAppiumSessions()`. |
| `POST` | `/api/inspector/:sessionId/attach` | Crea o adjunta un cliente WebdriverIO remoto (`InspectorManager.attachToSession`). |
| `POST` | `/api/inspector/:sessionId/detach` | Libera la sesión y limpia recursos (`cleanupStaleSessions`). |
| `GET` | `/api/inspector/:sessionId/inspect` | Retorna elementos normalizados (atributos, bounds, locators). El límite por defecto se amplió a 200 nodos para abarcar overlays complejos. |
| `GET` | `/api/inspector/:sessionId/xml` | Devuelve el XML completo de la jerarquía UI. |
| `GET` | `/api/inspector/:sessionId/screenshot` | Captura PNG en base64 usando `InspectorManager.getScreenshot`. |
| `GET` | `/api/inspector/:sessionId/overlay` | Genera overlay SVG/PNG combinando screenshot + bounds calculados. |
| `POST` | `/api/inspector/:sessionId/tap` | Ejecuta un tap coordinado mediante WebdriverIO. |
| `POST` | `/api/inspector/:sessionId/type` | Envía texto a un elemento usando su locator prioritario (id, accessibility id o xpath). |

## 📡 Eventos Socket.IO

El backend publica actualizaciones inmediatas a todos los clientes conectados:

- `inspector_session_attached` / `inspector_session_detached`: sincroniza el estado de attachment entre usuarios.
- `inspector_elements_updated`: entrega el árbol UI procesado por `parseUIElements`.
- `inspector_screenshot_updated`: transmite la última captura lista para el canvas.
- `inspector_tap_executed`: confirma la acción remota y muestra feedback en logs.
- `inspector_text_entered`: confirma que el texto solicitado fue ingresado y dispara la actualización del árbol.

## ⚙️ Requisitos y Consideraciones

- Se basa en `webdriverio@9` y `xml2js` para parsear el árbol; asegúrese de tener Appium accesible desde el worker (respetando `ANDROID_ADB_SERVER_HOST`).
- Los workers persistentes (`persistent workspace`) que se crean desde la pestaña del inspector se registran automáticamente; si hay una sesión disponible, el botón “🚀 Crear Worker” se deshabilita hasta que se libere.
- Al adjuntarse a un worker persistente, el inspector crea una sesión Appium con `newCommandTimeout = 0` para evitar cierres por inactividad durante la inspección manual.
- El inspector amplía el límite de extracción de elementos a 200 nodos para cubrir popups u overlays. Si `INSPECT_MAX_ELEMENTS` está presente en el entorno, puede sobreescribir este valor.
- La generación de identificadores para los elementos UI maneja strings Unicode, evitando errores al analizar árboles con caracteres fuera de Latin1.

## 📚 Referencias

- Implementación backend: `src/modules/core/inspector-manager.js`.
- UI y lógica de cliente: `public/js/inspector.js` y `public/css/inspector.css`.
- Hooks del worker: `src/modules/worker-management/worker-pool-manager.js` expone `getAppiumSessions()` para poblar la vista.
