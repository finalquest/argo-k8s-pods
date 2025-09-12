class ThemeManager {
  constructor() {
    this.currentTheme = this.getStoredTheme() || this.getPreferredTheme();
    this.init();
  }

  init() {
    // Aplicar tema inicial
    this.applyTheme(this.currentTheme);

    // Configurar event listeners
    this.setupEventListeners();

    // Observar cambios de sistema
    this.setupSystemThemeObserver();
  }

  getStoredTheme() {
    return localStorage.getItem('theme');
  }

  getPreferredTheme() {
    // Verificar preferencia del sistema
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  }

  setStoredTheme(theme) {
    localStorage.setItem('theme', theme);
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.currentTheme = theme;
    this.updateToggleUI();

    // Disparar evento personalizado
    window.dispatchEvent(
      new CustomEvent('themeChanged', { detail: { theme } }),
    );
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
    this.setStoredTheme(newTheme);
  }

  updateToggleUI() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    const icon = toggle.querySelector('.theme-icon');
    const text = toggle.querySelector('.theme-text');

    if (this.currentTheme === 'dark') {
      icon.textContent = '🌞';
      text.textContent = 'Light';
      toggle.title = 'Cambiar a tema claro';
    } else {
      icon.textContent = '🌙';
      text.textContent = 'Dark';
      toggle.title = 'Cambiar a tema oscuro';
    }
  }

  setupEventListeners() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggleTheme());
    }

    // Escuchar cambios de tema de sistema
    if (window.matchMedia) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', (e) => {
          if (!this.getStoredTheme()) {
            // Solo cambiar si el usuario no ha establecido preferencia
            this.applyTheme(e.matches ? 'dark' : 'light');
          }
        });
    }
  }

  setupSystemThemeObserver() {
    // Opcional: Observar cambios en tiempo real
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        console.log(`System theme changed to: ${e.matches ? 'dark' : 'light'}`);
      });
    }
  }

  // Método para obtener colores programáticamente
  getThemeColors() {
    const computedStyle = getComputedStyle(document.documentElement);
    return {
      primary: computedStyle.getPropertyValue('--primary-color').trim(),
      background: computedStyle.getPropertyValue('--gray-50').trim(),
      text: computedStyle.getPropertyValue('--gray-900').trim(),
      border: computedStyle.getPropertyValue('--gray-200').trim(),
    };
  }
}

// Exportar para uso en otros módulos
export default ThemeManager;

// Crear instancia global cuando se carga el módulo
let themeManager;

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    themeManager = new ThemeManager();
    window.themeManager = themeManager;
  });
} else {
  // El DOM ya está cargado
  themeManager = new ThemeManager();
  window.themeManager = themeManager;
}
