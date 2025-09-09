/**
 * Error Handling Utilities - Utilidades para manejo de errores
 *
 * Este módulo proporciona funciones centralizadas para el manejo de errores,
 * logging y alertas, reduciendo la duplicación de código y mejorando
 * la consistencia en el manejo de errores en toda la aplicación.
 */

/**
 * Maneja errores de API de manera estandarizada
 * @param {Error|Object} error - Error o objeto de error
 * @param {string} context - Contexto donde ocurrió el error
 * @returns {null} Siempre retorna null para uso en retornos tempranos
 */
export const handleApiError = (error, context = 'API call') => {
  if (!error) {
    console.warn('handleApiError: se proporcionó un error nulo o indefinido');
    return null;
  }

  // Registrar el error en la consola con contexto
  console.error(`${context} failed:`, error);

  // Mostrar alerta al usuario con información útil
  let userMessage = `${context} failed`;

  if (error.message) {
    userMessage += `: ${error.message}`;
  } else if (typeof error === 'string') {
    userMessage += `: ${error}`;
  } else if (error.status) {
    userMessage += `: Status ${error.status}`;
  } else {
    userMessage += '. Please check the console for details.';
  }

  alert(userMessage);

  return null;
};

/**
 * Maneja errores de UI de manera estandarizada
 * @param {Error|Object} error - Error o objeto de error
 * @param {string} context - Contexto donde ocurrió el error
 * @param {boolean} showAlert - Si mostrar alerta al usuario (default: true)
 * @returns {null} Siempre retorna null para uso en retornos tempranos
 */
export const handleUiError = (
  error,
  context = 'UI operation',
  showAlert = true,
) => {
  if (!error) {
    console.warn('handleUiError: se proporcionó un error nulo o indefinido');
    return null;
  }

  // Registrar el error en la consola
  console.error(`${context} failed:`, error);

  // Mostrar alerta si se solicita
  if (showAlert) {
    let userMessage = `${context} failed`;

    if (error.message) {
      userMessage += `: ${error.message}`;
    } else if (typeof error === 'string') {
      userMessage += `: ${error}`;
    }

    alert(userMessage);
  }

  return null;
};

/**
 * Maneja errores de red de manera estandarizada
 * @param {Error|Object} error - Error o objeto de error
 * @param {string} context - Contexto donde ocurrió el error
 * @returns {null} Siempre retorna null para uso en retornos tempranos
 */
export const handleNetworkError = (error, context = 'Network request') => {
  if (!error) {
    console.warn(
      'handleNetworkError: se proporcionó un error nulo o indefinido',
    );
    return null;
  }

  // Registrar el error en la consola
  console.error(`${context} failed:`, error);

  // Mensajes específicos para errores de red
  let userMessage = `${context} failed`;

  if (error.message && error.message.includes('Network Error')) {
    userMessage =
      'Network connection failed. Please check your internet connection and try again.';
  } else if (error.message && error.message.includes('timeout')) {
    userMessage = 'Request timed out. Please try again later.';
  } else if (error.status === 401) {
    userMessage = 'Authentication failed. Please log in again.';
  } else if (error.status === 403) {
    userMessage = 'You do not have permission to perform this action.';
  } else if (error.status === 404) {
    userMessage = 'The requested resource was not found.';
  } else if (error.status >= 500) {
    userMessage = 'Server error occurred. Please try again later.';
  } else if (error.message) {
    userMessage += `: ${error.message}`;
  } else {
    userMessage += '. Please try again.';
  }

  alert(userMessage);

  return null;
};

/**
 * Registra advertencias en la consola de manera estandarizada
 * @param {string} message - Mensaje de advertencia
 * @param {any} data - Datos adicionales para logging (opcional)
 */
export const logWarning = (message, data = null) => {
  if (!message || typeof message !== 'string') {
    console.warn('logWarning: se requiere un mensaje de advertencia válido');
    return;
  }

  if (data !== null) {
    console.warn(message, data);
  } else {
    console.warn(message);
  }
};

/**
 * Registra información de depuración en la consola
 * @param {string} message - Mensaje de información
 * @param {any} data - Datos adicionales para logging (opcional)
 */
export const logDebug = (message, data = null) => {
  if (!message || typeof message !== 'string') {
    console.warn('logDebug: se requiere un mensaje de depuración válido');
    return;
  }

  if (data !== null) {
    console.log(`[DEBUG] ${message}`, data);
  } else {
    console.log(`[DEBUG] ${message}`);
  }
};

