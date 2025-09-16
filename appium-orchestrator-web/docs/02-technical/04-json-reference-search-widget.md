# 🚀 JSON Reference Search Widget & Placeholder Replacement - Technical Documentation

## 📋 Visión General

El **JSON Reference Search Widget** es un componente avanzado que permite a los usuarios buscar y reemplazar placeholders (como `{string}`, `{int}`, etc.) en el editor CodeMirror con referencias JSON reales del sistema. Este widget se activa mediante right-click sobre un placeholder y proporciona una interfaz de búsqueda optimizada con filtros inteligentes.

## 🎯 Características Principales

### **Placeholder Detection**
- **Detección automática**: Identifica placeholders como `{string}`, `{int}`, `{float}`, `{bool}`, etc.
- **Context-aware**: Se activa únicamente cuando el cursor está sobre un placeholder válido
- **Right-click activation**: Integra seamlessly con el flujo de trabajo del editor

### **Search Widget Features**
- **Búsqueda inclusiva**: Permite búsquedas multi-término (ej: "newBuy tittle")
- **Scoring inteligente**: Prioriza resultados por relevancia
- **Dark mode support**: Adapta su apariencia al tema de la aplicación
- **Responsive design**: Optimizado para diferentes tamaños de pantalla
- **Caché optimizado**: 5 minutos de caché para rendimiento mejorado

### **Performance Optimizations**
- **Caché multi-nivel**: Memory cache + disk cache con expiry
- **Script optimization**: Parser con priority-based (jq > Node.js > regex)
- **Debounce inteligente**: Actualizaciones en tiempo real sin lag
- **File batching**: Procesamiento eficiente de archivos JSON

## 🏗️ Arquitectura

### **Componentes Principales**

```
SmartActionsManager
├── JsonReferenceSearchWidget
│   ├── Search UI (HTML/CSS)
│   ├── Cache Manager
│   └── Performance Monitor
├── ReplacePlaceholderAction
└── GlosarioService Integration
```

### **Flujo de Ejecución**

1. **Right-click sobre placeholder** → SmartActionsManager detecta placeholder
2. **Widget creation** → Se crea interfaz de búsqueda en posición del mouse
3. **Data loading** → Carga referencias JSON con caché optimizado
4. **Search interaction** → Usuario filtra resultados en tiempo real
5. **Selection & replacement** → Reemplaza placeholder con referencia JSON seleccionada

## 🔧 Implementación Detallada

### **1. Placeholder Detection**

**Archivo**: `public/js/smart-actions/smart-actions-manager.js`

```javascript
detectPlaceholderAtCursor() {
  const cursor = window.ideCodeMirror.getCursor();
  const line = window.ideCodeMirror.getLine(cursor.line);

  // Patrones: {string}, {int}, {float}, {bool}, etc.
  const placeholderPattern = /\{(string|int|float|bool|boolean|number|text|date|time)\w*\}/g;

  // Detecta si el cursor está dentro de un placeholder
  if (cursorPos >= placeholderStart && cursorPos <= placeholderEnd) {
    return {
      text: match[0],
      type: match[1],
      start: placeholderStart,
      end: placeholderEnd,
      line: cursor.line
    };
  }
}
```

### **2. Widget Creation & Positioning**

**Archivo**: `public/js/smart-actions/widgets/json-reference-search-widget.js`

```javascript
createWidget(x, y) {
  this.widgetElement = document.createElement('div');
  this.widgetElement.className = 'json-reference-search-widget';
  this.widgetElement.style.position = 'absolute';
  this.widgetElement.style.left = `${x}px`;
  this.widgetElement.style.top = `${y}px`;
  this.widgetElement.style.zIndex = '1001';

  // Optimized HTML structure with dark mode support
  this.widgetElement.innerHTML = `
    <div class="widget-header">
      <div class="widget-title">🔍 JSON Reference Search</div>
      <div class="widget-subtitle">Replace "${this.placeholderInfo.text}"</div>
    </div>
    <div class="widget-search">
      <input type="text" class="search-input" placeholder="Search filename, key, or value..." />
    </div>
    <div class="widget-results">
      <div class="results-container"></div>
    </div>
  `;
}
```

### **3. Optimized Search Algorithm**

