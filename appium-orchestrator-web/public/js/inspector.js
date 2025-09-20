// Appium Inspector Module
// Handles UI inspection, element discovery, and real-time updates

// Import API functions
import {
  getBranchesData,
  getApkVersionsData,
  getLocalDevices,
  fetchConfig,
} from './api.js';

class AppiumInspector {
  constructor(socket) {
    console.log('[DEBUG] AppiumInspector constructor called');
    this.socket = socket;
    this.currentSession = null;
    this.elements = [];
    this.isInitialized = false;
    this.refreshInterval = null;
    this.overlayVisible = false;

    console.log('[DEBUG] Calling initializeElements()');
    this.initializeElements();

    console.log('[DEBUG] Calling bindEvents()');
    this.bindEvents();

    console.log('[DEBUG] Calling initializeSocketListeners()');
    this.initializeSocketListeners();

    console.log('[DEBUG] AppiumInspector constructor completed');
  }

  initializeElements() {
    console.log('[DEBUG] initializeElements() called');

    // Tab elements - Inspector is now a tab, not a modal
    this.tabView = document.getElementById('inspector-view');
    console.log('[DEBUG] tabView element:', this.tabView);

    this.tabBtn = document.querySelector('.tab-btn[data-tab="inspector"]');
    console.log('[DEBUG] tabBtn element:', this.tabBtn);

    // Session elements
    this.sessionsContainer = document.getElementById(
      'inspector-sessions-container',
    );
    console.log('[DEBUG] sessionsContainer element:', this.sessionsContainer);

    this.sessionsColumn = document.getElementById('inspector-sessions-column');
    console.log('[DEBUG] sessionsColumn element:', this.sessionsColumn);

    this.controlsSection = document.getElementById('inspector-controls-column');
    console.log('[DEBUG] controlsSection element:', this.controlsSection);

    this.mainView = document.getElementById('inspector-main-view');
    this.mainViewScreenshot = document.getElementById(
      'inspector-main-view-screenshot',
    );
    this.screenshotPlaceholder = document.getElementById(
      'inspector-screenshot-placeholder',
    );
    console.log('[DEBUG] mainView elements:', {
      mainView: this.mainView,
      mainViewScreenshot: this.mainViewScreenshot,
      screenshotPlaceholder: this.screenshotPlaceholder,
    });

    // Control elements
    this.refreshAllBtn = document.getElementById('inspector-refresh-all-btn');
    this.overlayBtn = document.getElementById('inspector-overlay-btn');
    this.clickableOnlyCheckbox = document.getElementById(
      'inspector-clickable-only',
    );
    this.searchInput = document.getElementById('inspector-search');

    // Elements panel
    this.elementsList = document.getElementById('inspector-elements-list');

    // Screenshot panel
    this.screenshotImg = document.getElementById('inspector-screenshot-img');
    this.screenshotLoading = document.getElementById(
      'inspector-screenshot-loading',
    );
    this.overlayCanvas = document.getElementById('inspector-overlay-canvas');

    
    // Status
    this.statusText = document.getElementById('inspector-status-text');

    // Auto-detection properties
    this.autoDetectEnabled = false;
    this.lastXMLHash = '';
    this.pollingInterval = null;
    this.autoDetectToggle = document.getElementById('inspector-auto-detect-toggle');
    this.autoDetectIndicator = document.getElementById('inspector-auto-detect-indicator');
    this.updateCount = 0;
  }

  bindEvents() {
    console.log('[DEBUG] bindEvents() called for inspector');

    // Tab activation - initialize when tab is activated
    if (this.tabBtn) {
      this.tabBtn.addEventListener('click', () => {
        if (!this.isInitialized) {
          this.initialize();
        }
      });
    }

    // Control buttons
    this.refreshAllBtn.addEventListener('click', () => this.refreshInspector());
    this.overlayBtn.addEventListener('click', () => this.toggleOverlay());

    // Screenshot click handler for navigation
    this.setupScreenshotClickHandler();

    // Filters
    this.clickableOnlyCheckbox.addEventListener('change', () =>
      this.refreshElements(),
    );
    this.searchInput.addEventListener(
      'input',
      this.debounce(() => this.refreshElements(), 300),
    );

    // Auto-detection toggle
    if (this.autoDetectToggle) {
      this.autoDetectToggle.addEventListener('change', () =>
        this.toggleAutoDetection(),
      );
    }

    // Worker creation form in inspector
    const inspectorCreateBtn = document.getElementById(
      'inspector-create-worker-btn',
    );
    console.log('[DEBUG] Inspector create button element:', inspectorCreateBtn);

    if (inspectorCreateBtn) {
      console.log(
        '[DEBUG] Adding click event listener to inspector create button',
      );
      inspectorCreateBtn.addEventListener('click', () => {
        console.log('[DEBUG] Inspector create button clicked!');
        console.log(
          '[DEBUG] window.handleCreateWorker type:',
          typeof window.handleCreateWorker,
        );
        console.log(
          '[DEBUG] window.handleCreateWorker value:',
          window.handleCreateWorker,
        );

        // Call the global handleCreateWorker function with inspector source
        if (typeof window.handleCreateWorker === 'function') {
          console.log('[DEBUG] Calling window.handleCreateWorker("inspector")');
          console.log(
            '[DEBUG] Checking if status element exists:',
            document.getElementById('inspector-worker-creation-status'),
          );
          try {
            window.handleCreateWorker('inspector');
            console.log(
              '[DEBUG] window.handleCreateWorker called successfully',
            );
          } catch (error) {
            console.error(
              '[DEBUG] Error calling window.handleCreateWorker:',
              error,
            );
          }
        } else {
          console.error('[DEBUG] window.handleCreateWorker is not a function!');
          console.error(
            '[DEBUG] Available window properties:',
            Object.keys(window).filter(
              (key) => key.includes('worker') || key.includes('Worker'),
            ),
          );
        }
      });
      console.log('[DEBUG] Click event listener added successfully');
    } else {
      console.error('[DEBUG] Inspector create button not found!');
    }

    // Client dropdown change event for inspector
    const inspectorClientSelect = document.getElementById(
      'inspector-worker-client',
    );
    if (inspectorClientSelect) {
      inspectorClientSelect.addEventListener('change', () => {
        // Refresh APK versions when client changes
        this.populateInspectorWorkerApkSelect();
      });
    }

    // Listen for tab changes to handle auto-refresh
    document.addEventListener('click', (e) => {
      if (
        e.target.classList.contains('tab-btn') ||
        e.target.closest('.tab-btn')
      ) {
        const tabBtn = e.target.classList.contains('tab-btn')
          ? e.target
          : e.target.closest('.tab-btn');
        const tabName = tabBtn.dataset.tab;

        if (tabName === 'inspector' && !this.isInitialized) {
          this.initialize();
        } else if (tabName !== 'inspector' && this.isInitialized) {
          // Pause auto-refresh when switching away from inspector tab
          this.stopAutoRefresh();
        } else if (tabName === 'inspector' && this.isInitialized) {
          // Resume auto-refresh when switching back to inspector tab
          this.startAutoRefresh();
        }
      }
    });
  }

