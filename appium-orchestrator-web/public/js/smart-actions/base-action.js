export class BaseAction {
  constructor() {
    this.type = this.constructor.name.replace('Action', '').toLowerCase();
    this.icon = this.icon || '🔧';
    this.label = this.label || 'Action';
    this.shortcut = this.shortcut || null;
    this.applicableContexts = this.applicableContexts || [];
  }

  /**
   * Verifica si la acción es aplicable al contexto
   */
  isApplicable(context) {
    return this.applicableContexts.includes(context.type);
  }

  /**
   * Ejecuta la acción principal
   */
  async execute() {
    throw new Error('Execute method must be implemented by subclass');
  }

  /**
   * Valida precondiciones para ejecutar la acción
   */
  validate(context) {
    const errors = [];
    if (!context.data) {
      errors.push('No data available in context');
    }
    return errors;
  }

  /**
   * Muestra feedback visual al usuario
   */
  showFeedback(message, type = 'success') {
    const feedback = document.createElement('div');
    feedback.className = `smart-action-feedback ${type}`;
    feedback.innerHTML = `
      <div class="feedback-content">
        <span class="feedback-icon">${type === 'success' ? '✓' : '⚠'}</span>
        <span class="feedback-text">${message}</span>
      </div>
    `;

    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 3000);
  }
}
