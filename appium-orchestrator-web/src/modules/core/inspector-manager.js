// Inspector Manager Module
// Handles Appium session inspection, element discovery, and UI analysis

const { remote } = require('webdriverio');
const xml2js = require('xml2js');
const sharp = require('sharp');

class InspectorManager {
  constructor(configManager, validationManager, workerPoolManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.workerPoolManager = workerPoolManager;
    this.activeSessions = new Map();
    this.parser = new xml2js.Parser();
    this.maxElements = configManager.get('INSPECT_MAX_ELEMENTS') || 100;
    this.refreshInterval = configManager.get('INSPECT_REFRESH_MS') || 5000;
  }

  /**
   * Get all active Appium sessions from workers
   */
  getActiveSessions() {
    let sessions = [];

    if (
      this.workerPoolManager &&
      typeof this.workerPoolManager.getAppiumSessions === 'function'
    ) {
      sessions = this.workerPoolManager.getAppiumSessions();
    }

    // Add attachment status
    return sessions.map((session) => ({
      ...session,
      isAttached: this.activeSessions.has(session.sessionId),
    }));
  }

  /**
   * Attach inspector to an Appium session
   */
  async attachToSession(sessionId) {
    try {
      if (this.activeSessions.has(sessionId)) {
        return {
          success: true,
          message: 'Already attached to session',
          sessionId,
        };
      }

      // Find the worker with this session
      const worker = this.findWorkerBySessionId(sessionId);
      if (!worker) {
        throw new Error(`Worker with session ${sessionId} not found`);
      }

      // Get Appium connection details from worker environment
      const appiumConfig = this.getAppiumConfig(worker);

      let client;

      // Check if this is a persistent worker that needs a new session
      if (sessionId.startsWith('persistent-') && worker.persistent && worker.status === 'ready') {
        // For persistent workers, create a new session with basic capabilities
        // No appPackage or appActivity - we want to inspect current screen, not launch specific app
        const capabilities = {
          platformName: 'Android',
          'appium:deviceName': worker.deviceSerial || 'Android Device',
          'appium:automationName': 'UiAutomator2',
          'appium:udid': worker.deviceSerial,
          'appium:autoLaunch': false, // Don't launch any app automatically
          'appium:noReset': true, // Don't reset app state
        };

        client = await remote({
          ...appiumConfig,
          capabilities,
          logLevel: 'error',
          connectionRetryTimeout: 5000,
          connectionRetryCount: 3,
        });
      } else {
        // For regular workers, attach to existing session
        client = await remote({
          ...appiumConfig,
          capabilities: {},
          logLevel: 'error',
          connectionRetryTimeout: 5000,
          connectionRetryCount: 3,
        });

        // Attach to existing session
        await client.attachToSession(sessionId);
      }

      // Get the actual session ID for logging
      const actualSessionId = sessionId.startsWith('persistent-') ? client.sessionId : sessionId;

      // Store session info
      this.activeSessions.set(sessionId, {
        client,
        workerId: worker.id,
        deviceSerial: worker.deviceSerial,
        actualSessionId,
        isPersistent: sessionId.startsWith('persistent-'),
        attachedAt: new Date(),
        lastActivity: new Date(),
      });

      console.log(
        `[INSPECTOR] Attached to session ${sessionId} (real session: ${actualSessionId}) on device ${worker.deviceSerial}`,
      );

      return {
        success: true,
        message: 'Successfully attached to session',
        sessionId,
        deviceSerial: worker.deviceSerial,
      };
    } catch (error) {
      console.error(
        `[INSPECTOR] Failed to attach to session ${sessionId}:`,
        error.message,
      );
      return { success: false, message: error.message, sessionId };
    }
  }