  initializeSocketListeners() {
    this.socket.on('connect', () => {
      this.loadSessions().catch((error) => {
        console.warn('[INSPECTOR] Failed to load sessions on connect:', error);
      });
    });

    // Session updates
    this.socket.on('worker_session_updated', (data) => {
      console.log('Worker session updated:', data);
      this.loadSessions();
    });

    this.socket.on('worker_session_cleared', (data) => {
      console.log('Worker session cleared:', data);
      if (this.currentSession === data.sessionId) {
        this.detachFromSession();
      }
      this.loadSessions();
    });

    // Inspector updates
    this.socket.on('inspector_session_attached', (data) => {
      console.log('Inspector session attached:', data);
      this.setStatus('Conectado a sesión', 'success');
      this.showInspectorView();
    });

    this.socket.on('inspector_session_detached', (data) => {
      console.log('Inspector session detached:', data);
      this.setStatus('Desconectado de sesión', 'warning');
      this.hideInspectorView();
    });

    this.socket.on('inspector_elements_updated', (data) => {
      console.log('Elements updated:', data);
      if (data.sessionId === this.currentSession) {
        this.elements = data.elements;
        this.renderElements();
        // Hide overlay when elements are updated
        if (this.overlayVisible) {
          this.hideOverlay();
        }
      }
    });

    this.socket.on('inspector_screenshot_updated', (data) => {
      console.log('Screenshot updated:', data);
      if (data.sessionId === this.currentSession) {
        this.showScreenshot(data.screenshot);
      }
    });

    this.socket.on('inspector_tap_executed', (data) => {
      console.log('Tap executed:', data);
      this.setStatus(
        `Tap ejecutado en (${data.coordinates.x}, ${data.coordinates.y})`,
        'success',
      );
      setTimeout(() => this.refreshElements(), 500);
    });

    this.socket.on('inspector_text_entered', (data) => {
      console.log('Text entered:', data);
      const safeText = typeof data.text === 'string' ? data.text : '';
      this.setStatus(
        safeText ? `Texto enviado: "${this.truncate(safeText, 30)}"` : 'Texto enviado al dispositivo.',
        'success',
      );
      setTimeout(() => this.refreshElements(), 500);
    });
  }

  // activateTab method replaces show() for tab functionality
  activateTab() {
    if (!this.isInitialized) {
      this.initialize();
    }
    this.loadSessions();
    this.startAutoRefresh();
  }

  deactivateTab() {
    this.stopAutoRefresh();
    if (this.currentSession) {
      this.detachFromSession();
    }
  }

  async initialize() {
    try {
      const health = await this.apiRequest('/api/inspector/health');
      console.log('Inspector health:', health);

      // Initialize inspector worker form dropdowns
      await this.initializeWorkerForm();

      this.isInitialized = true;
      this.setStatus('Inspector inicializado', 'success');

      await this.loadSessions();
    } catch (error) {
      console.error('Failed to initialize inspector:', error);
      this.setStatus('Error al inicializar inspector', 'error');
    }
  }

  async initializeWorkerForm() {
    console.log('[DEBUG] initializeWorkerForm() called');

    try {
      // Populate branch dropdown for inspector
      await this.populateInspectorWorkerBranchSelect();

      // Populate APK dropdown for inspector
      await this.populateInspectorWorkerApkSelect();

      // Setup device selector for inspector
      await this.setupInspectorWorkerDeviceSelector();

      console.log('[DEBUG] Worker form dropdowns initialization completed');
    } catch (error) {
      console.error('[DEBUG] Error initializing worker form dropdowns:', error);
    }
  }

  async populateInspectorWorkerBranchSelect() {
    console.log('[DEBUG] populateInspectorWorkerBranchSelect() called');
    const select = document.getElementById('inspector-worker-branch');
    console.log('[DEBUG] inspector-worker-branch element:', select);
    if (!select) {
      console.log('[DEBUG] inspector-worker-branch element not found');
      return;
    }

    try {
      console.log('[DEBUG] Calling getBranchesData()...');
      const branches = await getBranchesData();
      console.log('[DEBUG] Branches received:', branches);
      select.innerHTML = '';

      if (branches.length === 0) {
        select.innerHTML = '<option>No branches available</option>';
        console.log('[DEBUG] No branches available');
        return;
      }

      branches.forEach((branch) => {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = branch;
        select.appendChild(option);
      });

      console.log(
        '[WORKERS] Inspector branch selector populated with:',
        branches,
      );
    } catch (error) {
      console.error(
        '[WORKERS] Error populating inspector branch selector:',
        error,
      );
      select.innerHTML = '<option>Error loading branches</option>';
    }
  }

  async populateInspectorWorkerApkSelect() {
    console.log('[DEBUG] populateInspectorWorkerApkSelect() called');
    const select = document.getElementById('inspector-worker-apk');
    const clientSelect = document.getElementById('inspector-worker-client');
    console.log('[DEBUG] inspector-worker-apk element:', select);
    console.log('[DEBUG] inspector-worker-client element:', clientSelect);
    if (!select || !clientSelect) {
      console.log('[DEBUG] Required elements not found');
      return;
    }

    const selectedClient = clientSelect.value;
    if (!selectedClient) {
      select.innerHTML = '<option>Selecciona un cliente primero</option>';
      return;
    }

    try {
      console.log(
        `[DEBUG] Getting APK versions for inspector with client: ${selectedClient}`,
      );
      const apkVersions = await getApkVersionsData(selectedClient); // Use selected client
      console.log('[DEBUG] APK versions received:', apkVersions);
      select.innerHTML = '';

      if (apkVersions.length === 0) {
        select.innerHTML = '<option>No APK versions available</option>';
        console.log('[DEBUG] No APK versions available');
        return;
      }

      apkVersions.forEach((version, index) => {
        console.log(
          `[DEBUG] Inspector APK version ${index}:`,
          typeof version,
          version,
        );
        const option = document.createElement('option');

        // Handle different data formats
        let displayValue, actualValue;
        if (typeof version === 'string') {
          displayValue = version;
          actualValue = version;
        } else if (version && typeof version === 'object') {
          displayValue =
            version.version ||
            version.name ||
            version.tag ||
            JSON.stringify(version);
          actualValue =
            version.version ||
            version.name ||
            version.tag ||
            JSON.stringify(version);
        } else {
          displayValue = String(version);
          actualValue = String(version);
        }

        option.value = actualValue;
        option.textContent = displayValue;
        select.appendChild(option);
      });

      console.log(
        '[WORKERS] Inspector APK selector populated with:',
        apkVersions,
      );
    } catch (error) {
      console.error(
        '[WORKERS] Error populating inspector APK versions:',
        error,
      );
      select.innerHTML = '<option>Error loading APK versions</option>';
    }
  }

