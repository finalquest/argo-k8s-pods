# Ecosistema de Penpot - Explicación Técnica

## 📋 Índice

1. [Arquitectura General](#arquitectura-general)
2. [Componentes del Ecosistema](#componentes-del-ecosistema)
3. [¿Por qué Vite Preview?](#por-qué-vite-preview)
4. [Flujos de Comunicación](#flujos-de-comunicación)
5. [Model Context Protocol (MCP)](#model-context-protocol-mcp)
6. [Plugin de Penpot](#plugin-de-penpot)
7. [Configuración y Despliegue](#configuración-y-despliegue)
8. [Diagramas de Flujo](#diagramas-de-flujo)

---

## Arquitectura General

El ecosistema de Penpot con MCP está compuesto por varios componentes que trabajan juntos. **IMPORTANTE**: El MCP Server corre en el **backend** (Kubernetes), NO en el browser.

```
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Kubernetes)                     │
│                                                              │
│  ┌──────────────┐      ┌──────────────────────────────┐   │
│  │  Penpot      │      │  Penpot MCP Pod              │   │
│  │  Core        │      │  ┌──────────┐  ┌───────────┐ │   │
│  │  (Backend)   │      │  │   MCP    │  │  Plugin   │ │   │
│  │              │◄────►│  │  Server  │  │  Server   │ │   │
│  │              │      │  │ (port    │  │ (Vite     │ │   │
│  │              │      │  │  4401)   │  │ Preview,  │ │   │
│  │              │      │  │          │  │ port 4400)│ │   │
│  └──────────────┘      │  └──────────┘  └───────────┘ │   │
│                        └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         ▲                           ▲              ▲
         │                           │              │
         │                           │              │
    ┌────┴────┐              ┌───────┴──────┐      │
    │         │              │              │      │
┌───▼────┐ ┌──▼────┐    ┌────▼────┐   ┌─────▼────┐│
│Penpot  │ │Codex/ │    │ Plugin  │   │  Plugin  ││
│Frontend│ │Claude │    │ (JS en  │   │  Code    ││
│(Browser)│ │Agent │    │ browser)│   │ (servido ││
└────────┘ └───────┘    └─────────┘   │  por     ││
                                     │  Vite)    ││
                                     └───────────┘│
                                                  │
                                     ┌────────────┘
                                     │
                              (descargado desde
                               Plugin Server)
```

### Componentes Principales

1. **Penpot Core**: El editor de diseño principal
   - **Backend**: Clojure (corre en Kubernetes)
   - **Frontend**: React (corre en el browser del usuario)

2. **MCP Server**: Servidor backend que expone la API de Penpot vía Model Context Protocol
   - ✅ **Corre en Kubernetes (backend)**
   - ✅ Expone endpoints HTTP para agentes de IA (Codex/Claude)
   - ✅ Se comunica con Penpot Backend vía API

3. **Plugin Server (Vite Preview)**: Servidor backend que **sirve** el código JavaScript del plugin
   - ✅ **Corre en Kubernetes (backend)**
   - ✅ Solo sirve archivos estáticos (HTML, JS, CSS)
   - ✅ El código que sirve se ejecuta en el browser del usuario

4. **Plugin (código JavaScript)**: Código que se ejecuta en el browser del usuario
   - ✅ Se descarga del Plugin Server
   - ✅ Se ejecuta dentro de Penpot (en el navegador)
   - ✅ Se comunica con el MCP Server vía WebSocket

---

## Componentes del Ecosistema

### 1. Penpot Core

**Qué es:**
- Aplicación web completa para diseño y prototipado
- Frontend (React) + Backend (Clojure)
- Base de datos PostgreSQL para almacenar proyectos
- Redis/Valkey para cache y sesiones

**Funcionalidad:**
- Editor de diseño visual
- Gestión de proyectos y archivos
- Colaboración en tiempo real
- Sistema de plugins (carga plugins externos)

**En nuestro setup:**
- Desplegado como Helm chart oficial
- Accesible en `http://penpot.finalq.xyz`
- Namespace: `penpot`

### 2. MCP Server (Model Context Protocol Server)

**⚠️ IMPORTANTE: Este corre en el BACKEND (Kubernetes), NO en el browser**

**Qué es:**
- Servidor backend que implementa el protocolo MCP
- Expone funcionalidades de Penpot como "herramientas" (tools) que pueden ser usadas por agentes de IA
- Permite que Codex/Claude Agent interactúe con Penpot programáticamente
- **Es un servidor Node.js corriendo en Kubernetes**

**Funcionalidades expuestas:**
- `execute_code`: Ejecutar código en el contexto de Penpot
- `high_level_overview`: Obtener vista general de un proyecto
- `penpot_api_info`: Información sobre la API de Penpot
- `export_shape`: Exportar formas/objetos
- `import_image`: Importar imágenes

**En nuestro setup:**
- ✅ Desplegado como Deployment en Kubernetes (backend)
- ✅ Escucha en puerto `4401` (HTTP MCP endpoint)
- ✅ WebSocket en puerto `4402` (para comunicación con el plugin que corre en el browser)
- ✅ Accesible en `http://penpot-mcp.finalq.xyz/mcp`
- ✅ Se comunica con Penpot Backend vía API HTTP

**Arquitectura:**
```
Codex/Claude Agent (local)
    │
    │ HTTP POST
    ▼
MCP Server (Kubernetes - puerto 4401)
    │
    │ HTTP API
    ▼
Penpot Backend (Kubernetes)
```

### 3. Plugin Server (Vite Preview)

**⚠️ IMPORTANTE: Este también corre en el BACKEND (Kubernetes), pero solo sirve archivos estáticos**

**Qué es:**
- Servidor backend que **sirve** el código JavaScript del plugin de Penpot
- Es un servidor HTTP simple que entrega archivos estáticos (HTML, JS, CSS)
- **NO ejecuta el plugin**, solo lo sirve
- El plugin se descarga y ejecuta en el browser del usuario

**En nuestro setup:**
- ✅ Desplegado junto con MCP Server (mismo pod en Kubernetes)
- ✅ Escucha en puerto `4400`
- ✅ Accesible en `http://penpot-plugin.finalq.xyz`
- ✅ Sirve `manifest.json` y archivos JavaScript del plugin

**Flujo:**
```
1. Usuario abre Penpot en el browser
2. Usuario carga el plugin desde http://penpot-plugin.finalq.xyz/manifest.json
3. Plugin Server (backend) entrega el código JavaScript
4. El código se descarga al browser del usuario
5. El código se ejecuta EN EL BROWSER (no en el servidor)
6. El plugin (en el browser) se conecta al MCP Server (backend) vía WebSocket
```

### 4. Plugin (código JavaScript en el browser)

**⚠️ IMPORTANTE: Este SÍ corre en el BROWSER del usuario**

**Qué es:**
- Código JavaScript que se descarga del Plugin Server
- Se ejecuta dentro de Penpot en el navegador del usuario
- Extiende la funcionalidad de Penpot
- Se comunica con el MCP Server (backend) vía WebSocket

**Dónde corre:**
- ✅ En el browser del usuario (no en Kubernetes)
- ✅ Dentro del contexto de Penpot
- ✅ Tiene acceso a la API de Penpot (en el browser)

**Comunicación:**
```
Plugin (en browser) ←→ WebSocket ←→ MCP Server (en Kubernetes)
```

---

## ¿Por qué Vite Preview?

### Aclaración importante

**Vite Preview NO ejecuta el plugin en el servidor.** Solo sirve los archivos estáticos (HTML, JS, CSS) que luego se descargan y ejecutan en el browser del usuario.

### ¿Qué es Vite?

**Vite** es un build tool moderno para aplicaciones frontend que:
- Compila código TypeScript/JavaScript
- Optimiza y empaqueta assets
- Proporciona un servidor de desarrollo rápido

### ¿Por qué usamos `vite preview` en lugar de `vite dev`?

#### 1. **Modo Producción vs Desarrollo**

```bash
# Desarrollo (vite dev)
vite dev          # Servidor de desarrollo con hot-reload
                  # No optimizado, incluye source maps
                  # Más lento en producción

# Producción (vite build + vite preview)
vite build        # Compila y optimiza el código
vite preview      # Sirve la versión optimizada
                  # Código minificado y optimizado
                  # Mejor rendimiento
```

#### 2. **En nuestro caso específico:**

El Plugin Server necesita:
- **Servir archivos estáticos**: Solo entrega HTML, JS, CSS al browser
- **Código optimizado**: El plugin se carga en el navegador del usuario, debe ser pequeño y rápido
- **Build estático**: No necesita hot-reload en producción
- **Servidor simple**: No necesita lógica de backend, solo servir archivos

**Flujo de build del plugin:**

```
┌─────────────────────────────────────────────────┐
│ 1. Desarrollo (en el repo penpot-mcp)           │
│    - Código TypeScript fuente                   │
│    - vite dev (para desarrollo local)           │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│ 2. Build (durante docker build)                │
│    - npm run build:all                          │
│    - vite build (compila TypeScript → JavaScript)│
│    - Genera archivos en /dist                   │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│ 3. Runtime (en el pod de Kubernetes)           │
│    - vite preview --host 0.0.0.0 --port 4400   │
│    - Sirve los archivos de /dist               │
│    - Escucha en todas las interfaces (0.0.0.0) │
└─────────────────────────────────────────────────┘
```

#### 3. **¿Por qué `--host 0.0.0.0`?**

Por defecto, `vite preview` escucha solo en `localhost` (127.0.0.1). Esto significa:
- ❌ Solo accesible desde dentro del contenedor
- ❌ El healthcheck de Kubernetes no puede conectarse
- ❌ El ingress no puede enrutar tráfico

Con `--host 0.0.0.0`:
- ✅ Escucha en todas las interfaces de red
- ✅ Accesible desde fuera del contenedor
- ✅ El healthcheck de Kubernetes funciona
- ✅ El ingress puede enrutar correctamente

#### 4. **¿Por qué `--watch` en el script dev?**

El script `dev` del plugin ejecuta:
```bash
vite build --watch && vite preview --host 0.0.0.0 --port 4400
```

- `vite build --watch`: Recompila automáticamente cuando hay cambios (útil para desarrollo)
- `vite preview`: Sirve la versión compilada

**Nota:** En producción, esto permite que el plugin se actualice automáticamente si hay cambios en el código (aunque en producción normalmente no cambias el código).

### Alternativas consideradas

1. **Nginx/Apache**: Servir archivos estáticos
   - ✅ Más simple
   - ❌ No permite rebuild automático
   - ❌ Más configuración

2. **Node.js + Express**: Servidor custom
   - ✅ Control total
   - ❌ Más código que mantener
   - ❌ No aprovecha las optimizaciones de Vite

3. **Vite Preview** (elegido):
   - ✅ Ya está en el stack (Vite es la herramienta de build)
   - ✅ Optimizado para servir builds de Vite
   - ✅ Soporta watch mode
   - ✅ Configuración mínima

---

## Flujos de Comunicación

### Flujo 1: Usuario carga el plugin en Penpot

```
1. Usuario abre Penpot (http://penpot.finalq.xyz)
   │
   ▼
2. Usuario abre Plugin Manager
   │
   ▼
3. Usuario ingresa URL: http://penpot-plugin.finalq.xyz/manifest.json
   │
   ▼
4. Penpot hace GET a http://penpot-plugin.finalq.xyz/manifest.json
   │
   ▼
5. Plugin Server (Vite Preview) responde con manifest.json
   {
     "name": "Penpot MCP Plugin",
     "code": "plugin.js",
     ...
   }
   │
   ▼
6. Penpot descarga plugin.js desde http://penpot-plugin.finalq.xyz/plugin.js
   │
   ▼
7. Penpot ejecuta el plugin en el navegador del usuario
```

### Flujo 2: Plugin se comunica con MCP Server

```
1. Plugin ejecutándose en el navegador del usuario
   │
   ▼
2. Plugin necesita ejecutar una acción (ej: crear una forma)
   │
   ▼
3. Plugin se conecta vía WebSocket a MCP Server
   ws://penpot-mcp.finalq.xyz:4402
   │
   ▼
4. MCP Server procesa la petición y ejecuta la acción en Penpot
   │
   ▼
5. MCP Server responde al plugin
   │
   ▼
6. Plugin actualiza la UI en Penpot
```

### Flujo 3: Codex/Claude Agent usa MCP

```
1. Codex/Claude Agent necesita crear un diseño en Penpot
   │
   ▼
2. Agent se conecta al MCP Server vía HTTP
   POST http://penpot-mcp.finalq.xyz/mcp
   {
     "method": "tools/call",
     "params": {
       "name": "execute_code",
       "arguments": {...}
     }
   }
   │
   ▼
3. MCP Server procesa la petición
   - Valida los parámetros
   - Ejecuta la acción en Penpot (vía API)
   - Obtiene resultados
   │
   ▼
4. MCP Server responde al Agent
   {
     "result": {
       "success": true,
       "data": {...}
     }
   }
   │
   ▼
5. Agent procesa la respuesta y continúa con su tarea
```

---

## Model Context Protocol (MCP)

### ¿Qué es MCP?

**Model Context Protocol** es un protocolo estándar desarrollado por Anthropic para que agentes de IA puedan interactuar con sistemas externos de manera estructurada.

### Características:

1. **Protocolo HTTP/WebSocket**: Comunicación estándar
2. **Tools (Herramientas)**: Funciones que el agente puede llamar
3. **Resources (Recursos)**: Datos que el agente puede leer
4. **Prompts (Prompts)**: Plantillas de prompts predefinidas

### En nuestro caso:

El MCP Server expone las siguientes **tools**:

```typescript
// Ejemplo de tool expuesta
{
  name: "execute_code",
  description: "Ejecuta código JavaScript en el contexto de Penpot",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string" },
      fileId: { type: "string" }
    }
  }
}
```

### Endpoints del MCP Server:

1. **HTTP MCP Endpoint**: `http://penpot-mcp.finalq.xyz/mcp`
   - Para agentes que usan HTTP
   - Soporta streaming (Server-Sent Events)

2. **WebSocket Endpoint**: `ws://penpot-mcp.finalq.xyz:4402`
   - Para comunicación bidireccional
   - Usado por el plugin de Penpot

3. **SSE Endpoint**: `http://penpot-mcp.finalq.xyz/sse`
   - Legacy endpoint para Server-Sent Events

---

## Plugin de Penpot

### ¿Qué es el Plugin?

El plugin es código JavaScript que:
- Se carga en el navegador del usuario dentro de Penpot
- Extiende la funcionalidad de Penpot
- Se comunica con el MCP Server vía WebSocket

### Estructura del Plugin:

```
penpot-plugin/
├── src/
│   ├── plugin.ts        # Código principal del plugin
│   └── ...
├── dist/                # Código compilado (generado)
│   ├── plugin.js        # Plugin compilado
│   ├── index.html       # HTML del plugin
│   └── assets/          # CSS y otros assets
└── package.json
```

### Cómo funciona:

1. **Build**: TypeScript se compila a JavaScript
2. **Serving**: Vite Preview sirve los archivos compilados
3. **Loading**: Penpot carga el plugin desde la URL
4. **Execution**: El plugin se ejecuta en el contexto de Penpot

### Comunicación Plugin ↔ MCP Server:

```javascript
// Ejemplo de código del plugin
const ws = new WebSocket('ws://penpot-mcp.finalq.xyz:4402');

ws.onopen = () => {
  // Enviar comando al MCP Server
  ws.send(JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'execute_code',
      arguments: { code: '...', fileId: '...' }
    }
  }));
};

ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  // Procesar respuesta y actualizar UI
};
```

---

## Configuración y Despliegue

### Arquitectura de Despliegue

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Namespace: penpot                                    │  │
│  │                                                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │  │
│  │  │   Penpot     │  │  PostgreSQL │  │  Valkey   │ │  │
│  │  │  (Helm)      │  │  (Helm)     │  │  (Helm)   │ │  │
│  │  └──────────────┘  └──────────────┘  └───────────┘ │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  Penpot MCP Deployment                       │   │  │
│  │  │  ┌──────────────┐  ┌──────────────┐         │   │  │
│  │  │  │  MCP Server  │  │ Plugin Server│         │   │  │
│  │  │  │  (port 4401) │  │ (Vite Preview│         │   │  │
│  │  │  │              │  │  port 4400)  │         │   │  │
│  │  │  └──────────────┘  └──────────────┘         │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Ingress Controller                        │
│                    (nginx-ingress)                           │
│                                                              │
│  penpot.finalq.xyz        → Penpot Service                  │
│  penpot-plugin.finalq.xyz  → penpot-mcp Service (port 4400) │
│  penpot-mcp.finalq.xyz    → penpot-mcp Service (port 4401)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx Proxy Manager                       │
│                    (Reverse Proxy)                          │
└─────────────────────────────────────────────────────────────┘
```

### Componentes de Kubernetes

#### 1. Penpot Core (Helm Chart)

```yaml
# Desplegado desde el chart oficial
penpot:
  config:
    publicUri: "http://penpot.finalq.xyz"
  persistence:
    assets:
      enabled: true
      size: 10Gi
```

**Recursos:**
- Deployment: `penpot-frontend`, `penpot-backend`
- Service: `penpot` (puerto 8080)
- Ingress: `penpot` (host: `penpot.finalq.xyz`)
- StatefulSet: `penpot-postgresql`, `penpot-valkey-primary`

#### 2. Penpot MCP (Deployment Custom)

```yaml
# Desplegado desde nuestro template
apiVersion: apps/v1
kind: Deployment
metadata:
  name: penpot-mcp
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: penpot-mcp
          image: harbor.finalq.xyz/tools/penpot-mcp:0.1.2
          ports:
            - name: plugin
              containerPort: 4400
            - name: mcp
              containerPort: 4401
```

**Recursos:**
- Deployment: `penpot-mcp`
- Service: `penpot-mcp` (puertos 4400 y 4401)
- Ingress: `penpot-mcp` (hosts: `penpot-plugin.finalq.xyz`, `penpot-mcp.finalq.xyz`)

### Variables de Entorno

```bash
# En el pod de penpot-mcp
PLUGIN_PORT=4400      # Puerto del Plugin Server (Vite Preview)
MCP_PORT=4401          # Puerto del MCP Server
NODE_ENV=production
```

### Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /manifest.json
    port: 4400
  initialDelaySeconds: 60
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /manifest.json
    port: 4400
  initialDelaySeconds: 45
  periodSeconds: 5
```

**¿Por qué `/manifest.json`?**
- Es el endpoint más simple y ligero
- Si el Plugin Server está funcionando, este endpoint responde
- No requiere autenticación
- Responde rápido

---

## Diagramas de Flujo

### Flujo Completo: Usuario crea diseño con ayuda de IA

```
┌──────────┐
│ Usuario  │
└────┬─────┘
     │
     │ 1. Abre Penpot
     ▼
┌─────────────────┐
│  Penpot Editor  │
│  (Navegador)    │
└────┬────────────┘
     │
     │ 2. Carga Plugin
     │    (desde penpot-plugin.finalq.xyz)
     ▼
┌─────────────────┐
│  Plugin JS      │
│  (en navegador) │
└────┬────────────┘
     │
     │ 3. Usuario pide: "Crea un botón rojo"
     │
     │ 4. Plugin envía comando vía WebSocket
     ▼
┌─────────────────┐
│  MCP Server     │
│  (port 4401)    │
└────┬────────────┘
     │
     │ 5. Ejecuta acción en Penpot API
     ▼
┌─────────────────┐
│  Penpot Backend │
└────┬────────────┘
     │
     │ 6. Crea el botón
     │
     │ 7. Responde al MCP Server
     ▼
┌─────────────────┐
│  MCP Server     │
└────┬────────────┘
     │
     │ 8. Responde al Plugin
     ▼
┌─────────────────┐
│  Plugin JS     │
└────┬────────────┘
     │
     │ 9. Actualiza UI
     ▼
┌──────────┐
│ Usuario  │
│ ve botón │
└──────────┘
```

### Flujo: Codex Agent crea diseño automáticamente

```
┌──────────────┐
│ Codex Agent  │
│  (Local Mac) │
└──────┬───────┘
       │
       │ 1. Agent necesita crear diseño
       │    "Crea un dashboard con 3 gráficos"
       ▼
┌─────────────────┐
│  MCP Server     │
│  (HTTP POST)    │
│  /mcp           │
└──────┬──────────┘
       │
       │ 2. MCP Server procesa petición
       │    - Valida parámetros
       │    - Llama a Penpot API
       ▼
┌─────────────────┐
│  Penpot Backend │
└──────┬──────────┘
       │
       │ 3. Crea el diseño
       │    - Crea archivo
       │    - Crea formas
       │    - Aplica estilos
       │
       │ 4. Responde
       ▼
┌─────────────────┐
│  MCP Server     │
└──────┬──────────┘
       │
       │ 5. Responde al Agent
       │    {
       │      "result": {
       │        "fileId": "...",
       │        "shapes": [...]
       │      }
       │    }
       ▼
┌──────────────┐
│ Codex Agent │
│ Continúa con│
│ siguiente    │
│ paso         │
└──────────────┘
```

---

## Resumen Técnico

### ¿Por qué esta arquitectura?

1. **Separación de responsabilidades**:
   - Penpot Core: Editor de diseño
   - MCP Server: Interfaz para agentes de IA
   - Plugin Server: Código del plugin para el navegador

2. **Escalabilidad**:
   - Cada componente puede escalar independientemente
   - MCP Server puede manejar múltiples conexiones

3. **Mantenibilidad**:
   - Código separado por responsabilidad
   - Fácil de actualizar cada componente

4. **Flexibilidad**:
   - El plugin puede evolucionar sin tocar Penpot Core
   - MCP Server puede agregar nuevas tools sin afectar el plugin

### Tecnologías Clave

- **Vite**: Build tool y servidor de preview
- **TypeScript**: Lenguaje del plugin y MCP Server
- **WebSocket**: Comunicación en tiempo real
- **HTTP MCP**: Protocolo estándar para agentes de IA
- **Kubernetes**: Orquestación y despliegue
- **Helm**: Gestión de Penpot Core

---

## Referencias

- [Penpot Official](https://penpot.app/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Vite Documentation](https://vitejs.dev/)
- [Penpot MCP Repository](https://github.com/penpot/penpot-mcp)

---

**Última actualización:** 2026-01-10  
**Versión:** 1.0
