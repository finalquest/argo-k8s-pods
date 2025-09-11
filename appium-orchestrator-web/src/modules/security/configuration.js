// Configuration Module
// Handles environment variables, server configuration, and validation

require('dotenv').config();

class ConfigurationManager {
  constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  /**
   * Load all configuration from environment variables
   */
  loadConfiguration() {
    return {
      // Server Configuration
      PORT: process.env.PORT || 3000,
      APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',

      // Authentication Configuration
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      SESSION_SECRET: process.env.SESSION_SECRET,
      GOOGLE_HOSTED_DOMAIN: process.env.GOOGLE_HOSTED_DOMAIN,

      // Git Configuration
      GIT_REPO_URL: process.env.GIT_REPO_URL,
      GIT_USER: process.env.GIT_USER,
      GIT_PAT: process.env.GIT_PAT,

      // Workspace Configuration
      PERSISTENT_WORKSPACES_ROOT: process.env.PERSISTENT_WORKSPACES_ROOT,

      // Device Configuration
      DEVICE_SOURCE: process.env.DEVICE_SOURCE || 'local',
      LOCAL_ADB_HOST: process.env.LOCAL_ADB_HOST,

      // Performance Configuration
      MAX_PARALLEL_TESTS: parseInt(process.env.MAX_PARALLEL_TESTS, 10) || 2,
      MAX_REPORTS_PER_FEATURE:
        parseInt(process.env.MAX_REPORTS_PER_FEATURE, 10) || 5,

      // Feature Directory Configuration
      FEATURE_DIRS: process.env.FEATURE_DIRS
        ? process.env.FEATURE_DIRS.split(',')
        : ['feature/modulos'],

      // APK Registry Configuration
      APK_REGISTRY_URL: process.env.APK_REGISTRY_URL || 'http://localhost:8081',
    };
  }

  /**
   * Validate required configuration
   */
  validateConfiguration() {
    // Si Google OAuth no está configurado, usar modo de desarrollo
    if (!this.isEnabled('googleAuth')) {
      console.warn('⚠️  Google OAuth no configurado - Modo desarrollo (sin autenticación)');
      console.warn('   Para habilitar autenticación, define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET');
      
      // Solo requerir SESSION_SECRET para modo desarrollo
      if (!this.config.SESSION_SECRET) {
        console.warn('⚠️  Generando SESSION_SECRET aleatoria para modo desarrollo...');
        this.config.SESSION_SECRET = require('crypto').randomBytes(32).toString('hex');
      }
    } else {
      // Validar variables de autenticación si Google OAuth está habilitado
      const authRequired = [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'SESSION_SECRET',
      ];
      const authMissing = authRequired.filter((key) => !this.config[key]);

      if (authMissing.length > 0) {
        console.error(
          `Error: Faltan variables de entorno requeridas: ${authMissing.join(', ')}`,
        );
        process.exit(1);
      }
    }

    // Validate Git configuration
    const gitRequired = ['GIT_REPO_URL', 'GIT_USER', 'GIT_PAT'];
    const gitMissing = gitRequired.filter((key) => !this.config[key]);

    if (gitMissing.length > 0) {
      console.error(
        `Error: Debes definir ${gitMissing.join(', ')} en el archivo .env`,
      );
      process.exit(1);
    }

    // Validate PORT is a valid number
    if (this.config.PORT && isNaN(this.config.PORT)) {
      console.warn('Warning: PORT is not a valid number, using default 3000');
      this.config.PORT = 3000;
    }

    // Validate MAX_PARALLEL_TESTS is a positive number
    if (this.config.MAX_PARALLEL_TESTS < 0) {
      console.warn(
        'Warning: MAX_PARALLEL_TESTS cannot be negative, using default 2',
      );
      this.config.MAX_PARALLEL_TESTS = 2;
    }
  }

  /**
   * Get configuration value
   */
  get(key) {
    return this.config[key];
  }