  /**
   * Detach inspector from session
   */
  async detachFromSession(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        await session.client.deleteSession();
        this.activeSessions.delete(sessionId);

        // If this was a persistent worker session, update worker status back to ready
        if (session.isPersistent && this.workerPoolManager) {
          const worker = this.workerPoolManager.getWorkerById(session.workerId);
          if (worker) {
            worker.status = 'ready';
            worker.appiumSessionId = null;
            console.log(`[INSPECTOR] Worker ${session.workerId} returned to ready state`);
          }
        }

        console.log(`[INSPECTOR] Detached from session ${sessionId}`);
        return { success: true, message: 'Detached from session', sessionId };
      }
      return { success: false, message: 'Session not found', sessionId };
    } catch (error) {
      console.error(
        `[INSPECTOR] Error detaching from session ${sessionId}:`,
        error.message,
      );
      return { success: false, message: error.message, sessionId };
    }
  }

  /**
   * Get UI elements from current screen
   */
  async getElements(sessionId, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not attached');
      }

      const { q: searchQuery, clickableOnly, maxElements } = options;

      // Get page source XML
      const source = await session.client.getPageSource();

      // Debug: Log XML source info
      console.log(`[INSPECTOR] XML source length for session ${sessionId}:`, source.length);
      console.log(`[INSPECTOR] XML source preview:`, source.substring(0, 500));

      const elements = await this.parseUIElements(
        source,
        searchQuery,
        clickableOnly,
        maxElements,
      );

      console.log(`[INSPECTOR] Parsed ${elements.length} elements from XML`);

      // Update last activity
      session.lastActivity = new Date();

      return {
        success: true,
        sessionId,
        elements: elements.slice(0, maxElements || this.maxElements),
        totalElements: elements.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `[INSPECTOR] Failed to get elements for session ${sessionId}:`,
        error.message,
      );
      return { success: false, message: error.message, sessionId };
    }
  }

  /**
   * Take screenshot of current screen
   */
  async getScreenshot(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not attached');
      }

      const screenshot = await session.client.takeScreenshot();
      session.lastActivity = new Date();

      return {
        success: true,
        sessionId,
        screenshot,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `[INSPECTOR] Failed to get screenshot for session ${sessionId}:`,
        error.message,
      );
      return { success: false, message: error.message, sessionId };
    }
  }

  /**
   * Generate overlay with element boundaries
   */
  async generateOverlay(sessionId, elementIds = null) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not attached');
      }

      // Get screenshot and elements
      const [screenshotResult, elementsResult] = await Promise.all([
        this.getScreenshot(sessionId),
        this.getElements(sessionId),
      ]);

      if (!screenshotResult.success || !elementsResult.success) {
        throw new Error('Failed to get screenshot or elements');
      }

      // Filter elements if specific IDs provided
      let elements = elementsResult.elements;
      if (elementIds && Array.isArray(elementIds)) {
        elements = elements.filter((el) => elementIds.includes(el.id));
      }

      // Generate overlay
      const overlay = await this.createOverlayImage(
        screenshotResult.screenshot,
        elements,
      );

      return {
        success: true,
        sessionId,
        overlay,
        elementCount: elements.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `[INSPECTOR] Failed to generate overlay for session ${sessionId}:`,
        error.message,
      );
      return { success: false, message: error.message, sessionId };
    }
  }

  /**
   * Tap on specific coordinates
   */
  async tapCoordinates(sessionId, x, y) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not attached');
      }

      await session.client.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y) },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          { type: 'pointerUp', button: 0 }
        ]
      }]);

      session.lastActivity = new Date();

      return {
        success: true,
        sessionId,
        coordinates: { x, y },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `[INSPECTOR] Failed to tap coordinates for session ${sessionId}:`,
        error.message,
      );
      return { success: false, message: error.message, sessionId };
    }
  }

  /**
   * Get health status of inspector and sessions
   */
  getHealth() {
    const activeSessionCount = this.activeSessions.size;
    const totalSessions = this.getActiveSessions().length;
    const staleSessions = this.getStaleSessions();

    return {
      status: 'healthy',
      activeSessionCount,
      totalSessions,
      staleSessions: staleSessions.length,
      maxElements: this.maxElements,
      refreshInterval: this.refreshInterval,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  // Private helper methods

  findWorkerBySessionId(sessionId) {
    if (!this.workerPoolManager) {
      return null;
    }

    // Try to find worker by regular session ID first
    if (typeof this.workerPoolManager.getWorkerBySessionId === 'function') {
      const worker = this.workerPoolManager.getWorkerBySessionId(sessionId);
      if (worker) {
        return worker;
      }
    }

    // Try to find worker by persistent session ID
    if (typeof this.workerPoolManager.findWorkerByPersistentSessionId === 'function') {
      return this.workerPoolManager.findWorkerByPersistentSessionId(sessionId);
    }

    return null;
  }

  getAppiumConfig(worker) {
    // Get Appium configuration from worker environment
    // Use worker's dynamic Appium port if available, otherwise fall back to environment
    return {
      hostname: process.env.APPIUM_HOST || 'localhost',
      port: parseInt(worker.appiumPort) || parseInt(process.env.APPIUM_PORT) || 4723,
      path: process.env.APPIUM_PATH || '/wd/hub',
      protocol: 'http',
    };
  }

  
  async parseUIElements(
    xmlSource,
    searchQuery = null,
    clickableOnly = false,
    maxElements = null,
  ) {
    try {
      console.log('[INSPECTOR] Starting XML parsing...');
      const result = await this.parser.parseStringPromise(xmlSource);
      console.log('[INSPECTOR] XML parsed successfully, result keys:', Object.keys(result));

      const nodes = this.extractNodes(result);
      console.log('[INSPECTOR] Extracted nodes:', nodes.length);

      // Flatten the hierarchy to get all elements
      const flattenedNodes = this.flattenHierarchy(nodes);
      console.log('[INSPECTOR] Flattened nodes:', flattenedNodes.length);

      const elements = [];

      for (const node of flattenedNodes) {
        const element = this.normalizeElement(node);

        // Apply filters
        if (searchQuery && !this.elementMatchesSearch(element, searchQuery)) {
          continue;
        }

        if (clickableOnly && !element.clickable) {
          continue;
        }

        elements.push(element);

        if (maxElements && elements.length >= maxElements) {
          break;
        }
      }

      console.log('[INSPECTOR] Final elements after filtering:', elements.length);
      console.log('[INSPECTOR] Sample element:', elements[0]);

      // Sort by priority: clickable > with content-desc > with resource-id
      return this.sortElementsByPriority(elements);
    } catch (error) {
      console.error('[INSPECTOR] Error parsing UI elements:', error.message);
      console.error('[INSPECTOR] Error details:', error);
      return [];
    }
  }

  extractNodes(obj, nodes = []) {
    if (!obj || typeof obj !== 'object') return nodes;

    console.log('[INSPECTOR] extractNodes called with keys:', Object.keys(obj));

    // Handle different XML structures from different Android versions
    if (obj.hierarchy && obj.hierarchy.node) {
      console.log('[INSPECTOR] Found hierarchy.node structure');
      this.processNodes(obj.hierarchy.node, nodes);
    } else if (obj.hierarchy && Array.isArray(obj.hierarchy)) {
      console.log('[INSPECTOR] Found hierarchy array structure');
      this.processNodes(obj.hierarchy, nodes);
    } else if (obj.node) {
      console.log('[INSPECTOR] Found direct node structure');
      this.processNodes(obj.node, nodes);
    } else if (obj.hierarchy) {
      console.log('[INSPECTOR] Found hierarchy object, checking for widget properties...');
      console.log('[INSPECTOR] Hierarchy object keys:', Object.keys(obj.hierarchy));

      // Look for widget properties in the hierarchy object
      const widgetKeys = Object.keys(obj.hierarchy).filter(key =>
        key !== '$' && key !== 'node' && typeof obj.hierarchy[key] === 'object'
      );

      console.log('[INSPECTOR] Potential widget keys:', widgetKeys);

      for (const widgetKey of widgetKeys) {
        const widgetData = obj.hierarchy[widgetKey];
        console.log(`[INSPECTOR] Checking widget key "${widgetKey}":`, Array.isArray(widgetData) ? `array with ${widgetData.length} items` : 'object');

        if (Array.isArray(widgetData)) {
          // Handle array of widgets - flatten the hierarchy to get ALL widgets
          if (widgetData.length > 0 && widgetData[0].$) {
            console.log(`[INSPECTOR] Found widget array with ${widgetData.length} items under "${widgetKey}"`);
            this.processNodes(widgetData, nodes);
            console.log(`[INSPECTOR] After processing ${widgetKey}, nodes count:`, nodes.length);
          }
        } else if (widgetData.$) {
          // Handle single widget
          console.log(`[INSPECTOR] Found single widget under "${widgetKey}"`);
          this.processNodes(widgetData, nodes);
          console.log(`[INSPECTOR] After processing ${widgetKey}, nodes count:`, nodes.length);
        }
      }

      console.log(`[INSPECTOR] Total extracted nodes from all widget keys:`, nodes.length);
    } else {
      console.log('[INSPECTOR] No recognized XML structure found');
      console.log('[INSPECTOR] Available keys:', Object.keys(obj));
      // Try to find any node-like structure
      for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object') {
          console.log(`[INSPECTOR] Checking key "${key}":`, typeof obj[key], Array.isArray(obj[key]) ? 'array' : 'object');
          if (obj[key].node) {
            console.log(`[INSPECTOR] Found node under key "${key}"`);
            this.processNodes(obj[key].node, nodes);
          } else if (Array.isArray(obj[key]) && obj[key].length > 0) {
            console.log(`[INSPECTOR] Found array under key "${key}" with ${obj[key].length} items`);
            // Check if first item has node structure
            if (obj[key][0] && obj[key][0].$) {
              console.log(`[INSPECTOR] Array items appear to be nodes, processing...`);
              this.processNodes(obj[key], nodes);
            }
          }
        }
      }
    }

    return nodes;
  }

  processNodes(nodes, result, parent = null) {
    if (!nodes) return;

    if (Array.isArray(nodes)) {
      nodes.forEach((node) => this.processNode(node, result, parent));
    } else {
      this.processNode(nodes, result, parent);
    }
  }

  processNode(node, result, parent = null) {
    // Debug: Log the node structure
    console.log('[INSPECTOR] Processing node:', {
      class: node.$?.class,
      hasChildren: !!node.node,
      keys: Object.keys(node),
      nodeKeys: node.node ? Object.keys(node.node) : [],
      isArray: Array.isArray(node.node)
    });

    const element = {
      ...node,
      parent,
      children: [],
    };

    result.push(element);
    console.log(`[INSPECTOR] Added node to result. Result count:`, result.length);

    // Handle children - Appium can store them in different structures
    if (node.node) {
      if (Array.isArray(node.node)) {
        console.log(`[INSPECTOR] Node has ${node.node.length} array children`);
        this.processNodes(node.node, element.children, element);
      } else {
        console.log('[INSPECTOR] Node has single child object');
        this.processNodes(node.node, element.children, element);
      }
    } else {
      // Look for children in other possible locations
      const childKeys = Object.keys(node).filter(key => key !== '$' && key !== 'parent' && key !== 'children');
      if (childKeys.length > 0) {
        console.log(`[INSPECTOR] Looking for children in keys:`, childKeys);
        for (const key of childKeys) {
          if (typeof node[key] === 'object' && node[key] !== null) {
            if (Array.isArray(node[key])) {
              console.log(`[INSPECTOR] Found array children under key "${key}":`, node[key].length);
              // Only add to parent's children array to avoid infinite loop
              this.processNodes(node[key], element.children, element);
            } else if (node[key].$) {
              console.log(`[INSPECTOR] Found single child under key "${key}"`);
              // Only add to parent's children array to avoid infinite loop
              this.processNodes(node[key], element.children, element);
            }
          }
        }
      }
    }
  }

  normalizeElement(node) {
    // Debug: Log the actual node structure
    console.log('[INSPECTOR] normalizeElement called with node:', {
      nodeKeys: Object.keys(node),
      hasDollar: !!node.$,
      dollarKeys: node.$ ? Object.keys(node.$) : [],
      dollarClass: node.$?.class,
      dollarBounds: node.$?.bounds,
      // Sample a few other properties
      sampleProps: Object.keys(node).filter(k => k !== '$' && k !== 'parent' && k !== 'children').slice(0, 3)
    });

    // Try to extract attributes from different possible locations
    let attributes = {};

    // Primary location: node.$ (standard xml2js format)
    if (node.$ && typeof node.$ === 'object') {
      attributes = node.$;
    }

    // Fallback: If node is a widget class name itself
    const widgetKeys = Object.keys(node).filter(key =>
      key !== '$' && key !== 'parent' && key !== 'children' &&
      typeof node[key] === 'object' && node[key] !== null
    );

    if (widgetKeys.length > 0 && !attributes.class) {
      // This node might be a container with widget properties
      console.log('[INSPECTOR] Node has widget properties:', widgetKeys);
    }

    console.log('[INSPECTOR] Using attributes:', attributes);

    const bounds = this.parseBounds(attributes.bounds || '[0,0][0,0]');
    const rect = this.boundsToRect(bounds);

    const element = {
      id: this.generateElementId(node),
      class: attributes.class || '',
      resourceId: attributes['resource-id'] || '',
      contentDesc: attributes['content-desc'] || '',
      text: attributes.text || '',
      clickable: attributes.clickable === 'true',
      enabled: attributes.enabled === 'true',
      focused: attributes.focused === 'true',
      bounds: bounds,
      rect: rect,
      locators: this.generateLocators(node),
    };

    console.log('[INSPECTOR] Normalized element:', {
      id: element.id,
      class: element.class,
      resourceId: element.resourceId,
      text: element.text,
      clickable: element.clickable,
      hasBounds: !!attributes.bounds
    });

    return element;
  }

  parseBounds(boundsStr) {
    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (match) {
      return {
        left: parseInt(match[1]),
        top: parseInt(match[2]),
        right: parseInt(match[3]),
        bottom: parseInt(match[4]),
      };
    }
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  boundsToRect(bounds) {
    return {
      x: bounds.left,
      y: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    };
  }

  generateElementId(node) {
    const parts = [
      node.$?.class || 'unknown',
      node.$?.['resource-id'] || '',
      node.$?.['content-desc'] || '',
    ];
    return Buffer.from(parts.join('|')).toString('base64').substring(0, 16);
  }

  generateLocators(node) {
    const locators = [];

    // 1. Content-desc format (highest priority)
    if (node.$?.['content-desc']) {
      locators.push({
        type: 'content-desc',
        value: `@content-desc='${node.$['content-desc']}'`,
        priority: 1,
      });
    }

    // 2. Resource ID
    if (node.$?.['resource-id']) {
      locators.push({
        type: 'id',
        value: node.$['resource-id'],
        priority: 2,
      });
    }

    return locators;
  }

  isStableText(text) {
    // Simple heuristic: avoid very short texts, numbers, or special patterns
    return (
      text &&
      text.length > 2 &&
      !/^\d+$/.test(text) &&
      !/^[{}[\]().,;:!?]$/.test(text)
    );
  }

  generateXPath(node) {
    const attrs = [];

    if (node.$?.class) {
      attrs.push(`@class='${node.$.class}'`);
    }

    if (node.$?.['resource-id']) {
      attrs.push(`@resource-id='${node.$['resource-id']}'`);
    }

    if (node.$?.['content-desc']) {
      attrs.push(`@content-desc='${node.$['content-desc']}'`);
    }

    if (node.$?.text && this.isStableText(node.$.text)) {
      attrs.push(`@text='${node.$.text}'`);
    }

    return attrs.length > 0 ? `//*[@${attrs.join(' and ')}]` : null;
  }

  elementMatchesSearch(element, query) {
    const searchText = query.toLowerCase();
    return (
      element.class.toLowerCase().includes(searchText) ||
      element.resourceId.toLowerCase().includes(searchText) ||
      element.contentDesc.toLowerCase().includes(searchText) ||
      element.text.toLowerCase().includes(searchText)
    );
  }

  flattenHierarchy(nodes, result = []) {
    if (!nodes) return result;

    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        result.push(node);
        // Recursively add all children
        if (node.children && node.children.length > 0) {
          this.flattenHierarchy(node.children, result);
        }
      }
    } else {
      // Single node
      result.push(nodes);
      // Recursively add all children
      if (nodes.children && nodes.children.length > 0) {
        this.flattenHierarchy(nodes.children, result);
      }
    }

    return result;
  }

  sortElementsByPriority(elements) {
    return elements.sort((a, b) => {
      // Clickable elements first
      if (a.clickable && !b.clickable) return -1;
      if (!a.clickable && b.clickable) return 1;

      // Elements with content-desc next
      if (a.contentDesc && !b.contentDesc) return -1;
      if (!a.contentDesc && b.contentDesc) return 1;

      // Elements with resource-id next
      if (a.resourceId && !b.resourceId) return -1;
      if (!a.resourceId && b.resourceId) return 1;

      return 0;
    });
  }

  async createOverlayImage(screenshotBase64, elements) {
    // Create overlay with element boundaries
    // This is a simplified version - in production you'd want proper image processing
    const buffer = Buffer.from(screenshotBase64, 'base64');
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Create overlay SVG
    const svgElements = elements
      .map((el) => {
        const { x, y, width, height } = el.rect;
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}"
               fill="none" stroke="red" stroke-width="2" rx="2"/>`;
      })
      .join('\n');

    const svg = `
      <svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">
        <image href="data:image/png;base64,${screenshotBase64}" width="${metadata.width}" height="${metadata.height}"/>
        ${svgElements}
      </svg>
    `;

    // Convert to PNG
    const overlayBuffer = Buffer.from(svg);
    return overlayBuffer.toString('base64');
  }

  getStaleSessions() {
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    return Array.from(this.activeSessions.entries()).filter(([_, session]) => {
      return now - session.lastActivity.getTime() > staleThreshold;
    });
  }

  /**
   * Cleanup stale sessions
   */
  async cleanupStaleSessions() {
    const staleSessions = this.getStaleSessions();

    for (const [sessionId] of staleSessions) {
      console.log(`[INSPECTOR] Cleaning up stale session: ${sessionId}`);
      await this.detachFromSession(sessionId);
    }
  }
}

module.exports = InspectorManager;
