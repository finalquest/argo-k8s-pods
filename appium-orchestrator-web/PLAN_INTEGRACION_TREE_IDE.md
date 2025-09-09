# Plan de Integración Tree View con IDE View

## Objetivo

Lograr que los botones del tree view (▶️ Run y ⚡ Priority) trigereen exactamente la misma funcionalidad que los botones del IDE view, incluyendo apertura de archivo, gestión de estado y coordinación con cambios no guardados.

## Estado Actual

### Tree View (Actual)

- ✅ Botones Run y Priority creados en `renderFeatureTree()`
- ✅ Ejecución directa de tests
- ❌ No abre archivo en editor
- ❌ No gestiona estado de archivo activo
- ❌ No coordina con cambios no guardados

### IDE View (Actual)

- ✅ Editor CodeMirror con syntax highlighting
- ✅ Botones Save, Commit, Run
- ✅ Gestión de estado (`activeFeature`, `window.currentFeatureFile`)
- ✅ Manejo de cambios no guardados
- ✅ Integración con progress indicators

## Pasos de Implementación

### 1. Modificar Event Handlers del Tree View

**Archivo:** `public/js/main.js`
**Función:** Event delegation para botones del tree

```javascript
// Actual: Solo ejecuta tests
// Nuevo: Debe abrir archivo + ejecutar tests (con save si es necesario)
```

**Tareas:**

- [ ] Modificar handler de `.run-btn` y `.priority-btn`
- [ ] Agregar llamada a abrir archivo en editor
- [ ] Implementar verificación de cambios no guardados
- [ ] Actualizar variables de estado global

### 2. Crear Función de Apertura de Archivo desde Tree

**Archivo:** `public/js/ui.js`
**Nueva función:** `openFeatureFromTree(featureName)`

```javascript
function openFeatureFromTree(featureName) {
  // 1. Buscar el feature en la estructura de datos
  // 2. Abrir en CodeMirror editor
  // 3. Actualizar activeFeature y window.currentFeatureFile
  // 4. Actualizar estado de botones IDE
  // 5. Inicializar progress indicators para el archivo
}
```

**Tareas:**

- [ ] Implementar función `openFeatureFromTree()`
- [ ] Integrar con API para obtener contenido del feature
- [ ] Configurar CodeMirror con el contenido
- [ ] Actualizar estado global

### 3. Modificar Función `addFeatureControls`

**Archivo:** `public/js/ui.js`
**Función:** `addFeatureControls()` (líneas 399-418)

```javascript
// Actual: Crea botones simples
// Nuevo: Debe preparar botones para integración con IDE
```

**Tareas:**

- [ ] Agregar data attributes necesarios para integración
- [ ] Modificar estructura de botones si es necesario
- [ ] Asegurar consistencia con botones del IDE

### 4. Implementar Coordinación de Save

**Archivo:** `public/js/ui.js`
**Integración con:** `handleSave()` function

```javascript
// Nuevo flujo:
// 1. Usuario clickea botón en tree view
// 2. Verificar si hay cambios no guardados
// 3. Si hay cambios, mostrar confirmación o auto-guardar
// 4. Si no hay cambios o se guardó, proceder con ejecución
```

**Tareas:**

- [ ] Crear función `checkUnsavedChangesBeforeExecution()`
- [ ] Implementar lógica de confirmación/auto-guardado
- [ ] Integrar con flujo de ejecución existente

### 5. Sincronizar Estado de Botones

**Archivo:** `public/js/ui.js`
**Funciones:** Actualización de estado de botones

```javascript
// Los botones del tree deben reflejar:
// - Estado de ejecución (deshabilitado durante ejecución)
// - Estado del archivo (si está abierto en editor)
// - Estado de cambios no guardados
```

**Tareas:**

- [ ] Crear función `syncTreeButtonStates()`
- [ ] Integrar con eventos de cambio de archivo
- [ ] Manejar estados de deshabilitación durante ejecución

### 6. Integración con Progress Indicators

**Archivo:** `public/js/progress-indicator-manager.js`
**Integración:** Ejecuciones desde tree view

```javascript
// Asegurar que las ejecuciones desde tree view:
// - Muestren progreso correctamente
// - Actualicen el tree view durante ejecución
// - Mantengan consistencia con ejecuciones desde IDE
```

**Tareas:**

- [ ] Verificar integración con progress indicator manager
- [ ] Asegurar actualización de UI en tree view durante ejecución
- [ ] Probar consistencia entre ambos orígenes de ejecución

### 7. Pruebas y Validación

**Escenarios a probar:**

- [ ] Clic en botón Run del tree view → abre archivo + ejecuta
- [ ] Clic en botón Priority del tree view → abre archivo + ejecuta con prioridad
- [ ] Archivo con cambios no guardados → muestra confirmación
- [ ] Ejecución simultánea desde IDE y tree → estados consistentes
- [ ] Progress indicators funcionan desde ambos orígenes

## Archivos a Modificar

1. **`public/js/main.js`** - Event handlers para tree view
2. **`public/js/ui.js`** - Funciones de apertura y coordinación
3. **`public/js/progress-indicator-manager.js`** - Integración de progreso
4. **`public/css/styles.css`** - Estilos adicionales si son necesarios

## Variables Globales Utilizadas

- `activeFeature` - Feature actualmente abierto en editor
- `window.currentFeatureFile` - Archivo actual para progress indicators
- `window.ideCodeMirror` - Instancia del editor CodeMirror
- `window.progressIndicatorManager` - Gestor de indicadores de progreso

## Dependencias

- CodeMirror editor instance
- Progress indicator manager
- API functions para obtener contenido de features
- Event delegation system existente

## Notas de Implementación

- Mantener compatibilidad con funcionalidad existente
- Seguir patrones de código establecidos en el proyecto
- Considerar rendimiento al abrir archivos desde tree view
- Mantener consistencia en la experiencia de usuario
