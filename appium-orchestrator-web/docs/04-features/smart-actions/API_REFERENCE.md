# Smart Actions - API Reference

## Table of Contents

- [SmartActionsManager](#smartactionsmanager)
- [ActionRegistry](#actionregistry)
- [BaseAction](#baseaction)
- [ActionContext](#actioncontext)
- [Acciones Implementadas](#acciones-implementadas)

## SmartActionsManager

### Constructor

```javascript
new SmartActionsManager(glosarioUI, insertController)
```

**Parámetros:**
- `glosarioUI` (Object): Instancia del GlosarioUI existente
- `insertController` (Object): Controlador de inserción existente

### Métodos

#### `executeAction(actionType, context)`
Ejecuta una smart action específica.

```javascript
const result = await smartActionsManager.executeAction('insert-step', context);
```

**Parámetros:**
- `actionType` (String): Tipo de acción a ejecutar
- `context` (ActionContext): Contexto de ejecución

**Retorna:** `Promise<Object>` - Resultado de la ejecución

**Lanza:** `Error` si la acción no existe o no es aplicable

#### `getAvailableActions(context)`
Obtiene acciones disponibles para un contexto específico.

```javascript
const actions = smartActionsManager.getAvailableActions(context);
```

**Parámetros:**
- `context` (ActionContext): Contexto a evaluar

**Retorna:** `Array<BaseAction>` - Acciones aplicables

#### `showSmartActionsMenu(event, element, type)`
Muestra el menú contextual de smart actions.

```javascript
smartActionsManager.showSmartActionsMenu(mouseEvent, element, 'step');
```

**Parámetros:**
- `event` (Event): Evento del mouse
- `element` (HTMLElement): Elemento DOM clickeado
- `type` (String): Tipo de contexto

#### `createContext(element, type, additionalData)`
Crea un contexto de acción.

```javascript
const context = smartActionsManager.createContext(element, 'step', { custom: 'data' });
```

**Parámetros:**
- `element` (HTMLElement): Elemento DOM
- `type` (String): Tipo de contexto
- `additionalData` (Object): Datos adicionales (opcional)

**Retorna:** `ActionContext`

#### `registerAction(actionClass)`
Registra una nueva smart action.

```javascript
smartActionsManager.registerAction(MyCustomAction);
```

**Parámetros:**
- `actionClass` (Class): Clase de la acción a registrar

#### `getDebugInfo()`
Obtiene información de debugging.

```javascript
const debugInfo = smartActionsManager.getDebugInfo();
```

**Retorna:** `Object` - Información de depuración

## ActionRegistry

### Constructor

```javascript
new ActionRegistry()
```

### Métodos

#### `registerAction(actionClass)`
Registra una acción en el sistema.

```javascript
registry.registerAction(MyCustomAction);
```

**Parámetros:**
- `actionClass` (Class): Clase de la acción

#### `getAction(actionType)`
Obtiene una acción por su tipo.

```javascript
const action = registry.getAction('insert-step');
```

**Parámetros:**
- `actionType` (String): Tipo de acción

**Retorna:** `BaseAction | null`

#### `getActionsForContext(context)`
Obtiene acciones aplicables a un contexto.

```javascript
const actions = registry.getActionsForContext(context);
```

**Parámetros:**
- `context` (ActionContext): Contexto a evaluar

**Retorna:** `Array<BaseAction>`

#### `getAllActions()`
Obtiene todas las acciones registradas.

```javascript
const actions = registry.getAllActions();
```

**Retorna:** `Array<BaseAction>`

#### `unregisterAction(actionType)`
Elimina una acción del registro.

```javascript
const success = registry.unregisterAction('old-action');
```

**Parámetros:**
- `actionType` (String): Tipo de acción a eliminar

**Retorna:** `Boolean` - `true` si se eliminó correctamente

#### `hasAction(actionType)`
Verifica si una acción está registrada.

```javascript
const exists = registry.hasAction('insert-step');
```

**Parámetros:**
- `actionType` (String): Tipo de acción

**Retorna:** `Boolean`

## BaseAction

### Constructor

```javascript
new BaseAction()
```

### Propiedades

#### `type` (String)
Identificador único de la acción.

**Ejemplo:** `'insert-step'`

#### `icon` (String)
Icono o emoji para mostrar en el menú.

**Ejemplo:** `'📝'`

#### `label` (String)
Texto descriptivo de la acción.

**Ejemplo:** `'Insert Step'`

#### `shortcut` (String|null)
Atajo de teclado (opcional).

**Ejemplo:** `'Ctrl+I'`

#### `applicableContexts` (Array<String>)
Contextos donde la acción es aplicable.

**Ejemplo:** `['step', 'json-reference']`

### Métodos

#### `isApplicable(context)`
Verifica si la acción es aplicable al contexto.

```javascript
const applicable = action.isApplicable(context);
```

**Parámetros:**
- `context` (ActionContext): Contexto a evaluar

**Retorna:** `Boolean`

#### `execute(context)`
Ejecuta la acción principal. **Debe ser implementado por subclases.**

```javascript
const result = await action.execute(context);
```

**Parámetros:**
- `context` (ActionContext): Contexto de ejecución

**Retorna:** `Promise<Object>` - Resultado de la ejecución

**Lanza:** `Error` si no está implementado

#### `validate(context)`
Valida precondiciones para ejecutar la acción.

```javascript
const errors = action.validate(context);
```

**Parámetros:**
- `context` (ActionContext): Contexto a validar

**Retorna:** `Array<String>` - Lista de errores (vacío si es válido)

#### `showFeedback(message, type)`
Muestra feedback visual al usuario.

```javascript
action.showFeedback('Operation completed', 'success');
```

**Parámetros:**
- `message` (String): Mensaje a mostrar
- `type` (String): Tipo de feedback ('success', 'error')

## ActionContext

### Constructor

```javascript
new ActionContext({
  element,        // HTMLElement
  type,           // String
  data,           // Object
  position,       // Object {line, ch}
  selection,      // Array (opcional)
  metadata        // Object (opcional)
})
```

### Propiedades

#### `element` (HTMLElement)
Elemento DOM que originó la acción.

#### `type` (String)
Tipo de contexto. Valores posibles:
- `'step'`: Elemento de step del glosario
- `'json-reference'`: Referencia JSON
- `'multiple'`: Selección múltiple

#### `data` (Object)
Datos específicos del elemento.

**Para tipo `'step'`:**
```javascript
{
  text: String,    // Texto del step
  type: String,    // Given/When/Then/And/But
  file: String     // Archivo origen
}
```

**Para tipo `'json-reference'`:**
```javascript
{
  key: String,     // Clave JSON
  value: String,   // Valor JSON
  file: String     // Archivo origen
}
```

#### `position` (Object)
Posición del cursor en el editor.

```javascript
{
  line: Number,    // Línea (0-indexed)
  ch: Number       // Carácter (0-indexed)
}
```

#### `selection` (Array|undefined)
Selección múltiple si aplica.

#### `metadata` (Object)
Metadata adicional, puede incluir:
- `glosarioUI`: Referencia al GlosarioUI
- `branch`: Rama actual
- `filePath`: Path del archivo

#### `timestamp` (Number)
Timestamp de creación del contexto.

### Métodos

#### `isValid()`
Verifica si el contexto es válido.

```javascript
const valid = context.isValid();
```

**Retorna:** `Boolean`

#### `clone(overrides)`
Crea una copia del contexto con datos modificados.

```javascript
const newContext = context.clone({ type: 'modified' });
```

**Parámetros:**
- `overrides` (Object): Propiedades a sobreescribir

**Retorna:** `ActionContext`

#### `extractMetadata()`
Extrae metadata relevante del contexto.

```javascript
const metadata = context.extractMetadata();
```

**Retorna:** `Object` - Metadata procesada

## Acciones Implementadas

### InsertStepAction

**Tipo:** `'insert-step'`
**Icono:** `'📝'`
**Label:** `'Insert Step'`
**Atajo:** `'Ctrl+I'`
**Contextos:** `['step']`

#### Métodos específicos:

##### `getStepKeyword(position)`
Determina el keyword apropiado para el step.

```javascript
const keyword = action.getStepKeyword(position);
```

**Retorna:** `String` - Keyword ('Given', 'When', 'Then', 'And')

##### `formatStep(step, keyword)`
Formatea un step para inserción.

```javascript
const formatted = action.formatStep(stepData, 'Given');
```

**Retorna:** `String` - Step formateado

##### `insertIntoEditor(formattedStep, position)`
Inserta el step en el editor.

```javascript
await action.insertIntoEditor(formattedStep, position);
```

### CopyStepAction

**Tipo:** `'copy-step'`
**Icono:** `'📋'`
**Label:** `'Copy Step'`
**Atajo:** `'Ctrl+C'`
**Contextos:** `['step']`

No tiene métodos específicos adicionales.

## Eventos

### Smart Actions Menu Events

Los menús contextuales emiten los siguientes eventos:

#### `click` en `.menu-item`
Se dispara cuando el usuario selecciona una acción.

```javascript
// El handler ya está implementado en SmartActionsManager
// Acceso al tipo de acción: event.target.dataset.action
```

#### `click` fuera del menú
Cierra el menú contextual.

## Constants

### Tipos de Contexto

```javascript
const CONTEXT_TYPES = {
  STEP: 'step',
  JSON_REFERENCE: 'json-reference',
  MULTIPLE: 'multiple'
};
```

### Tipos de Feedback

```javascript
const FEEDBACK_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error'
};
```

## CSS Classes

### Menú Contextual

- `.smart-actions-menu-container`: Contenedor principal
- `.smart-actions-menu`: Menú de acciones
- `.menu-header`: Header del menú
- `.menu-item`: Item individual de acción
- `.action-icon`: Icono de la acción
- `.action-label`: Etiqueta de la acción
- `.action-shortcut`: Atajo de teclado

### Feedback

- `.smart-action-feedback`: Contenedor de feedback
- `.feedback-content`: Contenido del feedback
- `.feedback-icon`: Icono de feedback
- `.feedback-text`: Texto del feedback