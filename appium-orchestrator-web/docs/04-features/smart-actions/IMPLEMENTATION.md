# Smart Actions - Guía de Implementación

## Introducción

Este documento explica cómo implementar y extender el sistema de Smart Actions en el proyecto.

## Prerrequisitos

- Conocimiento básico de JavaScript ES6+
- Familiaridad con el sistema de glosario existente
- Comprensión de CodeMirror (editor de código)

## Pasos para Implementar una Nueva Smart Action

### 1. Crear la Clase de Acción

```javascript
// src/modules/smart-actions/actions/my-action.js
import { BaseAction } from '../base-action.js';

export class MyAction extends BaseAction {
  constructor() {
    super();
    this.type = 'my-action'; // identificador único
    this.icon = '🎯';      // emoji para mostrar en menú
    this.label = 'My Action'; // texto descriptivo
    this.shortcut = 'Ctrl+M'; // atajo opcional
    this.applicableContexts = ['step', 'json-reference']; // contextos donde aplica
  }

  async execute(context) {
    // 1. Validar contexto
    const validation = this.validate(context);
    if (validation.length > 0) {
      throw new Error(`Validation failed: ${validation.join(', ')}`);
    }

    // 2. Extraer datos del contexto
    const { data, element, position } = context;

    // 3. Ejecutar lógica principal
    const result = await this.performAction(data, element);

    // 4. Mostrar feedback
    this.showFeedback(`Action completed successfully`);

    // 5. Retornar resultado
    return { success: true, ...result };
  }

  // Método personalizado para la lógica
  async performAction(data, element) {
    // Implementar aquí la lógica específica
    return { processedData: data };
  }
}
```

### 2. Registrar la Acción

```javascript
// En el archivo donde se inicializa el SmartActionsManager
import { MyAction } from './actions/my-action.js';

// Después de crear el manager
smartActionsManager.registerAction(MyAction);
```

### 3. Definir Contextos Aplicables

Los contextos disponibles son:

- `'step'`: Para elementos de steps del glosario
- `'json-reference'`: Para referencias JSON
- `'multiple'`: Para selecciones múltiples (futuro)

### 4. Validar Contexto (Opcional)

```javascript
validate(context) {
  const errors = [];

  // Validar datos requeridos
  if (!context.data?.text) {
    errors.push('Step text is required');
  }

  // Validar posición del cursor
  if (!context.position) {
    errors.push('Cursor position is required');
  }

  return errors;
}
```

## Ejemplos de Implementación

### Acción Simple: Copiar al Portapapeles

```javascript
export class CopyToClipboardAction extends BaseAction {
  constructor() {
    super();
    this.type = 'copy-to-clipboard';
    this.icon = '📋';
    this.label = 'Copy to Clipboard';
    this.applicableContexts = ['step', 'json-reference'];
  }

  async execute(context) {
    const { data } = context;
    const textToCopy = data.text || JSON.stringify(data);

    await navigator.clipboard.writeText(textToCopy);
    this.showFeedback('Copied to clipboard');

    return { success: true, copied: textToCopy };
  }
}
```

### Acción Compleja: Insertar con Formato

```javascript
export class InsertFormattedAction extends BaseAction {
  constructor() {
    super();
    this.type = 'insert-formatted';
    this.icon = '✨';
    this.label = 'Insert Formatted';
    this.applicableContexts = ['step'];
  }

  async execute(context) {
    const { data, position } = context;

    // Formatear el texto
    const formatted = this.formatData(data);

    // Insertar en el editor
    await this.insertInEditor(formatted, position);

    this.showFeedback(`Inserted: ${formatted.substring(0, 50)}...`);

    return { success: true, formatted };
  }

  formatData(data) {
    // Lógica de formateo personalizada
    return `${data.type}: ${data.text}`;
  }

  async insertInEditor(text, position) {
    if (!window.ideCodeMirror) return;

    const doc = window.ideCodeMirror.getDoc();
    doc.replaceRange(text + '\n', position, position);

    // Mover cursor
    doc.setCursor({
      line: position.line + 1,
      ch: 0
    });
  }
}
```

## Integración con el Editor CodeMirror

