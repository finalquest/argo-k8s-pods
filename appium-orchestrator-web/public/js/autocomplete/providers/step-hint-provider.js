// Step Hint Provider
// Proporciona suggestions de steps del glosario para autocompletado

class StepHintProvider {
  constructor(glosarioService) {
    this.glosarioService = glosarioService;
    this.type = 'step';
  }

  async getHints(context) {
    const cachedSteps = this.glosarioService.getCachedSteps();
    if (!cachedSteps || !cachedSteps.steps) {
      return { list: [] };
    }

    const hints = [];
    const currentWord = context.currentWord
      ? context.currentWord.toLowerCase()
      : '';
    const lineText = context.lineText.toLowerCase();

    // Determinar el tipo de step basado en el contexto
    const stepType = this.determineStepType(lineText);

    for (const step of cachedSteps.steps) {
      // Filtrar por tipo si se puede determinar
      if (stepType && step.type !== stepType) {
        continue;
      }

      // Filtrar por coincidencia con palabra actual
      if (currentWord && !step.text.toLowerCase().includes(currentWord)) {
        continue;
      }

      hints.push({
        text: this.formatStepText(step, context),
        displayText: step.text,
        type: 'step',
        description: `${step.type} • ${step.file}`,
        score: this.calculateStepScore(step, context),
        originalStep: step,
      });
    }

    // Ordenar por score y limitar resultados
    const sortedHints = hints.sort((a, b) => b.score - a.score);
    const limitedHints = sortedHints.slice(0, 20); // Limitar a 20 resultados

    return {
      list: limitedHints,
      from: this.getHintPosition(context),
      to: this.getHintEndPosition(context),
    };
  }

  determineStepType(lineText) {
    if (lineText.startsWith('given ')) return 'Given';
    if (lineText.startsWith('when ')) return 'When';
    if (lineText.startsWith('then ')) return 'Then';
    if (lineText.startsWith('and ')) return 'And';
    if (lineText.startsWith('but ')) return 'But';
    return null;
  }

  formatStepText(step, context) {
    const cursor = context.ch;
    const lineStart = context.lineText.substring(0, cursor);

    // Si la línea ya comienza con un keyword, solo agregar el step text
    if (this.lineHasKeyword(lineStart)) {
      return step.text;
    }

    // Determinar el keyword apropiado basado en el contexto (misma lógica que smart actions)
    const keyword = this.getStepKeyword(context, step.type);
    return `${keyword} ${step.text}`;
  }

  getStepKeyword(context, originalStepType) {
    if (!context.codeMirror) {
      return originalStepType; // fallback al tipo original
    }

    const doc = context.codeMirror.getDoc();
    const currentLine = context.line;

    // Buscar cualquier step anterior (Given/When/Then/And/But)
    for (let i = currentLine - 1; i >= 0; i--) {
      const lineText = doc.getLine(i);

      // Regex mejorado que detecta steps con o sin indentación
      if (lineText.match(/^\s*(Given|When|Then|And|But)\s+/)) {
        return 'And'; // Si hay steps anteriores, usar And
      }

      // Si encontramos un Scenario/Feature/Background, resetear
      if (
        lineText.match(/^\s*(Scenario|Feature|Background|Scenario Outline):/)
      ) {
        break; // Salir del loop, será el primer step
      }
    }

    // Si no hay steps anteriores, usar el keyword original del step
    return originalStepType;
  }

  lineHasKeyword(text) {
    const keywords = ['Given ', 'When ', 'Then ', 'And ', 'But '];
    return keywords.some((keyword) => text.trim().startsWith(keyword));
  }

  calculateStepScore(step, context) {
    let score = 0;

    // Score base por tipo
    const typeScores = { Given: 100, When: 90, Then: 80, And: 70, But: 60 };
    score += typeScores[step.type] || 50;

    // Score por coincidencia exacta con palabra actual
    if (context.currentWord) {
      const lowerText = step.text.toLowerCase();
      const lowerCurrentWord = context.currentWord
        ? context.currentWord.toLowerCase()
        : '';

      if (lowerText.startsWith(lowerCurrentWord)) {
        score += 50;
      } else if (lowerText.includes(lowerCurrentWord)) {
        score += 30;
      }
    }

    // Score por contexto de línea
    const lineText = context.lineText.toLowerCase();
    if (lineText.includes(step.type.toLowerCase())) {
      score += 25;
    }

    // Score por archivo (priorizar steps de archivos comunes)
    const commonFiles = ['common_steps.js', 'shared_steps.js', 'base_steps.js'];
    if (commonFiles.some((file) => step.file.includes(file))) {
      score += 15;
    }

    // Score por longitud del step (preferir steps más específicos)
    if (step.text.length > 20) {
      score += 10;
    }

    return score;
  }

  getHintPosition(context) {
    const line = context.line;
    const lineText = context.lineText;

    // Si la línea ya tiene un keyword, posicionarse después del keyword
    const keywordMatch = lineText.match(/^\s*(Given|When|Then|And|But)\s+/);
    if (keywordMatch) {
      return { line, ch: keywordMatch[0].length };
    }

    // Si no hay keyword, posicionarse al inicio de la línea
    return { line, ch: 0 };
  }

  getHintEndPosition(context) {
    return context.codeMirror.getCursor();
  }

  // Manejar la inserción del step seleccionado
  handleHintInsertion(hint, context) {
    const cursor = context.codeMirror.getCursor();
    const fromPos = this.getHintPosition(context);
    const toPos = this.getHintEndPosition(context);

    // Reemplazar el texto existente con el step formateado
    context.codeMirror.replaceRange(hint.text, fromPos, toPos);

    // Posicionar el cursor al final del step insertado
    const endPos = { line: cursor.line, ch: fromPos.ch + hint.text.length };
    context.codeMirror.setCursor(endPos);
  }

  destroy() {
    // Limpiar recursos si es necesario
  }
}

export default StepHintProvider;