  async setupInspectorWorkerDeviceSelector() {
    const container = document.getElementById(
      'inspector-worker-device-container',
    );
    const select = document.getElementById('inspector-worker-device');

    if (!container || !select) return;

    try {
      const config = await fetchConfig();
      if (config.deviceSource === 'local') {
        container.classList.remove('hidden');
        await this.populateInspectorWorkerDeviceSelect();
      } else {
        container.classList.add('hidden');
      }
    } catch (error) {
      console.error(
        '[WORKERS] Error setting up inspector device selector:',
        error,
      );
    }
  }

  async populateInspectorWorkerDeviceSelect() {
    const select = document.getElementById('inspector-worker-device');
    if (!select) return;

    try {
      const devices = await getLocalDevices();
      select.innerHTML = '';

      devices.forEach((device, index) => {
        console.log(
          `[WORKERS] Inspector Device ${index}:`,
          typeof device,
          device,
        );
        const option = document.createElement('option');

        // Handle different device data formats
        let displayValue, actualValue;
        if (typeof device === 'string') {
          displayValue = device;
          actualValue = device;
        } else if (device && typeof device === 'object') {
          displayValue =
            device.serial || device.id || device.name || JSON.stringify(device);
          actualValue =
            device.serial || device.id || device.name || JSON.stringify(device);
        } else {
          displayValue = String(device);
          actualValue = String(device);
        }

        option.value = actualValue;
        option.textContent = displayValue;
        select.appendChild(option);
      });

      console.log('[WORKERS] Inspector device selector populated');
    } catch (error) {
      console.error('[WORKERS] Error populating inspector devices:', error);
      select.innerHTML = '<option>Error loading devices</option>';
    }
  }

  async loadSessions() {
    try {
      console.log(
        '[INSPECTOR] Loading sessions from /api/inspector/sessions...',
      );
      const response = await this.apiRequest('/api/inspector/sessions');
      console.log('[INSPECTOR] Sessions response:', response);

      if (response.success) {
        console.log(
          `[INSPECTOR] Found ${response.sessions.length} sessions:`,
          response.sessions,
        );
        this.renderSessions(response.sessions);
        this.setStatus(
          `${response.sessions.length} sesiones activas`,
          'success',
        );
      } else {
        throw new Error(response.error || 'Failed to load sessions');
      }
    } catch (error) {
      console.error('[INSPECTOR] Failed to load sessions:', error);
      this.sessionsContainer.innerHTML = `
        <div class="error">
          Error al cargar sesiones: ${error.message}
        </div>
      `;
      this.setStatus('Error al cargar sesiones', 'error');
    }
  }

  renderSessions(sessions) {
    console.log(
      '[INSPECTOR] renderSessions called with',
      sessions.length,
      'sessions',
    );
    console.log(
      '[INSPECTOR] sessionsContainer element:',
      this.sessionsContainer,
    );

    if (sessions.length === 0) {
      console.log('[INSPECTOR] No sessions to render');
      this.sessionsContainer.innerHTML = `
        <div class="no-sessions">
          No hay sesiones Appium activas
        </div>
      `;
      this.updateCreateWorkerButton(true);
      this.currentSession = null;
      this.hideInspectorView();
      return;
    }

    console.log('[INSPECTOR] Rendering sessions:', sessions);

    const sessionsHtml = sessions
      .map((session) => {
        console.log('[INSPECTOR] Rendering session:', session);
        return `
      <div class="session-card ${session.isAttached ? 'attached' : ''}"
           data-session-id="${session.sessionId}">
        <div class="session-header">
          <span class="session-device">${session.deviceSerial || 'Unknown Device'}</span>
          <span class="session-status ${session.isAttached ? 'attached' : 'running'}">
            ${session.isAttached ? 'Attached' : 'Running'}
          </span>
        </div>
        <div class="session-info">
          <div class="session-info-item">
            <span class="icon">📱</span>
            <span>${session.branch}</span>
          </div>
          <div class="session-info-item">
            <span class="icon">📦</span>
            <span>${session.apkIdentifier}</span>
          </div>
          <div class="session-info-item">
            <span class="icon">⏰</span>
            <span>${this.formatTime(session.startTime)}</span>
          </div>
          <div class="session-info-item">
            <span class="icon">🏃</span>
            <span>${session.isQuickTest ? 'Quick Test' : 'Full Test'}</span>
          </div>
        </div>
      </div>
      `;
      })
      .join('');

    console.log(
      '[INSPECTOR] Setting sessionsContainer.innerHTML with generated HTML',
    );
    this.sessionsContainer.innerHTML = sessionsHtml;

    // Add click handlers
    this.sessionsContainer.querySelectorAll('.session-card').forEach((card) => {
      card.addEventListener('click', () => {
        const sessionId = card.dataset.sessionId;
        if (card.classList.contains('attached')) {
          this.detachFromSession();
        } else {
          this.attachToSession(sessionId);
        }
      });
    });

    const hasActiveSession = sessions.some((session) =>
      session.isAttached || session.isPersistent || session.status === 'ready',
    );
    this.updateCreateWorkerButton(!hasActiveSession);

    const attachedSession = sessions.find((session) => session.isAttached);
    if (attachedSession) {
      const previousSession = this.currentSession;
      this.currentSession = attachedSession.sessionId;
      this.showInspectorView();
      this.updateSessionCard(attachedSession.sessionId, true);
      this.setStatus('Sesión adjunta detectada', 'success');
      if (previousSession !== attachedSession.sessionId) {
        this.refreshInspector().catch((error) => {
          console.warn('[INSPECTOR] Failed to refresh after reconnect:', error);
        });
      }
    }
  }

  updateCreateWorkerButton(enable) {
    const inspectorCreateBtn = document.getElementById(
      'inspector-create-worker-btn',
    );
    if (!inspectorCreateBtn) {
      return;
    }

    if (enable) {
      inspectorCreateBtn.disabled = false;
      inspectorCreateBtn.textContent = '🚀 Crear Worker';
      inspectorCreateBtn.title = '';
    } else {
      inspectorCreateBtn.disabled = true;
      inspectorCreateBtn.textContent = '🚀 Worker Activo';
      inspectorCreateBtn.title =
        'Ya hay un worker disponible para el inspector';
    }
  }

  async attachToSession(sessionId) {
    try {
      this.setStatus('Conectando a sesión...', 'warning');

      const response = await this.apiRequest(
        `/api/inspector/${sessionId}/attach`,
        'POST',
      );

      if (response.success) {
        this.currentSession = sessionId;

        // Reset auto-detection state for new session
        this.updateCount = 0;
        this.lastXMLHash = '';
        if (this.autoDetectEnabled) {
          // Auto-detection was enabled, restart it for new session
          this.stopScreenChangeDetection();
          this.startScreenChangeDetection();
        }

        this.setStatus('Conectado exitosamente', 'success');

        // Update UI
        this.updateSessionCard(sessionId, true);
        this.showInspectorView();

        // Load initial data - DISABLED TO PREVENT INFINITE LOOP
        // await this.refreshInspector();

        // DISABLED AUTO REFRESH TO PREVENT INFINITE LOOP
        // this.startAutoRefresh();
      } else {
        throw new Error(response.message || 'Failed to attach to session');
      }
    } catch (error) {
      console.error('Failed to attach to session:', error);
      this.setStatus(`Error al conectar: ${error.message}`, 'error');
    }
  }

