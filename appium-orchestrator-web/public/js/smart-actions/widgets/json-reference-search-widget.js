/**
 * Widget de búsqueda de JSON references para placeholders
 * Muestra un panel flotante con búsqueda filtrable de JSON objects
 */

export class JsonReferenceSearchWidget {
  constructor(smartActionsManager, glosarioService) {
    this.smartActionsManager = smartActionsManager;
    this.glosarioService = glosarioService;
    this.widgetElement = null;
    this.isVisible = false;
    this.searchInput = null;
    this.resultsContainer = null;
    this.currentResults = [];
    this.placeholderInfo = null;
    this.widgetCache = null; // Caché específica del widget
    this.lastCacheUpdate = 0;
    this.cacheExpiryTime = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Muestra el widget de búsqueda
   * @param {Event} event - Evento del mouse para posicionamiento
   * @param {Object} placeholder - Información del placeholder detectado
   */
  show(event, placeholder) {
    this.placeholderInfo = placeholder;

    // Ocultar widget existente si está visible
    if (this.isVisible) {
      this.hide();
    }

    this.createWidget(event.pageX, event.pageY);
    this.isVisible = true;

    // Cargar JSON references y mostrar resultados iniciales
    this.loadJsonReferences();

    // Enfocar el input de búsqueda
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.focus();
      }
    }, 100);
  }

  /**
   * Oculta el widget
   */
  hide() {
    if (this.widgetElement && this.widgetElement.parentNode) {
      this.widgetElement.parentNode.removeChild(this.widgetElement);
    }
    this.widgetElement = null;
    this.isVisible = false;
    this.currentResults = [];
    this.placeholderInfo = null;
  }

  /**
   * Crea el elemento DOM del widget
   * @param {number} x - Posición X
   * @param {number} y - Posición Y
   */
  createWidget(x, y) {
    this.widgetElement = document.createElement('div');
    this.widgetElement.className = 'json-reference-search-widget';
    this.widgetElement.style.position = 'absolute';
    this.widgetElement.style.left = `${x}px`;
    this.widgetElement.style.top = `${y}px`;
    this.widgetElement.style.zIndex = '1001';

    this.widgetElement.innerHTML = `
      <div class="widget-header">
        <div class="widget-title">🔍 JSON Reference Search</div>
        <div class="widget-subtitle">Replace "${this.placeholderInfo.text}"</div>
      </div>
      <div class="widget-search">
        <input type="text" class="search-input" placeholder="Search filename, key, or value... (e.g., 'newBuy tittle')" />
      </div>
      <div class="widget-results">
        <div class="results-container"></div>
      </div>
    `;

    document.body.appendChild(this.widgetElement);

    // Configurar elementos del widget
    this.searchInput = this.widgetElement.querySelector('.search-input');
    this.resultsContainer = this.widgetElement.querySelector('.results-container');

    // Configurar event listeners
    this.setupEventListeners();
  }

  /**
   * Configura los event listeners del widget
   */
  setupEventListeners() {
    // Listener para input de búsqueda
    this.searchInput.addEventListener('input', (e) => {
      this.filterResults(e.target.value);
    });

    // Listener para teclado
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });

    // Cerrar widget al hacer clic fuera
    const handleOutsideClick = (event) => {
      if (this.widgetElement && !this.widgetElement.contains(event.target)) {
        this.hide();
        document.removeEventListener('click', handleOutsideClick);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 0);
  }

  /**
   * Carga las JSON references del glosario con caché optimizada
   */
  async loadJsonReferences() {
    const startTime = performance.now();
    console.log('[JSON-SEARCH-WIDGET] Starting to load JSON references...');

    try {
      // Verificar si tenemos caché válida en el widget
      const now = Date.now();
      if (this.widgetCache && (now - this.lastCacheUpdate) < this.cacheExpiryTime) {
        console.log('[JSON-SEARCH-WIDGET] Using widget cache, skipping data loading');
        this.currentResults = this.widgetCache;
        this.displayResults(this.widgetCache);
        const totalTime = performance.now() - startTime;
        console.log(`[JSON-SEARCH-WIDGET] Cache load time: ${totalTime}ms`);
        return;
      }

      const cacheStartTime = performance.now();
      const cachedRefs = this.glosarioService.getCachedJsonReferences();
      const cacheEndTime = performance.now();
      console.log(`[JSON-SEARCH-WIDGET] Cache retrieval took: ${cacheEndTime - cacheStartTime}ms`);

      if (!cachedRefs || !cachedRefs.data) {
        console.log('[JSON-SEARCH-WIDGET] No cached references found');
        this.showNoResults('No JSON references available');
        return;
      }

      console.log(`[JSON-SEARCH-WIDGET] Cached data structure:`, {
        hasReferences: !!cachedRefs.data.references,
        referencesCount: cachedRefs.data.references?.length || 0,
        totalKeys: cachedRefs.data.references?.reduce((sum, ref) => sum + (ref.keys?.length || 0), 0) || 0
      });

      const extractStartTime = performance.now();
      const references = this.extractJsonReferencesOptimized(cachedRefs.data);
      const extractEndTime = performance.now();
      console.log(`[JSON-SEARCH-WIDGET] Optimized reference extraction took: ${extractEndTime - extractStartTime}ms`);
      console.log(`[JSON-SEARCH-WIDGET] Extracted ${references.length} references`);

      // Actualizar caché del widget
      this.widgetCache = references;
      this.lastCacheUpdate = now;
      console.log('[JSON-SEARCH-WIDGET] Widget cache updated');

      this.currentResults = references;

      const displayStartTime = performance.now();
      this.displayResults(references);
      const displayEndTime = performance.now();
      console.log(`[JSON-SEARCH-WIDGET] Display rendering took: ${displayEndTime - displayStartTime}ms`);

      const totalTime = performance.now() - startTime;
      console.log(`[JSON-SEARCH-WIDGET] Total load time: ${totalTime}ms`);

    } catch (error) {
      console.error('Error loading JSON references:', error);
      this.showNoResults('Error loading JSON references');
    }
  }

  /**
   * Extrae referencias JSON de los datos del glosario (versión antigua)
   * @param {Object} data - Datos del glosario
   * @returns {Array} Lista de referencias en formato {filename, key, displayText}
   */
  extractJsonReferences(data) {
    const references = [];

    if (data.references) {
      for (const reference of data.references) {
        const filename = reference.filename;

        if (reference.keys) {
          for (const keyData of reference.keys) {
            references.push({
              filename,
              key: keyData.key,
              displayText: `${filename}.${keyData.key}`,
              value: keyData.value || ''
            });
          }
        }
      }
    }

    return references;
  }

  /**
   * Extrae referencias JSON de forma optimizada
   * @param {Object} data - Datos del glosario
   * @returns {Array} Lista de referencias en formato {filename, key, displayText}
   */
  extractJsonReferencesOptimized(data) {
    if (!data.references || !Array.isArray(data.references)) {
      return [];
    }

    // Pre-allocar array para mejor rendimiento
    const references = [];
    let totalKeys = 0;

    // Usar forEach en lugar de for...of para mejor rendimiento en arrays grandes
    data.references.forEach(reference => {
      const filename = reference.filename;

      if (reference.keys && Array.isArray(reference.keys)) {
        totalKeys += reference.keys.length;

        reference.keys.forEach(keyData => {
          references.push({
            filename: filename || 'unknown',
            key: keyData.key || 'unknown',
            displayText: `${filename || 'unknown'}.${keyData.key || 'unknown'}`,
            value: keyData.value || ''
          });
        });
      }
    });

    console.log(`[JSON-SEARCH-WIDGET] Processed ${data.references.length} files with ${totalKeys} total keys`);
    return references;
  }

  /**
   * Filtra resultados basado en el texto de búsqueda (búsqueda inclusiva con puntuación)
   * @param {string} searchText - Texto para filtrar
   */
  filterResults(searchText) {
    if (!searchText.trim()) {
      this.displayResults(this.currentResults);
      return;
    }

    const searchTerms = searchText.toLowerCase().split(' ').filter(term => term.trim());

    const resultsWithScores = this.currentResults.map(ref => {
      const filenameLower = ref.filename.toLowerCase();
      const keyLower = ref.key.toLowerCase();
      const valueLower = (ref.value || '').toLowerCase();

      let score = 0;
      let matchesAllTerms = true;

      // Evaluar cada término de búsqueda
      for (const term of searchTerms) {
        let termMatched = false;

        // Coincidencia exacta en key (máxima puntuación)
        if (keyLower === term) {
          score += 100;
          termMatched = true;
        }
        // Key comienza con el término
        else if (keyLower.startsWith(term)) {
          score += 80;
          termMatched = true;
        }
        // Key contiene el término
        else if (keyLower.includes(term)) {
          score += 60;
          termMatched = true;
        }
        // Filename contiene el término
        else if (filenameLower.includes(term)) {
          score += 40;
          termMatched = true;
        }
        // Value contiene el término
        else if (valueLower.includes(term)) {
          score += 20;
          termMatched = true;
        }

        if (!termMatched) {
          matchesAllTerms = false;
          break;
        }
      }

      return {
        ref,
        score,
        matchesAllTerms
      };
    });

    // Filtrar solo los resultados que coinciden con todos los términos
    // Ordenar por puntuación (más relevante primero)
    const filtered = resultsWithScores
      .filter(item => item.matchesAllTerms)
      .sort((a, b) => b.score - a.score)
      .map(item => item.ref);

    this.displayResults(filtered);
  }

  /**
   * Muestra los resultados en el contenedor
   * @param {Array} results - Resultados a mostrar
   */
  displayResults(results) {
    if (results.length === 0) {
      this.showNoResults('No matching JSON references found');
      return;
    }

    const resultsHTML = results.map((ref, index) => `
      <div class="result-item" data-index="${index}">
        <div class="result-icon">📄</div>
        <div class="result-content">
          <div class="result-top-row">
            <div class="result-filename">${ref.filename}</div>
            <div class="result-key">${ref.key}</div>
          </div>
          <div class="result-bottom-row">
            <div class="result-value-label">Value:</div>
            <div class="result-value">${this.truncateValue(ref.value)}</div>
          </div>
        </div>
      </div>
    `).join('');

    this.resultsContainer.innerHTML = resultsHTML;

    // Configurar listeners para los items
    this.resultsContainer.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.selectReference(results[index]);
      });
    });
  }

  /**
   * Muestra mensaje de "no hay resultados"
   * @param {string} message - Mensaje a mostrar
   */
  showNoResults(message) {
    this.resultsContainer.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div class="no-results-message">${message}</div>
      </div>
    `;
  }

  /**
   * Selecciona y reemplaza el placeholder con la referencia JSON
   * @param {Object} reference - Referencia seleccionada
   */
  selectReference(reference) {
    if (!window.ideCodeMirror || !this.placeholderInfo) {
      return;
    }

    const doc = window.ideCodeMirror.getDoc();

    // Reemplazar el placeholder con la referencia JSON (con comillas)
    const replacement = `"${reference.displayText}"`;
    doc.replaceRange(
      replacement,
      { line: this.placeholderInfo.line, ch: this.placeholderInfo.start },
      { line: this.placeholderInfo.line, ch: this.placeholderInfo.end }
    );

    // Dar feedback al usuario
    this.showFeedback(`Replaced "${this.placeholderInfo.text}" with "${reference.displayText}"`);

    // Ocultar el widget
    this.hide();
  }

  /**
   * Trunca el valor para mostrarlo en la UI
   * @param {string} value - Valor a truncar
   * @returns {string} Valor truncado
   */
  truncateValue(value) {
    if (!value) return '';
    const maxLength = 30;
    return value.length > maxLength ? value.substring(0, maxLength) + '...' : value;
  }

  /**
   * Muestra feedback al usuario
   * @param {string} message - Mensaje a mostrar
   */
  showFeedback(message) {
    if (window.showNotification) {
      window.showNotification(message, 'success');
    } else {
      console.log('[JSON-SEARCH-WIDGET]', message);
    }
  }

  /**
   * Destruye el widget y limpia recursos
   */
  destroy() {
    this.hide();
    this.smartActionsManager = null;
    this.glosarioService = null;
  }
}