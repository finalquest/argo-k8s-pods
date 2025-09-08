# Documentación Técnica: Sistema de Indicadores de Progreso en Tiempo Real

## Overview

El sistema de indicadores de progreso en tiempo real permite visualizar la ejecución de tests de Appium directamente en el editor CodeMirror, mostrando qué step está siendo ejecutado actualmente con indicadores visuales en el gutter y resaltado de líneas.

## Arquitectura del Sistema

```
Worker (LogProgressParser) → Server (Socket.IO) → Frontend (ProgressIndicatorManager) → CodeMirror Editor
```

### Componentes Principales

1. **LogProgressParser** (worker.js)
2. **Server Events** (server.js)
3. **ProgressIndicatorManager** (progress-indicator-manager.js)
4. **CodeMirror Integration** (ui.js)
5. **CSS Visual Indicators** (styles.css)

## Flujo de Datos Detallado

### 1. LogProgressParser (worker.js)

**Responsabilidad:** Parsear logs de WebdriverIO en tiempo real y extraer eventos de progreso.

```javascript
class LogProgressParser {
  constructor() {
    this.stepPatterns = [
      /^\[0-0\]\s*➡️\s+(Given|When|Then|And|But)\s+(.+)$/i,
      /^\[0-0\]\s*✅.*:\s+(Given|When|Then|And|But)\s+(.+)$/i,
      /^\[0-0\]\s*❌ Fail:\s+(Given|When|Then|And|But)\s+(.+)$/i,
    ];
    this.currentStep = null;
    this.featureName = null;
    this.scenarioName = null;
  }
}
```

**Patrones de Regex:**
- `➡️` - Inicio de step (running)
- `✅` - Step completado exitosamente (passed)
- `❌ Fail` - Step fallido (failed)

**Procesamiento:**
1. Cada línea de log es evaluada contra los patrones de regex
2. Cuando se detecta un evento, se genera un objeto de progreso:
```javascript
{
  jobId: string,
  event: 'step:start' | 'step:end' | 'scenario:start' | 'feature:start',
  data: {
    keyword: 'Given' | 'When' | 'Then' | 'And' | 'But',
    text: string,
    status: 'running' | 'passed' | 'failed',
    location: { line: number, file: string },
    duration?: number
  },
  timestamp: ISO string
}
```

### 2. Server Events (server.js)

**Responsabilidad:** Recibir eventos del worker y retransmitirlos al frontend via Socket.IO.

```javascript
worker.on('message', (msg) => {
  if (msg.type === 'PROGRESS_UPDATE') {
    // Añadir contexto del job actual
    const progressData = {
      ...msg.data,
      slotId: currentSlot.slotId,
      jobId: currentJob.id,
      featureName: currentJob.featureName
    };
    
    // Enviar a todos los clientes conectados
    io.emit('progress_update', progressData);
  }
});
```

**Contexto Añadido:**
- `slotId`: Identificador del worker
- `jobId`: ID único del job de ejecución
- `featureName`: Nombre del feature being ejecutado

### 3. ProgressIndicatorManager (progress-indicator-manager.js)

**Responsabilidad:** Manejar el estado de los jobs y actualizar las decoraciones visuales en el editor.

#### Estado Interno

```javascript
class ProgressIndicatorManager {
  constructor() {
    this.activeJobs = new Map();        // Jobs activos con sus estados
    this.editorDecorations = new Map(); // Decoraciones por job
    this.currentJobId = null;          // Job actualmente visible
    this.throttleTimeout = null;       // Para optimización de rendimiento
  }
}
```

#### Manejo de Eventos

**handleProgressUpdate(data):**
```javascript
handleProgressUpdate(data) {
  const { jobId, event, data: progressData, timestamp } = data;
  
  // 1. Actualizar estado del job
  this.updateJobState(jobId, event, progressData, timestamp);
  
  // 2. Si este job está visible, actualizar decoraciones
  if (this.currentJobId === jobId) {
    this.updateEditorDecorations(jobId);
  }
}
```

**updateJobState():**
- Mantiene el estado actual del step siendo ejecutado
- Almacena historial de steps completados
- Maneja eventos de feature/scenario start/end

#### Detección de Líneas en el Editor

**findStepInEditor(step):** Implementa múltiples estrategias para encontrar steps en el editor:

1. **Coincidencia Exacta:** Busca el texto exacto del step
2. **Placeholders Genéricos:** Reemplaza valores dinámicos con regex
   ```javascript
   const placeholderPattern = step.text.replace(/"[^"]*"/g, '"[^"]*"');
   ```
3. **Palabras Clave:** Busca las primeras 4 palabras del step

**Ejemplo:**
- Step en log: `Given the user is on "login" page`
- Pattern 1: `Given the user is on "login" page`
- Pattern 2: `Given the user is on "[^"]*" page`
- Pattern 3: `Given the user is on`

#### Decoraciones Visuales

