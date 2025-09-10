/**
 * Event System - Sistema de Eventos Centralizado
 *
 * Este módulo proporciona un sistema de eventos pub/sub para manejar
 * la comunicación entre componentes de manera desacoplada.
 */

import {
  logDebug,
  logError,
  AppError,
} from '../utils/error-handling.js';

/**
 * Clase principal para manejo de eventos
 */
export class EventManager {
  constructor(options = {}) {
    this.events = new Map();
    this.onceEvents = new Set();
    this.maxListeners = options.maxListeners || 100;
    this.debugMode = options.debug || false;
    this.eventHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;

    // Eventos del sistema predefinidos
    this.setupSystemEvents();
  }

  /**
   * Configura eventos del sistema
   */
  setupSystemEvents() {
    this.systemEvents = [
      'state:changed',
      'test:started',
      'test:completed',
      'test:failed',
      'progress:updated',
      'connection:established',
      'connection:lost',
      'ui:tab_changed',
      'ui:file_selected',
      'socket:message',
      'socket:error',
    ];
  }

  /**
   * Registra un listener para un evento
   */
  on(event, listener, context = null) {
    this.validateEventName(event);
    this.validateListener(listener);

    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }

    const eventListeners = this.events.get(event);

    // Validar límite de listeners
    if (eventListeners.size >= this.maxListeners) {
      throw new EventError(
        `Maximum number of listeners (${this.maxListeners}) reached for event: ${event}`,
        event,
        'on',
      );
    }

    // Envolver listener con contexto si se proporciona
    const wrappedListener = context ? listener.bind(context) : listener;
    wrappedListener._original = listener;

    eventListeners.add(wrappedListener);

    if (this.debugMode) {
      logDebug(`Listener registered for event: ${event}`, {
        totalListeners: eventListeners.size,
      });
    }