  async detachFromSession() {
    if (!this.currentSession) return;

    try {
      await this.apiRequest(
        `/api/inspector/${this.currentSession}/detach`,
        'POST',
      );

      this.currentSession = null;
      this.elements = [];

      // Stop auto-detection when detaching from session
      this.stopScreenChangeDetection();
      this.updateCount = 0;
      this.lastXMLHash = '';

      this.updateSessionCard(this.currentSession, false);
      this.hideInspectorView();

      this.setStatus('Desconectado de sesión', 'success');
    } catch (error) {
      console.error('Failed to detach from session:', error);
      this.setStatus(`Error al desconectar: ${error.message}`, 'error');
    }
  }

  async refreshElements() {
    if (!this.currentSession) return;

    try {
      const options = {
        q: this.searchInput.value,
        clickableOnly: this.clickableOnlyCheckbox.checked,
        maxElements: 200,
      };

      const response = await this.apiRequest(
        `/api/inspector/${this.currentSession}/inspect?${new URLSearchParams(options)}`,
      );

      if (response.success) {
        this.elements = response.elements;
        this.renderElements();
        // Show filtered element count in status
        const filteredCount = this.elements.filter(
          (element) => !this.isLayoutElement(element),
        ).length;
        this.setStatus(
          `${filteredCount} elementos interactivos encontrados`,
          'success',
        );
      } else {
        throw new Error(response.message || 'Failed to get elements');
      }
    } catch (error) {
      console.error('Failed to refresh elements:', error);
      this.setStatus(`Error al obtener elementos: ${error.message}`, 'error');
    }
  }

  async refreshInspector() {
    if (!this.currentSession) return;

    try {
      this.setStatus('Actualizando elementos y captura...', 'warning');

      // Execute both operations in parallel for better performance
      const [elementsResponse, screenshotResponse] = await Promise.all([
        this.apiRequest(
          `/api/inspector/${this.currentSession}/inspect?${new URLSearchParams({
            q: this.searchInput.value,
            clickableOnly: this.clickableOnlyCheckbox.checked,
            maxElements: 200,
          })}`
        ),
        this.apiRequest(`/api/inspector/${this.currentSession}/screenshot`, 'GET')
      ]);

      // Process elements response
      if (elementsResponse.success) {
        this.elements = elementsResponse.elements;
        this.renderElements();

        // Show filtered element count in status
        const filteredCount = this.elements.filter(
          (element) => !this.isLayoutElement(element),
        ).length;

        this.setStatus(
          `${filteredCount} elementos interactivos encontrados`,
          'success',
        );
      } else {
        throw new Error(elementsResponse.message || 'Failed to get elements');
      }

      // Process screenshot response
      if (screenshotResponse.success) {
        this.showScreenshot(screenshotResponse.screenshot);
      } else {
        console.warn('Screenshot refresh failed:', screenshotResponse.message);
        // Don't throw error for screenshot failure, just log it
      }

    } catch (error) {
      console.error('Failed to refresh inspector:', error);
      this.setStatus(`Error al actualizar: ${error.message}`, 'error');
    }
  }

  renderElements() {
    // Filter out layout elements before rendering
    const filteredElements = this.elements.filter(
      (element) => !this.isLayoutElement(element),
    );

    if (filteredElements.length === 0) {
      this.elementsList.innerHTML = `
        <div class="no-elements">
          No se encontraron elementos interactivos
        </div>
      `;
      return;
    }

    this.elementsList.innerHTML = filteredElements
      .map((element, index) => {
        // Use filtered index for unique ID generation to avoid conflicts with similar bounds
        const uniqueId = this.createElementUniqueId(element, index);
        return `
      <div class="element-item ${element.clickable ? 'clickable' : ''}"
           data-element-id="${uniqueId}">
        <div class="element-header">
          <span class="element-type">${this.truncate(element.class, 30)}</span>
          <div class="element-indicators">
            ${element.clickable ? '<span class="element-indicator clickable">Clickable</span>' : ''}
            ${element.enabled ? '<span class="element-indicator visible">Visible</span>' : ''}
          </div>
        </div>
        <div class="element-props">
          ${element.resourceId ? `<div class="element-prop"><strong>ID:</strong> ${this.truncate(element.resourceId, 40)}</div>` : ''}
          ${element.contentDesc ? `<div class="element-prop"><strong>Desc:</strong> ${this.truncate(element.contentDesc, 40)}</div>` : ''}
          ${element.text ? `<div class="element-prop"><strong>Text:</strong> ${this.truncate(element.text, 40)}</div>` : ''}
          <div class="element-prop"><strong>Bounds:</strong> ${this.formatBounds(element.bounds)}</div>
        </div>
       ${
          element.locators && element.locators.length > 0
            ? `
          <div class="element-locators">
            ${element.locators
              .slice(0, 2)
              .map(
                (locator) => `
              <div class="element-locator priority-${locator.priority}">
                ${locator.type}: ${this.truncate(locator.display || locator.value, 60)}
                <button class="copy-btn" onclick="inspector.copyLocator('${(locator.value || '').replace(/'/g, "\\'")}')">
                  Copy
                </button>
              </div>
            `,
              )
              .join('')}
          </div>
        `
            : ''
        }
      </div>
    `;
      })
      .join('');

    // Add click handlers
    const elementItems = this.elementsList.querySelectorAll('.element-item');
    console.log(
      '[INSPECTOR] Found',
      elementItems.length,
      'element items to add click handlers',
    );

    elementItems.forEach((item, index) => {
      console.log(
        '[INSPECTOR] Adding click handler to item',
        index,
        'with data-element-id:',
        item.dataset.elementId,
      );
      item.addEventListener('click', (e) => {
        console.log(
          '[INSPECTOR] Element item clicked:',
          item.dataset.elementId,
          'target:',
          e.target,
        );
        if (!e.target.classList.contains('copy-btn')) {
          const elementId = item.dataset.elementId;
          console.log('[INSPECTOR] Element clicked:', elementId);
          // Element details panel removed - element selection for coordinates still works through screenshot clicks
        }
      });
    });
  }

