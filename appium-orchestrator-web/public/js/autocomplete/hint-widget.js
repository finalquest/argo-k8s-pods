// Hint Widget Custom Component
// Componente UI personalizado para mostrar suggestions de autocompletado

class HintWidget {
  constructor(autocompleteService) {
    this.autocompleteService = autocompleteService;
    this.currentHints = [];
    this.selectedIndex = -1;
    this.widgetElement = null;
    this.isVisible = false;
  }

  show(hints, from, to) {
    this.currentHints = hints.map((hint) => ({
      ...hint,
      from,
      to,
    }));
    this.selectedIndex = -1;

    if (this.widgetElement) {
      this.hide();
    }

    this.createWidget(hints, from);
    this.isVisible = true;
  }

  hide() {
    if (this.widgetElement && this.widgetElement.parentNode) {
      this.widgetElement.parentNode.removeChild(this.widgetElement);
    }
    this.widgetElement = null;
    this.isVisible = false;
    this.currentHints = [];
    this.selectedIndex = -1;
  }

  createWidget(hints, from) {
    const editor = this.autocompleteService.codeMirror;
    const coords = editor.charCoords(from, 'local');

    // Crear elemento principal del widget
    this.widgetElement = document.createElement('div');
    this.widgetElement.className = 'autocomplete-widget';
    this.widgetElement.style.position = 'absolute';
    this.widgetElement.style.left = `${coords.left}px`;
    this.widgetElement.style.top = `${coords.bottom + 2}px`;
    this.widgetElement.style.zIndex = '1000';

    // Crear contenedor de hints
    const hintsContainer = document.createElement('div');
    hintsContainer.className = 'autocomplete-hints-container';

    // Agregar cada hint al contenedor
    hints.forEach((hint, index) => {
      const hintElement = this.createHintElement(hint, index);
      hintsContainer.appendChild(hintElement);
    });

    this.widgetElement.appendChild(hintsContainer);

    // Agregar widget al DOM
    editor.getWrapperElement().appendChild(this.widgetElement);

    // Configurar event listeners
    this.setupEventListeners();
  }

  createHintElement(hint, index) {
    const hintElement = document.createElement('div');
    hintElement.className = `autocomplete-hint autocomplete-hint-${hint.type}`;
    hintElement.dataset.index = index;

    // Contenido principal del hint
    const contentElement = document.createElement('div');
    contentElement.className = 'autocomplete-hint-content';

    // Icono según el tipo
    const icon = this.getIconForType(hint.type);
    const iconElement = document.createElement('span');
    iconElement.className = 'autocomplete-hint-icon';
    iconElement.textContent = icon;
    contentElement.appendChild(iconElement);

    // Texto del hint
    const textElement = document.createElement('span');
    textElement.className = 'autocomplete-hint-text';
    textElement.textContent = hint.displayText || hint.text;
    contentElement.appendChild(textElement);

    hintElement.appendChild(contentElement);

    // Descripción si existe
    if (hint.description) {
      const descriptionElement = document.createElement('div');
      descriptionElement.className = 'autocomplete-hint-description';
      descriptionElement.textContent = hint.description;
      hintElement.appendChild(descriptionElement);
    }

    // Event listeners
    hintElement.addEventListener('click', () => {
      this.selectHint(index);
      this.insertHint(this.currentHints[index]);
    });
    hintElement.addEventListener('mouseenter', () => this.selectHint(index));

    return hintElement;
  }

  getIconForType(type) {
    const icons = {
      step: '📝',
      json: '🔗',
      keyword: '🏷️',
      contextual: '💡',
    };
    return icons[type] || '💬';
  }

  selectHint(index) {
    if (index < 0 || index >= this.currentHints.length) {
      return;
    }

    // Remover selección anterior
    if (this.selectedIndex >= 0) {
      const prevElement = this.widgetElement.querySelector(
        `[data-index="${this.selectedIndex}"]`,
      );
      if (prevElement) {
        prevElement.classList.remove('selected');
      }
    }

    this.selectedIndex = index;

    // Agregar selección nueva
    const currentElement = this.widgetElement.querySelector(
      `[data-index="${index}"]`,
    );
    if (currentElement) {
      currentElement.classList.add('selected');
      this.ensureVisible(currentElement);
    }
  }

  ensureVisible(element) {
    const container = this.widgetElement.querySelector(
      '.autocomplete-hints-container',
    );
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    // Scroll hacia arriba si es necesario
    if (elementRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - elementRect.top;
    }

    // Scroll hacia abajo si es necesario
    if (elementRect.bottom > containerRect.bottom) {
      container.scrollTop += elementRect.bottom - containerRect.bottom;
    }
  }