**createStepDecoration(step, status):**
```javascript
// 1. Crear marcador en el gutter
const gutterMarker = document.createElement('div');
gutterMarker.className = `step-indicator step-${status}`;
gutterMarker.innerHTML = status === 'running' ? '▶️' : 
                        status === 'passed' ? '✅' : '❌';

// 2. Resaltar línea completa
const lineClass = `step-${status}-line`;
window.ideCodeMirror.addLineClass(lineNum, 'background', lineClass);

// 3. Agregar al gutter
window.ideCodeMirror.setGutterMarker(lineNum, 'progress-gutter', gutterMarker);
```

### 4. CodeMirror Integration (ui.js)

**Configuración del Editor:**
```javascript
ideCodeMirror = CodeMirror(wrapper, {
  gutters: ['CodeMirror-linenumbers', 'progress-gutter'],
  // ... otras opciones
});

// Exponer globalmente para el progress manager
window.ideCodeMirror = ideCodeMirror;
```

**Gutter Personalizado:**
- Se registra un gutter llamado 'progress-gutter'
- Los indicadores se muestran junto a los números de línea
- Soporta múltiples indicadores simultáneos

### 5. CSS Visual Indicators (styles.css)

#### Gutter Indicators
```css
.step-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  margin: 2px auto;
}

.step-running { background-color: rgba(217, 119, 6, 0.8); }
.step-passed { background-color: rgba(5, 150, 105, 0.8); }
.step-failed { background-color: rgba(220, 38, 38, 0.8); }
.step-initializing { background-color: rgba(107, 114, 128, 0.8); }
```

#### Line Highlighting
```css
.step-running-line { background-color: rgba(217, 119, 6, 0.3) !important; }
.step-passed-line { background-color: rgba(5, 150, 105, 0.2) !important; }
.step-failed-line { background-color: rgba(220, 38, 38, 0.3) !important; }
```

## Manejo de Estados

### Estados de Jobs

1. **Initializing:** ⏳ - Mientras Appium se inicia
2. **Running:** ▶️ - Step actualmente en ejecución
3. **Passed:** ✅ - Step completado exitosamente
4. **Failed:** ❌ - Step con error

### Transiciones de Estado

```
Feature Start → Scenario Start → Step Start → Step End → ... → Scenario End → Feature End
     ↓                ↓              ↓           ↑              ↑              ↑
  ⏳ (gray)      ⏳ (gray)      ▶️ (orange)    ✅/❌         ⏳ (gray)    ⏳ (gray)
```

## Optimizaciones y Consideraciones

### Performance

1. **Throttling:** Las actualizaciones son throttled para evitar sobrecarga
2. **Cleanup Automático:** Jobs inactivos se limpian después de 5 minutos
3. **Decoraciones Eficientes:** Se reutilizan y limpian adecuadamente

### Manejo de Errores

1. **Fallback a Línea 1:** Si no se encuentra el step, se usa la primera línea
2. **Resiliencia:** El sistema continúa funcionando incluso si falla alguna decoración
3. **Validación:** Se verifican los estados y datos antes de aplicar cambios

### Sincronización

1. **Job ID Tracking:** Se mantiene un job actual para evitar conflictos
2. **Socket.IO Events:** Eventos properly secuenciados y con timestamps
3. **State Management:** Estado consistente entre worker, server y frontend

## Configuración Requerida

### Worker Configuration
```javascript
// Habilitar progreso en runScript
const progressParser = new LogProgressParser(jobId, featureName);
```

### WDIO Configuration
```javascript
// Configuración para logs detallados
{
  logLevel: 'trace',
  reporters: ['spec'],
  cucumberOpts: {
    requireModule: ['@babel/register'],
    require: ['hooks.js'] // Hooks personalizados si es necesario
  }
}
```

### Frontend Dependencies
```javascript
// Socket.IO listener
socket.on('progress_update', (data) => {
  if (window.progressIndicatorManager) {
    window.progressIndicatorManager.handleProgressUpdate(data);
  }
});
```

## Limitaciones Conocidas

1. **Matching de Steps:** Los steps con placeholders complejos pueden requerir ajustes en los patrones de regex
2. **Multi-file Features:** Actualmente solo muestra indicadores en el archivo abierto
3. **Performance:** Muchos jobs simultáneos pueden impactar el rendimiento del editor
4. **Log Format:** Depende del formato específico de logs de WebdriverIO

## Extensiones Futuras

1. **Multi-file Support:** Mostrar indicadores en todos los archivos relacionados
2. **Step Definitions:** Navegación a definiciones de steps
3. **Performance Metrics:** Tiempos de ejecución por step
4. **Filtering:** Filtrar steps por tipo o etiquetas
5. **Export:** Exportar progreso y resultados

## Troubleshooting

### Problemas Comunes

1. **No se ven los indicadores:**
   - Verificar que `window.ideCodeMirror` esté disponible
   - Revisar que el job ID esté siendo correctamente establecido

2. **Los indicadores aparecen en línea incorrecta:**
   - Los placeholders en los steps pueden no coincidir exactamente
   - El feature file puede tener un formato diferente

3. **Performance issues:**
   - Demasiados jobs activos simultáneamente
   - Archivos de features muy grandes

### Debug

Los logs principales se encuentran en:
- **Worker Console:** Logs de parsing y detección de steps
- **Server Console:** Eventos de Socket.IO y retransmisión
- **Browser Console:** Eventos recibidos y estado del progress manager