/**
 * Registra errores en la consola de manera estandarizada
 * @param {string} message - Mensaje de error
 * @param {any} data - Datos adicionales para logging (opcional)
 */
export const logError = (message, data = null) => {
  if (!message || typeof message !== 'string') {
    console.warn('logError: se requiere un mensaje de error válido');
    return;
  }

  if (data !== null) {
    console.error(`[ERROR] ${message}`, data);
  } else {
    console.error(`[ERROR] ${message}`);
  }
};

/**
 * Crea y retorna un nuevo error con contexto adicional
 * @param {string} message - Mensaje de error
 * @param {string} context - Contexto del error
 * @param {Error} originalError - Error original (opcional)
 * @returns {Error} Nuevo error con contexto
 */
export const createError = (message, context = '', originalError = null) => {
  const fullMessage = context ? `${context}: ${message}` : message;
  const error = new Error(fullMessage);

  if (originalError) {
    error.originalError = originalError;
    error.stack = originalError.stack;
  }

  return error;
};

/**
 * Valida que un valor no sea nulo o indefinido
 * @param {any} value - Valor a validar
 * @param {string} name - Nombre del parámetro para el mensaje de error
 * @throws {Error} Si el valor es nulo o indefinido
 */
export const validateRequired = (value, name) => {
  if (value === null || value === undefined) {
    throw createError(
      `Required parameter '${name}' is null or undefined`,
      'Validation',
    );
  }
};

/**
 * Valida que un valor sea del tipo correcto
 * @param {any} value - Valor a validar
 * @param {string} type - Tipo esperado ('string', 'number', 'boolean', 'object', 'function')
 * @param {string} name - Nombre del parámetro para el mensaje de error
 * @throws {Error} Si el valor no es del tipo esperado
 */
export const validateType = (value, type, name) => {
  const actualType = Array.isArray(value) ? 'array' : typeof value;

  if (actualType !== type) {
    throw createError(
      `Parameter '${name}' must be of type '${type}', but got '${actualType}'`,
      'Validation',
    );
  }
};

/**
 * Ejecuta una función de manera segura con manejo de errores
 * @param {Function} fn - Función a ejecutar
 * @param {string} context - Contexto para el manejo de errores
 * @param {any} defaultValue - Valor a retornar en caso de error (opcional)
 * @returns {any} Resultado de la función o defaultValue en caso de error
 */
export const safeExecute = (fn, context = 'Operation', defaultValue = null) => {
  try {
    return fn();
  } catch (error) {
    handleUiError(error, context, false); // No mostrar alerta, solo log
    return defaultValue;
  }
};

/**
 * Maneja errores asíncronos de manera estandarizada
 * @param {Function} asyncFn - Función asíncrona a ejecutar
 * @param {string} context - Contexto para el manejo de errores
 * @returns {Promise<any>} Promesa que resuelve con el resultado o rechaza con el error
 */
export const handleAsyncError = async (
  asyncFn,
  context = 'Async operation',
) => {
  try {
    return await asyncFn();
  } catch (error) {
    handleApiError(error, context);
    throw error; // Re-lanzar el error para que el llamador pueda manejarlo
  }
};

/**
 * Formatea un error para mostrarlo de manera amigable
 * @param {Error|Object} error - Error a formatear
 * @returns {string} Mensaje de error formateado
 */
export const formatErrorMessage = (error) => {
  if (!error) {
    return 'Unknown error occurred';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  if (error.statusText) {
    return error.statusText;
  }

  return 'An unexpected error occurred';
};

/**
 * Clase personalizada para errores de la aplicación
 */
export class AppError extends Error {
  constructor(message, code = 'APP_ERROR', context = '', originalError = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();

    if (originalError) {
      this.originalError = originalError;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Clase para errores de validación
 */
export class ValidationError extends AppError {
  constructor(message, field = '', originalError = null) {
    super(
      message,
      'VALIDATION_ERROR',
      `Validation failed for field: ${field}`,
      originalError,
    );
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Clase para errores de red
 */
export class NetworkError extends AppError {
  constructor(message, url = '', statusCode = 0, originalError = null) {
    super(
      message,
      'NETWORK_ERROR',
      `Network request failed for: ${url}`,
      originalError,
    );
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Clase para errores de API
 */
export class ApiError extends AppError {
  constructor(message, endpoint = '', statusCode = 0, originalError = null) {
    super(
      message,
      'API_ERROR',
      `API call failed for: ${endpoint}`,
      originalError,
    );
    this.name = 'ApiError';
    this.endpoint = endpoint;
    this.statusCode = statusCode;
  }
}
