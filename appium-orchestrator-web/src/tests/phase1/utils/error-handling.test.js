import {
  handleApiError,
  handleUiError,
  handleNetworkError,
  logWarning,
  logDebug,
  logError,
  createError,
  validateRequired,
  validateType,
  safeExecute,
  handleAsyncError,
  formatErrorMessage,
  AppError,
  ValidationError,
  NetworkError,
  ApiError,
} from '@public/js/utils/error-handling.js';

describe('Error Handling Utilities', () => {
  let consoleSpy;
  let alertSpy;

  beforeEach(() => {
    // Mock console methods
    consoleSpy = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    };

    // Mock alert
    alertSpy = jest.fn();
    global.alert = alertSpy;
    global.console = consoleSpy;

    jest.clearAllMocks();
  });

  describe('handleApiError()', () => {
    test('maneja error con mensaje', () => {
      const error = new Error('Test API error');
      const result = handleApiError(error, 'API call');

      expect(result).toBeNull();
      expect(consoleSpy.error).toHaveBeenCalledWith('API call failed:', error);
      expect(alertSpy).toHaveBeenCalledWith('API call failed: Test API error');
    });

    test('maneja error de tipo string', () => {
      const error = 'String error';
      const result = handleApiError(error, 'API call');

      expect(result).toBeNull();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'API call failed:',
        'String error',
      );
      expect(alertSpy).toHaveBeenCalledWith('API call failed: String error');
    });

    test('maneja error con status', () => {
      const error = { status: 404 };
      const result = handleApiError(error, 'API call');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith('API call failed: Status 404');
    });

    test('maneja error nulo', () => {
      const result = handleApiError(null, 'API call');

      expect(result).toBeNull();
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'handleApiError: se proporcionó un error nulo o indefinido',
      );
    });

    test('maneja error genérico', () => {
      const error = {};
      const result = handleApiError(error, 'API call');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith(
        'API call failed. Please check the console for details.',
      );
    });
  });

  describe('handleUiError()', () => {
    test('maneja error con alerta', () => {
      const error = new Error('Test UI error');
      const result = handleUiError(error, 'UI operation', true);

      expect(result).toBeNull();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'UI operation failed:',
        error,
      );
      expect(alertSpy).toHaveBeenCalledWith(
        'UI operation failed: Test UI error',
      );
    });

    test('maneja error sin alerta', () => {
      const error = new Error('Test UI error');
      const result = handleUiError(error, 'UI operation', false);

      expect(result).toBeNull();
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'UI operation failed:',
        error,
      );
      expect(alertSpy).not.toHaveBeenCalled();
    });

    test('maneja error de tipo string', () => {
      const error = 'String UI error';
      const result = handleUiError(error, 'UI operation');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith(
        'UI operation failed: String UI error',
      );
    });
  });

  describe('handleNetworkError()', () => {
    test('maneja error de red con mensaje específico', () => {
      const error = { message: 'Network Error' };
      const result = handleNetworkError(error, 'Network request');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith(
        'Network connection failed. Please check your internet connection and try again.',
      );
    });

    test('maneja error de timeout', () => {
      const error = { message: 'timeout exceeded' };
      const result = handleNetworkError(error, 'Network request');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith(
        'Request timed out. Please try again later.',
      );
    });

    test('maneja error 401', () => {
      const error = { status: 401 };
      const result = handleNetworkError(error, 'Network request');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith(
        'Authentication failed. Please log in again.',
      );
    });

    test('maneja error 404', () => {
      const error = { status: 404 };
      const result = handleNetworkError(error, 'Network request');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith(
        'The requested resource was not found.',
      );
    });

    test('maneja error 500', () => {
      const error = { status: 500 };
      const result = handleNetworkError(error, 'Network request');

      expect(result).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith(
        'Server error occurred. Please try again later.',
      );
    });
  });

  describe('logWarning()', () => {
    test('registra advertencia con datos', () => {
      logWarning('Test warning', { data: 'test' });

      expect(consoleSpy.warn).toHaveBeenCalledWith('Test warning', {
        data: 'test',
      });
    });

    test('registra advertencia sin datos', () => {
      logWarning('Test warning');

      expect(consoleSpy.warn).toHaveBeenCalledWith('Test warning');
    });

    test('maneja mensaje inválido', () => {
      logWarning(null);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'logWarning: se requiere un mensaje de advertencia válido',
      );
    });
  });

  describe('logDebug()', () => {
    test('registra debug con datos', () => {
      logDebug('Test debug', { data: 'test' });

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] Test debug', {
        data: 'test',
      });
    });

    test('registra debug sin datos', () => {
      logDebug('Test debug');

      expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG] Test debug');
    });

    test('maneja mensaje inválido', () => {
      logDebug(null);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'logDebug: se requiere un mensaje de depuración válido',
      );
    });
  });

  describe('logError()', () => {
    test('registra error con datos', () => {
      logError('Test error', { data: 'test' });

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] Test error', {
        data: 'test',
      });
    });

    test('registra error sin datos', () => {
      logError('Test error');

      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] Test error');
    });

    test('maneja mensaje inválido', () => {
      logError(null);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'logError: se requiere un mensaje de error válido',
      );
    });
  });

  describe('createError()', () => {
    test('crea error con contexto', () => {
      const error = createError('Test message', 'Test context');

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test context: Test message');
    });

    test('crea error sin contexto', () => {
      const error = createError('Test message');

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test message');
    });

    test('crea error con error original', () => {
      const originalError = new Error('Original error');
      const error = createError('Test message', 'Test context', originalError);

      expect(error.originalError).toBe(originalError);
      expect(error.stack).toBe(originalError.stack);
    });
  });

  describe('validateRequired()', () => {
    test('valida valor no nulo', () => {
      expect(() => validateRequired('test', 'param')).not.toThrow();
    });

    test('lanza error con valor nulo', () => {
      expect(() => validateRequired(null, 'param')).toThrow(
        "Required parameter 'param' is null or undefined",
      );
    });

    test('lanza error con valor undefined', () => {
      expect(() => validateRequired(undefined, 'param')).toThrow(
        "Required parameter 'param' is null or undefined",
      );
    });
  });

  describe('validateType()', () => {
    test('valida tipo string', () => {
      expect(() => validateType('test', 'string', 'param')).not.toThrow();
    });

    test('valida tipo number', () => {
      expect(() => validateType(42, 'number', 'param')).not.toThrow();
    });

    test('valida tipo array', () => {
      expect(() => validateType([], 'array', 'param')).not.toThrow();
    });

    test('lanza error con tipo incorrecto', () => {
      expect(() => validateType('test', 'number', 'param')).toThrow(
        "Parameter 'param' must be of type 'number', but got 'string'",
      );
    });
  });

  describe('safeExecute()', () => {
    test('ejecuta función exitosamente', () => {
      const fn = () => 'success';
      const result = safeExecute(fn, 'Test operation');

      expect(result).toBe('success');
    });

    test('maneja error en función', () => {
      const fn = () => {
        throw new Error('Test error');
      };
      const result = safeExecute(fn, 'Test operation', 'default');

      expect(result).toBe('default');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Test operation failed:',
        expect.any(Error),
      );
    });

    test('retorna null por defecto en error', () => {
      const fn = () => {
        throw new Error('Test error');
      };
      const result = safeExecute(fn, 'Test operation');

      expect(result).toBeNull();
    });
  });

  describe('handleAsyncError()', () => {
    test('ejecuta función asíncrona exitosamente', async () => {
      const asyncFn = async () => 'success';
      const result = await handleAsyncError(asyncFn, 'Async operation');

      expect(result).toBe('success');
    });

    test('maneja error en función asíncrona', async () => {
      const asyncFn = async () => {
        throw new Error('Async error');
      };

      await expect(
        handleAsyncError(asyncFn, 'Async operation'),
      ).rejects.toThrow('Async error');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Async operation failed:',
        expect.any(Error),
      );
      expect(alertSpy).toHaveBeenCalledWith(
        'Async operation failed: Async error',
      );
    });
  });

  describe('formatErrorMessage()', () => {
    test('formatea error string', () => {
      const result = formatErrorMessage('String error');
      expect(result).toBe('String error');
    });

    test('formatea error con mensaje', () => {
      const error = new Error('Test error');
      const result = formatErrorMessage(error);
      expect(result).toBe('Test error');
    });

    test('formatea error con statusText', () => {
      const error = { statusText: 'Not Found' };
      const result = formatErrorMessage(error);
      expect(result).toBe('Not Found');
    });

    test('formatea error nulo', () => {
      const result = formatErrorMessage(null);
      expect(result).toBe('Unknown error occurred');
    });
  });

  describe('AppError', () => {
    test('crea AppError con valores por defecto', () => {
      const error = new AppError('Test message');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AppError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('APP_ERROR');
      expect(error.context).toBe('');
      expect(error.timestamp).toBeDefined();
    });

    test('crea AppError con parámetros completos', () => {
      const originalError = new Error('Original error');
      const error = new AppError(
        'Test message',
        'TEST_CODE',
        'Test context',
        originalError,
      );

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toBe('Test context');
      expect(error.originalError).toBe(originalError);
    });

    test('convierte a JSON', () => {
      const error = new AppError('Test message', 'TEST_CODE', 'Test context');
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'AppError',
        message: 'Test message',
        code: 'TEST_CODE',
        context: 'Test context',
        timestamp: error.timestamp,
        stack: error.stack,
      });
    });
  });

  describe('ValidationError', () => {
    test('crea ValidationError con valores por defecto', () => {
      const error = new ValidationError('Validation failed');

      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBe('');
    });

    test('crea ValidationError con field', () => {
      const error = new ValidationError('Validation failed', 'email');

      expect(error.field).toBe('email');
      expect(error.context).toBe('Validation failed for field: email');
    });
  });

  describe('NetworkError', () => {
    test('crea NetworkError con valores por defecto', () => {
      const error = new NetworkError('Network failed');

      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.url).toBe('');
      expect(error.statusCode).toBe(0);
    });

    test('crea NetworkError con parámetros completos', () => {
      const error = new NetworkError(
        'Network failed',
        'https://api.test.com',
        404,
      );

      expect(error.url).toBe('https://api.test.com');
      expect(error.statusCode).toBe(404);
      expect(error.context).toBe(
        'Network request failed for: https://api.test.com',
      );
    });
  });

  describe('ApiError', () => {
    test('crea ApiError con valores por defecto', () => {
      const error = new ApiError('API failed');

      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('ApiError');
      expect(error.code).toBe('API_ERROR');
      expect(error.endpoint).toBe('');
      expect(error.statusCode).toBe(0);
    });

    test('crea ApiError con parámetros completos', () => {
      const error = new ApiError('API failed', '/api/users', 500);

      expect(error.endpoint).toBe('/api/users');
      expect(error.statusCode).toBe(500);
      expect(error.context).toBe('API call failed for: /api/users');
    });
  });
});
