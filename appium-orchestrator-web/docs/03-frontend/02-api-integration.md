# Frontend - Integración con API

## 📋 Visión General

La integración con la API del backend es un componente crucial que permite al frontend comunicarse con el servidor para gestionar workspaces, features, operaciones Git y más. Este módulo centraliza toda la comunicación HTTP y proporciona una interfaz limpia y consistente para el resto de la aplicación.

## 🔧 Arquitectura de la API

### 1. Estructura Base

```javascript
// public/js/api.js - Estructura del módulo API
class ApiClient {
  constructor() {
    this.baseUrl = '/api';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: { ...this.defaultHeaders, ...(options.headers || {}) },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        throw new ApiError(response.status, response.statusText);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new NetworkError(error.message);
    }
  }
}

// Clases de error personalizadas
class ApiError extends Error {
  constructor(status, message) {
    super(`API Error ${status}: ${message}`);
    this.status = status;
    this.name = 'ApiError';
  }
}

class NetworkError extends Error {
  constructor(message) {
    super(`Network Error: ${message}`);
    this.name = 'NetworkError';
  }
}
```

### 2. Instancia Global

```javascript
// public/js/api.js - Instancia única del cliente API
const apiClient = new ApiClient();

// Funciones de conveniencia
export async function apiGet(endpoint) {
  return apiClient.request(endpoint, { method: 'GET' });
}

export async function apiPost(endpoint, data) {
  return apiClient.request(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiPut(endpoint, data) {
  return apiClient.request(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function apiDelete(endpoint) {
  return apiClient.request(endpoint, { method: 'DELETE' });
}
```

## 📁 Gestión de Workspaces

### 1. Operaciones Principales

```javascript
// public/js/api.js - Gestión de workspaces
export async function getWorkspaceStatus(branch) {
  try {
    const response = await fetch(`/api/workspace/${branch}/status`);

    if (!response.ok) {
      if (response.status === 404) {
        return { exists: false, ready: false };
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting workspace status:', error);
    return { exists: false, ready: false, error: error.message };
  }
}

export async function prepareWorkspace(branch) {
  try {
    const response = await fetch(`/api/workspace/${branch}/prepare`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Mostrar notificación de progreso
    showNotification(`Preparando workspace para ${branch}...`, 'info');

    return result;
  } catch (error) {
    console.error('Error preparing workspace:', error);
    showError(`Error al preparar workspace: ${error.message}`);
    throw error;
  }
}

export async function getWorkspaceChanges(branch) {
  try {
    const response = await fetch(`/api/workspace/${branch}/changes`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting workspace changes:', error);
    return { hasChanges: false, modifiedFiles: [] };
  }
}
```

### 2. Monitoreo de Workspace

```javascript
// public/js/api.js - Monitoreo asíncrono
export async function monitorWorkspacePreparation(
  branch,
  onProgress,
  onComplete,
) {
  const maxAttempts = 60; // 5 minutos máximo
  const interval = 5000; // 5 segundos entre chequeos

  let attempts = 0;

  const checkStatus = async () => {
    try {
      const status = await getWorkspaceStatus(branch);

      if (status.ready) {
        onComplete({ success: true, status });
        return;
      }

      if (status.error) {
        onComplete({ success: false, error: status.error });
        return;
      }

      attempts++;
      onProgress({ attempts, maxAttempts, status });

      if (attempts >= maxAttempts) {
        onComplete({
          success: false,
          error: 'Tiempo de espera agotado para la preparación del workspace',
        });
        return;
      }

      // Continuar monitoreando
      setTimeout(checkStatus, interval);
    } catch (error) {
      onComplete({ success: false, error: error.message });
    }
  };

  // Iniciar monitoreo
  checkStatus();
}
```

## 📄 Gestión de Features

### 1. Listado y Contenido

```javascript
// public/js/api.js - Operaciones con features
export async function fetchFeatures(branch, client) {
  try {
    const response = await fetch(`/api/features/${branch}/${client}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { features: [], clients: [] };
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching features:', error);
    showError(`Error al cargar features: ${error.message}`);
    return { features: [], clients: [] };
  }
}