    // Retornar función para remover el listener
    return () => this.off(event, wrappedListener);
  }

  /**
   * Registra un listener que se ejecuta solo una vez
   */
  once(event, listener, context = null) {
    this.validateEventName(event);
    this.validateListener(listener);

    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener.apply(context || null, args);
    };

    onceWrapper._original = listener;
    this.onceEvents.add(onceWrapper);

    return this.on(event, onceWrapper, context);
  }

  /**
   * Remueve un listener de un evento
   */
  off(event, listener) {
    if (!this.events.has(event)) {
      return false;
    }

    const eventListeners = this.events.get(event);
    const listenerToRemove = Array.from(eventListeners).find(
      (l) => l === listener || l._original === listener,
    );

    if (listenerToRemove) {
      eventListeners.delete(listenerToRemove);
      this.onceEvents.delete(listenerToRemove);

      if (eventListeners.size === 0) {
        this.events.delete(event);
      }

      if (this.debugMode) {
        logDebug(`Listener removed from event: ${event}`);
      }

      return true;
    }

    return false;
  }

  /**
   * Emite un evento
   */
  emit(event, data = null, options = {}) {
    const { async = false, timestamp = Date.now() } = options;

    this.validateEventName(event);

    const eventData = {
      event,
      data,
      timestamp,
      emitter: options.emitter || 'system',
    };

    // Guardar en historial
    this.saveToHistory(eventData);

    if (this.debugMode) {
      logDebug(`Event emitted: ${event}`, eventData);
    }

    const listeners = this.events.get(event);
    if (!listeners || listeners.size === 0) {
      return 0;
    }

    if (async) {
      // Ejecutar listeners asíncronamente
      return this.executeAsyncListeners(listeners, eventData);
    } else {
      // Ejecutar listeners síncronamente
      return this.executeSyncListeners(listeners, eventData);
    }
  }

  /**
   * Ejecuta listeners de forma síncrona
   */
  executeSyncListeners(listeners, eventData) {
    let executedCount = 0;
    const errors = [];

    listeners.forEach((listener) => {
      try {
        listener(eventData.data, eventData);
        executedCount++;
      } catch (error) {
        errors.push({ listener, error });
        logError(`Error in listener for event: ${eventData.event}`, error);
      }
    });

    if (errors.length > 0 && this.debugMode) {
      logDebug(
        `Errors in ${eventData.event} listeners: ${errors.length}`,
        errors,
      );
    }

    return executedCount;
  }

  /**
   * Ejecuta listeners de forma asíncrona
   */
  async executeAsyncListeners(listeners, eventData) {
    const promises = Array.from(listeners).map(async (listener) => {
      try {
        await listener(eventData.data, eventData);
        return { success: true };
      } catch (error) {
        logError(
          `Error in async listener for event: ${eventData.event}`,
          error,
        );
        return { success: false, error };
      }
    });

    const results = await Promise.allSettled(promises);
    const executedCount = results.filter(
      (r) => r.status === 'fulfilled',
    ).length;

    return executedCount;
  }

  /**
   * Remueve todos los listeners de un evento o de todos los eventos
   */
  removeAllListeners(event = null) {
    if (event) {
      this.events.delete(event);
      if (this.debugMode) {
        logDebug(`All listeners removed for event: ${event}`);
      }
    } else {
      this.events.clear();
      this.onceEvents.clear();
      if (this.debugMode) {
        logDebug('All listeners removed');
      }
    }
  }

  /**
   * Obtiene la cantidad de listeners para un evento
   */
  listenerCount(event = null) {
    if (event) {
      const listeners = this.events.get(event);
      return listeners ? listeners.size : 0;
    }

    let total = 0;
    this.events.forEach((listeners) => {
      total += listeners.size;
    });
    return total;
  }

  /**
   * Obtiene los nombres de todos los eventos registrados
   */
  eventNames() {
    return Array.from(this.events.keys());
  }

  /**
   * Verifica si un evento tiene listeners
   */
  hasListeners(event) {
    return this.events.has(event) && this.events.get(event).size > 0;
  }

  /**
   * Establece el máximo número de listeners por evento
   */
  setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0) {
      throw new EventError(
        'Max listeners must be a positive number',
        '',
        'setMaxListeners',
      );
    }
    this.maxListeners = n;
  }

  /**
   * Guarda evento en el historial
   */
  saveToHistory(eventData) {
    this.eventHistory.push(eventData);

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Obtiene el historial de eventos
   */
  getHistory(filter = {}) {
    let history = [...this.eventHistory];

    if (filter.event) {
      history = history.filter((h) => h.event === filter.event);
    }

    if (filter.since) {
      history = history.filter((h) => h.timestamp >= filter.since);
    }

    if (filter.until) {
      history = history.filter((h) => h.timestamp <= filter.until);
    }

    return history;
  }

  /**
   * Limpia el historial de eventos
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Activa/desactiva modo debug
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  /**
   * Valida nombre de evento
   */
  validateEventName(event) {
    if (typeof event !== 'string' || event.trim() === '') {
      throw new EventError(
        'Event name must be a non-empty string',
        event,
        'validate',
      );
    }
  }

  /**
   * Valida que listener sea una función
   */
  validateListener(listener) {
    if (typeof listener !== 'function') {
      throw new EventError('Listener must be a function', '', 'validate');
    }
  }

  /**
   * Métodos de utilidad para eventos comunes
   */
  waitFor(event, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, handler);
        reject(
          new EventError(
            `Timeout waiting for event: ${event}`,
            event,
            'waitFor',
          ),
        );
      }, timeout);

      const handler = (data) => {
        clearTimeout(timer);
        resolve(data);
      };

      this.once(event, handler);
    });
  }

  debounce(event, delay, options = {}) {
    let timeoutId;
    let lastArgs;

    return (...args) => {
      lastArgs = args;

      clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        this.emit(event, ...lastArgs);
      }, delay);
    };
  }

  throttle(event, limit) {
    let inThrottle;

    return (...args) => {
      if (!inThrottle) {
        this.emit(event, ...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }
}

/**
 * Gestor de eventos global de la aplicación
 */
export const globalEvents = new EventManager({
  debug: false,
  maxListeners: 50,
  maxHistorySize: 500,
});

/**
 * Clase de error para manejo de eventos
 */
export class EventError extends AppError {
  constructor(message, event = '', operation = '', originalError = null) {
    super(
      message,
      'EVENT_ERROR',
      `Event operation '${operation}' failed for event: ${event}`,
      originalError,
    );
    this.name = 'EventError';
    this.event = event;
    this.operation = operation;
  }
}

/**
 * Decorador para manejo de eventos en clases
 */
export function EventEmitter(target) {
  const eventManager = new EventManager();

  target.prototype.emit = function (event, data) {
    return eventManager.emit(event, data, { emitter: this.constructor.name });
  };

  target.prototype.on = function (event, listener) {
    return eventManager.on(event, listener, this);
  };

  target.prototype.once = function (event, listener) {
    return eventManager.once(event, listener, this);
  };

  target.prototype.off = function (event, listener) {
    return eventManager.off(event, listener);
  };

  return target;
}

/**
 * Hook para usar eventos en componentes
 */
export const useEvent = (event, callback) => {
  const unsubscribe = globalEvents.on(event, callback);

  // Retornar función de limpieza
  return () => unsubscribe();
};