### Acceder al Editor

```javascript
async execute(context) {
  const doc = window.ideCodeMirror.getDoc();
  const cursor = doc.getCursor();

  // Usar el cursor del contexto o el actual
  const position = context.position || cursor;

  // Insertar texto
  doc.replaceRange('Hello World\n', position, position);
}
```

### Manipular Contenido

```javascript
// Insertar texto
doc.replaceRange(text, start, end);

// Reemplazar línea
doc.replaceRange(newLine, {line: lineNumber, ch: 0}, {line: lineNumber + 1, ch: 0});

// Obtener línea actual
const currentLine = doc.getLine(cursor.line);

// Buscar en el documento
const lastScenario = this.findLastScenario(doc, cursor.line);
```

## Manejo de Estados y Datos

### Acceder a Datos del Glosario

```javascript
async execute(context) {
  const { glosarioUI } = context.metadata;

  if (glosarioUI) {
    // Acceder al glosario actual
    const currentGlosario = glosarioUI.currentGlosario;

    // Acceder a la sesión actual
    const session = glosarioUI.sessionManager.currentSession;
  }
}
```

### Persistir Estados

```javascript
async execute(context) {
  // Guardar en localStorage
  localStorage.setItem('my-action-state', JSON.stringify(data));

  // O usar el sistema de caché del glosario
  if (context.glosarioUI?.cacheManager) {
    context.glosarioUI.cacheManager.set('my-action', data);
  }
}
```

## Manejo de Errores

### Errores de Validación

```javascript
validate(context) {
  const errors = [];

  if (!context.data) {
    errors.push('No data available');
  }

  if (context.type === 'step' && !context.data.text) {
    errors.push('Step text is required');
  }

  return errors;
}
```

### Errores de Ejecución

```javascript
async execute(context) {
  try {
    // Lógica principal
    const result = await this.performAction(context);
    return result;
  } catch (error) {
    console.error('Action execution failed:', error);

    // Mostrar feedback de error
    this.showFeedback(`Error: ${error.message}`, 'error');

    // Re-lanzar el error para el manager
    throw error;
  }
}
```

## Testing y Debugging

### Debug de Acciones

```javascript
// Habilitar logging detallado
console.log('[MY-ACTION] Context:', context);
console.log('[MY-ACTION] Data:', context.data);

// Verificar estado del sistema
const debugInfo = smartActionsManager.getDebugInfo();
console.log('[DEBUG] Available actions:', debugInfo.registeredActions);
```

### Testing Manual

1. Abrir la aplicación en el navegador
2. Abrir DevTools Console
3. Ejecutar acciones y revisar logs
4. Verificar feedback visual
5. Comprobar integración con el editor

## Mejores Prácticas

### 1. Naming Conventions

- Usar PascalCase para nombres de clases: `MyCustomAction`
- Usar kebab-case para tipos: `'my-custom-action'`
- Ser descriptivo en labels: `'Insert Formatted Step'`

### 2. Error Handling

- Siempre validar contexto antes de ejecutar
- Proporcionar mensajes de error claros
- Usar `showFeedback()` para comunicación con usuario

### 3. Performance

- Evitar operaciones síncronas bloqueantes
- Cachear resultados cuando sea posible
- Limpiar recursos después de la ejecución

### 4. Compatibilidad

- Proveer fallbacks para APIs no disponibles
- Verificar existencia de objetos (`window.ideCodeMirror`)
- Manejar diferentes navegadores

## Troubleshooting Común

### Acción no aparece en menú

1. Verificar que la acción esté registrada
2. Comprobar `applicableContexts`
3. Revisar que el elemento tenga el contexto correcto

### Error al ejecutar acción

1. Revisar logs en consola
2. Verificar método `validate()`
3. Comprobar que todos los datos requeridos estén presentes

### Problemas con el editor

1. Verificar que `window.ideCodeMirror` exista
2. Comprobar permisos de escritura
3. Revisar posición del cursor

## Recursos Adicionales

- [Base Action Reference](#base-action-reference)
- [Context Types](#context-types)
- [CodeMirror API](https://codemirror.net/doc/manual.html)