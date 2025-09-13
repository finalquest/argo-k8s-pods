/**
 * Global Service Registry Access
 * 
 * Hace el serviceRegistry disponible globalmente para compatibilidad
 * y facilita el acceso a los servicios comúnmente utilizados
 */

import { serviceRegistry } from './service-registry.js';

// Hacer el serviceRegistry disponible globalmente
if (typeof window !== 'undefined') {
  window.serviceRegistry = serviceRegistry;
}

// Funciones de conveniencia globales
if (typeof window !== 'undefined') {
  window.getService = (name) => serviceRegistry.get(name);
  window.registerService = (name, service) => serviceRegistry.register(name, service);
  window.hasService = (name) => serviceRegistry.has(name);
}

export { serviceRegistry };