  moveSelection(direction) {
    if (!this.isVisible || this.currentHints.length === 0) {
      return null;
    }

    let newIndex;
    if (direction === 'down') {
      newIndex =
        this.selectedIndex < this.currentHints.length - 1
          ? this.selectedIndex + 1
          : 0;
    } else if (direction === 'up') {
      newIndex =
        this.selectedIndex > 0
          ? this.selectedIndex - 1
          : this.currentHints.length - 1;
    } else {
      return null;
    }

    this.selectHint(newIndex);
    return this.currentHints[newIndex];
  }

  getSelectedHint() {
    if (
      this.selectedIndex >= 0 &&
      this.selectedIndex < this.currentHints.length
    ) {
      return this.currentHints[this.selectedIndex];
    }
    return null;
  }

  setupEventListeners() {
    const editor = this.autocompleteService.codeMirror;

    // Listener para teclado - usar event capture para interceptar todos los eventos
    const keyHandler = (event) => {
      if (!this.isVisible) {
        return;
      }

      // Interceptamos TODOS los eventos de teclado cuando el widget está visible
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case 'Tab':
        case 'Escape':
          // Estos eventos son manejados completamente por nosotros
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          if (event.key === 'ArrowDown') {
            this.moveSelection('down');
          } else if (event.key === 'ArrowUp') {
            this.moveSelection('up');
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            const selectedHint = this.getSelectedHint();
            if (selectedHint) {
              this.insertHint(selectedHint);
            } else {
              this.hide();
            }
          } else if (event.key === 'Escape') {
            this.hide();
          }
          return false; // Prevenir cualquier otro procesamiento

        default:
          // Para otros eventos, decidir si dejamos que el editor los maneje
          if (
            event.key.length === 1 && // Teclas de caracteres
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.shiftKey // Permitir Shift+letras
          ) {
            // Si el usuario escribe texto, ocultar el widget y dejar que el editor maneje el evento
            this.hide();
            return true; // Dejar que el editor procese el evento
          }

          // Para otras teclas (Backspace, Delete, Home, End, etc.), ocultar widget y dejar pasar
          if (
            [
              'Backspace',
              'Delete',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          ) {
            this.hide();
            return true;
          }

          // Para cualquier otro evento, prevenir que afecte al editor
          event.preventDefault();
          event.stopPropagation();
          return false;
      }
    };

    // Agregar listener con useCapture=true para interceptar antes que CodeMirror
    editor.getWrapperElement().addEventListener('keydown', keyHandler, true);

    // También agregar listener al documento para mayor seguridad
    document.addEventListener('keydown', keyHandler, true);

    // Guardar referencia para limpieza
    this.keyHandler = keyHandler;

    // Listener para click fuera
    const outsideClickHandler = (event) => {
      if (this.widgetElement && !this.widgetElement.contains(event.target)) {
        this.hide();
      }
    };

    document.addEventListener('click', outsideClickHandler);
    this.outsideClickHandler = outsideClickHandler;
  }

  insertHint(hint) {
    const editor = this.autocompleteService.codeMirror;
    const doc = editor.getDoc();

    // Obtener posiciones de inserción
    let fromPos, toPos;

    if (hint.from && hint.to) {
      fromPos = hint.from;
      toPos = hint.to;
    } else {
      fromPos = editor.getCursor();
      toPos = editor.getCursor();
    }

    // Insertar el hint con salto de línea
    const textToInsert = hint.text + '\n';
    editor.replaceRange(textToInsert, fromPos, toPos);

    // Aplicar indentación manual (misma lógica que smart actions y glosario)
    const lineText = doc.getLine(fromPos.line);
    if (!lineText.startsWith('    ')) {
      const indentedText = '    ' + lineText;
      doc.replaceRange(
        indentedText,
        { line: fromPos.line, ch: 0 },
        { line: fromPos.line + 1, ch: 0 },
      );
    }

    // Mover cursor a la siguiente línea
    const newCursorPos = {
      line: fromPos.line + 1,
      ch: 0,
    };
    editor.setCursor(newCursorPos);

    // Ocultar widget
    this.hide();

    // Dar foco al editor
    editor.focus();
  }

  removeEventListeners() {
    if (this.keyHandler) {
      const editor = this.autocompleteService.codeMirror;
      editor
        .getWrapperElement()
        .removeEventListener('keydown', this.keyHandler, true);
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }

    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
  }

  destroy() {
    this.hide();
    this.removeEventListeners();
    this.autocompleteService = null;
    this.currentHints = [];
  }
}

export default HintWidget;
