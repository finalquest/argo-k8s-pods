// Autocomplete Service
// Gestiona la lógica principal de autocompletado en CodeMirror

import StepHintProvider from './providers/step-hint-provider.js';
import GherkinKeywordHintProvider from './providers/gherkin-keyword-provider.js';
import ContextualHintProvider from './providers/contextual-hint-provider.js';
import HintWidget from './hint-widget.js';

class AutocompleteService {
  constructor(glosarioService, codeMirror) {
    this.glosarioService = glosarioService;
    this.codeMirror = codeMirror;
    this.providers = [];
    this.hintWidget = new HintWidget(this);
    this.hintOptions = {
      completeSingle: false,
      closeOnUnfocus: true,
      alignWithWord: true,
      customHint: this.renderCustomHint.bind(this),
    };
    this.isAutoTriggerEnabled = true;
    this.debounceTimer = null;
    this.cursorActivityTimer = null;

    // Nuevas propiedades para modo persistente
    this.persistentUpdateTimer = null;
    this.lastContext = null;
    this.lastHints = null;

    this.initializeProviders();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
  }

  initializeProviders() {
    this.providers = [
      new StepHintProvider(this.glosarioService),
      new GherkinKeywordHintProvider(),
      new ContextualHintProvider(this.glosarioService),
    ];
  }

  setupEventListeners() {
    // Configurar event listeners para triggers de autocompletado
    this.codeMirror.on('change', (instance, change) => {
      this.handleTextChange(instance, change);
    });

    this.codeMirror.on('cursorActivity', () => {
      this.handleCursorActivity();
    });
  }

