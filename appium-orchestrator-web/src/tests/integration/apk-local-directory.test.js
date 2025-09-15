/**
 * Integration Test: APK Manager with LOCAL_APK_DIRECTORY
 *
 * Este test valida que cuando LOCAL_APK_DIRECTORY está definido:
 * 1. El endpoint /api/apk/versions ignora el parámetro repo
 * 2. Solo usa resolución local (no llama a ORAS)
 * 3. Devuelve las versiones correctas desde el directorio local
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ApkManager = require('../../modules/core/apk-manager');
const ConfigurationManager = require('../../modules/security/configuration');
const ValidationManager = require('../../modules/security/validation');

describe('APK Manager - LOCAL_APK_DIRECTORY Integration', () => {
  let app;
  let server;
  let tempApkDir;
  let originalEnv;
  let configManager;
  let validationManager;
  let apkManager;

  beforeAll(async () => {
    // Guardar variables de entorno originales
    originalEnv = { ...process.env };

    // Crear directorio temporal para APKs de prueba
    tempApkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-apks-'));

    // Crear APKs de prueba en el directorio temporal
    const testApks = [
      'app-debug.apk',
      'app-release.apk',
      'app-staging.apk'
    ];

    testApks.forEach(apkName => {
      const apkPath = path.join(tempApkDir, apkName);
      fs.writeFileSync(apkPath, `mock apk content for ${apkName}`);
    });

    // Configurar entorno para pruebas
    process.env.LOCAL_APK_DIRECTORY = tempApkDir;
    process.env.APK_REGISTRY = 'harbor:8080'; // Este debería ser ignorado
    delete process.env.NODE_ENV; // Asegurar que no estamos en test mode

    // Inicializar módulos
    configManager = new ConfigurationManager();
    validationManager = new ValidationManager();
    apkManager = new ApkManager(configManager, validationManager);

    // Importar y crear app después de configurar el entorno
    const express = require('express');
    app = express();
    app.use(express.json());

    // Configurar endpoint de prueba
    app.get('/api/apk/versions', async (req, res) => {
      const { repo, client } = req.query;

      try {
        let result;

        // If LOCAL_APK_DIRECTORY is defined, use local method (ignore repo parameter)
        if (process.env.LOCAL_APK_DIRECTORY) {
          result = await apkManager.getApkVersions();
        } else if (repo) {
          result = await apkManager.getRegistryApkVersions(repo);
        } else if (client) {
          result = await apkManager.getClientApkVersions(client);
        } else {
          result = await apkManager.getApkVersions();
        }

        if (result.success) {
          res.json({ source: result.source, versions: result.versions });
        } else {
          res.status(500).json({ error: result.error });
        }
      } catch (error) {
        console.error('Error en /api/apk/versions:', error);
        res.status(500).json({ error: 'Error interno al obtener versiones de APK.' });
      }
    });

    server = app.listen(0); // Puerto aleatorio para pruebas
  });

  afterAll(async () => {
    // Limpiar
    if (server) {
      server.close();
    }

    // Restaurar variables de entorno originales
    process.env = { ...originalEnv };

    // Eliminar directorio temporal
    if (fs.existsSync(tempApkDir)) {
      fs.rmSync(tempApkDir, { recursive: true, force: true });
    }
  });

  describe('Cuando LOCAL_APK_DIRECTORY está definido', () => {
    test('debería ignorar el parámetro repo y usar resolución local', async () => {
      const response = await request(server)
        .get('/api/apk/versions')
        .query({ repo: 'apks/nbch/int' }) // Este parámetro debería ser ignorado
        .expect(200);

      expect(response.body).toHaveProperty('source');
      expect(response.body).toHaveProperty('versions');
      expect(response.body.source).toBe('local');

      // Debería encontrar los APKs del directorio local
      expect(response.body.versions).toHaveLength(3);
      expect(response.body.versions.map(v => v.name)).toEqual(
        expect.arrayContaining(['app-debug.apk', 'app-release.apk', 'app-staging.apk'])
      );

      // Todas las versiones deberían tener source: 'local'
      response.body.versions.forEach(version => {
        expect(version.source).toBe('local');
        expect(version).toHaveProperty('path');
        expect(version).toHaveProperty('size');
      });
    });

    test('debería ignorar el parámetro client y usar resolución local', async () => {
      const response = await request(server)
        .get('/api/apk/versions')
        .query({ client: 'nbch' }) // Este parámetro debería ser ignorado
        .expect(200);

      expect(response.body.source).toBe('local');
      expect(response.body.versions).toHaveLength(3);
    });

    test('debería funcionar sin parámetros y usar resolución local', async () => {
      const response = await request(server)
        .get('/api/apk/versions')
        .expect(200);

      expect(response.body.source).toBe('local');
      expect(response.body.versions).toHaveLength(3);
    });

    test('no debería llamar a métodos ORAS/registro', async () => {
      // Espiar los métodos del apkManager
      const spyGetRegistryApkVersions = jest.spyOn(apkManager, 'getRegistryApkVersions');
      const spyGetClientApkVersions = jest.spyOn(apkManager, 'getClientApkVersions');
      const spyGetApkVersions = jest.spyOn(apkManager, 'getApkVersions');

      await request(server)
        .get('/api/apk/versions')
        .query({ repo: 'apks/nbch/int' })
        .expect(200);

      // Debería haber llamado a getApkVersions (método local)
      expect(spyGetApkVersions).toHaveBeenCalled();

      // No debería haber llamado a métodos de registro
      expect(spyGetRegistryApkVersions).not.toHaveBeenCalled();
      expect(spyGetClientApkVersions).not.toHaveBeenCalled();

      // Limpiar spies
      spyGetRegistryApkVersions.mockRestore();
      spyGetClientApkVersions.mockRestore();
      spyGetApkVersions.mockRestore();
    });
  });

  describe('Validación de estructura de respuesta', () => {
    test('debería devolver la estructura correcta para versiones locales', async () => {
      const response = await request(server)
        .get('/api/apk/versions')
        .query({ repo: 'apks/nbch/int' })
        .expect(200);

      const version = response.body.versions[0];

      expect(version).toMatchObject({
        name: expect.any(String),
        source: 'local',
        path: expect.stringContaining(tempApkDir),
        size: expect.any(Number)
      });

      // Verificar que el path existe y es un archivo
      expect(fs.existsSync(version.path)).toBe(true);
      expect(fs.statSync(version.path).isFile()).toBe(true);
    });

    test('debería manejar directorio local vacío', async () => {
      // Crear directorio temporal vacío
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-apks-'));
      const originalLocalDir = process.env.LOCAL_APK_DIRECTORY;

      process.env.LOCAL_APK_DIRECTORY = emptyDir;

      const response = await request(server)
        .get('/api/apk/versions')
        .query({ repo: 'apks/nbch/int' })
        .expect(200);

      expect(response.body.source).toBe('local');
      expect(response.body.versions).toHaveLength(0);

      // Restaurar
      process.env.LOCAL_APK_DIRECTORY = originalLocalDir;
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  describe('Comportamiento sin LOCAL_APK_DIRECTORY', () => {
    test('debería usar lógica normal cuando LOCAL_APK_DIRECTORY no está definido', async () => {
      // Temporalmente eliminar LOCAL_APK_DIRECTORY
      const originalLocalDir = process.env.LOCAL_APK_DIRECTORY;
      delete process.env.LOCAL_APK_DIRECTORY;

      const spyGetApkVersions = jest.spyOn(apkManager, 'getApkVersions');
      const spyGetRegistryApkVersions = jest.spyOn(apkManager, 'getRegistryApkVersions');

      await request(server)
        .get('/api/apk/versions')
        .query({ repo: 'apks/nbch/int' })
        .expect(200);

      // Sin LOCAL_APK_DIRECTORY, debería usar getRegistryApkVersions
      expect(spyGetRegistryApkVersions).toHaveBeenCalledWith('apks/nbch/int');
      expect(spyGetApkVersions).not.toHaveBeenCalled();

      // Restaurar
      process.env.LOCAL_APK_DIRECTORY = originalLocalDir;
      spyGetApkVersions.mockRestore();
      spyGetRegistryApkVersions.mockRestore();
    });
  });
});