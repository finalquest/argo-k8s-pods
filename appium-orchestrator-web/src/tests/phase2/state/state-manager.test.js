import { StateManager } from '@public/js/state/state-manager.js';

describe('Simple State Manager', () => {
  let stateManager;

  beforeEach(() => {
    stateManager = new StateManager({
      activeFeature: null,
      currentUser: null,
      isLoading: false,
      config: null,
    });
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('inicializa con estado personalizado', () => {
      const state = stateManager.getState();
      
      expect(state.activeFeature).toBeNull();
      expect(state.currentUser).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.config).toBeNull();
    });
  });

  describe('getState()', () => {
    test('retorna copia del estado completo', () => {
      const state = stateManager.getState();
      
      expect(state).toBeDefined();
      expect(typeof state).toBe('object');
      expect(state).toEqual(stateManager.state);
      
      // Verificar que es una copia, no la referencia
      expect(state).not.toBe(stateManager.state);
    });
  });

  describe('setState()', () => {
    test('actualiza propiedades individuales', () => {
      stateManager.setState({ isLoading: true });
      
      expect(stateManager.getState().isLoading).toBe(true);
      expect(stateManager.getState().currentUser).toBeNull();
    });

    test('actualiza múltiples propiedades', () => {
      stateManager.setState({
        isLoading: true,
        currentUser: { name: 'test' },
        config: { persistentWorkspacesEnabled: true }
      });
      
      const state = stateManager.getState();
      expect(state.isLoading).toBe(true);
      expect(state.currentUser).toEqual({ name: 'test' });
      expect(state.config).toEqual({ persistentWorkspacesEnabled: true });
    });

    test('mergea con estado existente', () => {
      stateManager.setState({
        currentUser: { name: 'test' },
        config: { enabled: true }
      });
      
      // Solo actualizar una propiedad, las otras deben permanecer
      stateManager.setState({ config: { enabled: false } });
      
      const state = stateManager.getState();
      expect(state.currentUser).toEqual({ name: 'test' });
      expect(state.config).toEqual({ enabled: false });
    });

    test('notifica a los listeners cuando hay cambios', () => {
      const mockListener = jest.fn();
      stateManager.subscribe('isLoading', mockListener);
      
      stateManager.setState({ isLoading: true });
      
      expect(mockListener).toHaveBeenCalledWith(true, false, 'isLoading');
    });

    test('no notifica si la propiedad no cambió', () => {
      const mockListener = jest.fn();
      stateManager.subscribe('isLoading', mockListener);
      
      stateManager.setState({ isLoading: false }); // Mismo valor
      
      expect(mockListener).not.toHaveBeenCalled();
    });

    test('puede actualizar sin notificar (silent)', () => {
      const mockListener = jest.fn();
      stateManager.subscribe('isLoading', mockListener);
      
      stateManager.setState({ isLoading: true }, { silent: true });
      
      expect(mockListener).not.toHaveBeenCalled();
      expect(stateManager.getState().isLoading).toBe(true);
    });
  });

  describe('subscribe()', () => {
    test('registra listener para propiedad específica', () => {
      const mockListener = jest.fn();
      const unsubscribe = stateManager.subscribe('isLoading', mockListener);
      
      expect(typeof unsubscribe).toBe('function');
      
      stateManager.setState({ isLoading: true });
      
      expect(mockListener).toHaveBeenCalledTimes(1);
    });

    test('puede unsuscribirse', () => {
      const mockListener = jest.fn();
      const unsubscribe = stateManager.subscribe('isLoading', mockListener);
      
      unsubscribe();
      
      stateManager.setState({ isLoading: true });
      
      expect(mockListener).not.toHaveBeenCalled();
    });

    test('maneja múltiples listeners para misma propiedad', () => {
      const mockListener1 = jest.fn();
      const mockListener2 = jest.fn();
      
      stateManager.subscribe('isLoading', mockListener1);
      stateManager.subscribe('isLoading', mockListener2);
      
      stateManager.setState({ isLoading: true });
      
      expect(mockListener1).toHaveBeenCalledTimes(1);
      expect(mockListener2).toHaveBeenCalledTimes(1);
    });

    test('solo llama listeners de propiedades que cambiaron', () => {
      const loadingListener = jest.fn();
      const userListener = jest.fn();
      
      stateManager.subscribe('isLoading', loadingListener);
      stateManager.subscribe('currentUser', userListener);
      
      stateManager.setState({ isLoading: true });
      
      expect(loadingListener).toHaveBeenCalledTimes(1);
      expect(userListener).not.toHaveBeenCalled();
    });
  });

  describe('manejo de errores', () => {
    test('maneja errores en listeners', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      stateManager.subscribe('isLoading', errorListener);
      stateManager.subscribe('isLoading', goodListener);
      
      // No debería lanzar error, solo manejarlo
      expect(() => {
        stateManager.setState({ isLoading: true });
      }).not.toThrow();
      
      expect(goodListener).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('setDebugMode()', () => {
    test('puede activar y desactivar modo debug', () => {
      expect(stateManager.debugMode).toBe(false);
      
      stateManager.setDebugMode(true);
      expect(stateManager.debugMode).toBe(true);
      
      stateManager.setDebugMode(false);
      expect(stateManager.debugMode).toBe(false);
    });
  });

  describe('caso de uso real', () => {
    test('simula el flujo real de la aplicación', () => {
      // Simular el estado inicial como en main.js
      const appState = new StateManager({
        activeFeature: null,
        currentUser: null,
        selectedBranch: '',
        selectedClient: '',
        isLoading: false,
        config: null,
        localDevices: [],
        lastError: null,
      });

      // Simular listeners como en main.js
      const loadingListener = jest.fn();
      const errorListener = jest.fn();
      
      appState.subscribe('isLoading', loadingListener);
      appState.subscribe('lastError', errorListener);

      // Simular checkAuthStatus
      appState.setState({ isLoading: true });
      expect(loadingListener).toHaveBeenCalledWith(true, false, 'isLoading');
      
      appState.setState({ 
        isLoading: false, 
        currentUser: { name: 'testuser' } 
      });
      expect(loadingListener).toHaveBeenCalledWith(false, true, 'isLoading');

      // Simular carga de dispositivos
      appState.setState({ isLoading: true });
      appState.setState({ 
        isLoading: false, 
        localDevices: ['device1', 'device2'] 
      });

      // Verificar estado final
      const finalState = appState.getState();
      expect(finalState.currentUser).toEqual({ name: 'testuser' });
      expect(finalState.localDevices).toEqual(['device1', 'device2']);
      expect(finalState.isLoading).toBe(false);
    });
  });
});