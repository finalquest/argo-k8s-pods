// JSON Reference Hint Provider
// Proporciona suggestions de referencias JSON para autocompletado

class JsonReferenceHintProvider {
  constructor(glosarioService) {
    this.glosarioService = glosarioService;
    this.type = 'json';
  }

  async getHints(context) {
    const cachedRefs = this.glosarioService.getCachedJsonReferences();
    if (!cachedRefs || !cachedRefs.data) {
      return { list: [] };
    }

    const hints = [];
    const currentWord = context.currentWord
      ? context.currentWord.toLowerCase()
      : '';
    const lineText = context.lineText;

    // Solo activar si estamos en un contexto JSON
    if (!this.isJsonContext(lineText, context.ch)) {
      return { list: [] };
    }

    // Extraer las referencias JSON del caché
    const jsonRefs = this.extractJsonReferences(cachedRefs.data);

    for (const ref of jsonRefs) {
      // Filtrar por coincidencia con palabra actual
      if (currentWord && !ref.toLowerCase().includes(currentWord)) {
        continue;
      }

      hints.push({
        text: this.formatJsonReference(ref, context),
        displayText: ref,
        type: 'json',
        description: 'JSON Reference',
        score: this.calculateJsonScore(ref, context),
        originalRef: ref,
      });
    }

    // Ordenar por score y limitar resultados
    const sortedHints = hints.sort((a, b) => b.score - a.score);
    const limitedHints = sortedHints.slice(0, 15); // Limitar a 15 resultados

    return {
      list: limitedHints,
      from: this.getHintPosition(context),
      to: this.getHintEndPosition(context),
    };
  }

  isJsonContext(lineText, cursorPos) {
    const textBeforeCursor = lineText.substring(0, cursorPos);

    // Activar si hay una llave abierta antes del cursor
    const braceCount = (textBeforeCursor.match(/\{/g) || []).length;
    const closeBraceCount = (textBeforeCursor.match(/\}/g) || []).length;

    return braceCount > closeBraceCount;
  }

  extractJsonReferences(data) {
    const references = [];

    // Extraer referencias del formato de datos del glosario
    if (data.files) {
      for (const [filename, fileData] of Object.entries(data.files)) {
        if (fileData.references) {
          for (const reference of fileData.references) {
            references.push(`${filename}.${reference}`);
          }
        }
      }
    }

    return references;
  }

  formatJsonReference(ref, context) {
    // Formatear la referencia JSON con comillas si es necesario
    const cursor = context.ch;
    const lineText = context.lineText;
    const textBeforeCursor = lineText.substring(0, cursor);

    // Si no hay comillas antes del cursor, agregarlas
    const needsQuotes = !textBeforeCursor.endsWith('"');

    if (needsQuotes) {
      return `"${ref}"`;
    }

    return ref;
  }

  calculateJsonScore(ref, context) {
    let score = 0;

    // Score base
    score += 80;

    // Score por coincidencia exacta con palabra actual
    if (context.currentWord) {
      const lowerRef = ref.toLowerCase();
      const lowerCurrentWord = context.currentWord
        ? context.currentWord.toLowerCase()
        : '';

      if (lowerRef.startsWith(lowerCurrentWord)) {
        score += 50;
      } else if (lowerRef.includes(lowerCurrentWord)) {
        score += 30;
      }
    }

    // Score por popularidad del archivo
    const filename = ref.split('.')[0];
    const commonFiles = ['config', 'settings', 'data', 'test', 'fixtures'];
    if (commonFiles.some((file) => filename.toLowerCase().includes(file))) {
      score += 20;
    }

    // Score por longitud del path (preferir rutas más cortas)
    const pathParts = ref.split('.');
    if (pathParts.length <= 3) {
      score += 15;
    }

    // Score por contexto
    const lineText = context.lineText.toLowerCase();
    if (lineText.includes('json') || lineText.includes('data')) {
      score += 10;
    }

    return score;
  }

  getHintPosition(context) {
    const line = context.line;
    const lineText = context.lineText;
    const cursor = context.ch;

    // Buscar la posición de la última llave abierta o inicio de string
    let startPos = cursor;

    // Buscar hacia atrás para encontrar el inicio del contexto JSON
    for (let i = cursor - 1; i >= 0; i--) {
      const char = lineText[i];
      if (char === '{' || char === '"' || char === ':') {
        startPos = i + 1;
        break;
      }
    }

    return { line, ch: startPos };
  }

  getHintEndPosition(context) {
    return context.codeMirror.getCursor();
  }

  // Manejar la inserción de la referencia JSON seleccionada
  handleHintInsertion(hint, context) {
    const cursor = context.codeMirror.getCursor();
    const fromPos = this.getHintPosition(context);
    const toPos = this.getHintEndPosition(context);

    // Reemplazar el texto existente con la referencia formateada
    context.codeMirror.replaceRange(hint.text, fromPos, toPos);

    // Posicionar el cursor al final de la referencia insertada
    const endPos = { line: cursor.line, ch: fromPos.ch + hint.text.length };
    context.codeMirror.setCursor(endPos);
  }

  destroy() {
    // Limpiar recursos si es necesario
  }
}

export default JsonReferenceHintProvider;
