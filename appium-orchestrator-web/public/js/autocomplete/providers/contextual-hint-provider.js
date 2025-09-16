// Contextual Hint Provider
// Proporciona suggestions basadas en el contexto del documento y patrones inteligentes

class ContextualHintProvider {
  constructor(glosarioService) {
    this.glosarioService = glosarioService;
    this.type = 'contextual';
  }

  async getHints(context) {
    const hints = [];
    const currentWord = context.currentWord
      ? context.currentWord.toLowerCase()
      : '';

    // Analizar el contexto del documento
    const documentContext = this.analyzeDocumentContext(context);

    // Generar sugerencias contextuales basadas en patrones
    if (documentContext.featurePattern) {
      hints.push(...this.generateFeaturePatternHints(context, documentContext));
    }

    if (documentContext.dataTablePattern) {
      hints.push(...this.generateDataTableHints(context, documentContext));
    }

    if (documentContext.docStringPattern) {
      hints.push(...this.generateDocStringHints(context, documentContext));
    }

    if (documentContext.tagPattern) {
      hints.push(...this.generateTagHints(context, documentContext));
    }

    // Sugerencias basadas en steps similares usados
    hints.push(...this.generateSimilarStepsHints(context, documentContext));

    // Filtrar por coincidencia con palabra actual
    const filteredHints = currentWord
      ? hints.filter((hint) => hint.text.toLowerCase().includes(currentWord))
      : hints;

    // Ordenar por score y limitar resultados
    const sortedHints = filteredHints.sort((a, b) => b.score - a.score);
    const limitedHints = sortedHints.slice(0, 10); // Limitar a 10 resultados

    return {
      list: limitedHints,
      from: this.getHintPosition(context),
      to: this.getHintEndPosition(context),
    };
  }

  analyzeDocumentContext(context) {
    const previousLines = context.previousLines;
    const currentLine = context.lineText;

    const documentContext = {
      featurePattern: false,
      dataTablePattern: false,
      docStringPattern: false,
      tagPattern: false,
      hasFeature: false,
      hasScenario: false,
      lastStepType: null,
      variableSuggestions: [],
    };

    // Analizar líneas anteriores para determinar patrones
    for (const line of previousLines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('Feature:')) {
        documentContext.hasFeature = true;
        documentContext.featurePattern = true;
      } else if (trimmedLine.startsWith('Scenario:')) {
        documentContext.hasScenario = true;
      } else if (trimmedLine.startsWith('@')) {
        documentContext.tagPattern = true;
      } else if (trimmedLine.startsWith('Given')) {
        documentContext.lastStepType = 'Given';
      } else if (trimmedLine.startsWith('When')) {
        documentContext.lastStepType = 'When';
      } else if (trimmedLine.startsWith('Then')) {
        documentContext.lastStepType = 'Then';
      } else if (trimmedLine.startsWith('"""')) {
        documentContext.docStringPattern = true;
      } else if (trimmedLine.startsWith('|')) {
        documentContext.dataTablePattern = true;
      }

      // Extraer variables de steps anteriores
      this.extractVariablesFromLine(line, documentContext);
    }

    // Analizar línea actual
    if (currentLine.trim().startsWith('|')) {
      documentContext.dataTablePattern = true;
    }