export async function getFeatureContent(branch, client, feature) {
  try {
    const response = await fetch(
      `/api/features/${branch}/${client}/${feature}`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Feature no encontrado: ${feature}`);
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error('Error getting feature content:', error);
    throw error;
  }
}

export async function saveFeatureContent(branch, client, feature, content) {
  try {
    const response = await fetch(
      `/api/features/${branch}/${client}/${feature}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      },
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Mostrar notificación de éxito
    showNotification(`Feature ${feature} guardado correctamente`, 'success');

    return result;
  } catch (error) {
    console.error('Error saving feature content:', error);
    showError(`Error al guardar feature: ${error.message}`);
    throw error;
  }
}
```

### 2. Búsqueda y Filtrado

```javascript
// public/js/api.js - Utilidades de búsqueda
export async function searchFeatures(branch, client, query) {
  try {
    const response = await fetch(
      `/api/features/${branch}/${client}/search?q=${encodeURIComponent(query)}`,
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching features:', error);
    return { results: [] };
  }
}

export function filterFeaturesByType(features, type) {
  return features.filter((feature) => feature.type === type);
}

export function sortFeaturesByName(features, direction = 'asc') {
  return [...features].sort((a, b) => {
    const comparison = a.name.localeCompare(b.name);
    return direction === 'asc' ? comparison : -comparison;
  });
}
```

## 🔀 Gestión Git

### 1. Operaciones Básicas

```javascript
// public/js/api.js - Operaciones Git
export async function getCommitStatus(branch) {
  try {
    const response = await fetch(`/api/git/${branch}/commit-status`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting commit status:', error);
    return { hasPendingCommits: false, commits: [] };
  }
}

export async function commitChanges(branch, files, message) {
  try {
    if (!message || message.trim() === '') {
      throw new Error('El mensaje de commit es requerido');
    }

    const response = await fetch(`/api/git/${branch}/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files, message: message.trim() }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Error ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();

    // Mostrar notificación de éxito
    showNotification(
      `Cambios commiteados correctamente: ${result.hash}`,
      'success',
    );

    return result;
  } catch (error) {
    console.error('Error committing changes:', error);
    showError(`Error al realizar commit: ${error.message}`);
    throw error;
  }
}

export async function pushChanges(branch) {
  try {
    const response = await fetch(`/api/git/${branch}/push`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Error ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();

    // Mostrar notificación de éxito
    showNotification(`Cambios pushados correctamente`, 'success');

    return result;
  } catch (error) {
    console.error('Error pushing changes:', error);
    showError(`Error al realizar push: ${error.message}`);
    throw error;
  }
}
```

### 2. Gestión de Diferencias

```javascript
// public/js/api.js - Operaciones con diff
export async function getGitDiff(branch, filePath = null) {
  try {
    const url = filePath
      ? `/api/git/${branch}/diff?path=${encodeURIComponent(filePath)}`
      : `/api/git/${branch}/diff`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting git diff:', error);
    return { diff: '', hasChanges: false };
  }
}

export async function getGitLog(branch, limit = 10) {
  try {
    const response = await fetch(`/api/git/${branch}/log?limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting git log:', error);
    return { commits: [] };
  }
}
```

## 👤 Gestión de Usuarios

### 1. Autenticación

```javascript
// public/js/api.js - Operaciones de usuario
export async function getCurrentUser() {
  try {
    const response = await fetch('/api/auth/current-user');

    if (!response.ok) {
      if (response.status === 401) {
        return null;
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export async function logout() {
  try {
    const response = await fetch('/auth/logout', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    // Limpiar estado local
    localStorage.clear();

    // Redirigir al login
    window.location.href = '/login';

    return await response.json();
  } catch (error) {
    console.error('Error during logout:', error);
    // Forzar redirección incluso si hay error
    window.location.href = '/login';
    throw error;
  }
}
```

### 2. Preferencias de Usuario

```javascript
// public/js/api.js - Gestión de preferencias
export async function getUserPreferences() {
  try {
    const response = await fetch('/api/user/preferences');

    if (!response.ok) {
      if (response.status === 404) {
        return getDefaultPreferences();
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return getDefaultPreferences();
  }
}

export async function saveUserPreferences(preferences) {
  try {
    const response = await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving user preferences:', error);
    throw error;
  }
}

function getDefaultPreferences() {
  return {
    theme: 'default',
    editor: {
      theme: 'default',
      fontSize: 14,
      lineNumbers: true,
      wordWrap: true,
    },
    execution: {
      autoSave: true,
      showProgress: true,
      timeout: 300000,
    },
  };
}
```

## 📊 Gestión de Reportes

### 1. Generación y Descarga

```javascript
// public/js/api.js - Operaciones con reportes
export async function generateReport(branch, client, features) {
  try {
    const response = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branch, client, features }),
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

export async function downloadReport(reportId) {
  try {
    const response = await fetch(`/api/reports/${reportId}/download`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    // Crear blob y descargar
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${reportId}.html`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return true;
  } catch (error) {
    console.error('Error downloading report:', error);
    throw error;
  }
}
```

### 2. Historial de Ejecuciones

```javascript
// public/js/api.js - Gestión de historial
export async function getExecutionHistory(limit = 50) {
  try {
    const response = await fetch(`/api/executions/history?limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting execution history:', error);
    return { executions: [] };
  }
}

export async function getExecutionDetails(executionId) {
  try {
    const response = await fetch(`/api/executions/${executionId}`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting execution details:', error);
    throw error;
  }
}
```

## 🔄 Integración con el Sistema

### 1. Manejo de Errores Global

```javascript
// public/js/api.js - Manejo centralizado de errores
export function handleApiError(error, context = '') {
  console.error(`API Error [${context}]:`, error);

  if (error.status === 401) {
    // Redirigir al login
    window.location.href = '/login';
    return;
  }

  if (error.status === 403) {
    showError('No tienes permisos para realizar esta acción');
    return;
  }

  if (error.status === 404) {
    showError('Recurso no encontrado');
    return;
  }

  if (error.status >= 500) {
    showError('Error interno del servidor. Por favor intenta más tarde');
    return;
  }

  // Error genérico
  showError(error.message || 'Error desconocido');
}
```

### 2. Cache de Respuestas

```javascript
// public/js/api.js - Sistema de cache simple
class ApiCache {
  constructor(ttl = 5 * 60 * 1000) {
    // 5 minutos por defecto
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  clear() {
    this.cache.clear();
  }

  clearPattern(pattern) {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

// Instancia global
const apiCache = new ApiCache();

// Función con cache
export async function fetchFeaturesWithCache(branch, client) {
  const cacheKey = `features:${branch}:${client}`;

  // Intentar obtener del cache
  const cached = apiCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Si no está en cache, hacer la petición
  const data = await fetchFeatures(branch, client);

  // Guardar en cache
  apiCache.set(cacheKey, data);

  return data;
}
```

## 📡 Eventos y Reactividad

### 1. Sistema de Eventos

```javascript
// public/js/api.js - Eventos de API
class ApiEventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
  }

  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in API event handler for ${event}:`, error);
        }
      });
    }
  }
}

// Instancia global
const apiEvents = new ApiEventEmitter();

// Eventos disponibles
export const API_EVENTS = {
  WORKSPACE_READY: 'workspace:ready',
  FEATURE_SAVED: 'feature:saved',
  COMMIT_SUCCESS: 'commit:success',
  PUSH_SUCCESS: 'push:success',
  ERROR: 'api:error',
};

// Uso en otras partes de la aplicación
apiEvents.on(API_EVENTS.FEATURE_SAVED, (data) => {
  // Actualizar UI cuando se guarda un feature
  console.log('Feature saved:', data);
});
```

## 📖 Documentos Relacionados

- [01-module-overview.md](./01-module-overview.md) - Visión general de los módulos
- [03-worker-integration.md](./03-worker-integration.md) - Integración con el sistema de workers
- [04-ui-components.md](./04-ui-components.md) - Componentes de UI reutilizables
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