  toBase64Safe(value) {
    try {
      if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
        if (typeof TextEncoder !== 'undefined') {
          const bytes = new TextEncoder().encode(value);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
          }
          return window.btoa(binary);
        }
        return window.btoa(unescape(encodeURIComponent(value)));
      }
    } catch (error) {
      console.warn('[INSPECTOR] Failed to encode base64 for value:', error);
    }

    return `uid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  createElementUniqueId(element, index) {
    // Create a unique identifier using bounds + other properties
    const bounds = element.bounds || {};
    const boundsStr = bounds
      ? `${bounds.left}-${bounds.top}-${bounds.right}-${bounds.bottom}`
      : '';
    const resourceId = element.resourceId || '';
    const text = element.text || '';

    // Combine bounds with other properties to create unique ID
    const uniqueStr = `${boundsStr}-${resourceId}-${text}-${index}`;

    // Convert to a base64 identifier that tolerates Unicode
    return `${this.toBase64Safe(uniqueStr).substring(0, 16)}-${index}`;
  }

  
  
  highlightElement(element) {
    if (
      !this.screenshotImg.src ||
      this.screenshotImg.style.display === 'none'
    ) {
      return;
    }

    const img = this.screenshotImg;
    const canvas = this.overlayCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas size to match displayed image size (CSS dimensions)
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    canvas.style.width = img.offsetWidth + 'px';
    canvas.style.height = img.offsetHeight + 'px';

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale factors from natural to displayed dimensions
    const scaleX = img.offsetWidth / img.naturalWidth;
    const scaleY = img.offsetHeight / img.naturalHeight;

    console.log('[INSPECTOR] highlightElement coordinates:', {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      displayWidth: img.offsetWidth,
      displayHeight: img.offsetHeight,
      scaleX: scaleX,
      scaleY: scaleY,
      elementRect: element.rect,
      scaledRect: {
        x: element.rect.x * scaleX,
        y: element.rect.y * scaleY,
        width: element.rect.width * scaleX,
        height: element.rect.height * scaleY,
      },
    });

    // Draw rectangle around element using scaled coordinates
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);

    ctx.strokeRect(
      element.rect.x * scaleX,
      element.rect.y * scaleY,
      element.rect.width * scaleX,
      element.rect.height * scaleY,
    );

    canvas.style.display = 'block';
  }

  async captureScreenshot() {
    if (!this.currentSession) return;

    try {
      this.setStatus('Capturando pantalla...', 'warning');

      const response = await this.apiRequest(
        `/api/inspector/${this.currentSession}/screenshot`,
      );

      if (response.success) {
        this.showScreenshot(response.screenshot);
        this.setStatus('Captura exitosa', 'success');
      } else {
        throw new Error(response.message || 'Failed to capture screenshot');
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      this.setStatus(`Error al capturar: ${error.message}`, 'error');
    }
  }

  showScreenshot(base64) {
    this.screenshotImg.src = `data:image/png;base64,${base64}`;
    this.screenshotImg.style.display = 'block';
    this.screenshotLoading.style.display = 'none';

    // Hide overlay when new screenshot is loaded
    this.overlayCanvas.style.display = 'none';
    this.overlayVisible = false;
    this.overlayBtn.classList.remove('active');
  }

  async generateOverlay() {
    if (!this.currentSession || !this.elements || this.elements.length === 0) {
      this.setStatus('No hay sesión o elementos para overlay', 'error');
      return;
    }

    try {
      this.setStatus('Generando overlay...', 'warning');
      console.log(
        '[INSPECTOR] Generating overlay for',
        this.elements.length,
        'elements',
      );

      // First capture a fresh screenshot
      const screenshotResponse = await this.apiRequest(
        `/api/inspector/${this.currentSession}/screenshot`,
      );

      if (!screenshotResponse.success) {
        throw new Error('Failed to capture screenshot for overlay');
      }

      // Show the screenshot first
      this.showScreenshot(screenshotResponse.screenshot);

      // Wait for image to load
      await new Promise((resolve) => {
        this.screenshotImg.onload = resolve;
        setTimeout(resolve, 1000); // Fallback timeout
      });

      // Draw overlay on canvas
      this.drawOverlay();

      this.setStatus('Overlay generado', 'success');
    } catch (error) {
      console.error('Failed to generate overlay:', error);
      this.setStatus(`Error al generar overlay: ${error.message}`, 'error');
    }
  }

  toggleOverlay() {
    if (this.overlayVisible) {
      this.hideOverlay();
    } else {
      this.showOverlay();
    }
  }

  async showOverlay() {
    if (!this.currentSession || !this.elements || this.elements.length === 0) {
      this.setStatus('No hay sesión o elementos para overlay', 'error');
      return;
    }

    try {
      this.setStatus('Generando overlay...', 'warning');
      console.log(
        '[INSPECTOR] Showing overlay for',
        this.elements.length,
        'elements',
      );

      // Check if we have a screenshot
      if (
        !this.screenshotImg.src ||
        this.screenshotImg.style.display === 'none'
      ) {
        // First capture a fresh screenshot
        const screenshotResponse = await this.apiRequest(
          `/api/inspector/${this.currentSession}/screenshot`,
        );

        if (!screenshotResponse.success) {
          throw new Error('Failed to capture screenshot for overlay');
        }

        // Show the screenshot first
        this.showScreenshot(screenshotResponse.screenshot);

        // Wait for image to load
        await new Promise((resolve) => {
          this.screenshotImg.onload = resolve;
          setTimeout(resolve, 1000); // Fallback timeout
        });
      }

      // Draw overlay on canvas
      this.drawOverlay();

      this.overlayVisible = true;
      this.overlayBtn.classList.add('active');
      this.setStatus('Overlay activado', 'success');
    } catch (error) {
      console.error('Failed to show overlay:', error);
      this.setStatus(`Error al generar overlay: ${error.message}`, 'error');
    }
  }

  hideOverlay() {
    this.overlayCanvas.style.display = 'none';
    this.overlayVisible = false;
    this.overlayBtn.classList.remove('active');
    this.setStatus('Overlay desactivado', 'success');
  }

  drawOverlay() {
    if (!this.screenshotImg || !this.elements || this.elements.length === 0) {
      console.log(
        '[INSPECTOR] Cannot draw overlay - missing screenshot or elements',
      );
      return;
    }

    const canvas = this.overlayCanvas;
    const ctx = canvas.getContext('2d');
    const img = this.screenshotImg;

    console.log('[INSPECTOR] Drawing overlay on canvas');

    // Set canvas size to match displayed image size (CSS dimensions)
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    canvas.style.width = img.offsetWidth + 'px';
    canvas.style.height = img.offsetHeight + 'px';

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale factors from natural to displayed dimensions
    const scaleX = img.offsetWidth / img.naturalWidth;
    const scaleY = img.offsetHeight / img.naturalHeight;

    console.log('[INSPECTOR] drawOverlay coordinates:', {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      displayWidth: img.offsetWidth,
      displayHeight: img.offsetHeight,
      scaleX: scaleX,
      scaleY: scaleY,
    });

    // Draw rectangles around elements
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';

    let drawnCount = 0;
    this.elements.forEach((element) => {
      if (element.rect) {
        const x = element.rect.x * scaleX;
        const y = element.rect.y * scaleY;
        const width = element.rect.width * scaleX;
        const height = element.rect.height * scaleY;

        console.log('[INSPECTOR] Drawing rect for element:', {
          id: element.id,
          rect: element.rect,
          scaled: { x, y, width, height },
        });

        // Draw filled rectangle
        ctx.fillRect(x, y, width, height);
        // Draw border
        ctx.strokeRect(x, y, width, height);

        drawnCount++;
      }
    });

    console.log('[INSPECTOR] Drew overlay for', drawnCount, 'elements');

    // Show canvas
    canvas.style.display = 'block';

    // Hide loading
    if (this.screenshotLoading) {
      this.screenshotLoading.style.display = 'none';
    }
  }

  async copyLocator(locator) {
    try {
      await navigator.clipboard.writeText(locator);
      this.setStatus('Locator copiado al portapapeles', 'success');

      // Visual feedback
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');

      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 2000);
    } catch (error) {
      console.error('Failed to copy locator:', error);
      this.setStatus('Error al copiar locator', 'error');
    }
  }

  showInspectorView() {
    console.log('[INSPECTOR] showInspectorView called');

    // Re-initialize elements if they're null
    if (!this.sessionsColumn) {
      this.sessionsColumn = document.getElementById(
        'inspector-sessions-column',
      );
      console.log(
        '[INSPECTOR] Re-initialized sessionsColumn:',
        this.sessionsColumn,
      );
    }
    if (!this.controlsSection) {
      this.controlsSection = document.getElementById(
        'inspector-controls-column',
      );
      console.log(
        '[INSPECTOR] Re-initialized controlsSection:',
        this.controlsSection,
      );
    }

    console.log('[INSPECTOR] sessionsColumn:', this.sessionsColumn);
    console.log('[INSPECTOR] controlsSection:', this.controlsSection);
    console.log('[INSPECTOR] mainView:', this.mainView);

    if (this.sessionsColumn) {
      this.sessionsColumn.style.display = 'none';
      console.log('[INSPECTOR] Hid sessions column');
    }
    if (this.controlsSection) {
      this.controlsSection.style.display = 'block';
      console.log('[INSPECTOR] Showed controls column');
    }
    if (this.mainView) {
      this.mainView.style.display = 'block';
      console.log('[INSPECTOR] Showed main view (elements)');
    }
    if (this.mainViewScreenshot) {
      this.mainViewScreenshot.style.display = 'block';
      console.log('[INSPECTOR] Showed main view (screenshot)');
    }
    if (this.screenshotPlaceholder) {
      this.screenshotPlaceholder.style.display = 'none';
      console.log('[INSPECTOR] Hid screenshot placeholder');
    }
  }

  hideInspectorView() {
    // Re-initialize elements if they're null
    if (!this.sessionsColumn) {
      this.sessionsColumn = document.getElementById(
        'inspector-sessions-column',
      );
    }
    if (!this.controlsSection) {
      this.controlsSection = document.getElementById(
        'inspector-controls-column',
      );
    }

    if (this.sessionsColumn) {
      this.sessionsColumn.style.display = 'block';
    }
    if (this.controlsSection) {
      this.controlsSection.style.display = 'none';
    }
    if (this.mainView) {
      this.mainView.style.display = 'none';
    }
    if (this.mainViewScreenshot) {
      this.mainViewScreenshot.style.display = 'none';
    }
    if (this.screenshotPlaceholder) {
      this.screenshotPlaceholder.style.display = 'flex';
    }
  }

  updateSessionCard(sessionId, isAttached) {
    const card = this.sessionsContainer.querySelector(
      `[data-session-id="${sessionId}"]`,
    );
    if (card) {
      if (isAttached) {
        card.classList.add('attached');
        card.querySelector('.session-status').textContent = 'Attached';
        card.querySelector('.session-status').className =
          'session-status attached';
      } else {
        card.classList.remove('attached');
        card.querySelector('.session-status').textContent = 'Running';
        card.querySelector('.session-status').className =
          'session-status running';
      }
    }
  }

  startAutoRefresh() {
    this.stopAutoRefresh();

    if (this.currentSession) {
      this.refreshInterval = setInterval(() => {
        this.refreshElements();
      }, 5000); // Refresh every 5 seconds
    }
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  setStatus(message, type = 'info') {
    this.statusText.textContent = message;

    const statusElement = document.getElementById('inspector-status');
    statusElement.className = `inspector-status ${type}`;

    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        if (this.statusText.textContent === message) {
          this.statusText.textContent = 'Ready';
          statusElement.className = 'inspector-status';
        }
      }, 3000);
    }
  }

  async apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  // Check if element is a layout (should be filtered out)
  isLayoutElement(element) {
    // If the element is clickable, never filter it out
    if (element.clickable) {
      return false;
    }

    if (!element.class) return false;

    const layoutClasses = [
      'android.widget.FrameLayout',
      'android.widget.LinearLayout',
      'android.widget.RelativeLayout',
      'android.widget.ConstraintLayout',
      'android.widget.TableLayout',
      'android.widget.GridLayout',
      'android.view.View',
      'android.view.ScrollView',
      'android.widget.HorizontalScrollView',
      'android.widget.AbsListView',
      'android.widget.ListView',
      'android.widget.GridView',
      'android.widget.ImageView',
      'hierarchy',
    ];

    return layoutClasses.some((layoutClass) =>
      element.class.includes(layoutClass),
    );
  }

  isTextInputElement(element) {
    if (!element || !element.class) {
      return false;
    }
    const cls = element.class.toLowerCase();
    return (
      cls.includes('edittext') ||
      cls.includes('textfield') ||
      cls.includes('textinput')
    );
  }

  escapeAttribute(value) {
    if (value == null) {
      return '';
    }
    return String(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Find elements at specific coordinates
  findElementsAtCoordinates(x, y) {
    if (!this.elements || this.elements.length === 0) {
      return [];
    }

    const elementsAtCoords = [];

    this.elements.forEach((element) => {
      // Skip non-clickable layout elements, but show clickable elements
      if (this.isLayoutElement(element)) {
        return;
      }

      if (element.rect) {
        const { x: elemX, y: elemY, width, height } = element.rect;

        // Check if the click coordinates are within the element bounds
        if (
          x >= elemX &&
          x <= elemX + width &&
          y >= elemY &&
          y <= elemY + height
        ) {
          elementsAtCoords.push(element);
        }
      }
    });

    // Sort elements by priority: clickable > with content-desc > with resource-id > smaller area
    return elementsAtCoords.sort((a, b) => {
      // Clickable elements first
      if (a.clickable && !b.clickable) return -1;
      if (!a.clickable && b.clickable) return 1;

      // Elements with content-desc next
      if (a.contentDesc && !b.contentDesc) return -1;
      if (!a.contentDesc && b.contentDesc) return 1;

      // Elements with resource-id next
      if (a.resourceId && !b.resourceId) return -1;
      if (!a.resourceId && b.resourceId) return 1;

      // Smaller elements first (more specific)
      const areaA = a.rect.width * a.rect.height || Infinity;
      const areaB = b.rect.width * b.rect.height || Infinity;
      return areaA - areaB;
    });
  }

  // Show element selection dialog
  showElementSelectionDialog(elements, clickX, clickY, deviceX, deviceY) {
    const modal = document.getElementById('element-selection-modal');
    const list = document.getElementById('element-selection-list');

    // Clear previous content
    list.innerHTML = '';

    if (elements.length === 0) {
      // Show message when no elements found but offer direct tap
      list.innerHTML = `
        <div class="no-elements-found">
          <div class="no-elements-icon">🔍</div>
          <h4>No se encontraron elementos</h4>
          <p>Coordenadas del click: (${deviceX}, ${deviceY})</p>
          <p class="no-elements-details">
            No hay elementos UI detectables en esta posición.
            Esto puede ocurrir en áreas vacías de la pantalla.
          </p>
          <button id="inspector-direct-tap" class="element-selection-btn element-selection-btn-primary">
            Tap directo en (${deviceX}, ${deviceY})
          </button>
        </div>
      `;
    } else {
      // Add elements to the list
      elements.forEach((element, index) => {
        const item = this.createElementSelectionItem(
          element,
          index,
          deviceX,
          deviceY,
        );
        list.appendChild(item);
      });
    }

    // Setup modal event listeners
    this.setupElementSelectionModal();

    // Show modal
    modal.style.display = 'block';

    // Store click coordinates for potential direct tap
    this.pendingClickCoords = { clickX, clickY, deviceX, deviceY };

    const directTapBtn = document.getElementById('inspector-direct-tap');
    if (directTapBtn) {
      directTapBtn.addEventListener('click', async () => {
        await this.tapOnDevice(deviceX, deviceY);
        this.closeElementSelectionDialog();
      });
    }

    list.querySelectorAll('.element-send-text').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const wrapper = btn.closest('.element-text-input-wrapper');
        const input = wrapper ? wrapper.querySelector('.element-text-input') : null;
        const text = input ? input.value : '';
        if (!text) {
          this.setStatus('Ingresa un texto antes de enviarlo.', 'warning');
          return;
        }

        let locators = [];
        if (btn.dataset.locators) {
          try {
            locators = JSON.parse(btn.dataset.locators);
          } catch (error) {
            console.warn('[INSPECTOR] Failed to parse locators:', error);
          }
        }

        const success = await this.typeOnDevice(locators, text);
        if (success) {
          if (input) {
            input.value = '';
          }
          this.closeElementSelectionDialog();
        }
      });
    });
  }

  createElementSelectionItem(element, index, deviceX, deviceY) {
    const item = document.createElement('div');
    item.className = `element-selection-item ${element.clickable ? 'clickable' : ''}`;

    const title =
      element.contentDesc ||
      element.text ||
      element.resourceId ||
      `Element ${index + 1}`;
    const type = element.class || 'Unknown';
    const locator = element.locators && element.locators.length > 0 ? element.locators[0] : null;
    const isTextInput = this.isTextInputElement(element);

    item.innerHTML = `
      <div class="element-selection-item-header">
        <div class="element-selection-item-title">${this.truncate(title, 40)}</div>
        <div class="element-selection-item-type">${this.truncate(type, 25)}</div>
      </div>
      <div class="element-selection-item-details">
        ${element.contentDesc ? `<strong>Desc:</strong> ${this.truncate(element.contentDesc, 50)}<br>` : ''}
        ${element.text ? `<strong>Text:</strong> ${this.truncate(element.text, 50)}<br>` : ''}
        ${element.resourceId ? `<strong>ID:</strong> ${this.truncate(element.resourceId, 40)}<br>` : ''}
        ${element.clickable ? '<strong>✓ Clickable</strong>' : ''}
      </div>
      <div class="element-selection-item-bounds">
        Bounds: ${element.rect ? `${Math.round(element.rect.x)},${Math.round(element.rect.y)} ${Math.round(element.rect.width)}×${Math.round(element.rect.height)}` : 'N/A'}
      </div>
      <div class="element-selection-actions">
        <button class="element-selection-btn element-selection-btn-primary" onclick="inspector.tapElementFromDialog('${element.id}', ${deviceX}, ${deviceY})">
          Hacer Tap
        </button>
        ${
          isTextInput && locator
            ? `
          <div class="element-text-input-wrapper">
            <input type="text" class="element-text-input" placeholder="Ingresar texto" />
            <button class="element-selection-btn element-selection-btn-secondary element-send-text"
              data-locator-type="${this.escapeAttribute(locator.type)}"
              data-locator-value="${this.escapeAttribute(locator.value)}">
              Enviar texto
            </button>
          </div>
        `
            : ''
        }
      </div>
    `;

    const sendTextBtn = item.querySelector('.element-send-text');
    if (sendTextBtn) {
      try {
        const minimalLocators = (element.locators || []).map((locator) => ({
          type: locator.type,
          value: locator.value,
        }));
        sendTextBtn.dataset.locators = JSON.stringify(minimalLocators);
      } catch (error) {
        console.warn('[INSPECTOR] Failed to serialize locators:', error);
      }
    }

    return item;
  }

  setupElementSelectionModal() {
    const modal = document.getElementById('element-selection-modal');
    const closeBtn = modal.querySelector('.close');
    const cancelBtn = document.getElementById('element-selection-cancel');

    // Remove existing listeners to avoid duplicates
    const newCloseBtn = closeBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // Add event listeners
    newCloseBtn.onclick = () => this.closeElementSelectionDialog();
    newCancelBtn.onclick = () => this.closeElementSelectionDialog();

    // Close modal when clicking outside
    window.onclick = (event) => {
      if (event.target === modal) {
        this.closeElementSelectionDialog();
      }
    };
  }

  closeElementSelectionDialog() {
    const modal = document.getElementById('element-selection-modal');
    modal.style.display = 'none';
    this.pendingClickCoords = null;
  }

  
  async tapElementFromDialog(elementId, deviceX, deviceY) {
    console.log('[TAP] Using original click coordinates:', { deviceX, deviceY });

    // Use the original click coordinates directly
    const success = await this.tapOnDevice(deviceX, deviceY);
    if (success) {
      this.closeElementSelectionDialog();
      this.setStatus(
        `Tap ejecutado en las coordenadas del clic: (${deviceX}, ${deviceY})`,
        'success',
      );
    }
  }

  // Screenshot click handler for navigation
  setupScreenshotClickHandler() {
    // Add click event to both the image and the overlay canvas
    [this.screenshotImg, this.overlayCanvas].forEach((element) => {
      if (element) {
        element.addEventListener('click', (e) => this.handleScreenshotClick(e));
      }
    });
  }

  async handleScreenshotClick(event) {
    if (!this.currentSession) {
      this.setStatus('No hay sesión activa para navegar', 'error');
      return;
    }

    // Don't process clicks if we don't have a screenshot
    if (
      !this.screenshotImg.src ||
      this.screenshotImg.style.display === 'none'
    ) {
      this.setStatus('Captura una pantalla primero', 'warning');
      return;
    }

    const img = this.screenshotImg;
    const rect = img.getBoundingClientRect();

    // Calculate click position relative to the image
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Calculate scale factors from natural to displayed dimensions
    const scaleX = img.naturalWidth / img.offsetWidth;
    const scaleY = img.naturalHeight / img.offsetHeight;

    // Convert click coordinates to device coordinates
    const deviceX = Math.round(clickX * scaleX);
    const deviceY = Math.round(clickY * scaleY);

    console.log('[INSPECTOR] Screenshot click:', {
      clickCoords: { x: clickX, y: clickY },
      imageRect: { width: img.offsetWidth, height: img.offsetHeight },
      naturalSize: { width: img.naturalWidth, height: img.naturalHeight },
      scale: { x: scaleX, y: scaleY },
      deviceCoords: { x: deviceX, y: deviceY },
    });

    // Show visual feedback
    this.showClickFeedback(clickX, clickY);

    // Find elements at click coordinates
    const elementsAtClick = this.findElementsAtCoordinates(deviceX, deviceY);

    console.log(
      '[INSPECTOR] Elements found at click:',
      elementsAtClick.length,
      elementsAtClick,
    );

    // Always show the element selection modal (never execute automatic tap)
    this.showElementSelectionDialog(
      elementsAtClick,
      clickX,
      clickY,
      deviceX,
      deviceY,
    );
  }

  showClickFeedback(x, y) {
    const canvas = this.overlayCanvas;
    const ctx = canvas.getContext('2d');

    // Show a temporary visual indicator at click position
    ctx.save();
    ctx.fillStyle = 'rgba(102, 126, 234, 0.8)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    // Draw a circle at click position
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Remove the indicator after 500ms
    setTimeout(() => {
      if (canvas.style.display !== 'none') {
        // Only clear if we're not drawing overlay
        ctx.clearRect(x - 15, y - 15, 30, 30);
      }
    }, 500);

    ctx.restore();
  }

  async tapOnDevice(x, y) {
    try {
      this.setStatus(`Ejecutando tap en (${x}, ${y})...`, 'warning');

      const response = await this.apiRequest(
        `/api/inspector/${this.currentSession}/tap`,
        'POST',
        { x, y },
      );

      if (response.success) {
        this.setStatus(`Tap ejecutado en (${x}, ${y})`, 'success');

        // Auto-refresh inspector after 200ms to see the result
        setTimeout(() => this.refreshInspector(), 200);
        return true;
      } else {
        throw new Error(response.message || 'Failed to execute tap');
      }
    } catch (error) {
      console.error('Failed to tap on device:', error);
      this.setStatus(`Error al ejecutar tap: ${error.message}`, 'error');
      return false;
    }
  }

  async typeOnDevice(locators, text) {
    if (!this.currentSession) {
      this.setStatus('No hay sesión activa para escribir texto.', 'error');
      return false;
    }

    const locatorArray = Array.isArray(locators) ? locators : [];
    const primaryLocator = locatorArray.find(
      (locator) => locator && locator.type && locator.value,
    );

    if (!primaryLocator) {
      this.setStatus('No se encontró un locator válido para el elemento.', 'error');
      return false;
    }

    try {
      this.setStatus('Enviando texto al dispositivo...', 'warning');

      const response = await this.apiRequest(
        `/api/inspector/${this.currentSession}/type`,
        'POST',
        {
          locators: locatorArray,
          locatorType: primaryLocator.type,
          locatorValue: primaryLocator.value,
          text,
        },
      );

      if (response.success) {
        this.setStatus('Texto enviado correctamente.', 'success');
        setTimeout(() => this.refreshInspector(), 200);
        return true;
      }

      throw new Error(response.message || 'No se pudo enviar el texto');
    } catch (error) {
      console.error('Failed to type on device:', error);
      this.setStatus(`Error al escribir: ${error.message}`, 'error');
      return false;
    }
  }

  // Utility methods
  formatTime(timestamp) {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString();
  }

  formatBounds(bounds) {
    if (!bounds) return 'N/A';
    return `(${bounds.left}, ${bounds.top}) - (${bounds.right}, ${bounds.bottom})`;
  }

  truncate(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength
      ? text.substring(0, maxLength) + '...'
      : text;
  }

  // Generate hash from XML string for change detection
  async generateXMLHash(xmlString) {
    if (!xmlString) return '';

    try {
      // Use a simple hash algorithm for change detection
      let hash = 0;
      for (let i = 0; i < xmlString.length; i++) {
        const char = xmlString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString(36); // Convert to base36 for shorter string
    } catch (error) {
      console.warn('Error generating XML hash:', error);
      return '';
    }
  }

  // Start automatic screen change detection
  startScreenChangeDetection() {
    if (this.pollingInterval) {
      this.stopScreenChangeDetection();
    }

    this.autoDetectEnabled = true;
    this.updateAutoDetectUI();

    // Start polling every 1 second
    this.pollingInterval = setInterval(async () => {
      await this.checkForScreenChanges();
    }, 1000);

    console.log('Screen change detection started');
    this.setStatus('Detección automática activada', 'success');
  }

  // Stop automatic screen change detection
  stopScreenChangeDetection() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.autoDetectEnabled = false;
    this.updateAutoDetectUI();

    console.log('Screen change detection stopped');
    this.setStatus('Detección automática desactivada', 'info');
  }

  // Check for screen changes by comparing XML hashes
  async checkForScreenChanges() {
    if (!this.currentSession || !this.autoDetectEnabled) {
      return;
    }

    try {
      // Get current page source
      const response = await this.apiRequest(
        `/api/inspector/${this.currentSession}/xml`,
        'GET'
      );

      if (response.success && response.source) {
        const currentHash = await this.generateXMLHash(response.source);

        if (currentHash && currentHash !== this.lastXMLHash) {
          console.log('Screen change detected - refreshing inspector');
          this.lastXMLHash = currentHash;
          this.updateCount++;

          // Update indicator
          this.updateAutoDetectIndicator();

          // Refresh inspector
          await this.refreshInspector();
        }
      }
    } catch (error) {
      console.warn('Error checking for screen changes:', error);
      // Don't show error to user to avoid spam, just log it
    }
  }

  // Update auto-detection UI elements
  updateAutoDetectUI() {
    if (this.autoDetectToggle) {
      this.autoDetectToggle.checked = this.autoDetectEnabled;
    }
    this.updateAutoDetectIndicator();
  }

  // Update auto-detection indicator
  updateAutoDetectIndicator() {
    if (!this.autoDetectIndicator) return;

    if (this.autoDetectEnabled) {
      this.autoDetectIndicator.className = 'inspector-status success';
      this.autoDetectIndicator.textContent = `Auto-detect ON (${this.updateCount})`;
      this.autoDetectIndicator.style.display = 'block';
    } else {
      this.autoDetectIndicator.style.display = 'none';
    }
  }

  // Toggle auto-detection on/off
  toggleAutoDetection() {
    if (this.autoDetectEnabled) {
      this.stopScreenChangeDetection();
    } else {
      this.startScreenChangeDetection();
    }
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Global instance
let inspector;

// Initialize inspector when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log(
    '[DEBUG] DOMContentLoaded - setting up window.initializeInspector',
  );
  // Inspector will be initialized after socket connection is established
  window.initializeInspector = (socket) => {
    console.log(
      '[DEBUG] window.initializeInspector called with socket:',
      socket,
    );
    inspector = new AppiumInspector(socket);
    window.appiumInspector = inspector; // Variable global para prueba
    window.inspector = inspector; // Make inspector globally available for onclick handlers
    console.log(
      '[DEBUG] appiumInspector global variable set:',
      window.appiumInspector,
    );
  };
});

// Make copyLocator globally available
window.copyLocator = (locator) => {
  if (inspector) {
    inspector.copyLocator(locator);
  }
};
