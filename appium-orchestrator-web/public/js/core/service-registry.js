/**
 * Service Registry - Registro de Servicios Centralizado
 *
 * Gestor centralizado para registrar y acceder a los servicios de la aplicación
 * en lugar de usar variables globales window.xxx
 */

import { logDebug } from '../utils/error-handling.js';

export class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.debugMode = false;
  }

  /**
   * Registra un servicio
   */
  register(name, service) {
    if (this.services.has(name)) {
      logDebug(`Service '${name}' already registered, overwriting`);
    }

    this.services.set(name, service);

    if (this.debugMode) {
      logDebug(`Service registered: ${name}`, { service });
    }
  }

  /**
   * Obtiene un servicio registrado
   */
  get(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not registered`);
    }

    return this.services.get(name);
  }

  /**
   * Verifica si un servicio está registrado
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * Elimina un servicio registrado
   */
  unregister(name) {
    const removed = this.services.delete(name);

    if (removed && this.debugMode) {
      logDebug(`Service unregistered: ${name}`);
    }

    return removed;
  }

  /**
   * Obtiene todos los servicios registrados
   */
  getAll() {
    return Object.fromEntries(this.services);
  }

  /**
   * Limpia todos los servicios
   */
  clear() {
    this.services.clear();

    if (this.debugMode) {
      logDebug('All services cleared');
    }
  }

  /**
   * Activa/desactiva modo debug
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
}

/**
 * Registro global de servicios
 */
export const serviceRegistry = new ServiceRegistry();

/**
 * Funciones de conveniencia para acceder a los servicios
 */
export const getService = (name) => serviceRegistry.get(name);
export const registerService = (name, service) =>
  serviceRegistry.register(name, service);
export const hasService = (name) => serviceRegistry.has(name);

/**
 * Alias para compatibilidad con código existente
 * (se eliminarán gradualmente)
 */
export const createLegacyAliases = () => {
  // Crear aliases temporales para compatibilidad
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'glosarioService', {
      get() {
        console.warn(
          'Deprecated: Use serviceRegistry.get("glosario") instead of window.glosarioService',
        );
        return serviceRegistry.get('glosario');
      },
      set(value) {
        console.warn(
          'Deprecated: Use serviceRegistry.register("glosario", service) instead of window.glosarioService',
        );
        serviceRegistry.register('glosario', value);
      },
    });

    Object.defineProperty(window, 'glosarioUI', {
      get() {
        console.warn(
          'Deprecated: Use serviceRegistry.get("glosarioUI") instead of window.glosarioUI',
        );
        return serviceRegistry.get('glosarioUI');
      },
      set(value) {
        console.warn(
          'Deprecated: Use serviceRegistry.register("glosarioUI", service) instead of window.glosarioUI',
        );
        serviceRegistry.register('glosarioUI', value);
      },
    });
  }
};
