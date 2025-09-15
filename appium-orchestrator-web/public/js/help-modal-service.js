// Help Modal Service
// Gestiona el modal de ayuda para autocompletado y glosario

class HelpModalService {
  constructor() {
    this.modal = null;
    this.closeBtn = null;
    this.gotItBtn = null;
    this.helpBtn = null;

    this.init();
  }

  init() {
    // Esperar a que el DOM esté cargado
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupHelpModal());
    } else {
      this.setupHelpModal();
    }
  }

  setupHelpModal() {
    // Obtener elementos del DOM
    this.modal = document.getElementById('help-modal');
    this.closeBtn = document.getElementById('help-modal-close');
    this.gotItBtn = document.getElementById('help-got-it-btn');
    this.helpBtn = document.getElementById('help-btn');

    if (!this.modal || !this.helpBtn) {
      console.warn('Help modal elements not found');
      return;
    }

    // Configurar event listeners
    this.setupEventListeners();

    console.log('Help modal service initialized');
  }

  setupEventListeners() {
    // Abrir modal al hacer clic en el botón de ayuda
    this.helpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showHelp();
    });

    // Cerrar modal con el botón X
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideHelp();
      });
    }

    // Cerrar modal con el botón "¡Entendido!"
    if (this.gotItBtn) {
      this.gotItBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideHelp();
      });
    }

    // Cerrar modal al hacer clic fuera del contenido
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hideHelp();
      }
    });

    // Cerrar modal con la tecla Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isHelpVisible()) {
        this.hideHelp();
      }
    });

    // Prevenir que el modal cierre cuando se hace clic dentro del contenido
    const modalContent = this.modal.querySelector('.help-modal-content');
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  showHelp() {
    if (!this.modal) return;

    // Mostrar el modal
    this.modal.style.display = 'block';

    // Prevenir scrolling del body
    document.body.style.overflow = 'hidden';

    // Hacer foco en el modal para accesibilidad
    this.modal.setAttribute('aria-hidden', 'false');
    this.modal.focus();

    // Animación de entrada
    setTimeout(() => {
      this.modal.classList.add('show');
    }, 10);

    console.log('Help modal shown');

    // Disparar evento personalizado
    this.dispatchEvent('help:shown');
  }

  hideHelp() {
    if (!this.modal) return;

    // Animación de salida
    this.modal.classList.remove('show');

    // Esperar a que termine la animación
    setTimeout(() => {
      this.modal.style.display = 'none';

      // Restaurar scrolling del body
      document.body.style.overflow = '';

      // Restaurar atributo de accesibilidad
      this.modal.setAttribute('aria-hidden', 'true');

      // Devolver foco al botón de ayuda
      if (this.helpBtn) {
        this.helpBtn.focus();
      }

      console.log('Help modal hidden');

      // Disparar evento personalizado
      this.dispatchEvent('help:hidden');
    }, 200); // Coincide con la duración de la animación CSS
  }

  isHelpVisible() {
    return this.modal && this.modal.style.display === 'block';
  }

  toggleHelp() {
    if (this.isHelpVisible()) {
      this.hideHelp();
    } else {
      this.showHelp();
    }
  }

  // Navegación dentro del modal (opcional - para secciones)
  scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }

  // Métodos de accesibilidad
  trapFocus() {
    const focusableElements = this.modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    this.modal.addEventListener('keydown', handleKeyDown);

    // Guardar referencia para limpieza
    this.focusTrapHandler = handleKeyDown;
  }

  removeFocusTrap() {
    if (this.focusTrapHandler) {
      this.modal.removeEventListener('keydown', this.focusTrapHandler);
      this.focusTrapHandler = null;
    }
  }

  // Utilidad para disparar eventos personalizados
  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail: detail,
      bubbles: true,
      cancelable: true
    });

    this.modal.dispatchEvent(event);

    // También disparar en document para global listeners
    document.dispatchEvent(event);
  }

  // Método para mostrar secciones específicas
  showSection(sectionName) {
    this.showHelp();

    // Esperar a que el modal sea visible
    setTimeout(() => {
      const sections = this.modal.querySelectorAll('.help-section');
      sections.forEach(section => {
        const title = section.querySelector('.help-section-title');
        if (title && title.textContent.toLowerCase().includes(sectionName.toLowerCase())) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });

          // Resaltar la sección brevemente
          section.style.transition = 'background-color 0.3s ease';
          section.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';

          setTimeout(() => {
            section.style.backgroundColor = '';
          }, 2000);
        }
      });
    }, 300);
  }

  // Limpiar recursos
  destroy() {
    if (this.helpBtn) {
      this.helpBtn.removeEventListener('click', this.showHelp);
    }

    if (this.closeBtn) {
      this.closeBtn.removeEventListener('click', this.hideHelp);
    }

    if (this.gotItBtn) {
      this.gotItBtn.removeEventListener('click', this.hideHelp);
    }

    if (this.modal) {
      this.modal.removeEventListener('click', this.hideHelp);
      this.removeFocusTrap();
    }

    document.removeEventListener('keydown', this.hideHelp);

    this.modal = null;
    this.closeBtn = null;
    this.gotItBtn = null;
    this.helpBtn = null;

    console.log('Help modal service destroyed');
  }
}

// Exportar como singleton
const helpModalService = new HelpModalService();

// Exportar para uso en otros módulos
export default helpModalService;

// También exportar la clase para casos de uso avanzados
export { HelpModalService };