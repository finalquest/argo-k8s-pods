// Glosario UI Component
// Handles the glosario panel UI and user interactions

import { GlosarioInsertController } from './glosario-insert-controller.js';
import { SmartActionsManager } from './smart-actions-loader.js';
import AutocompleteService from './autocomplete/autocomplete-service.js';

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
    this.insertController = null;
    this.currentTab = 'steps';
    this.smartActionsManager = null;

    this.init();
  }

  /**
   * Initialize the glosario UI
   */
  init() {
    this.createPanel();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.initializeInsertController();
    this.initializeSmartActions();
    this.initializeAutocomplete();
  }

  /**
   * Get glosario service instance
   */
  getGlosarioService() {
    if (
      typeof window.serviceRegistry !== 'undefined' &&
      window.serviceRegistry.has('glosario')
    ) {
      return window.serviceRegistry.get('glosario');
    } else if (typeof window !== 'undefined' && window.glosarioService) {
      console.warn(
        'Deprecated: Using window.glosarioService instead of service registry',
      );
      return window.glosarioService;
    } else {
      throw new Error('Glosario service not available');
    }
  }

  /**
   * Initialize the insert controller
   */
  initializeInsertController() {
    // Wait for CodeMirror to be available
    const initializeController = () => {
      if (typeof window !== 'undefined' && window.ideCodeMirror) {
        try {
          this.insertController = new GlosarioInsertController(
            this,
            window.ideCodeMirror,
          );
          console.log(
            '[GLOSARIO-UI] Insert controller initialized successfully',
          );
        } catch (error) {
          console.error(
            '[GLOSARIO-UI] Failed to initialize insert controller:',
            error,
          );
        }
      } else {
        // Retry after a short delay
        setTimeout(initializeController, 100);
      }
    };

    // Start initialization
    initializeController();
  }

  /**
   * Initialize the smart actions manager
   */
  initializeSmartActions() {
    try {
      // SmartActionsManager ya está importado como módulo
      this.smartActionsManager = new SmartActionsManager(
        this,
        this.insertController,
      );
      console.log(
        '[GLOSARIO-UI] Smart Actions Manager initialized successfully',
      );

      this.setupSmartActionsEventListeners();
    } catch (error) {
      console.error(
        '[GLOSARIO-UI] Failed to initialize Smart Actions Manager:',
        error,
      );
    }
  }

  /**
   * Initialize the autocomplete service
   */
  initializeAutocomplete() {
    try {
      // Esperar a que CodeMirror esté disponible
      const initializeWhenReady = () => {
        if (typeof window.ideCodeMirror !== 'undefined') {
          const glosarioService = this.getGlosarioService();
          this.autocompleteService = new AutocompleteService(
            glosarioService,
            window.ideCodeMirror,
          );

          // Registrar en el service registry
          if (typeof window.serviceRegistry !== 'undefined') {
            window.serviceRegistry.register(
              'autocomplete',
              this.autocompleteService,
            );
            console.log(
              '[GLOSARIO-UI] Autocomplete Service initialized and registered',
            );
          } else {
            // Fallback para compatibilidad
            window.autocompleteService = this.autocompleteService;
            console.log(
              '[GLOSARIO-UI] Autocomplete Service initialized (fallback mode)',
            );
          }
        } else {
          // Esperar y reintentar
          setTimeout(initializeWhenReady, 100);
        }
      };

      initializeWhenReady();
    } catch (error) {
      console.error(
        '[GLOSARIO-UI] Failed to initialize Autocomplete Service:',
        error,
      );
    }
  }

  /**
   * Setup smart actions event listeners
   */
  setupSmartActionsEventListeners() {
    if (!this.smartActionsManager) return;

    // Right-click for steps
    if (this.stepsContainer) {
      this.stepsContainer.addEventListener('contextmenu', (e) => {
        const stepElement = e.target.closest('.glosario-step-item');
        if (stepElement) {
          e.preventDefault();
          this.smartActionsManager.showSmartActionsMenu(e, stepElement, 'step');
        }
      });
    }

    // Right-click for JSON references
    const jsonContainer = this.jsonContainer;
    if (jsonContainer) {
      jsonContainer.addEventListener('contextmenu', (e) => {
        const jsonElement = e.target.closest('.json-key-item');
        if (jsonElement) {
          e.preventDefault();
          this.smartActionsManager.showSmartActionsMenu(
            e,
            jsonElement,
            'json-reference',
          );
        }
      });
    }

    // Re-setup when JSON container is updated
    this.setupJsonContainerObserver();

    // Setup context menu for editor placeholders
    this.setupEditorPlaceholderListener();
  }

  /**
   * Setup observer for JSON container changes
   */
  setupJsonContainerObserver() {
    if (!this.panel || !window.MutationObserver) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          if (this.jsonContainer) {
            // Remove existing listeners and re-add
            this.jsonContainer.removeEventListener(
              'contextmenu',
              this.handleJsonContextMenu,
            );
            this.jsonContainer.addEventListener(
              'contextmenu',
              this.handleJsonContextMenu.bind(this),
            );
          }
        }
      });
    });

    observer.observe(this.panel, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Setup context menu listener for editor placeholders
   */
  setupEditorPlaceholderListener() {
    if (!this.smartActionsManager || !window.ideCodeMirror) return;

    // Agregar listener para context menu en el editor
    const editorElement = window.ideCodeMirror.getWrapperElement();
    editorElement.addEventListener('contextmenu', (e) => {
      this.smartActionsManager.handleEditorContextMenu(e);
    });

    console.log('[GLOSARIO-UI] Editor placeholder listener setup completed');
  }

  /**
   * Handle JSON context menu events
   */
  handleJsonContextMenu(e) {
    const jsonElement = e.target.closest('.json-key-item');
    if (jsonElement && this.smartActionsManager) {
      e.preventDefault();
      this.smartActionsManager.showSmartActionsMenu(
        e,
        jsonElement,
        'json-reference',
      );
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
      
      <div class="glosario-tabs">
        <button class="glosario-tab active" data-tab="steps">Steps</button>
        <button class="glosario-tab" data-tab="objects">Objects</button>
      </div>
      
      <!-- Steps Content -->
      <div id="steps-content">
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
      </div>
      
      <!-- Objects Content -->
      <div id="objects-content" style="display: none; flex: 1; overflow: hidden; flex-direction: column;">
        <div class="glosario-search-container">
          <input 
            type="text" 
            class="glosario-search-input" 
            placeholder="Buscar JSON references..."
            id="glosario-json-search-input"
          >
        </div>
        <div class="glosario-json-container" id="glosario-json-container">
          <div class="glosario-empty-state">
            <div class="empty-icon">📄</div>
            <p>Cargando JSON references...</p>
          </div>
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
    this.jsonSearchInput = document.getElementById(
      'glosario-json-search-input',
    );
    this.stepsContainer = document.getElementById('glosario-steps-container');
    this.jsonContainer = document.getElementById('glosario-json-container');
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
        overflow-x: hidden;
        padding: 10px;
        min-height: 0;
      }

      .glosario-json-container {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 10px;
        min-height: 0;
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
        cursor: pointer;
        transform: translateX(-2px);
        box-shadow: 2px 2px 8px rgba(79, 195, 247, 0.3);
      }

      .glosario-step-item {
        transition: all 0.2s ease;
        position: relative;
        border-left: 3px solid transparent;
      }

      .glosario-step-item:hover {
        border-left-color: #4fc3f7;
        padding-left: 7px;
      }

      .glosario-step-item.insert-ready {
        border-left-color: #4caf50;
        background: linear-gradient(90deg, rgba(76, 175, 80, 0.1) 0%, transparent 100%);
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

      /* Tabs styles */
      .glosario-tabs {
        display: flex;
        background: #2d2d2d;
        border-bottom: 1px solid #333;
      }

      .glosario-tab {
        flex: 1;
        padding: 10px;
        background: none;
        border: none;
        color: #ccc;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 14px;
      }

      .glosario-tab.active {
        color: #4fc3f7;
        border-bottom: 2px solid #4fc3f7;
        background: rgba(79, 195, 247, 0.1);
      }

      .glosario-tab:hover {
        color: #fff;
      }

      #steps-content, #objects-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
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

      [data-theme="dark"] .glosario-tabs {
        background: #252525;
        border-bottom-color: #333;
      }

      [data-theme="dark"] .glosario-tab {
        color: #ccc;
      }

      [data-theme="dark"] .glosario-tab.active {
        color: #4fc3f7;
        background: rgba(79, 195, 247, 0.1);
      }

      [data-theme="dark"] .glosario-tab:hover {
        color: #fff;
      }

      /* JSON References styles */
      .json-reference-item {
        background: #2a2a2a;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .json-reference-item:hover {
        background: #333;
        border-color: #4fc3f7;
        transform: translateX(-2px);
      }

      .json-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px solid #444;
      }

      .json-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
      }

      .json-collapse-indicator {
        font-size: 12px;
        color: #888;
        transition: transform 0.2s ease;
      }

      .json-reference-item.expanded .json-collapse-indicator {
        transform: rotate(90deg);
      }

      .json-reference-item.collapsed .json-keys-container {
        display: none;
      }

      .json-reference-item.expanded .json-keys-container {
        display: block;
      }

      .json-filename {
        font-weight: bold;
        color: #ffa726;
        font-size: 14px;
      }

      .json-file-path {
        color: #888;
        font-size: 12px;
      }

      .json-key-count {
        background: #4fc3f7;
        color: #000;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
      }

      .json-keys-container {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .json-key-item {
        display: flex;
        flex-direction: column;
        padding: 4px 8px;
        background: #252525;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .json-key-item:hover {
        background: #333;
      }

      .key-header {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
      }

      .key-collapse-indicator {
        font-size: 10px;
        color: #888;
        transition: transform 0.2s ease;
        cursor: pointer;
      }

      .json-key-item.expanded .key-collapse-indicator {
        transform: rotate(90deg);
      }

      .key-name {
        font-family: 'Courier New', monospace;
        font-size: 12px;
        color: #e0e0e0;
        font-weight: bold;
        flex: 1;
      }

      .key-action {
        font-size: 11px;
        color: #4fc3f7;
        background: rgba(79, 195, 247, 0.1);
        padding: 2px 6px;
        border-radius: 2px;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .key-action:hover {
        background: rgba(79, 195, 247, 0.2);
      }

      .key-value-container {
        display: none;
        margin-top: 4px;
        padding-left: 16px;
        border-left: 2px solid #444;
      }

      .json-key-item.expanded .key-value-container {
        display: block;
      }

      .key-value {
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: #888;
        word-break: break-all;
        display: block;
        padding: 4px 0;
      }

      [data-theme="dark"] .json-reference-item {
        background: #222;
        border-color: #444;
      }

      [data-theme="dark"] .json-reference-item:hover {
        background: #2a2a2a;
        border-color: #4fc3f7;
      }

      [data-theme="dark"] .json-header {
        border-bottom-color: #444;
      }

      [data-theme="dark"] .json-key-item {
        background: #2a2a2a;
      }

      [data-theme="dark"] .json-key-item:hover {
        background: #333;
      }

      [data-theme="dark"] .key-value-container {
        border-left-color: #555;
      }

      [data-theme="dark"] .key-value {
        color: #aaa;
      }

      [data-theme="dark"] .key-collapse-indicator {
        color: #aaa;
      }

      /* Smart Actions Menu */
      .smart-actions-menu-container {
        position: absolute;
        background: #2d2d2d;
        border: 1px solid #444;
        border-radius: 6px;
        min-width: 200px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        padding: 4px 0;
      }

      .smart-actions-menu {
        position: relative;
      }

      .menu-header {
        padding: 8px 16px;
        font-size: 12px;
        color: #888;
        border-bottom: 1px solid #444;
        margin-bottom: 4px;
        font-weight: 500;
      }

      .menu-item {
        display: flex;
        align-items: center;
        padding: 8px 16px;
        cursor: pointer;
        transition: background 0.2s ease;
        user-select: none;
      }

      .menu-item:hover {
        background: #3a3a3a;
      }

      .action-icon {
        margin-right: 12px;
        font-size: 14px;
        width: 16px;
        text-align: center;
      }

      .action-label {
        flex: 1;
        font-size: 14px;
        color: #e0e0e0;
      }

      .action-shortcut {
        font-size: 11px;
        color: #888;
        background: #1a1a1a;
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 8px;
      }

      /* Smart Action Feedback */
      .smart-action-feedback {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        min-width: 200px;
        max-width: 400px;
      }

      .smart-action-feedback.success {
        background: #4caf50;
        color: white;
      }

      .smart-action-feedback.error {
        background: #f44336;
        color: white;
      }

      .feedback-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .feedback-icon {
        font-size: 16px;
      }

      .feedback-text {
        flex: 1;
      }

      @keyframes slideIn {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      /* Enhanced placeholder replacement feedback */
      .smart-action-feedback.placeholder-replaced {
        background: linear-gradient(135deg, #4caf50, #45a049);
        color: white;
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
        border-left: 4px solid #2e7d32;
      }

      .feedback-message {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .feedback-reference {
        font-size: 12px;
        opacity: 0.9;
        font-family: 'Courier New', monospace;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        display: inline-block;
      }

      .feedback-hint {
        font-size: 11px;
        opacity: 0.8;
        margin-top: 4px;
        padding: 2px 0;
      }

      .smart-action-feedback.error .feedback-hint {
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        padding-top: 6px;
        margin-top: 6px;
      }

      /* Dark theme support for smart actions */
      [data-theme="dark"] .smart-actions-menu-container {
        background: #1e1e1e;
        border-color: #333;
      }

      [data-theme="dark"] .menu-header {
        color: #666;
        border-bottom-color: #333;
      }

      [data-theme="dark"] .menu-item:hover {
        background: #2a2a2a;
      }

      [data-theme="dark"] .action-label {
        color: #ccc;
      }

      [data-theme="dark"] .action-shortcut {
        background: #0a0a0a;
        color: #666;
      }
    `;
    document.head.appendChild(styles);
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    console.log(`[GLOSARIO-UI] Switching to tab: ${tabName}`);

    // Update tab buttons
    this.panel.querySelectorAll('.glosario-tab').forEach((tab) => {
      tab.classList.remove('active');
    });
    this.panel.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content areas
    document.getElementById('steps-content').style.display =
      tabName === 'steps' ? 'flex' : 'none';
    document.getElementById('objects-content').style.display =
      tabName === 'objects' ? 'flex' : 'none';

    this.currentTab = tabName;

    // Load JSON references when switching to objects tab
    if (tabName === 'objects') {
      this.loadJsonReferences();
    }
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

    // JSON search input
    if (this.jsonSearchInput) {
      this.jsonSearchInput.addEventListener('input', (e) => {
        this.filterJsonReferences(e.target.value.toLowerCase());
      });
    }

    // Tab buttons
    this.panel.querySelectorAll('.glosario-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // JSON key items (delegated event since they're dynamically created)
    this.jsonContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('key-action')) {
        const keyItem = e.target.closest('.json-key-item');
        if (keyItem && this.smartActionsManager) {
          // Ejecutar la smart action de insert JSON reference directamente
          const context = this.smartActionsManager.createContext(
            keyItem,
            'json-reference',
          );
          this.smartActionsManager.executeAction(
            'insert-json-reference',
            context,
          );
        }
      } else if (
        e.target.classList.contains('json-header') ||
        e.target.closest('.json-header')
      ) {
        const header = e.target.classList.contains('json-header')
          ? e.target
          : e.target.closest('.json-header');
        const item = header.closest('.json-reference-item');
        if (item) {
          item.classList.toggle('collapsed');
          item.classList.toggle('expanded');
        }
      } else if (
        e.target.classList.contains('key-header') ||
        e.target.closest('.key-header') ||
        e.target.classList.contains('key-collapse-indicator')
      ) {
        const header =
          e.target.classList.contains('key-header') ||
          e.target.classList.contains('key-collapse-indicator')
            ? e.target
            : e.target.closest('.key-header');
        const keyItem = header.closest('.json-key-item');
        if (keyItem) {
          keyItem.classList.toggle('collapsed');
          keyItem.classList.toggle('expanded');
        }
      }
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
        console.log(
          '[GLOSARIO-UI] Using cached steps for branch:',
          this.currentBranch,
        );
        this.displaySteps(cached);
        this.updateStats(cached.result ? cached.result.summary : null);
        this.setStatus('Steps cargados desde caché', '🟢');
      } else {
        console.log(
          '[GLOSARIO-UI] No cached steps, scanning for branch:',
          this.currentBranch,
        );
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
    } catch {
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
   * Load JSON references for current branch
   */
  async loadJsonReferences() {
    if (!this.currentBranch) {
      console.log('[GLOSARIO-UI] No current branch set for JSON references');
      this.showJsonEmptyState('Seleccione una branch primero');
      return;
    }

    try {
      console.log(
        '[GLOSARIO-UI] Loading JSON references for branch:',
        this.currentBranch,
      );
      const glosarioService = this.getGlosarioService();
      const jsonRefs = await glosarioService.getJsonReferences(
        this.currentBranch,
        false,
      );
      console.log('[GLOSARIO-UI] JSON references loaded:', jsonRefs);
      this.displayJsonReferences(jsonRefs);
    } catch (error) {
      console.warn('[GLOSARIO-UI] Error loading JSON references:', error);
      this.showJsonEmptyState(`Error: ${error.message}`);
    }
  }

  /**
   * Display JSON references in the container
   */
  displayJsonReferences(jsonRefs) {
    if (!jsonRefs || !jsonRefs.success) {
      this.showJsonEmptyState('No se pudieron cargar las referencias JSON');
      return;
    }

    const { references = [] } = jsonRefs.data || {};

    if (references.length === 0) {
      this.showJsonEmptyState(
        'No se encontraron archivos JSON de page-objects',
      );
      return;
    }

    console.log(
      `[GLOSARIO-UI] Displaying ${references.length} JSON references`,
    );

    const html = references
      .map((ref) => this.createJsonReferenceItem(ref))
      .join('');
    this.jsonContainer.innerHTML = html;
  }

  /**
   * Create HTML for a JSON reference item
   */
  createJsonReferenceItem(ref) {
    const keys = ref.keys || [];
    const keysHtml = keys
      .map((keyData) => {
        const key = keyData.key || '';
        const value =
          keyData.value !== undefined ? JSON.stringify(keyData.value) : '';
        return `
        <div class="json-key-item collapsed" data-key="${key}">
          <div class="key-header">
            <span class="key-collapse-indicator">▶</span>
            <span class="key-name">${key}</span>
            <span class="key-action">insertar</span>
          </div>
          <div class="key-value-container">
            <span class="key-value">${value}</span>
          </div>
        </div>
      `;
      })
      .join('');

    return `
      <div class="json-reference-item collapsed" data-filename="${ref.filename}">
        <div class="json-header">
          <div class="json-header-left">
            <span class="json-collapse-indicator">▶</span>
            <div>
              <div class="json-filename">${ref.filename}</div>
              <div class="json-file-path">${ref.file}</div>
            </div>
          </div>
          <span class="json-key-count">${keys.length} keys</span>
        </div>
        <div class="json-keys-container">
          ${keysHtml || '<div class="no-keys">No keys found</div>'}
        </div>
      </div>
    `;
  }

  /**
   * Show empty state for JSON references
   */
  showJsonEmptyState(message) {
    this.jsonContainer.innerHTML = `
      <div class="glosario-empty-state">
        <div class="empty-icon">📄</div>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Filter JSON references based on search query
   */
  filterJsonReferences(query) {
    const items = this.jsonContainer.querySelectorAll('.json-reference-item');

    items.forEach((item) => {
      const filename = item.dataset.filename.toLowerCase();
      const keys = Array.from(item.querySelectorAll('.key-name')).map((key) =>
        key.textContent.toLowerCase(),
      );

      const matchesSearch =
        filename.includes(query) || keys.some((key) => key.includes(query));

      item.style.display = matchesSearch ? 'block' : 'none';
    });
  }

  /**
   * Copy JSON reference to clipboard
   */
  async copyJsonReferenceToClipboard(keyName, event, fileName = null) {
    try {
      // Build the reference string with filename if provided
      const reference = fileName ? `"${fileName}.${keyName}"` : `"${keyName}"`;
      await navigator.clipboard.writeText(reference);

      // Show visual feedback
      const originalText = event.target.textContent;
      event.target.textContent = '✓ copiado';
      event.target.style.background = '#4caf50';
      event.target.style.color = '#fff';

      setTimeout(() => {
        event.target.textContent = originalText;
        event.target.style.background = '';
        event.target.style.color = '';
      }, 2000);

      console.log(`[GLOSARIO-UI] Copied to clipboard: ${reference}`);
    } catch (error) {
      console.error('[GLOSARIO-UI] Failed to copy to clipboard:', error);
      // Fallback: create temporary input element
      const reference = fileName ? `"${fileName}.${keyName}"` : `"${keyName}"`;
      const input = document.createElement('input');
      input.value = reference;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
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

    // Only add click handler if no insert controller is available
    // (the insert controller will handle its own event registration)
    if (!this.insertController) {
      stepDiv.addEventListener('click', () => {
        this.insertStepIntoEditorFallback(step);
      });
    }

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
   * Detect Gherkin context to determine appropriate keyword
   */
  detectGherkinContext(cursorPos) {
    if (!window.ideCodeMirror) return 'first';

    const doc = window.ideCodeMirror.getDoc();
    const currentLine = cursorPos.line;

    // Look backwards to find the first Gherkin keyword
    for (let i = currentLine - 1; i >= 0; i--) {
      const lineText = doc.getLine(i).trim();
      if (lineText.match(/^(Given|When|Then|And|But)\s/)) {
        // Found a previous Gherkin step, use And
        return 'subsequent';
      }

      // If we hit a Scenario or Feature line, reset to first
      if (lineText.match(/^(Scenario|Feature|Background|Scenario Outline):/)) {
        return 'first';
      }

      // If we hit an empty line after some content, might be new section
      if (lineText === '' && i < currentLine - 1) {
        const prevLine = doc.getLine(i - 1);
        if (prevLine && prevLine.trim() !== '') {
          // Check if this looks like a section break
          return 'first';
        }
      }
    }

    // No previous Gherkin steps found, use the original type
    return 'first';
  }

  /**
   * Get appropriate Gherkin keyword based on context
   */
  getGherkinKeyword(step, context) {
    if (context === 'subsequent') {
      return 'And';
    }
    return step.type; // Given, When, or Then for first step
  }

  /**
   * Fallback method to insert step into editor
   */
  insertStepIntoEditorFallback(step) {
    try {
      if (!window.ideCodeMirror) {
        this.setStatus('Editor no encontrado', '🔴');
        return;
      }

      // Get current cursor position
      const cursorPos = window.ideCodeMirror.getCursor();

      // Detect context to determine keyword
      const context = this.detectGherkinContext(cursorPos);
      const keyword = this.getGherkinKeyword(step, context);

      // Format step as Gherkin line
      const gherkinLine = `${keyword} ${step.text}`;

      // Insert the step
      window.ideCodeMirror.replaceRange(
        gherkinLine + '\n',
        cursorPos,
        cursorPos,
      );

      // Move cursor to next line
      const newCursorPos = {
        line: cursorPos.line + 1,
        ch: 0,
      };
      window.ideCodeMirror.setCursor(newCursorPos);

      // Focus the editor
      window.ideCodeMirror.focus();

      // Show feedback with context info
      const contextMsg = context === 'first' ? `(${step.type})` : '(And)';
      this.setStatus(`Step insertado ${contextMsg}`, '🟢');

      console.log(
        '[GLOSARIO-UI] Step inserted via fallback:',
        gherkinLine,
        'context:',
        context,
      );
    } catch {
      this.setStatus('Error al insertar step', '🔴');
    }
  }

  /**
   * Copy step to clipboard (fallback for Ctrl+Click)
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
    } catch {
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
    } catch {
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

// Initialize when DOM is ready and serviceRegistry is available
function initializeGlosarioUI() {
  const glosarioUI = new GlosarioUI();

  // Registrar en el service registry
  if (typeof window.serviceRegistry !== 'undefined') {
    window.serviceRegistry.register('glosarioUI', glosarioUI);
  } else if (typeof window !== 'undefined') {
    // Fallback para compatibilidad temporal
    window.glosarioUI = glosarioUI;
  }
}

// Esperar a que tanto el DOM como el serviceRegistry estén disponibles
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Esperar un poco más para asegurar que los módulos se cargaron
    setTimeout(initializeGlosarioUI, 100);
  });
} else {
  // El DOM ya está cargado, esperar solo al serviceRegistry
  setTimeout(initializeGlosarioUI, 100);
}
