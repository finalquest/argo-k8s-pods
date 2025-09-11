// Validation Module
// Handles input validation, sanitization, and security validation

const path = require('path');

class ValidationManager {
  constructor() {
    this.setupValidators();
  }

  /**
   * Setup all validation methods
   */
  setupValidators() {
    this.validators = {
      branch: this.validateBranchName.bind(this),
      client: this.validateClientName.bind(this),
      apkIdentifier: this.validateApkIdentifier.bind(this),
      deviceSerial: this.validateDeviceSerial.bind(this),
      featureFile: this.validateFeatureFile.bind(this),
      gitUrl: this.validateGitUrl.bind(this),
      workspacePath: this.validateWorkspacePath.bind(this),
    };
  }

  /**
   * Sanitize input string by removing dangerous characters
   */
  sanitize(name) {
    if (!name) return '';
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  /**
   * Validate branch name
   */
  validateBranchName(branchName) {
    const errors = [];
    
    if (!branchName || typeof branchName !== 'string') {
      errors.push('Branch name is required');
      return errors;
    }
    
    if (branchName.trim() !== branchName) {
      errors.push('Branch name cannot have leading/trailing whitespace');
    }
    
    if (branchName.length < 1) {
      errors.push('Branch name cannot be empty');
    }
    
    if (branchName.length > 255) {
      errors.push('Branch name too long');
    }
    
    if (!/^[a-zA-Z0-9_.\-/]+$/.test(branchName)) {
      errors.push('Branch name contains invalid characters');
    }
    
    if (branchName.startsWith('/') || branchName.endsWith('/')) {
      errors.push('Branch name cannot start or end with /');
    }
    
    if (branchName.includes('//')) {
      errors.push('Branch name cannot contain consecutive slashes');
    }

    // Check for path traversal patterns
    if (branchName.includes('../') || branchName.includes('..\\')) {
      errors.push('Branch name cannot contain path traversal patterns');
    }
    
    return errors;
  }

  /**
   * Validate client name
   */
  validateClientName(clientName) {
    const errors = [];
    
    if (!clientName || typeof clientName !== 'string') {
      errors.push('Client name is required');
      return errors;
    }
    
    if (clientName.trim() !== clientName) {
      errors.push('Client name cannot have leading/trailing whitespace');
    }
    
    if (!/^[a-zA-Z0-9_.\-]+$/.test(clientName)) {
      errors.push('Client name contains invalid characters');
    }

    // Check for path traversal patterns
    if (clientName.includes('../') || clientName.includes('..\\')) {
      errors.push('Client name cannot contain path traversal patterns');
    }
    
    return errors;
  }

  /**
   * Validate APK identifier
   */
  validateApkIdentifier(identifier) {
    const errors = [];
    
    if (!identifier || typeof identifier !== 'string') {
      errors.push('APK identifier is required');
      return errors;
    }
    
    // Check if it's a package name or version number
    const isValidPackage = /^[a-zA-Z0-9._]+$/.test(identifier);
    const isValidVersion = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(identifier);
    
    if (!isValidPackage && !isValidVersion) {
      errors.push('APK identifier format is invalid');
    }

    // Check for dangerous characters
    const dangerousChars = /[;|&`$'"<>]/;
    if (dangerousChars.test(identifier)) {
      errors.push('APK identifier contains dangerous characters');
    }
    
    return errors;
  }

  /**
   * Validate device serial
   */
  validateDeviceSerial(serial) {
    const errors = [];
    
    if (!serial || typeof serial !== 'string') {
      errors.push('Device serial is required');
      return errors;
    }
    
    if (serial.trim() !== serial) {
      errors.push('Device serial cannot have leading/trailing whitespace');
    }

    // Check for dangerous characters
    const dangerousChars = /[;|&`$'"<>]/;
    if (dangerousChars.test(serial)) {
      errors.push('Device serial contains dangerous characters');
    }
    
    return errors;
  }

  /**
   * Validate feature file name
   */
  validateFeatureFile(fileName) {
    const errors = [];
    
    if (!fileName || typeof fileName !== 'string') {
      errors.push('Feature file name is required');
      return errors;
    }
    
    if (!fileName.endsWith('.feature')) {
      errors.push('Feature file must have .feature extension');
    }
    
    if (fileName.trim() !== fileName) {
      errors.push('Feature file name cannot have leading/trailing whitespace');
    }

    // Check for path traversal patterns
    if (fileName.includes('../') || fileName.includes('..\\')) {
      errors.push('Feature file name cannot contain path traversal patterns');
    }

    // Check for dangerous characters
    const dangerousChars = /[;|&`$'"<>]/;
    if (dangerousChars.test(fileName)) {
      errors.push('Feature file name contains dangerous characters');
    }
    
    return errors;
  }

  /**
   * Validate git URL
   */
  validateGitUrl(url) {
    const errors = [];
    
    if (!url || typeof url !== 'string') {
      errors.push('Git URL is required');
      return errors;
    }
    
    try {
      const urlObj = new URL(url);
      
      // Check for valid protocols
      const validProtocols = ['https:', 'http:', 'git:'];
      if (!validProtocols.includes(urlObj.protocol)) {
        errors.push('Git URL must use http, https, or git protocol');
      }
      
      // Check for dangerous characters in path
      const dangerousChars = /[;|&`$'"<>]/;
      if (dangerousChars.test(urlObj.pathname)) {
        errors.push('Git URL path contains dangerous characters');
      }
      
    } catch (error) {
      errors.push('Git URL format is invalid');
    }
    
    return errors;
  }

  /**
   * Validate workspace path
   */
  validateWorkspacePath(workspacePath) {
    const errors = [];
    
    if (!workspacePath || typeof workspacePath !== 'string') {
      errors.push('Workspace path is required');
      return errors;
    }
    
    // Check for absolute path or dangerous patterns
    if (workspacePath.includes('../') || workspacePath.includes('..\\')) {
      errors.push('Workspace path cannot contain path traversal patterns');
    }

    // Check for dangerous characters
    const dangerousChars = /[;|&`$'"<>]/;
    if (dangerousChars.test(workspacePath)) {
      errors.push('Workspace path contains dangerous characters');
    }

    // Check if path is trying to access sensitive directories
    const sensitivePatterns = [
      /\/etc\//,
      /\/windows\//i,
      /\/system32\//i,
      /\/usr\/local\//,
      /\/bin\//,
      /\/sbin\//,
    ];
    
    if (sensitivePatterns.some(pattern => pattern.test(workspacePath))) {
      errors.push('Workspace path cannot access system directories');
    }
    
    return errors;
  }

  /**
   * Validate API parameters
   */
  validateApiParams(requiredParams, providedParams) {
    const errors = [];
    const missing = requiredParams.filter(param => !providedParams[param]);
    
    if (missing.length > 0) {
      errors.push(`Missing required parameters: ${missing.join(', ')}`);
    }
    
    return errors;
  }

  /**
   * Validate file extension
   */
  validateFileExtension(fileName, allowedExtensions) {
    const errors = [];
    
    if (!fileName || typeof fileName !== 'string') {
      errors.push('File name is required');
      return errors;
    }
    
    const extension = path.extname(fileName).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      errors.push(`File extension ${extension} is not allowed. Allowed: ${allowedExtensions.join(', ')}`);
    }
    
    return errors;
  }

  /**
   * Validate content type
   */
  validateContentType(contentType, allowedTypes) {
    const errors = [];
    
    if (!contentType || typeof contentType !== 'string') {
      errors.push('Content type is required');
      return errors;
    }
    
    if (!allowedTypes.includes(contentType)) {
      errors.push(`Content type ${contentType} is not allowed. Allowed: ${allowedTypes.join(', ')}`);
    }
    
    return errors;
  }

  /**
   * Sanitize error message for client display
   */
  sanitizeErrorMessage(error) {
    if (!error || typeof error !== 'string') return 'Internal server error';
    
    // Remove sensitive information
    let sanitized = error;
    
    // Remove file paths that might contain sensitive information
    sanitized = sanitized.replace(/\/[a-zA-Z0-9_\-\/]*\//g, '/[PATH]/');
    sanitized = sanitized.replace(/[A-Za-z]:\\[a-zA-Z0-9_\-\\]*\\/g, '[PATH]\\');
    
    // Remove environment variable references
    sanitized = sanitized.replace(/process\.env\.[A-Z_]+/g, '[ENV_VAR]');
    
    // Remove sensitive keywords
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /auth/i,
      /credential/i,
    ];
    
    sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });
    
    return sanitized;
  }

  /**
   * Validate multiple inputs using validators
   */
  validateMultiple(validations) {
    const errors = {};
    let hasErrors = false;
    
    Object.entries(validations).forEach(([key, { type, value }]) => {
      const validator = this.validators[type];
      if (validator) {
        const validationErrors = validator(value);
        if (validationErrors.length > 0) {
          errors[key] = validationErrors;
          hasErrors = true;
        }
      } else {
        errors[key] = [`Unknown validator type: ${type}`];
        hasErrors = true;
      }
    });
    
    return {
      isValid: !hasErrors,
      errors
    };
  }

  /**
   * Check if value contains dangerous patterns
   */
  containsDangerousPatterns(value) {
    if (!value || typeof value !== 'string') return false;
    
    const dangerousPatterns = [
      /\.\.\//,  // Path traversal
      /\.\.\\/,  // Windows path traversal
      /;rm\s+-rf\s+\//,  // Dangerous command
      /\$\(/,    // Command substitution
      /`.*`/,   // Command execution
      /[|&`$'"<>]/,  // Dangerous characters
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Get all validators
   */
  getValidators() {
    return { ...this.validators };
  }
}

module.exports = ValidationManager;