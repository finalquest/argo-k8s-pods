import { BaseAction } from '../base-action.js';

export class InsertStepAction extends BaseAction {
  constructor() {
    super();
    this.type = 'insert-step';
    this.icon = '📝';
    this.label = 'Insert Step';
    this.shortcut = 'Ctrl+I';
    this.applicableContexts = ['step'];
  }

  async execute(context) {
    const validation = this.validate(context);
    if (validation.length > 0) {
      throw new Error(`Validation failed: ${validation.join(', ')}`);
    }

    const { data, position } = context;

    // 1. Determinar keyword simple: primer step = original, demás = And
    const keyword = this.getStepKeyword(position);

    // 2. Generar texto formateado
    const formattedStep = this.formatStep(data, keyword);

    // 3. Insertar en el editor
    await this.insertIntoEditor(formattedStep, position);

    // 4. Dar feedback
    this.showFeedback(`Step inserted: ${formattedStep}`);

    return { success: true, formattedStep };
  }

  getStepKeyword(position) {
    if (!window.ideCodeMirror) {
      return 'Given'; // fallback
    }

    const doc = window.ideCodeMirror.getDoc();

    // Buscar cualquier step anterior (Given/When/Then/And/But)
    for (let i = position.line - 1; i >= 0; i--) {
      const lineText = doc.getLine(i);

      if (lineText.match(/^(Given|When|Then|And|But)\s+/)) {
        return 'And'; // Si hay steps anteriores, usar And
      }

      // Si encontramos un Scenario/Feature/Background, resetear
      if (lineText.match(/^(Scenario|Feature|Background|Scenario Outline):/)) {
        break; // Salir del loop, será el primer step
      }
    }

    return 'Given'; // Default para primer step, se ajustará después
  }

  formatStep(step, keyword) {
    // Si es el primer step, usar el keyword original del step
    if (keyword === 'Given' && step.type) {
      keyword = step.type; // Given, When, Then
    }

    // Convertir placeholders a marcadores visibles
    const formattedText = step.text.replace(/\{([^}]+)\}/g, '«$1»');

    return `${keyword} ${formattedText}`;
  }

  async insertIntoEditor(formattedStep, position) {
    const doc = window.ideCodeMirror.getDoc();

    // Insertar el step
    const textToInsert = formattedStep + '\n';
    doc.replaceRange(textToInsert, position, position);

    // Indentación manual: añadir 4 espacios si es necesario
    const lineText = doc.getLine(position.line);
    if (!lineText.startsWith('    ')) {
      const indentedText = '    ' + lineText;
      doc.replaceRange(
        indentedText,
        { line: position.line, ch: 0 },
        { line: position.line + 1, ch: 0 },
      );
    }

    // Mover cursor a la siguiente línea
    const newCursorPos = {
      line: position.line + 1,
      ch: 0,
    };

    doc.setCursor(newCursorPos);
    window.ideCodeMirror.focus();
  }
}
