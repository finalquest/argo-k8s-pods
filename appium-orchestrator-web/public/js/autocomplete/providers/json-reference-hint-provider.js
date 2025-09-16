// JSON Reference Hint Provider
// Proporciona suggestions de referencias JSON para autocompletado

class JsonReferenceHintProvider {
  constructor(glosarioService) {
    this.glosarioService = glosarioService;
    this.type = 'json';
  }

  async getHints(context) {
    console.log('🔍 JSON PROVIDER DEBUG - Context:', context);

    const cachedRefs = this.glosarioService.getCachedJsonReferences();

    if (!cachedRefs || !cachedRefs.data) {
      console.log('🔍 JSON PROVIDER DEBUG - No cached references found');
      return { list: [] };
    }

    const hints = [];
    const lineText = context.lineText;

    // EXTRAER EL PATRÓN COMPLETO ${filename.key
    let jsonPattern = '';
    const textBeforeCursor = context.textBeforeCursor || '';
    const jsonMatch = textBeforeCursor.match(/\$\{([^{}]*)$/);
    if (jsonMatch) {
      jsonPattern = jsonMatch[1]; // Extrae "newBuyUSD.t" de "${newBuyUSD.t"
    }

    // Solo activar si estamos en un contexto JSON
    const isJsonContext = this.isJsonContext(lineText, context.ch);
    console.log('🔍 JSON PROVIDER DEBUG - Is JSON context:', isJsonContext);
    console.log('🔍 JSON PROVIDER DEBUG - Line text:', `"${lineText}"`, 'Cursor:', context.ch);

    if (!isJsonContext) {
      console.log('🔍 JSON PROVIDER DEBUG - Not in JSON context, returning empty list');
      return { list: [] };
    }

    // Extraer las referencias JSON del caché
    const jsonRefs = this.extractJsonReferences(cachedRefs.data);
    console.log('🔍 JSON PROVIDER DEBUG - Extracted JSON refs:', jsonRefs);

    for (const ref of jsonRefs) {
      let shouldInclude = true;

      if (jsonPattern) {
        const lowerPattern = jsonPattern.toLowerCase();
        const lowerRef = ref.toLowerCase();

        if (jsonPattern.includes('.')) {
          // Patrón como "newBuyUSD.title" - filtrar por filename Y key
          const [filenamePart, keyPart] = lowerPattern.split('.');

          console.log(
            `🔍 Filtrando: filename="${filenamePart}", key="${keyPart}"`,
          );

          // El ref debe contener el filename
          shouldInclude = lowerRef.includes(filenamePart);

          // Si hay una key específica, también debe contener la key
          if (keyPart && keyPart.trim() !== '') {
            shouldInclude = shouldInclude && lowerRef.includes(keyPart);
            console.log(
              `🔍 ${ref} incluye ${filenamePart} y ${keyPart}: ${shouldInclude}`,
            );
          }
        } else {
          // Patrón como "title" - filtrar por cualquier coincidencia
          shouldInclude = lowerRef.includes(lowerPattern);
        }
      }

      if (!shouldInclude) {
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

    console.log('🔍 JSON PROVIDER DEBUG - All hints before filtering:', hints);

    // Ordenar por score y limitar resultados
    const sortedHints = hints.sort((a, b) => b.score - a.score);
    const limitedHints = sortedHints.slice(0, 15); // Limitar a 15 resultados

    console.log('🔍 JSON PROVIDER DEBUG - Final hints to return:', limitedHints);

    const fromPos = this.getHintPosition(context);
    const toPos = this.getHintEndPosition(context);
    console.log('🔍 JSON PROVIDER DEBUG - From position:', fromPos);
    console.log('🔍 JSON PROVIDER DEBUG - To position:', toPos);

    return {
      list: limitedHints,
      from: fromPos,
      to: toPos,
    };
  }

  isJsonContext(lineText, cursorPos) {
    const textBeforeCursor = lineText.substring(0, cursorPos);

    console.log('🔍 JSON CONTEXT DEBUG - Text before cursor:', `"${textBeforeCursor}"`);

    // Detectar diferentes contextos JSON:
    // 1. ${} para referencias JSON
    // 2. {string}, {int}, etc. para placeholders que pueden ser reemplazados
    // 3. Cualquier {} que pueda ser un contexto JSON

    // Activar si hay una llave abierta antes del cursor
    const braceCount = (textBeforeCursor.match(/\{/g) || []).length;
    const closeBraceCount = (textBeforeCursor.match(/\}/g) || []).length;

    console.log('🔍 JSON CONTEXT DEBUG - Brace count:', braceCount, 'Close brace count:', closeBraceCount);

    if (braceCount <= closeBraceCount) {
      console.log('🔍 JSON CONTEXT DEBUG - No open braces, returning false');
      return false;
    }

    // Verificar si estamos en un placeholder como {string}, {int}, etc.
    // Buscar hacia atrás para encontrar un placeholder completo o parcial
    const placeholderMatch = textBeforeCursor.match(/\{(\w+)\}$/);
    const partialPlaceholderMatch = textBeforeCursor.match(/\{(\w*)$/);

    console.log('🔍 JSON CONTEXT DEBUG - Placeholder match:', placeholderMatch);
    console.log('🔍 JSON CONTEXT DEBUG - Partial placeholder match:', partialPlaceholderMatch);

    if (placeholderMatch) {
      const placeholderType = placeholderMatch[1].toLowerCase();
      console.log('🔍 JSON CONTEXT DEBUG - Placeholder type:', placeholderType);
      // Si es un placeholder común, activar el contexto JSON
      const commonPlaceholders = [
        'string',
        'int',
        'float',
        'bool',
        'boolean',
        'number',
        'text',
        'date',
        'time',
      ];
      const isCommonPlaceholder = commonPlaceholders.includes(placeholderType);
      console.log('🔍 JSON CONTEXT DEBUG - Is common placeholder:', isCommonPlaceholder);
      if (isCommonPlaceholder) {
        return true;
      }
    }

    // También verificar si estamos dentro de un placeholder parcial
    if (partialPlaceholderMatch) {
      const partialText = partialPlaceholderMatch[1].toLowerCase();
      console.log('🔍 JSON CONTEXT DEBUG - Partial placeholder text:', partialText);

      // Verificar si el partial coincide con el inicio de algún placeholder común
      const commonPlaceholders = ['string', 'int', 'float', 'bool', 'boolean', 'number', 'text', 'date', 'time'];
      const matchesCommonPlaceholder = commonPlaceholders.some(placeholder =>
        placeholder.startsWith(partialText)
      );

      console.log('🔍 JSON CONTEXT DEBUG - Matches common placeholder start:', matchesCommonPlaceholder);

      if (matchesCommonPlaceholder) {
        return true;
      }
    }

    // Verificar si hay un patrón ${ antes del cursor
    const dollarBracePattern = textBeforeCursor.match(/\$\{[^{}]*$/);
    console.log('🔍 JSON CONTEXT DEBUG - Dollar brace pattern:', dollarBracePattern);

    if (dollarBracePattern) {
      return true;
    }

    // Por defecto, permitir contexto si hay llaves abiertas
    console.log('🔍 JSON CONTEXT DEBUG - Default case, allowing context');
    return true;
  }

  extractJsonReferences(data) {
    const references = [];

    // Extraer referencias del formato de datos real del glosario
    if (data.references) {
      for (const reference of data.references) {
        const filename = reference.filename;

        // Extraer keys del archivo
        if (reference.keys) {
          for (const keyData of reference.keys) {
            references.push(`${filename}.${keyData.key}`);
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

    // Buscar la posición de la última llave abierta
    let startPos = cursor;

    // Buscar hacia atrás para encontrar el inicio del contexto JSON
    for (let i = cursor - 1; i >= 0; i--) {
      const char = lineText[i];
      if (char === '{') {
        startPos = i;
        break;
      }
    }

    // Si encontramos una llave, incluir la llave en la selección para reemplazar completamente
    return { line, ch: startPos };
  }

  getHintEndPosition(context) {
    const line = context.line;
    const lineText = context.lineText;
    const cursor = context.ch;

    // Buscar el final del placeholder (la llave de cierre)
    let endPos = cursor;

    // Buscar hacia adelante para encontrar la llave de cierre
    for (let i = cursor; i < lineText.length; i++) {
      const char = lineText[i];
      if (char === '}') {
        endPos = i + 1; // Incluir la llave de cierre
        break;
      }
    }

    return { line, ch: endPos };
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
