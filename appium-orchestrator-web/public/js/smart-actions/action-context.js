export class ActionContext {
  constructor({
    element, // Elemento DOM clickeado
    type, // 'step' | 'json-reference' | 'multiple'
    data, // Datos del elemento (step object, json object)
    position, // Posición del cursor en editor
    selection, // Selección múltiple si aplica
    metadata = {}, // Metadata adicional
  }) {
    this.element = element;
    this.type = type;
    this.data = data;
    this.position = position;
    this.selection = selection;
    this.metadata = metadata;
    this.timestamp = Date.now();
  }

  /**
   * Extrae metadata relevante del contexto
   */
  extractMetadata() {
    return {
      branch: this.glosarioUI?.currentBranch,
      filePath: this.data?.file,
      itemType: this.type,
      hasSelection: this.selection && this.selection.length > 0,
      cursorContext: this.analyzeCursorContext(),
    };
  }

  /**
   * Analiza el contexto del cursor en el editor
   */
  analyzeCursorContext() {
    if (!window.ideCodeMirror) return { type: 'unknown' };

    const doc = window.ideCodeMirror.getDoc();
    const line = doc.getLine(this.position.line);

    return {
      line: line,
      lineContent: line,
      cursorPosition: this.position,
    };
  }

  /**
   * Verifica si el contexto es válido para ejecutar acciones
   */
  isValid() {
    return this.element && this.type && this.data && this.position;
  }

  /**
   * Clona el contexto con nuevos datos
   */
  clone(overrides = {}) {
    return new ActionContext({
      element: this.element,
      type: this.type,
      data: this.data,
      position: this.position,
      selection: this.selection,
      metadata: { ...this.metadata, ...overrides },
    });
  }
}