  /**
   * Get all configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Check if feature is enabled
   */
  isEnabled(feature) {
    switch (feature) {
      case 'persistentWorkspaces':
        return !!this.config.PERSISTENT_WORKSPACES_ROOT;
      case 'googleAuth':
        return !!(
          this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET
        );
      case 'domainRestriction':
        return !!this.config.GOOGLE_HOSTED_DOMAIN;
      case 'localDevices':
        return this.config.DEVICE_SOURCE === 'local';
      case 'authentication':
        return this.isEnabled('googleAuth');
      default:
        return false;
    }
  }

  /**
   * Check if running in development mode (without authentication)
   */
  isDevelopmentMode() {
    return !this.isEnabled('authentication');
  }

  /**
   * Get development user info for non-authenticated mode
   */
  getDevelopmentUser() {
    return {
      id: 'dev-user',
      displayName: 'Development User',
      email: 'dev@localhost',
      photos: [{ value: 'https://via.placeholder.com/40' }],
      isDevelopment: true
    };
  }

  /**
   * Get server configuration for client
   */
  getClientConfig() {
    return {
      persistentWorkspacesEnabled: this.isEnabled('persistentWorkspaces'),
      deviceSource: this.config.DEVICE_SOURCE,
      maxParallelTests: this.config.MAX_PARALLEL_TESTS,
      featureDirs: this.config.FEATURE_DIRS,
    };
  }

  /**
   * Get git configuration with authentication
   */
  getGitConfig() {
    try {
      const url = new URL(this.config.GIT_REPO_URL);
      url.username = this.config.GIT_USER;
      url.password = this.config.GIT_PAT;
      return {
        url: url.toString(),
        user: this.config.GIT_USER,
        repoUrl: this.config.GIT_REPO_URL,
      };
    } catch (error) {
      console.error('Error al parsear GIT_REPO_URL:', error);
      return {
        url: this.config.GIT_REPO_URL,
        user: this.config.GIT_USER,
        repoUrl: this.config.GIT_REPO_URL,
      };
    }
  }

  /**
   * Get session configuration
   */
  getSessionConfig() {
    return {
      secret: this.config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
    };
  }

  /**
   * Get OAuth configuration
   */
  getOAuthConfig() {
    return {
      clientID: this.config.GOOGLE_CLIENT_ID,
      clientSecret: this.config.GOOGLE_CLIENT_SECRET,
      callbackURL: `${this.config.APP_BASE_URL}/auth/google/callback`,
      hostedDomain: this.config.GOOGLE_HOSTED_DOMAIN,
    };
  }

  /**
   * Get workspace configuration
   */
  getWorkspaceConfig() {
    return {
      persistentRoot: this.config.PERSISTENT_WORKSPACES_ROOT,
      persistentEnabled: this.isEnabled('persistentWorkspaces'),
      featureDirs: this.config.FEATURE_DIRS,
    };
  }

  /**
   * Get device configuration
   */
  getDeviceConfig() {
    return {
      source: this.config.DEVICE_SOURCE,
      localAdbHost: this.config.LOCAL_ADB_HOST,
      localEnabled: this.isEnabled('localDevices'),
    };
  }

  /**
   * Get performance configuration
   */
  getPerformanceConfig() {
    return {
      maxParallelTests: this.config.MAX_PARALLEL_TESTS,
      maxReportsPerFeature: this.config.MAX_REPORTS_PER_FEATURE,
    };
  }

  /**
   * Validate configuration value
   */
  validateValue(key, value) {
    const validators = {
      PORT: (val) => !isNaN(val) && val > 0 && val < 65536,
      MAX_PARALLEL_TESTS: (val) => !isNaN(val) && val >= 0,
      MAX_REPORTS_PER_FEATURE: (val) => !isNaN(val) && val > 0,
      GOOGLE_CLIENT_ID: (val) => typeof val === 'string' && val.length > 0,
      GOOGLE_CLIENT_SECRET: (val) => typeof val === 'string' && val.length > 0,
      SESSION_SECRET: (val) => typeof val === 'string' && val.length > 0,
    };

    const validator = validators[key];
    return validator ? validator(value) : true;
  }

  /**
   * Update configuration value (for testing purposes)
   */
  set(key, value) {
    if (this.validateValue(key, value)) {
      this.config[key] = value;
      return true;
    }
    return false;
  }

  /**
   * Reset configuration to environment variables
   */
  reset() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }
}

module.exports = ConfigurationManager;
