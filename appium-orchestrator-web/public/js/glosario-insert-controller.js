// Glosario Insert Controller
// Handles click-to-insert functionality from glosario panel to CodeMirror editor

class GlosarioInsertController {
  /**
   * Constructor
   * @param {GlosarioUI} glosarioUI - Instance of GlosarioUI
   * @param {Object} codeMirror - CodeMirror instance
   */
  constructor(glosarioUI, codeMirror) {
    this.glosarioUI = glosarioUI;
    this.codeMirror = codeMirror;
    this.debugMode = false;

    this.init();
  }

  /**
   * Initialize the controller
   */
  init() {
    this.logDebug('GlosarioInsertController initialized');

    // Override the click handler in glosario UI
    this.setupInsertHandlers();

    // Add keyboard shortcuts for insertion
    this.setupKeyboardShortcuts();
  }

  /**
   * Setup insert handlers for glosario steps
   */
  setupInsertHandlers() {
    // We'll modify the createStepElement method to use our insert handler
    this.overrideCreateStepElement();
  }

  /**
   * Override the createStepElement method in GlosarioUI
   */
  overrideCreateStepElement() {
    const originalCreateStepElement = this.glosarioUI.createStepElement.bind(
      this.glosarioUI,
    );

    this.glosarioUI.createStepElement = (step) => {
      const stepElement = originalCreateStepElement(step);

      // Add our insert handler (the original createStepElement won't add one if we exist)
      stepElement.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Pequeño retraso para asegurar que el cursor esté en la posición correcta
        setTimeout(() => {
          this.insertStepIntoEditor(step, stepElement);
        }, 10);
      });

      // Add hover effect to show insert capability
      this.addInsertHoverEffect(stepElement);

