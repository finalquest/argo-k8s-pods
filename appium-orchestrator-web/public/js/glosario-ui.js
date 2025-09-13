// Glosario UI Component
// Handles the glosario panel UI and user interactions

import { logDebug, logError } from './utils/error-handling.js';

class GlosarioUI {
  constructor() {
    this.panel = null;
    this.isVisible = false;
    this.currentBranch = null;
    this.searchInput = null;
    this.stepsContainer = null;
    this.filterType = 'all';
    this.searchQuery = '';
    this.debugMode = false;

    this.init();
  }

  /**
   * Initialize the glosario UI
   */
  init() {
    this.createPanel();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
  }

  /**
   * Get glosario service instance
   */
  getGlosarioService() {
    if (typeof serviceRegistry !== 'undefined' && serviceRegistry.has('glosario')) {
      return serviceRegistry.get('glosario');
    } else if (typeof window !== 'undefined' && window.glosarioService) {
      console.warn('Deprecated: Using window.glosarioService instead of service registry');
      return window.glosarioService;
    } else {
      throw new Error('Glosario service not available');
    }
  }

  /**
   * Create the glosario panel
   */
  createPanel() {
    // Create panel container
    this.panel = document.createElement('div');
    this.panel.id = 'glosario-panel';
    this.panel.className = 'glosario-panel';
    this.panel.innerHTML = `
      <div class="glosario-header">
        <div class="glosario-title">
          <span class="glosario-icon">📚</span>
          <h3>Glosario de Steps</h3>
        </div>
        <div class="glosario-controls">
          <button class="glosario-refresh-btn" title="Recargar steps">
            🔄
          </button>
          <button class="glosario-close-btn" title="Cerrar panel">
            ✕
          </button>
        </div>
      </div>
      
      <div class="glosario-info">
        <div class="glosario-branch-info">
          <span class="branch-label">Branch:</span>
          <span class="branch-name" id="glosario-branch-name">-</span>
        </div>
        <div class="glosario-status" id="glosario-status">
          <span class="status-indicator">⚪</span>
          <span class="status-text">Sin workspace</span>
        </div>
      </div>
      
      <div class="glosario-search-container">
        <input 
          type="text" 
          class="glosario-search-input" 
          placeholder="Buscar steps..."
          id="glosario-search-input"
        >
        <div class="glosario-filters">
          <button class="filter-btn active" data-type="all">Todos</button>
          <button class="filter-btn" data-type="Given">Given</button>
          <button class="filter-btn" data-type="When">When</button>
          <button class="filter-btn" data-type="Then">Then</button>
        </div>
      </div>
      
      <div class="glosario-steps-container" id="glosario-steps-container">
        <div class="glosario-empty-state">
          <div class="empty-icon">📝</div>
          <p>Seleccione una branch y prepare el workspace para ver los steps disponibles</p>
        </div>
      </div>
      
      <div class="glosario-footer">
        <div class="glosario-stats" id="glosario-stats">
          <span class="stat-item">Total: 0</span>
        </div>
        <button class="glosario-cache-btn" title="Limpiar caché">
          🗑️ Caché
        </button>
      </div>
    `;

    // Add styles if not already added
    if (!document.getElementById('glosario-styles')) {
      this.addStyles();
    }

    // Add to document
    document.body.appendChild(this.panel);

    // Cache DOM elements
    this.searchInput = document.getElementById('glosario-search-input');
    this.stepsContainer = document.getElementById('glosario-steps-container');
    this.branchName = document.getElementById('glosario-branch-name');
    this.statusElement = document.getElementById('glosario-status');
    this.statsElement = document.getElementById('glosario-stats');
  }

