// Mock para fetch API
global.fetch = jest.fn();

// Mock para console.error
global.console = {
  ...console,
  error: jest.fn(),
};

import {
  getCurrentUser,
  fetchConfig,
  getWorkspaceStatus,
  getFeatureContent,
  saveFeatureContent,
} from '@public/js/api.js';

describe('API Functions', () => {
  beforeEach(() => {
    fetch.mockClear();
    console.error.mockClear();
  });

  describe('getCurrentUser()', () => {
    test('retorna usuario cuando la respuesta es exitosa', async () => {
      const mockUser = { name: 'testuser', role: 'admin' };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUser,
      });

      const result = await getCurrentUser();

      expect(result).toEqual(mockUser);
      expect(fetch).toHaveBeenCalledWith('/api/current-user');
    });

    test('retorna null cuando el usuario no está autenticado (401)', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await getCurrentUser();

      expect(result).toBeNull();
      expect(console.error).not.toHaveBeenCalled();
    });

    test('retorna null y loggea error cuando hay error de red', async () => {
      const networkError = new Error('Network error');
      fetch.mockRejectedValueOnce(networkError);

      const result = await getCurrentUser();

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching user status:',
        networkError,
      );
    });

    test('retorna null y loggea error cuando hay error HTTP', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await getCurrentUser();

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching user status:',
        expect.any(Error),
      );
    });
  });

  describe('fetchConfig()', () => {
    test('retorna configuración cuando la respuesta es exitosa', async () => {
      const mockConfig = { persistentWorkspacesEnabled: true, maxDevices: 5 };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      });

      const result = await fetchConfig();

      expect(result).toEqual(mockConfig);
      expect(fetch).toHaveBeenCalledWith('/api/config');
    });

    test('retorna configuración por defecto cuando hay error de red', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchConfig();

      expect(result).toEqual({ persistentWorkspacesEnabled: false });
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching server config:',
        expect.any(Error),
      );
    });

    test('retorna configuración por defecto cuando hay error HTTP', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await fetchConfig();

      expect(result).toEqual({ persistentWorkspacesEnabled: false });
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching server config:',
        expect.any(Error),
      );
    });
  });

  describe('getWorkspaceStatus()', () => {
    test('retorna lista vacía cuando no se proporciona branch', async () => {
      const result = await getWorkspaceStatus(null);

      expect(result).toEqual({ modified_features: [] });
      expect(fetch).not.toHaveBeenCalled();
    });

    test('retorna workspace status cuando la respuesta es exitosa', async () => {
      const mockStatus = { modified_features: ['feature1.feature', 'feature2.feature'] };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockStatus,
      });

      const result = await getWorkspaceStatus('main');

      expect(result).toEqual(mockStatus);
      expect(fetch).toHaveBeenCalledWith('/api/workspace-status/main');
    });

    test('retorna lista vacía cuando hay error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getWorkspaceStatus('main');

      expect(result).toEqual({ modified_features: [] });
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching workspace status for branch main:',
        expect.any(Error),
      );
    });
  });

  describe('getFeatureContent()', () => {
    test('retorna contenido cuando la respuesta es exitosa', async () => {
      const mockContent = 'Feature: Test\nScenario: Test scenario';
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: mockContent,
          isLocal: true,
          workspaceExists: true,
          message: 'Contenido cargado desde workspace local (editable)'
        }),
      });

      const result = await getFeatureContent('main', 'client1', 'test');

      expect(result).toEqual({
        content: mockContent,
        isLocal: true,
        workspaceExists: true,
        message: 'Contenido cargado desde workspace local (editable)'
      });
      expect(fetch).toHaveBeenCalledWith(
        '/api/feature-content?branch=main&client=client1&feature=test',
      );
    });

    test('retorna null cuando hay error de red', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getFeatureContent('main', 'client1', 'test');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching feature content:',
        expect.any(Error),
      );
    });

    test('retorna null cuando hay error HTTP', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Feature not found' }),
      });

      const result = await getFeatureContent('main', 'client1', 'nonexistent');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching feature content:',
        expect.any(Error),
      );
    });

    test('maneja caracteres especiales en los parámetros', async () => {
      const mockContent = 'Feature: Test';
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: mockContent,
          isLocal: false,
          workspaceExists: false,
          message: 'Contenido cargado desde repositorio remoto (solo lectura)'
        }),
      });

      const result = await getFeatureContent('main', 'client with spaces', 'test-feature');

      expect(result).toEqual({
        content: mockContent,
        isLocal: false,
        workspaceExists: false,
        message: 'Contenido cargado desde repositorio remoto (solo lectura)'
      });
      // El navegador no codifica automáticamente los espacios en URLs construidos manualmente
      expect(fetch).toHaveBeenCalledWith(
        '/api/feature-content?branch=main&client=client with spaces&feature=test-feature',
      );
    });
  });

  describe('saveFeatureContent()', () => {
    test('guarda contenido cuando la respuesta es exitosa', async () => {
      const mockResponse = { success: true, message: 'Feature saved' };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await saveFeatureContent('main', 'client1', 'test', 'Feature content');

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('/api/feature-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch: 'main',
          client: 'client1',
          feature: 'test',
          content: 'Feature content',
        }),
      });
    });

    test('retorna null cuando hay error de red', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await saveFeatureContent('main', 'client1', 'test', 'Feature content');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error saving feature content:',
        expect.any(Error),
      );
    });

    test('retorna null cuando hay error HTTP', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid feature content' }),
      });

      const result = await saveFeatureContent('main', 'client1', 'test', 'Feature content');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error saving feature content:',
        expect.any(Error),
      );
    });
  });

  describe('manejo de errores general', () => {
    test('todas las funciones manejan errores de red consistentemente', async () => {
      // Forzar error de red en todas las llamadas
      fetch.mockRejectedValue(new Error('Network unavailable'));

      const results = await Promise.allSettled([
        getCurrentUser(),
        fetchConfig(),
        getWorkspaceStatus('test'),
        getFeatureContent('test', 'test', 'test'),
        saveFeatureContent('test', 'test', 'test', 'test'),
      ]);

      // Todas deberían completarse con valores seguros
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
        
        if (index === 0) {
          // getCurrentUser retorna null en error
          expect(result.value).toBeNull();
        } else if (index === 1) {
          // fetchConfig retorna objeto por defecto
          expect(result.value).toEqual({ persistentWorkspacesEnabled: false });
        } else if (index === 2) {
          // getWorkspaceStatus retorna lista vacía
          expect(result.value).toEqual({ modified_features: [] });
        } else {
          // getFeatureContent y saveFeatureContent retornan null en error
          expect(result.value).toBeNull();
        }
      });
    });
  });
});