      return stepElement;
    };
  }

  /**
   * Add hover effect to show insert capability
   */
  addInsertHoverEffect(stepElement) {
    stepElement.style.cursor = 'pointer';
    stepElement.title = 'Click to insert in editor';

    stepElement.addEventListener('mouseenter', () => {
      stepElement.style.borderLeft = '3px solid #4fc3f7';
      stepElement.style.paddingLeft = '7px';
    });

    stepElement.addEventListener('mouseleave', () => {
      stepElement.style.borderLeft = '';
      stepElement.style.paddingLeft = '10px';
    });
  }

  /**
   * Insert step into CodeMirror editor
   */
  insertStepIntoEditor(step, stepElement) {
    try {
      if (!this.codeMirror) {
        this.showError('CodeMirror editor not found');
        return;
      }

      // Forzar cursor al final del documento para evitar inserciones en medio de líneas
      const doc = this.codeMirror.getDoc();
      const lastLine = doc.lineCount() - 1;
      const endOfDocument = {
        line: lastLine,
        ch: doc.getLine(lastLine).length,
      };

      // Mover cursor al final del documento
      this.codeMirror.setCursor(endOfDocument);

      // Obtener la posición final (debería ser el inicio de una nueva línea)
      let cursorPos = {
        line: endOfDocument.line,
        ch: 0,
      };

      // Si la última línea no está vacía, agregar un salto de línea primero
      const lastLineText = doc.getLine(lastLine).trim();
      if (lastLineText !== '') {
        doc.replaceRange('\n', endOfDocument, endOfDocument);
        cursorPos = {
          line: lastLine + 1,
          ch: 0,
        };
      }

      // Format step as Gherkin line with context awareness
      const gherkinLine = this.formatAsGherkin(step, cursorPos);

      // Insert the step
      const textToInsert = gherkinLine + '\n';
      this.codeMirror.replaceRange(textToInsert, cursorPos, cursorPos);

      // Aplicar indentación manual
      const lineText = doc.getLine(cursorPos.line);
      if (!lineText.startsWith('    ')) {
        const indentedText = '    ' + lineText;
        doc.replaceRange(
          indentedText,
          { line: cursorPos.line, ch: 0 },
          { line: cursorPos.line + 1, ch: 0 },
        );
      }

      // Move cursor to next line
      const newCursorPos = {
        line: cursorPos.line + 1,
        ch: 0,
      };
      this.codeMirror.setCursor(newCursorPos);

      // Focus the editor
      this.codeMirror.focus();

      // Visual feedback
      this.showInsertFeedback(stepElement, '✓ Inserted!');

      this.logDebug('Step inserted successfully:', gherkinLine);
    } catch {
      this.logError('Error inserting step');
      this.showError('Failed to insert step');
    }
  }

  /**
   * Detect Gherkin context to determine appropriate keyword
   */
  detectGherkinContext(cursorPos) {
    if (!this.codeMirror) return 'first';

    const doc = this.codeMirror.getDoc();
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
   * Format step as Gherkin line with context awareness
   */
  formatAsGherkin(step, cursorPos) {
    const context = this.detectGherkinContext(cursorPos);
    const keyword = this.getGherkinKeyword(step, context);
    return `${keyword} ${step.text}`;
  }

  /**
   * Show visual feedback for successful insertion
   */
  showInsertFeedback(stepElement, message) {
    const originalBg = stepElement.style.background;
    const originalBorder = stepElement.style.borderColor;

    stepElement.style.background = '#4caf50';
    stepElement.style.borderColor = '#4caf50';
    stepElement.style.color = '#fff';

    // Show message
    const feedbackDiv = document.createElement('div');
    feedbackDiv.textContent = message;
    feedbackDiv.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: #4caf50;
      color: white;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      z-index: 1000;
    `;

    stepElement.style.position = 'relative';
    stepElement.appendChild(feedbackDiv);

    // Reset after delay
    setTimeout(() => {
      stepElement.style.background = originalBg;
      stepElement.style.borderColor = originalBorder;
      stepElement.style.color = '';
      if (feedbackDiv.parentNode) {
        feedbackDiv.parentNode.removeChild(feedbackDiv);
      }
    }, 1500);
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only handle when glosario is visible
      if (!this.glosarioUI.isVisible) return;

      // Enter to insert selected step (if any step is hovered)
      if (e.key === 'Enter') {
        const hoveredStep = document.querySelector('.glosario-step-item:hover');
        if (hoveredStep) {
          e.preventDefault();
          hoveredStep.click();
        }
      }

      // Ctrl/Cmd + Click to copy instead of insert
      if (
        (e.ctrlKey || e.metaKey) &&
        e.target.classList.contains('glosario-step-item')
      ) {
        e.preventDefault();
        const stepData = this.extractStepDataFromElement(e.target);
        if (stepData) {
          this.copyStepToClipboard(stepData);
        }
      }
    });
  }

  /**
   * Extract step data from DOM element
   */
  extractStepDataFromElement(element) {
    try {
      const stepElement = element.closest('.glosario-step-item');
      if (!stepElement) return null;

      const typeElement = stepElement.querySelector('.step-type');
      const textElement = stepElement.querySelector('.step-text');
      const metaElement = stepElement.querySelector('.step-parameters');

      return {
        type: typeElement ? typeElement.textContent.trim() : 'Given',
        text: textElement ? textElement.textContent.trim() : '',
        parameters: metaElement ? metaElement.textContent.trim() : '',
      };
    } catch (error) {
      this.logError('Error extracting step data:', error);
      return null;
    }
  }

  /**
   * Copy step to clipboard (fallback functionality)
   */
  async copyStepToClipboard(step) {
    // For clipboard copy, use the original type without context
    const stepText = `${step.type} ${step.text}`;

    try {
      await navigator.clipboard.writeText(stepText);
      this.showNotification('Step copied to clipboard', 'success');
    } catch {
      this.showError('Failed to copy to clipboard');
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `glosario-notification glosario-notification-${type}`;
    notification.textContent = message;

    // Add styles if not already added
    if (!document.getElementById('glosario-notification-styles')) {
      this.addNotificationStyles();
    }

    // Position and show
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 300px;
    `;

    document.body.appendChild(notification);

    // Auto-remove after delay
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  /**
   * Add notification styles
   */
  addNotificationStyles() {
    const styles = document.createElement('style');
    styles.id = 'glosario-notification-styles';
    styles.textContent = `
      .glosario-notification {
        padding: 12px 16px;
        border-radius: 4px;
        color: white;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
      }
      
      .glosario-notification-success {
        background: #4caf50;
      }
      
      .glosario-notification-error {
        background: #f44336;
      }
      
      .glosario-notification-info {
        background: #2196f3;
      }
      
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  /**
   * Debug logging
   */
  logDebug(...args) {
    if (this.debugMode) {
      console.log('[GLOSARIO-INSERT-CONTROLLER]', ...args);
    }
  }

  /**
   * Error logging
   */
  logError(...args) {
    console.error('[GLOSARIO-INSERT-CONTROLLER]', ...args);
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.logDebug('Debug mode:', enabled ? 'enabled' : 'disabled');
  }
}

export { GlosarioInsertController };