```javascript
filterResults(searchText) {
  const searchTerms = searchText.toLowerCase().split(' ').filter(term => term.trim());

  const resultsWithScores = this.currentResults.map(ref => {
    let score = 0;
    let matchesAllTerms = true;

    // Scoring system for relevance
    for (const term of searchTerms) {
      let termMatched = false;

      // Exact key match (highest score)
      if (ref.key.toLowerCase() === term) {
        score += 100;
        termMatched = true;
      }
      // Key starts with term
      else if (ref.key.toLowerCase().startsWith(term)) {
        score += 80;
        termMatched = true;
      }
      // Key contains term
      else if (ref.key.toLowerCase().includes(term)) {
        score += 60;
        termMatched = true;
      }
      // Filename contains term
      else if (ref.filename.toLowerCase().includes(term)) {
        score += 40;
        termMatched = true;
      }
      // Value contains term
      else if (ref.value.toLowerCase().includes(term)) {
        score += 20;
        termMatched = true;
      }

      if (!termMatched) {
        matchesAllTerms = false;
        break;
      }
    }

    return { ref, score, matchesAllTerms };
  });

  // Filter and sort by relevance
  return resultsWithScores
    .filter(item => item.matchesAllTerms)
    .sort((a, b) => b.score - a.score)
    .map(item => item.ref);
}
```

### **4. Cache System Implementation**

**Archivo**: `src/modules/core/json-reference-scanner-manager.js`

```javascript
// Multi-level cache with memory + disk
getFromCache(branch) {
  // Try memory cache first
  const memoryCache = this.cache.get(this.getCacheKey(branch));
  if (memoryCache && this.isCacheValid(memoryCache)) {
    return { ...memoryCache.data, cached: true, source: 'memory' };
  }

  // Try disk cache
  const cacheFile = this.getCacheFilePath(branch);
  if (fs.existsSync(cacheFile)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (this.isCacheValid(cacheData)) {
        this.cache.set(this.getCacheKey(branch), cacheData);
        return { ...cacheData.data, cached: true, source: 'disk' };
      }
    } catch (error) {
      console.warn('Error reading disk cache:', error.message);
    }
  }

  return null;
}
```

### **5. Optimized Script Processing**

**Archivo**: `scripts/scan-json-refs.sh`

```bash
# Priority-based JSON parsing
if command -v jq >/dev/null 2>&1; then
    # Use jq for fastest processing
    keys_json=$(jq -c 'to_entries | map({key: .key, value: .value})' "$file")
    key_count=$(jq 'length' "$file")
elif command -v node >/dev/null 2>&1; then
    # Fallback to Node.js
    keys_json=$(node -e "const data = require('$file'); console.log(JSON.stringify(Object.entries(data)));")
else
    # Last resort: optimized regex processing
    grep -o '"[^"]*":\s*[^,]*' "$file" > "$temp_file"
    key_count=$(wc -l < "$temp_file")
fi
```

## 🎨 UI/UX Implementation

### **Dark Mode Support**

**Archivo**: `public/css/styles.css`

```css
/* Dark mode with hex colors for compatibility */
[data-theme='dark'] .json-reference-search-widget {
  background: #1f2937 !important;
  border-color: #4b5563 !important;
  color: #f9fafb !important;
}

[data-theme='dark'] .widget-header {
  background: #374151 !important;
  border-bottom-color: #4b5563 !important;
}

[data-theme='dark'] .search-input {
  background: #111827 !important;
  border-color: #4b5563 !important;
  color: #f9fafb !important;
}
```

### **Responsive Layout**

```css
.json-reference-search-widget {
  max-width: 500px;
  max-height: 400px;
  box-sizing: border-box;
  overflow: hidden;
}

/* Two-row layout for better space utilization */
.result-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-top-row {
  display: flex;
  gap: 8px;
}

.result-filename {
  flex: 2; /* More space for filename */
  font-weight: 600;
  color: #2563eb;
}

.result-key {
  flex: 1; /* Less space for key */
  color: #059669;
}
```

## 🔌 API Integration

### **Server Endpoint**

**Archivo**: `server.js`

```javascript
app.get('/api/json-references/scan', async (req, res) => {
  const { branch, forceRefresh } = req.query;

  const forceRefreshBool = forceRefresh === 'true' || forceRefresh === '1';
  const result = await jsonReferenceScannerManager.scanJsonReferences(branch, forceRefreshBool);

  if (result.success) {
    res.json(result);
  } else {
    const statusCode = result.code === 'WORKSPACE_NOT_EXISTS' ? 404 : 400;
    res.status(statusCode).json(result);
  }
});
```

### **Client Service**

**Archivo**: `public/js/glosario-service.js`

