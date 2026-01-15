# Aclaración: ¿Dónde corre cada componente?

## Resumen Rápido

| Componente | Dónde corre | Propósito |
|------------|-------------|-----------|
| **MCP Server** | ✅ Backend (Kubernetes) | Servidor que expone API MCP para agentes de IA |
| **Plugin Server (Vite)** | ✅ Backend (Kubernetes) | Solo sirve archivos estáticos (HTML, JS, CSS) |
| **Plugin (código JS)** | ✅ Browser del usuario | Código que se ejecuta en el navegador |
| **Penpot Backend** | ✅ Backend (Kubernetes) | API y lógica de negocio de Penpot |
| **Penpot Frontend** | ✅ Browser del usuario | Interfaz de usuario de Penpot |

---

## Explicación Detallada

### 1. MCP Server (Backend)

**Ubicación:** Kubernetes (backend)

**Qué hace:**
- Implementa el protocolo Model Context Protocol (MCP)
- Expone endpoints HTTP para que agentes de IA (Codex/Claude) puedan interactuar con Penpot
- Se comunica con Penpot Backend vía API HTTP
- También expone WebSocket para comunicación con el plugin (que corre en el browser)

**Ejemplo de uso:**
```bash
# Codex Agent (local) se conecta al MCP Server (backend)
curl -X POST http://penpot-mcp.finalq.xyz/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "execute_code",
      "arguments": {...}
    }
  }'
```

**Código:** Node.js corriendo en Kubernetes

---

### 2. Plugin Server / Vite Preview (Backend)

**Ubicación:** Kubernetes (backend)

**Qué hace:**
- **Solo sirve archivos estáticos** (HTML, JS, CSS)
- NO ejecuta el plugin
- Es un servidor HTTP simple que entrega archivos

**Flujo:**
```
1. Usuario (browser) → GET http://penpot-plugin.finalq.xyz/manifest.json
2. Plugin Server (backend) → Responde con manifest.json
3. Usuario (browser) → GET http://penpot-plugin.finalq.xyz/plugin.js
4. Plugin Server (backend) → Responde con plugin.js (archivo estático)
5. Browser descarga y ejecuta plugin.js
```

**Código:** Vite Preview (servidor HTTP simple) corriendo en Kubernetes

**¿Por qué Vite Preview y no Nginx?**
- Ya está en el stack (Vite es la herramienta de build)
- Optimizado para servir builds de Vite
- Configuración mínima

---

### 3. Plugin (código JavaScript) - Browser

**Ubicación:** Browser del usuario

**Qué hace:**
- Código JavaScript que se descarga del Plugin Server
- Se ejecuta dentro de Penpot en el navegador
- Extiende la funcionalidad de Penpot
- Se comunica con el MCP Server (backend) vía WebSocket

**Flujo:**
```
1. Plugin se descarga del Plugin Server (backend)
2. Plugin se ejecuta en el browser del usuario
3. Plugin se conecta al MCP Server (backend) vía WebSocket
4. Plugin puede ejecutar acciones en Penpot a través del MCP Server
```

**Código:** JavaScript ejecutándose en el browser

---

## Diagrama de Comunicación

```
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Kubernetes)                      │
│                                                              │
│  ┌──────────────┐      ┌──────────────────────────────┐   │
│  │  Penpot      │      │  Penpot MCP Pod              │   │
│  │  Backend     │      │  ┌──────────┐  ┌───────────┐ │   │
│  │              │      │  │   MCP    │  │  Plugin   │ │   │
│  │              │◄────►│  │  Server  │  │  Server   │ │   │
│  │              │ HTTP │  │ (Node.js)│  │ (Vite)    │ │   │
│  │              │      │  │          │  │           │ │   │
│  └──────────────┘      │  └────┬─────┘  └─────┬─────┘ │   │
│                         │       │              │       │   │
│                         │       │ WebSocket    │ HTTP  │   │
│                         │       │              │       │   │
│                         └───────┼──────────────┼───────┘   │
└─────────────────────────────────┼──────────────┼───────────┘
                                  │              │
                    ┌─────────────┘              └─────────────┐
                    │                                            │
                    │                                            │
         ┌──────────▼──────────┐                    ┌───────────▼──────────┐
         │                     │                    │                     │
         │  Codex/Claude Agent │                    │  Browser del Usuario│
         │  (Local Mac)        │                    │                     │
         │                     │                    │  ┌──────────────┐  │
         │  HTTP POST          │                    │  │   Penpot     │  │
         │  /mcp                │                    │  │   Frontend   │  │
         │                      │                    │  └──────┬───────┘  │
         └──────────────────────┘                    │         │          │
                                                     │         │          │
                                                     │  ┌──────▼───────┐  │
                                                     │  │   Plugin    │  │
                                                     │  │   (JS)      │  │
                                                     │  │             │  │
                                                     │  │ WebSocket   │  │
                                                     │  └─────────────┘  │
                                                     │                    │
                                                     └────────────────────┘
```

---

## Preguntas Frecuentes

### ¿El MCP Server corre en el browser?

**NO.** El MCP Server corre en Kubernetes (backend). Es un servidor Node.js que expone endpoints HTTP y WebSocket.

### ¿El Plugin Server ejecuta el plugin?

**NO.** El Plugin Server solo sirve archivos estáticos. El plugin se descarga y ejecuta en el browser del usuario.

### ¿Por qué hay dos servidores (MCP Server y Plugin Server)?

- **MCP Server**: Para agentes de IA (Codex/Claude) que se conectan vía HTTP
- **Plugin Server**: Para servir el código del plugin que se carga en el browser

Ambos están en el mismo pod por simplicidad, pero podrían estar separados.

### ¿El plugin puede acceder directamente a Penpot?

**Sí, pero a través del MCP Server.** El plugin (en el browser) se conecta al MCP Server (backend) vía WebSocket, y el MCP Server se comunica con Penpot Backend vía API HTTP.

### ¿Por qué el plugin no se conecta directamente a Penpot Backend?

Por seguridad y arquitectura:
- El MCP Server actúa como intermediario
- Centraliza la lógica de comunicación
- Permite que tanto agentes de IA como el plugin usen la misma interfaz (MCP)

---

## Resumen

1. **MCP Server** = Backend (Kubernetes) - Para agentes de IA
2. **Plugin Server** = Backend (Kubernetes) - Solo sirve archivos
3. **Plugin** = Browser - Código JavaScript ejecutándose en el navegador
4. **Vite Preview** = Herramienta para servir archivos estáticos (no ejecuta código)

**Ningún componente del MCP corre en el browser excepto el plugin mismo, que es código JavaScript descargado del Plugin Server.**