    return documentContext;
  }

  extractVariablesFromLine(line, documentContext) {
    // Buscar patrones de variables en steps
    const variablePatterns = [
      /"([^"]+)"/g, // Strings entre comillas
      /(\d+)/g, // Números
      /(\w+)@(\w+)/g, // Emails
    ];

    for (const pattern of variablePatterns) {
      const matches = line.match(pattern);
      if (matches) {
        documentContext.variableSuggestions.push(...matches);
      }
    }
  }

  generateFeaturePatternHints(context, documentContext) {
    const hints = [];

    if (documentContext.hasFeature && !documentContext.hasScenario) {
      // Sugerir plantilla de escenario básico
      hints.push({
        text: 'Scenario: ',
        displayText: 'Scenario: ',
        type: 'contextual',
        description: 'Crear nuevo escenario',
        score: 90,
      });

      hints.push({
        text: 'Background: ',
        displayText: 'Background: ',
        type: 'contextual',
        description: 'Crear sección de pasos comunes',
        score: 70,
      });
    }

    return hints;
  }

  generateDataTableHints(context, documentContext) {
    const hints = [];

    if (documentContext.dataTablePattern) {
      // Sugerir estructura de tabla común
      hints.push({
        text: '| header1 | header2 | header3 |',
        displayText: '| header1 | header2 | header3 |',
        type: 'contextual',
        description: 'Estructura de tabla básica',
        score: 80,
      });

      // Sugerir variables usadas anteriormente
      if (documentContext.variableSuggestions.length > 0) {
        const uniqueVars = [...new Set(documentContext.variableSuggestions)];
        const varHint = {
          text: `| ${uniqueVars.slice(0, 3).join(' | ')} |`,
          displayText: `| ${uniqueVars.slice(0, 3).join(' | ')} |`,
          type: 'contextual',
          description: 'Variables usadas anteriormente',
          score: 75,
        };
        hints.push(varHint);
      }
    }

    return hints;
  }

  generateDocStringHints(context, documentContext) {
    const hints = [];

    if (documentContext.docStringPattern) {
      hints.push({
        text: '"""',
        displayText: '"""',
        type: 'contextual',
        description: 'Cierre de docstring',
        score: 85,
      });

      hints.push({
        text: '    # contenido aquí',
        displayText: '    # contenido aquí',
        type: 'contextual',
        description: 'Contenido de docstring',
        score: 60,
      });
    }

    return hints;
  }

  generateTagHints(context, documentContext) {
    const hints = [];

    if (documentContext.tagPattern) {
      const commonTags = [
        '@smoke',
        '@regression',
        '@integration',
        '@api',
        '@ui',
        '@critical',
        '@high',
        '@medium',
        '@low',
        '@wip',
        '@mobile',
        '@desktop',
        '@chrome',
        '@firefox',
      ];

      for (const tag of commonTags) {
        hints.push({
          text: tag,
          displayText: tag,
          type: 'contextual',
          description: `Tag: ${tag.substring(1)}`,
          score: 50,
        });
      }
    }

    return hints;
  }

  generateSimilarStepsHints(context, documentContext) {
    const hints = [];
    const cachedSteps = this.glosarioService.getCachedSteps();

    if (!cachedSteps || !cachedSteps.steps || !documentContext.lastStepType) {
      return hints;
    }

    // Encontrar steps del mismo tipo usados anteriormente
    const similarSteps = cachedSteps.steps
      .filter((step) => step.type === documentContext.lastStepType)
      .slice(0, 5); // Limitar a 5 steps similares

    for (const step of similarSteps) {
      hints.push({
        text: `${step.type} ${step.text}`,
        displayText: `${step.type} ${step.text}`,
        type: 'contextual',
        description: `Step similar: ${step.file}`,
        score: 40,
      });
    }

    return hints;
  }

  calculateContextualScore(hint, context) {
    let score = hint.score || 50;

    // Ajustar score basado en la palabra actual
    if (context.currentWord) {
      const lowerHint = hint.text.toLowerCase();
      const lowerCurrentWord = context.currentWord
        ? context.currentWord.toLowerCase()
        : '';

      if (lowerHint.startsWith(lowerCurrentWord)) {
        score += 30;
      } else if (lowerHint.includes(lowerCurrentWord)) {
        score += 15;
      }
    }

    return score;
  }

  getHintPosition(context) {
    const line = context.line;
    const lineText = context.lineText;
    const cursor = context.ch;

    // Para contextual hints, generalmente van al inicio de la línea
    if (lineText.trim() === '' || cursor === 0) {
      return { line, ch: 0 };
    }

    // Para tablas, alinear con el pipe anterior
    if (lineText.includes('|')) {
      const lastPipeIndex = lineText.lastIndexOf('|');
      return { line, ch: lastPipeIndex + 1 };
    }

    // Para otros casos, usar posición actual
    return { line, ch: cursor };
  }

  getHintEndPosition(context) {
    return context.codeMirror.getCursor();
  }

  // Manejar la inserción de sugerencias contextuales
  handleHintInsertion(hint, context) {
    const cursor = context.codeMirror.getCursor();
    const fromPos = this.getHintPosition(context);
    const toPos = this.getHintEndPosition(context);

    // Insertar el texto formateado
    context.codeMirror.replaceRange(hint.text, fromPos, toPos);

    // Posicionar el cursor de manera inteligente
    let newCursorPos;
    if (hint.text.includes('"""')) {
      // Para docstring, posicionar cursor dentro
      newCursorPos = { line: cursor.line, ch: fromPos.ch + 3 };
    } else if (hint.text.startsWith('|')) {
      // Para tablas, posicionar después del primer header
      const firstPipe = hint.text.indexOf('|');
      newCursorPos = { line: cursor.line, ch: fromPos.ch + firstPipe + 2 };
    } else {
      // Para otros casos, al final del texto insertado
      newCursorPos = { line: cursor.line, ch: fromPos.ch + hint.text.length };
    }

    context.codeMirror.setCursor(newCursorPos);
  }

  destroy() {
    // Limpiar recursos si es necesario
  }
}

export default ContextualHintProvider;
