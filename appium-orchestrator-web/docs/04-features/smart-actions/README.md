# Smart Actions

Sistema de acciones contextuales e inteligentes para el glosario.

## 📖 Documentación Completa

Esta carpeta contiene la documentación completa del sistema de Smart Actions. Para aprender sobre el sistema, consulta los siguientes documentos:

### 🚀 Quick Start
- **[01-overview.md](./01-overview.md)** - Documentación técnica principal
  - Visión general y arquitectura del sistema
  - Flujo de ejecución y componentes clave
  - Ejemplos de uso y guía de troubleshooting

### 🔧 Guías Técnicas Detalladas
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** - Guía completa de implementación
  - Cómo implementar nuevas acciones
  - Patrones y mejores prácticas
  - Ejemplos de código completo

- **[API_REFERENCE.md](./API_REFERENCE.md)** - Referencia completa de APIs
  - Documentación de todas las clases y métodos
  - Parámetros y valores de retorno
  - Ejemplos de uso

## 🎯 Características Principales

### ✅ Funcionalidades Implementadas
- **Acciones contextuales** - Right-click en steps para acciones inteligentes
- **Inserción con formato** - Inserta steps con indentación correcta automáticamente
- **Detección de contexto** - Usa Given/When/Then/And según posición en el escenario
- **Arquitectura extensible** - Fácil de agregar nuevas acciones
- **Integración con glosario** - Se integra perfectamente con UI existente
- **Manejo de errores** - Validación y feedback robusto

### 🏗️ Arquitectura General

## Arquitectura General

```
SmartActionsManager
├── ActionRegistry
│   ├── BaseAction
│   ├── InsertStepAction
│   └── CopyStepAction
├── ActionContext
└── Event System
```

## Componentes Principales

### 1. SmartActionsManager

**Archivo:** `src/modules/smart-actions/smart-actions-manager.js`

Es el coordinador principal del sistema. Se encarga de:

- Registrar y gestionar acciones disponibles
- Manejar menús contextuales
- Crear contextos de ejecución
- Coordinar la ejecución de acciones

**Métodos clave:**
- `executeAction(actionType, context)`: Ejecuta una acción específica
- `getAvailableActions(context)`: Obtiene acciones disponibles para un contexto
- `showSmartActionsMenu(event, element, type)`: Muestra menú contextual
- `createContext(element, type, data)`: Crea contexto de acción

### 2. ActionRegistry

**Archivo:** `src/modules/smart-actions/action-registry.js`

Gestiona el registro y recuperación de acciones smart actions.

**Características:**
- Registro dinámico de acciones
- Filtrado por contexto aplicable
- Gestión de dependencias entre acciones

### 3. BaseAction

**Archivo:** `src/modules/smart-actions/base-action.js`

Clase abstracta base para todas las smart actions.

**Propiedades requeridas:**
- `type`: Identificador único de la acción
- `icon`: Emoji o icono para mostrar en menú
- `label`: Texto descriptivo de la acción
- `shortcut`: Atajo de teclado (opcional)
- `applicableContexts`: Array de contextos donde aplica

**Métodos a implementar:**
- `execute(context)`: Lógica principal de la acción
- `validate(context)`: Validación de precondiciones

### 4. ActionContext

**Archivo:** `src/modules/smart-actions/action-context.js`

Contiene toda la información necesaria para ejecutar una acción.

**Propiedades:**
- `element`: Elemento DOM que originó la acción
- `type`: Tipo de contexto ('step', 'json-reference', 'multiple')
- `data`: Datos específicos del elemento
- `position`: Posición del cursor en el editor
- `selection`: Selección múltiple si aplica
- `metadata`: Metadata adicional

## Acciones Implementadas

### InsertStepAction

**Archivo:** `src/modules/smart-actions/actions/insert-step-action.js`

Inserta un step del glosario en el editor CodeMirror.

**Funcionalidad:**
- Detecta automáticamente el keyword apropiado (Given/When/Then/And)
- Formatea placeholders como marcadores visibles (`{param}` → `«param»`)
- Inserta en la posición actual del cursor
- Mantiene contexto de escenario existente

**Contextos aplicables:** `['step']`

### CopyStepAction

**Archivo:** `src/modules/smart-actions/actions/copy-step-action.js`

Copia un step del glosario al portapapeles.

**Funcionalidad:**
- Formatea el step completo (keyword + texto)
- Usa Clipboard API con fallback para navegadores antiguos
- Proporciona feedback visual al usuario

**Contextos aplicables:** `['step']`

## Flujo de Ejecución

1. **Usuario hace clic derecho** en un elemento del glosario
2. **SmartActionsManager** crea un ActionContext
3. **ActionRegistry** filtra acciones aplicables
4. **Menú contextual** se muestra con acciones disponibles
5. **Usuario selecciona acción** → se ejecuta `execute()`
6. **Acción procesa datos** y modifica editor/estado
7. **Feedback visual** se muestra al usuario

## Tipos de Contexto

### step
Aplica a elementos de steps en el glosario.
- **Data:** `{ text, type, file }`
- **Elemento:** `.glosario-step-item`

### json-reference
Aplica a referencias JSON.
- **Data:** `{ key, value, file }`
- **Elemento:** `.json-key-item`

### multiple
Para selecciones múltiples (futuro).

## Extensión del Sistema

### Crear Nueva Acción

1. Extender de `BaseAction`:
```javascript
import { BaseAction } from '../base-action.js';

export class MyCustomAction extends BaseAction {
  constructor() {
    super();
    this.type = 'my-custom-action';
    this.icon = '🎯';
    this.label = 'My Custom Action';
    this.applicableContexts = ['step', 'json-reference'];
  }

  async execute(context) {
    // Lógica de la acción
    return { success: true };
  }
}
```

2. Registrar la acción:
```javascript
smartActionsManager.registerAction(MyCustomAction);
```

### Manejo de Errores

Las acciones deben:
- Validar precondiciones en `validate()`
- Lanzar errores descriptivos
- Usar `showFeedback()` para comunicación con usuario

## Integración con UI Existente

### GlosarioUI Integration

El SmartActionsManager se integra con el GlosarioUI existente:

```javascript
const smartActionsManager = new SmartActionsManager(glosarioUI, insertController);
```

### Event Listeners

Los eventos de clic derecho se configuran automáticamente en los elementos del glosario.

## Configuración y Personalización

### Estilos CSS

Los menús contextuales usan clases CSS personalizables:
- `.smart-actions-menu-container`
- `.smart-actions-menu`
- `.menu-item`

### Iconos y Etiquetas

Cada acción define su propio icono (emoji) y etiqueta para máxima flexibilidad.

## Debugging

El sistema incluye métodos de debugging:

```javascript
smartActionsManager.getDebugInfo();
// Retorna acciones registradas y estado del sistema
```

## Consideraciones Técnicas

### Performance

- Las acciones se instancian solo una vez al registrarlas
- El filtrado por contexto es eficiente usando Map
- Los menús se crean dinámicamente y se destruyen después de usar

### Seguridad

- Validación de contexto antes de ejecutar acciones
- Sanitización de datos extraídos del DOM
- Manejo seguro de errores para evitar filtración de información

### Compatibilidad

- Soporte para navegadores modernos con fallbacks
- Integración con CodeMirror existente
- Compatible con el sistema de glosario actual