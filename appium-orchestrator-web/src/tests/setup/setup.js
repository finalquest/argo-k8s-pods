import '@testing-library/jest-dom';

// Mocks básicos para el entorno de testing
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

// Mock DOM básico
global.document = {
  getElementById: jest.fn(),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  createElement: jest.fn(() => ({
    style: {},
    className: '',
    innerHTML: '',
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }))
};

global.window = {
  ...window,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  location: { href: '' },
  dispatchEvent: jest.fn()
};

// Mock funciones globales comunes
global.fetch = jest.fn();
global.alert = jest.fn();
global.setTimeout = jest.fn();
global.clearTimeout = jest.fn();
global.setInterval = jest.fn();
global.clearInterval = jest.fn();

// Mock para CodeMirror (usado en el proyecto)
global.CodeMirror = jest.fn(() => ({
  setValue: jest.fn(),
  getValue: jest.fn(() => ''),
  on: jest.fn(),
  off: jest.fn(),
  setOption: jest.fn(),
  getOption: jest.fn(() => ''),
  lineCount: jest.fn(() => 0),
  getLine: jest.fn(() => ''),
  addLineClass: jest.fn(),
  removeLineClass: jest.fn(),
  setGutterMarker: jest.fn(),
  markClean: jest.fn(),
  clearHistory: jest.fn(),
  setSize: jest.fn(),
  getWrapperElement: jest.fn(() => ({ classList: { add: jest.fn(), remove: jest.fn() } }))
}));

// Limpiar mocks después de cada test
beforeEach(() => {
  jest.clearAllMocks();
});

// Mock para modules externos (se añadirán cuando se necesiten)
// Por ahora, solo necesitamos lo básico para las pruebas de humo