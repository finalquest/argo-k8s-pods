import { BaseAction } from '../base-action.js';

export class ReplacePlaceholderAction extends BaseAction {
  constructor() {
    super();
    this.type = 'replace-placeholder';
    this.icon = '🔍';
    this.label = 'Search JSON References';
    this.shortcut = null;
    this.applicableContexts = ['placeholder'];
  }

  async execute(context) {
    const validation = this.validate(context);
    if (validation.length > 0) {
      throw new Error(`Validation failed: ${validation.join(', ')}`);
    }

    const { data, position } = context;

    // Por ahora, mostrar un mensaje de implementación pendiente
    // Más adelante implementaremos el widget de búsqueda
    this.showFeedback('JSON Reference Search - Coming Soon!');

    return {
      success: true,
      message: 'Placeholder action executed',
      placeholder: data.placeholderText,
      position: data.placeholderPosition
    };
  }

  validate(context) {
    const errors = [];

    if (!context.data) {
      errors.push('No data available in context');
    }

    if (!context.data.placeholderText) {
      errors.push('No placeholder text available');
    }

    if (!context.data.placeholderPosition) {
      errors.push('No placeholder position available');
    }

    return errors;
  }

  showFeedback(message) {
    // Mostrar notificación flotante
    if (window.showNotification) {
      window.showNotification(message, 'info');
    } else {
      console.log('[PLACEHOLDER-ACTION]', message);
    }
  }
}