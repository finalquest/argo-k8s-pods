import { BaseAction } from '../base-action.js';

export class CopyStepAction extends BaseAction {
  constructor() {
    super();
    this.type = 'copy-step';
    this.icon = '📋';
    this.label = 'Copy Step';
    this.shortcut = 'Ctrl+C';
    this.applicableContexts = ['step'];
  }

  async execute(context) {
    const validation = this.validate(context);
    if (validation.length > 0) {
      throw new Error(`Validation failed: ${validation.join(', ')}`);
    }

    const { data } = context;

    // Formatear el step para copiar
    const stepText = `${data.type} ${data.text}`;

    // Copiar al portapapeles
    try {
      await navigator.clipboard.writeText(stepText);
      this.showFeedback(`Step copied: ${stepText}`);
      return { success: true, copiedText: stepText };
    } catch {
      // Fallback para navegadores que no soportan clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = stepText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);

      this.showFeedback(`Step copied: ${stepText}`);
      return { success: true, copiedText: stepText };
    }
  }
}
