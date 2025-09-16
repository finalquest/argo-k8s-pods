import { BaseAction } from '../base-action.js';

export class InsertJsonReferenceAction extends BaseAction {
  constructor() {
    super();
    this.type = 'insert-json-reference';
    this.icon = '🔗';
    this.label = 'Insert JSON Reference';
    this.shortcut = 'Ctrl+J';
    this.applicableContexts = ['json-reference'];
  }

  async execute(context) {
    const validation = this.validate(context);
    if (validation.length > 0) {
      throw new Error(`Validation failed: ${validation.join(', ')}`);
    }

    const { data, position } = context;

    // 1. Obtener la referencia JSON (filename.key)
    const jsonReference = this.getJsonReference(data);

    // 2. Encontrar placeholders cerca del cursor
    const placeholders = this.findNearbyPlaceholders(position);

    if (placeholders.length === 0) {
      this.showErrorFeedback('No {placeholder} found near cursor');
      return { success: false, error: 'No placeholders found' };
    }

    // 3. Seleccionar el placeholder más cercano
    const targetPlaceholder = this.selectClosestPlaceholder(placeholders);

    // 4. Mostrar feedback visual del placeholder seleccionado
    this.highlightTargetPlaceholder(targetPlaceholder, placeholders.length);

    // Pequeña pausa para que el usuario vea el placeholder seleccionado
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 5. Reemplazar el placeholder
    await this.replacePlaceholder(targetPlaceholder, jsonReference);

    // 6. Mostrar feedback visual del reemplazo
    this.showReplacementFeedback(targetPlaceholder, jsonReference);

    // 7. Mover cursor al próximo placeholder si existe
    await this.moveToNextPlaceholder(targetPlaceholder, placeholders);

    // 8. Mostrar feedback mejorado
    this.showEnhancedFeedback(
      targetPlaceholder,
      jsonReference,
      placeholders.length,
    );

    return {
      success: true,
      replacedAt: targetPlaceholder,
      jsonReference: jsonReference,
      totalFound: placeholders.length,
    };
  }

  /**
   * Genera la referencia JSON completa (filename.key)
   */
  getJsonReference(data) {
    // El filename viene del contexto (extraído del elemento padre)
    const fileName = data.file || 'unknown';
    const keyName = data.key;
    return `${fileName}.${keyName}`;
  }

  /**
   * Encuentra todos los placeholders {string} cerca del cursor
   */
  findNearbyPlaceholders(position) {
    if (!window.ideCodeMirror) {
      return [];
    }

    const doc = window.ideCodeMirror.getDoc();
    const allPlaceholders = [];

    // Estrategia mucho más restrictiva: solo buscar en la misma línea y la línea siguiente
    const searchLines = [position.line, position.line + 1];

    for (const lineNum of searchLines) {
      // Validar que la línea existe
      if (lineNum < 0 || lineNum >= doc.lineCount()) {
        continue;
      }

      const lineText = doc.getLine(lineNum);
      const regex = /\{[^}]+\}/g; // Cualquier cosa entre {}
      let match;

      // Encontrar todos los placeholders en esta línea
      while ((match = regex.exec(lineText)) !== null) {
        const placeholderStart = match.index;
        const placeholderEnd = match.index + match[0].length;

        // Calcular distancia Manhattan real: diferencia de líneas + distancia de caracteres
        const lineDistance = Math.abs(lineNum - position.line);
        const charDistance =
          position.ch >= placeholderStart && position.ch <= placeholderEnd
            ? 0
            : Math.min(
                Math.abs(placeholderStart - position.ch),
                Math.abs(placeholderEnd - position.ch),
              );

        // Priorizar: misma línea y cerca del cursor
        const totalDistance = lineDistance * 1000 + charDistance;

        allPlaceholders.push({
          line: lineNum,
          start: placeholderStart,
          end: placeholderEnd,
          distance: totalDistance,
          text: match[0],
        });
      }
    }

    // Ordenar por distancia (mismo línea cerca primero, luego línea siguiente)
    return allPlaceholders.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Selecciona el placeholder más cercano al cursor
   */
  selectClosestPlaceholder(placeholders) {
    // Los placeholders ya están ordenados por distancia
    // En caso de empate, tomar el primero (más arriba a la izquierda)
    return placeholders[0];
  }

  /**
   * Mueve el cursor al próximo placeholder disponible
   */
  async moveToNextPlaceholder(replacedPlaceholder, allPlaceholders) {
    if (!window.ideCodeMirror || allPlaceholders.length <= 1) {
      return; // No hay más placeholders o no hay editor
    }

    const doc = window.ideCodeMirror.getDoc();

    // Estrategia mejorada: buscar el próximo placeholder en orden de lectura
    const nextPlaceholder = this.findNextPlaceholderInReadingOrder(
      replacedPlaceholder,
      allPlaceholders,
    );

    if (nextPlaceholder) {
      // Mover cursor al inicio del próximo placeholder
      const nextCursorPos = {
        line: nextPlaceholder.line,
        ch: nextPlaceholder.start,
      };

      doc.setCursor(nextCursorPos);
      window.ideCodeMirror.focus();

      // Seleccionar el placeholder para visualización
      doc.setSelection(nextCursorPos, {
        line: nextPlaceholder.line,
        ch: nextPlaceholder.end,
      });
    }
  }

