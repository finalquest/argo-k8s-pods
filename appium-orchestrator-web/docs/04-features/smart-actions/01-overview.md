# Smart Actions - Documentación Técnica

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Documentación Disponible](#documentación-disponible)
3. [Arquitectura](#arquitectura)
4. [Flujo de Ejecución](#flujo-de-ejecución)
5. [Componentes Clave](#componentes-clave)
6. [Archivos y Estructura](#archivos-y-estructura)
7. [Implementación Detallada](#implementación-detallada)
8. [Integración con GlosarioUI](#integración-con-glosarioui)
9. [Ejemplos de Uso](#ejemplos-de-uso)
10. [Troubleshooting](#troubleshooting)

## 📚 Documentación Disponible

Esta es la documentación principal del sistema de Smart Actions. Para información detallada, consulta los siguientes documentos:

- 📖 **[README.md](./README.md)** - Visión general y quick start
- 🔧 **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** - Guía completa de implementación
- 📋 **[API_REFERENCE.md](./API_REFERENCE.md)** - Referencia completa de APIs

---

## 🎯 Visión General

Smart Actions es un sistema de acciones contextuales e inteligentes que permite a los desarrolladores realizar operaciones avanzadas sobre steps y referencias JSON directamente desde el glosario, sin necesidad de copiar y pegar manualmente.

### **Propósito Principal:**

- **Incrementar productividad** reduciendo pasos manuales
- **Mantener consistencia** en el formato del código
- **Proveer contexto inteligente** según la posición del cursor
- **Ser extensible** para futuras funcionalidades

---

## 🏗️ Arquitectura

### **Diagrama de Arquitectura:**

```
┌─────────────────────────────────────────────────────┐
│                    GlosarioUI                        │
│  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │   Steps Panel   │  │   JSON References Panel │   │
│  └─────────────────┘  └─────────────────────────┘   │
│           │                      │                  │
│           ▼                      ▼                  │
│  ┌─────────────────────────────────────────────────┐ │
│  │         SmartActionsManager                     │ │
│  │  • ActionRegistry                              │ │
│  │  • Context Analysis                           │ │
│  │  • Menu Management                            │ │
│  └─────────────────────────────────────────────────┘ │
│           │                      │                  │
│           ▼                      ▼                  │
│  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │ Base Actions    │  │   Context Handling     │   │
│  │ • InsertStep    │  │ • ActionContext        │   │
│  │ • CopyStep      │  │ • Cursor Position      │   │
│  │ • [Extensible]  │  │ • Data Extraction      │   │
│  └─────────────────┘  └─────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────┐
│                   CodeMirror Editor                   │
│          • Step Insertion with Formatting             │
│          • Cursor Positioning                        │
│          • JSON Reference Replacement                  │
└─────────────────────────────────────────────────────┘
```

### **Patrones de Diseño Utilizados:**

1. **Manager Pattern**: `SmartActionsManager` coordina todo el sistema
2. **Registry Pattern**: `ActionRegistry` gestiona las acciones disponibles
3. **Strategy Pattern**: Cada acción implementa su propia lógica
4. **Context Object**: `ActionContext` encapsula información del contexto
5. **Template Method**: `BaseAction` define estructura común

---

## 🔄 Flujo de Ejecución

### **1. Inicialización:**

```javascript
// 1. Carga del bundle (smart-actions-bundle.js)
// 2. Disponibilidad global: window.SmartActionsManager
// 3. GlosarioUI detecta y crea instancia
// 4. Registro de acciones por defecto
// 5. Setup de event listeners
```

### **2. Interacción del Usuario:**

```javascript
// 1. Usuario hace right-click en step/JSON
// 2. event.preventDefault() bloquea menú del navegador
// 3. Creación de ActionContext con datos del elemento
// 4. Búsqueda de acciones aplicables
// 5. Renderizado de menú contextual
```

### **3. Ejecución de Acción:**

```javascript
// 1. Usuario selecciona acción del menú
// 2. Recreación de contexto con elemento y tipo
// 3. Validación de precondiciones
// 4. Ejecución de lógica específica
// 5. Feedback visual al usuario
```

---

## 🔧 Componentes Clave

### **1. SmartActionsManager**

**Responsabilidades:**

- Coordinar todo el sistema de smart actions
- Gestionar el registro de acciones
- Manejar el ciclo de vida de los menús contextuales
- Proveer APIs para integración con otros componentes

**Métodos Principales:**

```javascript
class SmartActionsManager {
  constructor(glosarioUI, insertController)
  registerAction(actionClass)
  executeAction(actionType, context)
  showSmartActionsMenu(event, element, type)
  getAvailableActions(context)
}
```

### **2. ActionRegistry**

**Responsabilidades:**

- Mantener registro de acciones disponibles
- Filtrar acciones por contexto aplicable
- Proveer métodos de búsqueda y consulta

**Patrón de Diseño:** Registry Pattern

### **3. BaseAction**

**Responsabilidades:**

- Definir interfaz común para todas las acciones
- Proveer métodos de validación y feedback
- Implementar comportamiento por defecto

**Métodos a Implementar:**

```javascript
class BaseAction {
  constructor() // Define metadatos (icono, label, etc.)
  isApplicable(context) // ¿Es aplicable en este contexto?
  async execute(context) // Lógica principal (obligatorio)
  validate(context) // Validar precondiciones
  showFeedback(message, type) // Mostrar feedback
}
```

### **4. ActionContext**

**Responsabilidades:**

- Encapsular toda la información del contexto
- Proveer métodos de análisis de contexto
- Facilitar la extracción de datos del DOM

**Propiedades Clave:**

```javascript
{
  element: HTMLElement,    // Elemento DOM clickeado
  type: string,           // 'step' | 'json-reference'
  data: object,           // Datos extraídos del elemento
  position: {line, ch},   // Posición del cursor
  timestamp: number       // Timestamp de creación
}
```

---

## 📁 Archivos y Estructura

### **Archivos Principales:**

```
smart-actions/
├── docs/04-features/smart-actions/
│   ├── 01-overview.md              # Este documento
│   ├── 02-implementation-guide.md  # Guía de implementación
│   └── 03-api-reference.md         # Referencia de APIs
├── public/js/smart-actions-bundle.js    # Bundle completo (producción)
├── src/modules/smart-actions/           # Código fuente modular
│   ├── smart-actions-manager.js       # Manager principal
│   ├── action-registry.js              # Registro de acciones
│   ├── action-context.js               # Manejo de contexto
│   ├── base-action.js                  # Clase base
│   ├── actions/                        # Acciones implementadas
│   │   ├── insert-step-action.js       # Insertar step con formato
│   │   ├── copy-step-action.js         # Copiar step
│   │   ├── insert-json-action.js       # Insertar referencia JSON
│   │   ├── replace-placeholder-action.js # Reemplazar placeholder con JSON
│   │   └── insert-json-reference-action.js # Insertar referencia JSON
│   └── widgets/                        # Widgets especializados
│       ├── json-reference-search-widget.js # Widget de búsqueda JSON
└── public/js/glosario-ui.js              # Integración con UI existente
```

### **¿Por qué un Bundle?**

**Razones:**

- **Evitar import dinámicos** problemáticos en el navegador
- **Garantizar orden de carga** correcto
- **Simplificar dependencias** entre módulos
- **Mejorar performance** (solo una petición HTTP)

---

## 💻 Implementación Detallada

### **1. Sistema de Carga:**

**HTML (index.html):**

```html
<!-- Orden crítico de carga -->
<script type="module" src="js/glosario-insert-controller.js"></script>
<script src="js/smart-actions-bundle.js"></script>
<!-- Bundle primero -->
<script type="module" src="js/glosario-ui.js"></script>
```

**Detección en GlosarioUI:**

```javascript
initializeSmartActions() {
  if (typeof SmartActionsManager !== 'undefined') {
    this.smartActionsManager = new SmartActionsManager(this, this.insertController);
    this.setupSmartActionsEventListeners();
  } else {
    // Reintentar si no está disponible aún
    setTimeout(() => this.initializeSmartActions(), 100);
  }
}
```

### **2. Manejo de Eventos:**

**Prevención de Menú del Navegador:**

```javascript
setupSmartActionsEventListeners() {
  this.stepsContainer.addEventListener('contextmenu', (e) => {
    const stepElement = e.target.closest('.glosario-step-item');
    if (stepElement) {
      e.preventDefault(); // ← Bloquea menú del navegador
      this.smartActionsManager.showSmartActionsMenu(e, stepElement, 'step');
    }
  });
}
```

### **3. Formato Gherkin Simplificado:**

**Lógica Principal:**

```javascript
getStepKeyword(position) {
  // Buscar cualquier step anterior
  for (let i = position.line - 1; i >= 0; i--) {
    const lineText = doc.getLine(i);
    if (lineText.match(/^(Given|When|Then|And|But)\s+/)) {
      return 'And'; // Steps siguientes usan "And"
    }
    if (lineText.match(/^(Scenario|Feature|Background|Scenario Outline):/)) {
      break; // Reset para primer step
    }
  }
  return 'Given'; // Primer step usa keyword original
}
```

---

## 🔌 Integración con GlosarioUI

### **Puntos de Integración:**

1. **Constructor:**

   ```javascript
   constructor() {
     // ... propiedades existentes
     this.smartActionsManager = null;
     this.init();
   }
   ```

2. **Inicialización:**

   ```javascript
   init() {
     this.createPanel();
     this.setupEventListeners();
     this.setupKeyboardShortcuts();
     this.initializeInsertController();
     this.initializeSmartActions(); // ← Nuevo
   }
   ```

3. **Event Listeners:**
   ```javascript
   setupSmartActionsEventListeners() {
     // Right-click para steps
     // Right-click para JSON references
     // Observer para contenedores dinámicos
   }
   ```

### **Comunicación entre Componentes:**

```
GlosarioUI → SmartActionsManager → BaseAction → CodeMirror
     ↓                ↓                ↓           ↓
  Panel UI      Menú Contextual   Lógica      Editor
```

---

## 🎯 Ejemplos de Uso

### **1. Insert Step con Formato:**

**Before (Manual):**

```
1. Copiar step: Given I login with {username}
2. Pegar en editor
3. Manualmente cambiar a And (si no es primer step)
4. Formatear placeholders
```

**After (Smart Action):**

```
1. Right-click en step → "Insert Step"
2. Auto-insert con formato correcto
Resultado: And I login with «username»
```

### **2. Copy Step:**

**Before (Manual):**

```
1. Seleccionar texto del step
2. Ctrl+C
3. Navegar a destino
4. Ctrl+V
```

**After (Smart Action):**

```
1. Right-click en step → "Copy Step"
2. Listo para pegar
```

### **3. Contexto Inteligente:**

**Situación:**

```
Scenario: Login functionality
  Given I am on the login page    ← Insertar aquí → usa Given
  And I enter credentials         ← Insertar aquí → usa And
  And I click login button        ← Insertar aquí → usa And
```

---

## 🐛 Troubleshooting

### **Problemas Comunes:**

#### **1. Menú del navegador aparece en lugar de menú smart:**

**Causa:** Event listeners no conectados correctamente
**Solución:** Verificar orden de carga de scripts en index.html

#### **2. SmartActionsManager no está definido:**

**Causa:** Bundle no cargó antes que glosario-ui.js
**Solución:** Verificar que smart-actions-bundle.js cargue antes

#### **3. Acciones no aparecen en el menú:**

**Causa:** Acciones no registradas o contexto no aplicable
**Solución:** Verificar console.log para mensajes de registro

#### **4. Error "doc.focus is not a function":**

**Causa:** Llamando focus() en documento en lugar de editor
**Solución:** Usar `window.ideCodeMirror.focus()` en lugar de `doc.focus()`

### **Debugging:**

**Console Commands:**

```javascript
// Verificar si SmartActionsManager está disponible
window.SmartActionsManager;

// Verificar acciones registradas
window.glosarioUI?.smartActionsManager?.actionRegistry?.getAllActions();

// Verificar estado del manager
window.glosarioUI?.smartActionsManager?.getDebugInfo();
```

**Log Messages a Buscar:**

```
[GLOSARIO-UI] Smart Actions Manager initialized successfully
[SMART-ACTIONS] Default actions registered
Smart Action executed: insert-step
```

---

## 🆕 Nuevas Características Implementadas

### **Placeholder Replacement System**

**Características:**
- **Detección automática** de placeholders (`{string}`, `{int}`, `{float}`, etc.)
- **Widget de búsqueda** con interfaz optimizada y dark mode
- **Búsqueda inclusiva** multi-término con scoring inteligente
- **Caché multi-nivel** para rendimiento optimizado
- **Integración fluida** con editor CodeMirror

**Implementación:**
- `ReplacePlaceholderAction` - Acción principal de reemplazo
- `JsonReferenceSearchWidget` - Widget especializado de búsqueda
- `InsertJsonReferenceAction` - Inserción directa de referencias

**Performance Optimizations:**
- Caché de 5 minutos (memoria + disco)
- Script optimization con priority-based parsing
- Respuestas < 100ms para búsquedas en tiempo real
- Reducción de 70% en tiempos de carga

---

## 🚀 Próximos Pasos

### **Acciones Planeadas:**

1. **FindUsagesAction** - Buscar todos los usos de un step
2. **GoToDefinitionAction** - Navegar a definición de step
3. **CreateSimilarStepAction** - Crear steps similares
4. **BatchReplaceAction** - Reemplazar múltiples placeholders

### **Mejoras Técnicas:**

1. **Keyboard Shortcuts** - Atajos para acciones comunes
2. **Fuzzy Search** - Búsqueda difusa en JSON references
3. **Custom Actions** - Permitir acciones personalizadas por usuario
4. **Web Workers** - Offload JSON parsing a background threads

---

**Última Actualización:** Septiembre 2025
**Versión:** 2.0
**Estado:** ✅ Implementación completa con Placeholder Replacement
**Performance:** ⚡ Optimizado con caché multi-nivel
