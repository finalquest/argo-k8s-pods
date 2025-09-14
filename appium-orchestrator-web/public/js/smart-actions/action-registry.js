export class ActionRegistry {
  constructor() {
    this.actions = new Map();
    this.contextFilters = new Map();
  }

  /**
   * Registra una nueva smart action
   */
  registerAction(actionClass) {
    const action = new actionClass();
    this.actions.set(action.type, action);

    // Registrar por contextos aplicables
    action.applicableContexts.forEach((context) => {
      if (!this.contextFilters.has(context)) {
        this.contextFilters.set(context, []);
      }
      this.contextFilters.get(context).push(action);
    });
  }

  /**
   * Obtiene una acción por su tipo
   */
  getAction(actionType) {
    return this.actions.get(actionType);
  }

  /**
   * Obtiene acciones disponibles para un contexto específico
   */
  getActionsForContext(context) {
    const applicableActions = this.contextFilters.get(context.type) || [];
    return applicableActions.filter((action) => action.isApplicable(context));
  }

  /**
   * Lista todas las acciones registradas
   */
  getAllActions() {
    return Array.from(this.actions.values());
  }

  /**
   * Remueve una acción del registro
   */
  unregisterAction(actionType) {
    const action = this.actions.get(actionType);
    if (!action) return false;

    // Remover del mapa principal
    this.actions.delete(actionType);

    // Remover de los filtros de contexto
    action.applicableContexts.forEach((context) => {
      const contextActions = this.contextFilters.get(context);
      if (contextActions) {
        const index = contextActions.findIndex((a) => a.type === actionType);
        if (index !== -1) {
          contextActions.splice(index, 1);
        }
      }
    });

    return true;
  }

  /**
   * Verifica si una acción está registrada
   */
  hasAction(actionType) {
    return this.actions.has(actionType);
  }

  /**
   * Obtiene acciones por tipo de contexto
   */
  getActionsByContext(contextType) {
    return this.contextFilters.get(contextType) || [];
  }

  /**
   * Limpia todas las acciones registradas
   */
  clear() {
    this.actions.clear();
    this.contextFilters.clear();
  }
}