  /**
   * Encuentra el próximo placeholder en orden natural de lectura
   */
  findNextPlaceholderInReadingOrder(replacedPlaceholder, allPlaceholders) {
    // Estrategia más estricta: solo buscar en la misma línea y línea siguiente
    // Filtrar placeholders cercanos (los que ya encontró findNearbyPlaceholders)

    // Primero: buscar en la misma línea después del placeholder reemplazado
    const sameLinePlaceholders = allPlaceholders.filter(
      (p) =>
        p.line === replacedPlaceholder.line &&
        p.start > replacedPlaceholder.end,
    );

    if (sameLinePlaceholders.length > 0) {
      // Tomar el siguiente más cercano en la misma línea
      return sameLinePlaceholders.sort((a, b) => a.start - b.start)[0];
    }

    // Segundo: buscar en la línea siguiente
    const nextLinePlaceholders = allPlaceholders.filter(
      (p) => p.line === replacedPlaceholder.line + 1,
    );

    if (nextLinePlaceholders.length > 0) {
      // Tomar el primero de la línea siguiente (orden natural de lectura)
      return nextLinePlaceholders.sort((a, b) => a.start - b.start)[0];
    }

    // Tercero: si no hay más placeholders cercanos, no mover el cursor
    return null;
  }

  /**
   * Reemplaza un placeholder específico con la referencia JSON
   */
  async replacePlaceholder(placeholder, jsonReference) {
    if (!window.ideCodeMirror) {
      throw new Error('Editor not available');
    }

    const doc = window.ideCodeMirror.getDoc();

    // Posiciones para el reemplazo
    const startPos = { line: placeholder.line, ch: placeholder.start };
    const endPos = { line: placeholder.line, ch: placeholder.end };

    // Realizar el reemplazo con comillas
    const quotedReference = `"${jsonReference}"`;
    doc.replaceRange(quotedReference, startPos, endPos);

    // Mover cursor después del texto insertado
    const newCursorPos = {
      line: placeholder.line,
      ch: placeholder.start + quotedReference.length,
    };

    doc.setCursor(newCursorPos);
    window.ideCodeMirror.focus();
  }

  /**
   * Muestra feedback mejorado con información sobre placeholders restantes
   */
  showEnhancedFeedback(placeholder, jsonReference, totalFound) {
    const feedback = document.createElement('div');
    feedback.className = 'smart-action-feedback placeholder-replaced';

    const remainingCount = totalFound - 1;
    const hasMore = remainingCount > 0;

    feedback.innerHTML = `
      <div class="feedback-content">
        <span class="feedback-icon">✓</span>
        <div class="feedback-message">
          <span class="feedback-text">Replaced placeholder at line ${placeholder.line + 1}</span>
          <span class="feedback-reference">with: ${jsonReference}</span>
          ${
            hasMore
              ? `
            <span class="feedback-hint">
              💡 Cursor moved to next placeholder - click to continue
            </span>
          `
              : ''
          }
        </div>
      </div>
    `;

    document.body.appendChild(feedback);

    // Auto-eliminar después de 4 segundos
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
      }
    }, 4000);
  }

  /**
   * Muestra mensaje de error mejorado
   */
  showErrorFeedback(message) {
    const feedback = document.createElement('div');
    feedback.className = 'smart-action-feedback error';
    feedback.innerHTML = `
      <div class="feedback-content">
        <span class="feedback-icon">⚠</span>
        <span class="feedback-text">${message}</span>
        <span class="feedback-hint">Move cursor closer to a {placeholder}</span>
      </div>
    `;

    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 4000);
  }

  /**
   * Resalta visualmente el placeholder que será reemplazado
   */
  highlightTargetPlaceholder(placeholder, totalFound) {
    if (!window.ideCodeMirror) {
      return;
    }

    const doc = window.ideCodeMirror.getDoc();

    // Crear un marcador temporal para resaltar el placeholder
    const startPos = { line: placeholder.line, ch: placeholder.start };
    const endPos = { line: placeholder.line, ch: placeholder.end };

    // Resaltar el placeholder con un fondo amarillo
    const marker = doc.markText(startPos, endPos, {
      className: 'smart-action-target-highlight',
      attributes: {
        title: `Placeholder a reemplazar (${totalFound} encontrados)`,
      },
    });

    // Auto-eliminar el resaltado después de 2 segundos
    setTimeout(() => {
      marker.clear();
    }, 2000);

    // Asegurar que el placeholder sea visible en el editor
    window.ideCodeMirror.scrollIntoView(startPos, 100);
  }

  /**
   * Muestra feedback visual mejorado después del reemplazo
   */
  showReplacementFeedback(replacedPlaceholder, jsonReference) {
    if (!window.ideCodeMirror) {
      return;
    }

    const doc = window.ideCodeMirror.getDoc();

    // Crear un marcador temporal para mostrar dónde se hizo el reemplazo
    const startPos = {
      line: replacedPlaceholder.line,
      ch: replacedPlaceholder.start,
    };
    const endPos = {
      line: replacedPlaceholder.line,
      ch: replacedPlaceholder.start + jsonReference.length + 2,
    }; // +2 por las comillas

    // Resaltar el texto reemplazado con un fondo verde
    const marker = doc.markText(startPos, endPos, {
      className: 'smart-action-replacement-highlight',
      attributes: {
        title: `Reemplazado con: ${jsonReference}`,
      },
    });

    // Auto-eliminar el resaltado después de 3 segundos
    setTimeout(() => {
      marker.clear();
    }, 3000);
  }

  /**
   * Validación adicional para contexto JSON
   */
  validate(context) {
    const errors = super.validate(context);

    if (!context.data || !context.data.key) {
      errors.push('Invalid JSON reference data');
    }

    if (!window.ideCodeMirror) {
      errors.push('CodeMirror editor not available');
    }

    return errors;
  }
}