  /**
   * Add CSS styles for the glosario panel
   */
  addStyles() {
    const styles = document.createElement('style');
    styles.id = 'glosario-styles';
    styles.textContent = `
      .glosario-panel {
        position: fixed;
        top: 0;
        right: -400px;
        width: 400px;
        height: 100vh;
        background: #1e1e1e;
        border-left: 1px solid #333;
        color: #e0e0e0;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        transition: right 0.3s ease;
        z-index: 1000;
        display: flex;
        flex-direction: column;
      }

      .glosario-panel.visible {
        right: 0;
      }

      .glosario-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        background: #2d2d2d;
        border-bottom: 1px solid #333;
      }

      .glosario-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .glosario-title h3 {
        margin: 0;
        font-size: 16px;
        color: #fff;
      }

      .glosario-icon {
        font-size: 20px;
      }

      .glosario-controls {
        display: flex;
        gap: 10px;
      }

      .glosario-refresh-btn,
      .glosario-close-btn,
      .glosario-cache-btn {
        background: none;
        border: 1px solid #555;
        color: #ccc;
        padding: 5px 10px;
        cursor: pointer;
        border-radius: 3px;
        font-size: 12px;
        transition: all 0.2s ease;
      }

      .glosario-refresh-btn:hover,
      .glosario-close-btn:hover,
      .glosario-cache-btn:hover {
        background: #444;
        color: #fff;
      }

      .glosario-info {
        padding: 10px 15px;
        background: #2a2a2a;
        border-bottom: 1px solid #333;
        font-size: 12px;
      }

      .glosario-branch-info {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 5px;
      }

      .branch-label {
        color: #888;
      }

      .branch-name {
        color: #4fc3f7;
        font-weight: bold;
      }

      .glosario-status {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .status-indicator {
        font-size: 10px;
      }

      .status-text {
        color: #ccc;
      }

      .glosario-search-container {
        padding: 15px;
        background: #2d2d2d;
        border-bottom: 1px solid #333;
      }

      .glosario-search-input {
        width: 100%;
        padding: 8px 12px;
        background: #1e1e1e;
        border: 1px solid #444;
        color: #fff;
        border-radius: 4px;
        font-size: 14px;
        margin-bottom: 10px;
      }

      .glosario-search-input:focus {
        outline: none;
        border-color: #4fc3f7;
      }

      .glosario-filters {
        display: flex;
        gap: 5px;
      }

      .filter-btn {
        flex: 1;
        padding: 5px 10px;
        background: #1e1e1e;
        border: 1px solid #444;
        color: #ccc;
        cursor: pointer;
        border-radius: 3px;
        font-size: 12px;
        transition: all 0.2s ease;
      }

      .filter-btn.active {
        background: #4fc3f7;
        color: #000;
        border-color: #4fc3f7;
      }

      .filter-btn:hover:not(.active) {
        background: #333;
      }

      .glosario-steps-container {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
      }

      .glosario-empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #888;
      }

      .empty-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }

      .glosario-step-item {
        background: #2a2a2a;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .glosario-step-item:hover {
        background: #333;
        border-color: #4fc3f7;
      }

      .step-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 5px;
      }

      .step-type {
        background: #555;
        color: #fff;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
      }

      .step-type.Given {
        background: #4caf50;
      }

      .step-type.When {
        background: #ff9800;
      }

      .step-type.Then {
        background: #2196f3;
      }

      .step-text {
        font-size: 14px;
        color: #fff;
        margin-bottom: 5px;
        line-height: 1.4;
      }

      .step-meta {
        font-size: 11px;
        color: #888;
      }

      .glosario-footer {
        padding: 10px 15px;
        background: #2d2d2d;
        border-top: 1px solid #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .glosario-stats {
        font-size: 12px;
        color: #888;
      }

      .stat-item {
        margin-right: 15px;
      }

      /* Dark mode support */
      [data-theme="dark"] .glosario-panel {
        background: #1a1a1a;
        border-left-color: #333;
      }

      [data-theme="dark"] .glosario-header,
      [data-theme="dark"] .glosario-info,
      [data-theme="dark"] .glosario-search-container,
      [data-theme="dark"] .glosario-footer {
        background: #252525;
      }

      [data-theme="dark"] .glosario-step-item {
        background: #222;
      }

      [data-theme="dark"] .glosario-step-item:hover {
        background: #2a2a2a;
      }
    `;
    document.head.appendChild(styles);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Close button
    this.panel
      .querySelector('.glosario-close-btn')
      .addEventListener('click', () => {
        this.hide();
      });

    // Refresh button
    this.panel
      .querySelector('.glosario-refresh-btn')
      .addEventListener('click', () => {
        this.refreshSteps();
      });

    // Cache button
    this.panel
      .querySelector('.glosario-cache-btn')
      .addEventListener('click', () => {
        this.clearCache();
      });

    // Search input
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.filterSteps();
    });

    // Filter buttons
    this.panel.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.panel
          .querySelectorAll('.filter-btn')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterType = btn.dataset.type;
        this.filterSteps();
      });
    });
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + G to toggle glosario
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        this.toggle();
      }

      // Escape to close
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Show the glosario panel
   */
  async show() {
    this.isVisible = true;
    this.panel.classList.add('visible');
    await this.updateStatus();
    
    // Load steps only if not already cached for current branch
    if (this.currentBranch) {
      const glosarioService = this.getGlosarioService();
      const cached = glosarioService.getCachedSteps();
      if (cached) {
        console.log('[GLOSARIO-UI] Using cached steps for branch:', this.currentBranch);
        this.displaySteps(cached);
        this.updateStats(cached.result ? cached.result.summary : null);
        this.setStatus('Steps cargados desde caché', '🟢');
      } else {
        console.log('[GLOSARIO-UI] No cached steps, scanning for branch:', this.currentBranch);
        await this.loadSteps();
      }
    }
  }

  /**
   * Hide the glosario panel
   */
  hide() {
    this.isVisible = false;
    this.panel.classList.remove('visible');
  }

  /**
   * Toggle the glosario panel
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set current branch and update UI
   */
  setBranch(branch) {
    this.currentBranch = branch;
    this.branchName.textContent = branch || '-';
    this.updateStatus();
  }

  /**
   * Update status display
   */
  async updateStatus() {
    if (!this.currentBranch) {
      this.setStatus('Sin branch seleccionada', '⚪');
      return;
    }

    try {
      const glosarioService = this.getGlosarioService();
      const status = await glosarioService.getStatus(this.currentBranch);

      if (status.workspaceExists) {
        this.setStatus('Workspace listo', '🟢');
        this.startScan();
      } else {
        this.setStatus('Workspace no encontrado', '🔴');
        this.showEmptyState('Ejecute "preparar workspace" para esta branch');
      }
    } catch (error) {
      this.setStatus('Error al verificar workspace', '🔴');
    }
  }

  /**
   * Set status text and indicator
   */
  setStatus(text, indicator) {
    this.statusElement.querySelector('.status-text').textContent = text;
    this.statusElement.querySelector('.status-indicator').textContent =
      indicator;
  }

  /**
   * Start scanning steps for current branch
   */
  async startScan() {
    await this.loadSteps();
  }

  /**
   * Load steps using cache logic
   */
  async loadSteps() {
    if (!this.currentBranch) {
      alert('Por favor, seleccione una branch primero');
      return;
    }

    try {
      this.setStatus('Cargando steps...', '🟡');

      const glosarioService = this.getGlosarioService();
      const data = await glosarioService.getSteps(this.currentBranch, false);
      this.displaySteps(data);
      this.updateStats(data.result ? data.result.summary : null);
      
      if (data.cached) {
        this.setStatus('Steps cargados desde caché', '🟢');
      } else {
        this.setStatus('Steps escaneados', '🟢');
      }
    } catch (error) {
      this.setStatus('Error al cargar steps', '🔴');

      if (error.message.includes('Workspace no existe')) {
        this.showEmptyState('Ejecute "preparar workspace" para esta branch');
      } else {
        this.showEmptyState(`Error: ${error.message}`);
      }
    }
  }

  /**
   * Refresh steps for current branch
   */
  async refreshSteps() {
    if (!this.currentBranch) {
      alert('Por favor, seleccione una branch primero');
      return;
    }

    try {
      this.setStatus('Escaneando steps...', '🟡');

      const glosarioService = this.getGlosarioService();
      const data = await glosarioService.refreshSteps(this.currentBranch);
      this.displaySteps(data);
      this.updateStats(data.result ? data.result.summary : null);
      this.setStatus('Steps actualizados', '🟢');
    } catch (error) {
      this.setStatus('Error al escanear', '🔴');

      if (error.message.includes('Workspace no existe')) {
        this.showEmptyState('Ejecute "preparar workspace" para esta branch');
      } else {
        this.showEmptyState(`Error: ${error.message}`);
      }
    }
  }

  /**
   * Load cached steps
   */
  loadCachedSteps() {
    const cached = window.glosarioService.getCachedSteps();
    if (cached) {
      this.displaySteps(cached);
      this.updateStats(cached.result ? cached.result.summary : null);
      this.setStatus('Steps cargados desde caché', '🟢');
    }
  }

  /**
   * Display steps in the container
   */
  displaySteps(data) {
    if (!data.steps || data.steps.length === 0) {
      this.showEmptyState('No se encontraron step definitions');
      return;
    }

    const filteredSteps = this.getFilteredSteps(data.steps);

    if (filteredSteps.length === 0) {
      this.showEmptyState('No hay steps que coincidan con los filtros');
      return;
    }

    this.stepsContainer.innerHTML = '';

    filteredSteps.forEach((step) => {
      const stepElement = this.createStepElement(step);
      this.stepsContainer.appendChild(stepElement);
    });
  }

  /**
   * Create step element
   */
  createStepElement(step) {
    const stepDiv = document.createElement('div');
    stepDiv.className = 'glosario-step-item';
    stepDiv.innerHTML = `
      <div class="step-header">
        <span class="step-type ${step.type}">${step.type}</span>
      </div>
      <div class="step-text">${this.escapeHtml(step.text)}</div>
      <div class="step-meta">
        <span class="step-parameters">${step.parameters ? `Parameters: ${step.parameters}` : ''}</span>
      </div>
    `;

    stepDiv.addEventListener('click', () => {
      this.copyStepToClipboard(step);
    });

    return stepDiv;
  }

  /**
   * Filter steps based on current filters
   */
  getFilteredSteps(steps) {
    let filtered = steps;

    // Filter by type
    if (this.filterType !== 'all') {
      filtered = filtered.filter((step) => step.type === this.filterType);
    }

    // Filter by search query
    if (this.searchQuery) {
      filtered = filtered.filter(
        (step) =>
          step.text.toLowerCase().includes(this.searchQuery) ||
          step.file.toLowerCase().includes(this.searchQuery),
      );
    }

    return filtered;
  }

  /**
   * Filter and redisplay steps
   */
  filterSteps() {
    const glosarioService = this.getGlosarioService();
    const cached = glosarioService.getCachedSteps();
    if (cached) {
      this.displaySteps(cached);
    }
  }

  /**
   * Show empty state
   */
  showEmptyState(message) {
    this.stepsContainer.innerHTML = `
      <div class="glosario-empty-state">
        <div class="empty-icon">📝</div>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Update statistics
   */
  updateStats(summary) {
    if (!summary) {
      this.statsElement.innerHTML = '';
      return;
    }

    const statsHtml = `
      <span class="stat-item">Total: ${summary.total_steps || 0}</span>
      <span class="stat-item">Given: ${summary.given_steps || 0}</span>
      <span class="stat-item">When: ${summary.when_steps || 0}</span>
      <span class="stat-item">Then: ${summary.then_steps || 0}</span>
    `;
    this.statsElement.innerHTML = statsHtml;
  }

  /**
   * Copy step to clipboard
   */
  async copyStepToClipboard(step) {
    const stepText = `${step.type} ${step.text}`;

    try {
      await navigator.clipboard.writeText(stepText);

      // Visual feedback
      const originalText = event.target.textContent;
      event.target.textContent = '✓ Copied!';
      event.target.style.background = '#4caf50';

      setTimeout(() => {
        event.target.textContent = originalText;
        event.target.style.background = '';
      }, 1000);
    } catch (error) {
      alert('Error al copiar el step al portapapeles');
    }
  }

  /**
   * Clear cache
   */
  async clearCache() {
    try {
      const glosarioService = this.getGlosarioService();
      await glosarioService.clearCache(this.currentBranch);
      this.setStatus('Caché limpiado', '🟢');
      this.showEmptyState('Caché limpiado. Click en refresh para recargar.');
    } catch (error) {
      alert('Error al limpiar el caché');
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const glosarioUI = new GlosarioUI();
  
  // Registrar en el service registry
  if (typeof serviceRegistry !== 'undefined') {
    serviceRegistry.register('glosarioUI', glosarioUI);
  } else if (typeof window !== 'undefined') {
    // Fallback para compatibilidad temporal
    window.glosarioUI = glosarioUI;
  }
});