  setupKeyboardShortcuts() {
    // Configurar shortcut para activación manual (Ctrl+Space)
    const extraKeys = this.codeMirror.getOption('extraKeys') || {};

    extraKeys['Ctrl-Space'] = () => {
      this.triggerManualAutocomplete();
    };

    extraKeys['Ctrl- '] = () => {
      this.triggerManualAutocomplete();
    };

    this.codeMirror.setOption('extraKeys', extraKeys);

    // También configurar en el nivel del documento para mejor compatibilidad
    this.keydownHandler = (event) => {
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        this.triggerManualAutocomplete();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  handleTextChange(instance, change) {
    // Limpiar timer existente
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce para evitar múltiples activaciones
    this.debounceTimer = setTimeout(() => {
      if (!this.isAutoTriggerEnabled) {
        return;
      }

      // Detectar patrones de activación automática - validar que change exista
      if (!change || !change.from) {
        return;
      }

      // NUEVO: Actualización en tiempo real para modo persistente
      // No salir early - permitir que los auto-triggers funcionen junto con el modo persistente
      if (this.hintWidget.isPersistentMode && this.hintWidget.isVisible) {
        this.schedulePersistentUpdate();
        // No return aquí - permitir que los auto-triggers también se ejecuten
      }

      const { from } = change;
      const line = this.codeMirror.getLine(from.line);
      const cursorPos = from.ch;

      // Auto-trigger para Gherkin keywords
      const gherkinTrigger = this.isGherkinKeywordTrigger(line, cursorPos);

      // Auto-trigger para patrones de contexto
      const contextualTrigger = this.isContextualTrigger(line, cursorPos);

      if (gherkinTrigger || contextualTrigger) {
        this.showHints();
      }
    }, 300); // 300ms de debounce
  }

  handleCursorActivity() {
    // Limpiar timer existente para cursor activity
    if (this.cursorActivityTimer) {
      clearTimeout(this.cursorActivityTimer);
    }

    // Debounce para evitar múltiples activaciones por movimiento de cursor
    this.cursorActivityTimer = setTimeout(() => {
      // Cursor activity handling sin triggers específicos
    }, 200); // 200ms de debounce para cursor activity
  }

  isGherkinKeywordTrigger(line, cursorPos) {
    const textBeforeCursor = line.substring(0, cursorPos);

    // Patrones más flexibles que funcionan con indentación
    const patterns = [
      /Given\s+$/, // "Given " al final (justo después de espacio)
      /When\s+$/, // "When " al final
      /Then\s+$/, // "Then " al final
      /And\s+$/, // "And " al final
      /But\s+$/, // "But " al final

      // Patrones que no requieren word boundary (funcionan con espacios al inicio)
      /(?:^|\s)Given\s+/, // "Given " precedido por inicio de línea o espacio
      /(?:^|\s)When\s+/, // "When " precedido por inicio de línea o espacio
      /(?:^|\s)Then\s+/, // "Then " precedido por inicio de línea o espacio
      /(?:^|\s)And\s+/, // "And " precedido por inicio de línea o espacio
      /(?:^|\s)But\s+/, // "But " precedido por inicio de línea o espacio

      // También aceptar solo el keyword sin espacio (para cuando están escribiendo)
      /(?:^|\s)Given$/, // "Given" al final (sin espacio aún)
      /(?:^|\s)When$/,
      /(?:^|\s)Then$/,
      /(?:^|\s)And$/,
      /(?:^|\s)But$/,
    ];

    return patterns.some((pattern) => pattern.test(textBeforeCursor));
  }

  isContextualTrigger(line, cursorPos) {
    const textBeforeCursor = line.substring(0, cursorPos);

    // Trigger para líneas vacías después de un Scenario
    if (textBeforeCursor.trim() === '') {
      const previousLine = this.getPreviousLine(cursorPos.line);
      if (previousLine && previousLine.trim().startsWith('Scenario:')) {
        return true;
      }
    }

    // Trigger para inicio de nueva línea en contexto de steps
    if (cursorPos <= 1) {
      const previousLines = this.getPreviousLines(cursorPos.line);
      const hasSteps = previousLines.some((line) =>
        ['Given', 'When', 'Then', 'And', 'But'].some((keyword) =>
          line.trim().startsWith(keyword),
        ),
      );

      if (hasSteps) {
        return true;
      }
    }

    return false;
  }

  getPreviousLine(lineNumber) {
    if (lineNumber > 0) {
      return this.codeMirror.getLine(lineNumber - 1);
    }
    return null;
  }

  async showHints() {
    // Ocultar widget existente si está visible
    if (this.hintWidget.isVisible) {
      this.hintWidget.hide();
    }

    const context = this.buildContext();
    const hints = await this.getHints(context);

    if (hints && hints.list.length > 0) {
      // Usar nuestro widget personalizado en lugar del showHint de CodeMirror
      this.hintWidget.show(hints.list, hints.from, hints.to);

      // Importante: Los auto-triggers NO activan modo persistente
      // Solo Ctrl+Space activa modo persistente en triggerManualAutocomplete()
    }
  }

  buildContext() {
    const cursor = this.codeMirror.getCursor();
    const line = this.codeMirror.getLine(cursor.line);
    const textBeforeCursor = line.substring(0, cursor.ch);
    const textAfterCursor = line.substring(cursor.ch);

    return {
      line: cursor.line,
      ch: cursor.ch,
      lineText: line,
      textBeforeCursor,
      textAfterCursor,
      currentWord: this.getCurrentWord(textBeforeCursor),
      previousLines: this.getPreviousLines(cursor.line),
      nextLines: this.getNextLines(cursor.line),
      codeMirror: this.codeMirror,
    };
  }

  getCurrentWord(textBeforeCursor) {
    const match = textBeforeCursor.match(/(\w+)$/);
    return match ? match[1] : '';
  }

  getPreviousLines(currentLine) {
    const lines = [];
    for (let i = Math.max(0, currentLine - 3); i < currentLine; i++) {
      lines.push(this.codeMirror.getLine(i));
    }
    return lines;
  }

  getNextLines(currentLine) {
    const lines = [];
    const totalLines = this.codeMirror.lineCount();
    for (
      let i = currentLine + 1;
      i < Math.min(totalLines, currentLine + 3);
      i++
    ) {
      lines.push(this.codeMirror.getLine(i));
    }
    return lines;
  }

  async getHints(context) {
    const allHints = [];
    let fromPos = null;
    let toPos = null;

    for (const provider of this.providers) {
      try {
        const providerHints = await provider.getHints(context);

        if (providerHints && providerHints.list.length > 0) {
          // Si el provider provee posiciones from/to, usarlas para calcular la posición general
          if (providerHints.from && providerHints.to) {
            fromPos = fromPos
              ? this.getEarlierPosition(fromPos, providerHints.from)
              : providerHints.from;
            toPos = toPos
              ? this.getLaterPosition(toPos, providerHints.to)
              : providerHints.to;
          }

          // Agregar los hints conservando sus posiciones originales si existen
          const hintsWithPositions = providerHints.list.map((hint) => ({
            ...hint,
            from: hint.from || providerHints.from,
            to: hint.to || providerHints.to,
          }));

          allHints.push(...hintsWithPositions);
        }
      } catch (error) {
        console.error('Error getting hints from provider:', error);
      }
    }

    // Ordenar hints por relevancia
    const sortedHints = this.sortHintsByRelevance(allHints, context);

    // Si no se encontraron posiciones específicas, usar la posición actual del cursor
    const currentPos = this.codeMirror.getCursor();
    const finalResult = {
      list: sortedHints,
      from: fromPos || currentPos,
      to: toPos || currentPos,
    };

    return finalResult;
  }

  getEarlierPosition(pos1, pos2) {
    // Compara posiciones y devuelve la más temprana
    if (pos1.line < pos2.line) return pos1;
    if (pos1.line > pos2.line) return pos2;
    return pos1.ch < pos2.ch ? pos1 : pos2;
  }

  getLaterPosition(pos1, pos2) {
    // Compara posiciones y devuelve la más tardía
    if (pos1.line > pos2.line) return pos1;
    if (pos1.line < pos2.line) return pos2;
    return pos1.ch > pos2.ch ? pos1 : pos2;
  }

  sortHintsByRelevance(hints, context) {
    return hints.sort((a, b) => {
      // Priorizar por tipo y coincidencia con contexto
      const aScore = this.calculateHintScore(a, context);
      const bScore = this.calculateHintScore(b, context);
      return bScore - aScore;
    });
  }

  calculateHintScore(hint, context) {
    let score = 0;

    // Score por tipo
    const typeScores = {
      step: 100,
      keyword: 80,
      contextual: 60,
    };
    score += typeScores[hint.type] || 0;

    // Score por coincidencia con palabra actual
    if (
      context.currentWord &&
      hint.text.toLowerCase().includes(context.currentWord.toLowerCase())
    ) {
      score += 50;
    }

    // Score por contexto
    if (this.isContextuallyRelevant(hint, context)) {
      score += 30;
    }

    return score;
  }

  isContextuallyRelevant(hint, context) {
    // Lógica contextual para determinar relevancia
    const lineText = context.lineText.toLowerCase();

    if (hint.type === 'step') {
      return (
        lineText.includes('given') ||
        lineText.includes('when') ||
        lineText.includes('then')
      );
    }

    return true;
  }

  renderCustomHint(hint) {
    // Widget personalizado para mostrar hints con categorización visual
    const element = document.createElement('div');
    element.className = `autocomplete-hint autocomplete-hint-${hint.type}`;

    const icon = this.getIconForType(hint.type);
    element.innerHTML = `${icon} ${hint.text}`;

    if (hint.description) {
      const description = document.createElement('div');
      description.className = 'autocomplete-hint-description';
      description.textContent = hint.description;
      element.appendChild(description);
    }

    return element;
  }

  getIconForType(type) {
    const icons = {
      step: '📝',
      keyword: '🏷️',
      contextual: '💡',
    };
    return icons[type] || '💬';
  }

  // Método público para activar autocompletado manualmente (Ctrl+Space)
  async triggerManualAutocomplete() {
    await this.showHints();
    // NUEVO: Activar modo persistente para Ctrl+Space
    if (this.hintWidget.isVisible) {
      this.hintWidget.setPersistentMode(true);
    }
  }

  // Métodos públicos para control del autocompletado
  enableAutoTrigger() {
    this.isAutoTriggerEnabled = true;
  }

  disableAutoTrigger() {
    this.isAutoTriggerEnabled = false;
  }

  toggleAutoTrigger() {
    this.isAutoTriggerEnabled = !this.isAutoTriggerEnabled;
    return this.isAutoTriggerEnabled;
  }

  /**
   * Programa una actualización persistente (usado en modo persistente)
   */
  schedulePersistentUpdate() {
    if (this.persistentUpdateTimer) {
      clearTimeout(this.persistentUpdateTimer);
    }

    this.persistentUpdateTimer = setTimeout(() => {
      this.updateHintsInRealTime();
    }, 100); // 100ms para respuestas rápidas
  }

  /**
   * Actualiza hints en tiempo real (para modo persistente)
   */
  async updateHintsInRealTime() {
    const context = this.buildContext();

    // Optimización: si el contexto no cambió significativamente, reusar resultados
    if (this.lastContext && this.isContextSimilar(this.lastContext, context)) {
      return;
    }

    try {
      const hints = await this.getHints(context);

      if (hints && hints.list.length > 0 && this.hintWidget.isVisible) {
        this.hintWidget.updateHints(hints.list, hints.from, hints.to);
      }

      // Cache para optimización
      this.lastContext = context;
      this.lastHints = hints;
    } catch (error) {
      console.error('Error updating hints in real time:', error);
    }
  }

  /**
   * Compara si dos contextos son similares (para optimización)
   */
  isContextSimilar(context1, context2) {
    return (
      context1.line === context2.line &&
      context1.ch === context2.ch &&
      context1.lineText === context2.lineText
    );
  }

  // Limpiar recursos
  destroy() {
    // Limpiar providers
    this.providers.forEach((provider) => {
      if (provider.destroy) {
        provider.destroy();
      }
    });
    this.providers = [];

    // Limpiar widget
    if (this.hintWidget) {
      this.hintWidget.destroy();
      this.hintWidget = null;
    }

    // Limpiar timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.cursorActivityTimer) {
      clearTimeout(this.cursorActivityTimer);
      this.cursorActivityTimer = null;
    }

    // NUEVO: Limpiar timers de modo persistente
    if (this.persistentUpdateTimer) {
      clearTimeout(this.persistentUpdateTimer);
      this.persistentUpdateTimer = null;
    }

    this.lastContext = null;
    this.lastHints = null;

    // Remover event listeners
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }
}

export default AutocompleteService;