```javascript
async getJsonReferences(branch, forceRefresh = false) {
  // Check client cache first
  if (!forceRefresh && this.jsonCache.has(branch)) {
    const cachedData = this.jsonCache.get(branch);
    return { ...cachedData, cached: true };
  }

  // Fetch from server with cache support
  const url = `${this.jsonRefsApiUrl}/scan?branch=${encodeURIComponent(branch)}&forceRefresh=${forceRefresh}`;
  const response = await fetch(url);

  const result = await response.json();
  if (result.success) {
    const dataWithCacheFlag = { ...result, cached: result.cached || false };
    this.jsonCache.set(branch, dataWithCacheFlag);
    return dataWithCacheFlag;
  }
}
```

## 🚀 Performance Optimizations

### **Caching Strategy**
- **Memory cache**: 5-minute expiry para solicitudes frecuentes
- **Disk cache**: Persistencia entre reinicios del servidor
- **Cache invalidation**: Force refresh parameter para actualizar datos

### **Script Optimization**
- **Priority parsing**: jq > Node.js > regex (rendimiento descendente)
- **Reduced process spawning**: Elimina subprocess múltiples por archivo
- **Efficient key counting**: Direct counting en lugar de operaciones complejas
- **File batching**: Procesamiento por lotes para mejor throughput

### **Client-side Optimizations**
- **Debounced search**: 100ms delay para búsquedas en tiempo real
- **Virtual rendering**: Solo renderiza items visibles
- **Smart caching**: Widget-level cache con expiry management
- **Optimized extraction**: forEach loops en lugar de for...of para arrays grandes

## 🧪 Testing Strategy

### **Manual Testing Cases**

1. **Placeholder Detection**
   - Right-click sobre `{string}` → Widget aparece
   - Right-click fuera de placeholder → Widget no aparece
   - Cursor dentro de placeholder → Widget se posiciona correctamente

2. **Search Functionality**
   - Buscar "tittle" → Encontrar todas las keys con "tittle"
   - Buscar "newBuy tittle" → Encontrar resultados que contengan ambos términos
   - Buscar término inexistente → Mostrar "No results found"

3. **Performance Testing**
   - Primer carga: < 3 segundos para datasets grandes
   - Cargas subsecuentes: < 500ms con caché
   - Búsqueda en tiempo real: < 100ms de respuesta

4. **Dark Mode Testing**
   - Cambiar tema → Widget adapta colores
   - Verificar contraste y legibilidad
   - Test en diferentes resoluciones

### **Performance Metrics**

- **Load time**: < 3s (first load), < 500ms (cached)
- **Search response**: < 100ms
- **Memory usage**: < 50MB durante operación normal
- **CPU usage**: < 10% durante búsquedas continuas

## 🔧 Troubleshooting

### **Common Issues**

**Widget no aparece al hacer right-click**
- Verificar que el cursor esté sobre un placeholder válido
- Check console para errores JavaScript
- Confirmar que SmartActionsManager esté inicializado

**Búsqueda muy lenta**
- Verificar que el caché esté funcionando
- Check server logs para errores en el script de escaneo
- Confirmar que jq o Node.js estén disponibles para parsing óptimo

**Dark mode no funciona**
- Verificar CSS variables y !important declarations
- Check que el theme switching esté funcionando en la aplicación
- Inspeccionar elementos para ver estilos aplicados

### **Debug Logging**

Habilitar logging detallado para diagnóstico:

```javascript
// En json-reference-search-widget.js
console.log('[JSON-SEARCH-WIDGET] Loading references...');
console.log('[JSON-SEARCH-WIDGET] Cache status:', cached ? 'hit' : 'miss');
console.log('[JSON-SEARCH-WIDGET] Processing time:', endTime - startTime, 'ms');

// En json-reference-scanner-manager.js
console.log(`[JSON-SCANNER] Starting scan for branch ${branch}`);
console.log(`[JSON-SCANNER] Cache ${cachedData ? 'hit' : 'miss'} (${cachedData?.source})`);
console.log(`[JSON-SCANNER] Scan completed in ${endTime - startTime}ms`);
```

## 📝 Future Enhancements

### **Planned Features**
- **Fuzzy search**: Implementar búsqueda difusa para mejor matching
- **Preview panel**: Mostrar preview del JSON seleccionado
- **Recent searches**: Guardar búsquedas recientes para rápido acceso
- **Keyboard navigation**: Navegación por teclado en resultados
- **Multi-selection**: Permitir selección múltiple de referencias

### **Performance Improvements**
- **Web Workers**: Offload JSON parsing a background threads
- **Incremental loading**: Cargar resultados en páginas para datasets grandes
- **Smart preloading**: Pre-cargar referencias basado en patrones de uso
- **Compression**: Comprimir responses para mejor transfer time

---

**Documento técnico creado**: Septiembre 2025
**Versión**: 1.0
**Estado**: Implementado y en producción
**Prioridad**: Alta (mejora significativa de UX y productividad)