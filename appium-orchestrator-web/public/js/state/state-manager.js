/**
 * Simple State Manager - Gestor de Estado Simplificado
 *
 * Versión simplificada que solo incluye lo que realmente usa el código:
 * - getState() para obtener el estado completo
 * - setState(object) para actualizar propiedades
 * - subscribe(path, callback) para escuchar cambios
 */

import { logDebug, logError } from '../utils/error-handling.js';

export class StateManager {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.listeners = new Map();
    this.debugMode = false;
  }

  /**
   * Obtiene el estado completo
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Actualiza el estado con un objeto (estilo React setState)
   */
  setState(stateObject, options = {}) {
    const { silent = false } = options;

    try {
      const oldState = { ...this.state };

      // Actualizar el estado
      this.state = { ...this.state, ...stateObject };

      if (!silent) {
        // Notificar a los listeners de las propiedades que cambiaron
        Object.keys(stateObject).forEach((key) => {
          if (oldState[key] !== stateObject[key]) {
            this.notifyListeners(key, stateObject[key], oldState[key]);
          }
        });
      }

      if (this.debugMode) {
        logDebug('State updated:', {
          changed: Object.keys(stateObject),
          newState: this.state,
        });
      }

      return true;
    } catch (error) {
      logError('Failed to set state:', error);
      return false;
    }
  }

  /**
   * Registra un listener para cambios en una propiedad específica
   */
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }

    this.listeners.get(path).add(callback);

    // Retornar función para unsuscribirse
    return () => {
      const pathListeners = this.listeners.get(path);
      if (pathListeners) {
        pathListeners.delete(callback);
        if (pathListeners.size === 0) {
          this.listeners.delete(path);
        }
      }
    };
  }

  /**
   * Notifica a los listeners sobre cambios
   */
  notifyListeners(path, newValue, oldValue) {
    const pathListeners = this.listeners.get(path);
    if (pathListeners) {
      pathListeners.forEach((callback) => {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          logError(`Error in state listener for path: ${path}`, error);
        }
      });
    }
  }

  /**
   * Activa/desactiva modo debug
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
}
