import { ActionRegistry } from './action-registry.js';
import { ActionContext } from './action-context.js';
import { InsertStepAction } from './actions/insert-step-action.js';
import { CopyStepAction } from './actions/copy-step-action.js';
import { InsertJsonReferenceAction } from './actions/insert-json-reference-action.js';

export class SmartActionsManager {
  constructor(glosarioUI, insertController) {
    this.glosarioUI = glosarioUI;
    this.insertController = insertController;
    this.actionRegistry = new ActionRegistry();
    this.activeMenu = null;
    this.lastMenuElement = null;
    this.lastMenuType = null;

    this.initializeDefaultActions();
    this.setupEventListeners();
  }

  /**
   * Inicializa las acciones por defecto
   */
  initializeDefaultActions() {
    // Registrar acciones básicas
    this.actionRegistry.registerAction(InsertStepAction);
    this.actionRegistry.registerAction(CopyStepAction);
    this.actionRegistry.registerAction(InsertJsonReferenceAction);

    console.log('[SMART-ACTIONS] Default actions registered');
  }

  /**
   * Configura los event listeners para smart actions
   */
  setupEventListeners() {
    // Event listeners se configurarán cuando se integre con GlosarioUI
  }

  /**
   * Ejecuta una smart action basada en contexto
   */
  async executeAction(actionType, context) {
    try {
      const action = this.actionRegistry.getAction(actionType);
      if (!action) {
        throw new Error(`Action ${actionType} not found`);
      }

      if (!action.isApplicable(context)) {
        throw new Error(
          `Action ${actionType} not applicable to current context`,
        );
      }

      const result = await action.execute(context);
      return result;
    } catch (error) {
      console.error('Smart Action execution failed:', error);
      throw error;
    }
  }

  /**
   * Obtiene acciones disponibles para el contexto actual
   */
  getAvailableActions(context) {
    return this.actionRegistry.getActionsForContext(context);
  }

  /**
   * Crea un contexto de acción a partir de un elemento DOM
   */
  createContext(element, type, additionalData = {}) {
    const data = this.extractDataFromElement(element, type);
    const position = this.getCurrentCursorPosition();

    const context = new ActionContext({
      element,
      type,
      data,
      position,
      glosarioUI: this.glosarioUI,
      ...additionalData,
    });

    return context;
  }

  /**
   * Extrae datos de un elemento DOM según su tipo
   */
  extractDataFromElement(element, type) {
    switch (type) {
      case 'step':
        return this.extractStepData(element);
      case 'json-reference':
        return this.extractJsonData(element);
      default:
        return {};
    }
  }

  /**
   * Extrae datos de un step
   */
  extractStepData(element) {
    const stepItem = element.closest('.glosario-step-item');
    if (!stepItem) return {};

    return {
      text: stepItem.querySelector('.step-text')?.textContent || '',
      type: stepItem.dataset.stepType || 'Given',
      file: stepItem.dataset.file || '',
    };
  }

  /**
   * Extrae datos de una referencia JSON
   */
  extractJsonData(element) {
    const jsonItem = element.closest('.json-key-item');
    if (!jsonItem) return {};

    // El filename está en el elemento padre .json-reference-item
    const jsonReferenceItem = jsonItem.closest('.json-reference-item');
    const filename = jsonReferenceItem?.dataset.filename || '';

    return {
      key: jsonItem.dataset.key || '',
      value: jsonItem.dataset.value || '',
      file: filename,
    };
  }

  /**
   * Obtiene la posición actual del cursor en el editor
   */
  getCurrentCursorPosition() {
    if (!window.ideCodeMirror) {
      return { line: 0, ch: 0 };
    }

    return window.ideCodeMirror.getDoc().getCursor();
  }

  /**
   * Muestra el menú contextual de smart actions
   */
  showSmartActionsMenu(event, element, type) {
    // Prevenir menú contextual por defecto
    event.preventDefault();

    // Cerrar menú existente si hay uno
    this.hideSmartActionsMenu();

    // Guardar el elemento y tipo para usarlos cuando se ejecute la acción
    this.lastMenuElement = element;
    this.lastMenuType = type;

    const context = this.createContext(element, type);
    const availableActions = this.getAvailableActions(context);

    if (availableActions.length === 0) {
      return; // No hay acciones disponibles
    }

    const menu = this.createMenuHTML(availableActions);
    this.renderMenu(menu, event.pageX, event.pageY);
  }

  /**
   * Crea el HTML del menú contextual
   */
  createMenuHTML(actions) {
    return `
      <div class="smart-actions-menu">
        <div class="menu-header">Smart Actions</div>
        ${actions
          .map(
            (action) => `
          <div class="menu-item" data-action="${action.type}">
            <span class="action-icon">${action.icon}</span>
            <span class="action-label">${action.label}</span>
            ${action.shortcut ? `<span class="action-shortcut">${action.shortcut}</span>` : ''}
          </div>
        `,
          )
          .join('')}
      </div>
    `;
  }

  /**
   * Renderiza el menú en la pantalla
   */
  renderMenu(menuHTML, x, y) {
    const menu = document.createElement('div');
    menu.innerHTML = menuHTML;
    menu.className = 'smart-actions-menu-container';

    // Posicionar el menú
    menu.style.position = 'absolute';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '1000';

    document.body.appendChild(menu);
    this.activeMenu = menu;

    // Configurar event listeners para los items del menú
    this.setupMenuEventListeners(menu);

    // Cerrar menú al hacer clic fuera
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick.bind(this));
    }, 0);
  }

  /**
   * Configura event listeners para el menú
   */
  setupMenuEventListeners(menu) {
    const menuItems = menu.querySelectorAll('.menu-item');

    menuItems.forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const actionType = item.dataset.action;

        try {
          // Crear contexto para la acción
          const context = this.createContext(
            this.lastMenuElement,
            this.lastMenuType,
          );

          // Ejecutar la acción
          const result = await this.executeAction(actionType, context);
          console.log(`Smart Action executed: ${actionType}`, result);
        } catch (error) {
          console.error(`Smart Action failed: ${actionType}`, error);
        }

        this.hideSmartActionsMenu();
      });
    });
  }

  /**
   * Maneja clicks fuera del menú
   */
  handleOutsideClick(event) {
    if (!this.activeMenu || this.activeMenu.contains(event.target)) {
      return;
    }

    this.hideSmartActionsMenu();
  }

  /**
   * Oculta el menú contextual
   */
  hideSmartActionsMenu() {
    if (this.activeMenu) {
      this.activeMenu.remove();
      this.activeMenu = null;
    }

    document.removeEventListener('click', this.handleOutsideClick.bind(this));
  }

  /**
   * Registra una nueva acción
   */
  registerAction(actionClass) {
    this.actionRegistry.registerAction(actionClass);
  }

  /**
   * Obtiene información del manager para debugging
   */
  getDebugInfo() {
    return {
      registeredActions: this.actionRegistry.getAllActions().map((a) => ({
        type: a.type,
        label: a.label,
        contexts: a.applicableContexts,
      })),
      hasActiveMenu: !!this.activeMenu,
    };
  }
}
