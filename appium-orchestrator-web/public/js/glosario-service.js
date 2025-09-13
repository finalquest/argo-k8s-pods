// Glosario Service
// Handles API communication for step definitions scanning

import { logDebug, logError } from './utils/error-handling.js';

class GlosarioService {
  constructor() {
    this.baseApiUrl = '/api/steps';
    this.currentBranch = null;
    this.cache = new Map();
    this.debugMode = false;
  }

  /**
   * Get steps for a specific branch (uses cache if available)
   */
  async getSteps(branch, forceRefresh = false) {
    console.log('[GLOSARIO-SERVICE] getSteps called for branch:', branch, 'forceRefresh:', forceRefresh);
    
    // Update current branch if changed
    if (this.currentBranch !== branch) {
      console.log('[GLOSARIO-SERVICE] Branch changed, clearing cache for old branch');
      this.currentBranch = branch;
      forceRefresh = true; // Force refresh when branch changes
    }

    // Return cached data if available and not forcing refresh
    if (!forceRefresh && this.cache.has(branch)) {
      console.log('[GLOSARIO-SERVICE] Returning cached data for branch:', branch);
      const cachedData = this.cache.get(branch);
      return { ...cachedData, cached: true };
    }

    // Scan fresh data
    console.log('[GLOSARIO-SERVICE] Scanning fresh data for branch:', branch);
    try {
      const url = `${this.baseApiUrl}/scan?branch=${encodeURIComponent(branch)}`;
      console.log('[GLOSARIO-SERVICE] Fetching URL:', url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log('[GLOSARIO-SERVICE] Scan successful, caching result for branch:', branch);
        const dataWithCacheFlag = { ...result.data, cached: false };
        this.cache.set(branch, dataWithCacheFlag);
        return dataWithCacheFlag;
      } else {
        throw new Error(result.error || 'Error al escanear steps');
      }
    } catch (error) {
      console.error('Error scanning steps:', error);
      throw error;
    }
  }

  /**
   * Force refresh steps for current branch
   */
  async refreshSteps(branch) {
    console.log('[GLOSARIO-SERVICE] refreshSteps called for branch:', branch);
    return this.getSteps(branch, true);
  }

  /**
   * Get status for a specific branch
   */
  async getStatus(branch) {
    console.log('[GLOSARIO-SERVICE] getStatus called for branch:', branch);
    try {
      const url = `${this.baseApiUrl}/status?branch=${encodeURIComponent(branch)}`;
      console.log('[GLOSARIO-SERVICE] Fetching URL:', url);
      const response = await fetch(url);

      console.log('[GLOSARIO-SERVICE] Response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[GLOSARIO-SERVICE] Response result:', result);

      if (result.success) {
        console.log('[GLOSARIO-SERVICE] Returning data:', result.data);
        return result.data;
      } else {
        throw new Error(result.error || 'Error al obtener status');
      }
    } catch (error) {
      console.error('[GLOSARIO-SERVICE] Error getting status:', error);
      throw error;
    }
  }

  /**
   * Clear cache for a branch or all branches
   */
  async clearCache(branch = null) {
    try {
      const body = branch ? { branch } : {};
      const response = await fetch(`${this.baseApiUrl}/cache/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        if (branch) {
          this.cache.delete(branch);
        } else {
          this.cache.clear();
        }
        return result;
      } else {
        throw new Error(result.error || 'Error al limpiar caché');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw error;
    }
  }

  /**
   * Get cached steps for current branch
   */
  getCachedSteps() {
    console.log(
      '[GLOSARIO-SERVICE] getCachedSteps called, currentBranch:',
      this.currentBranch,
    );
    console.log(
      '[GLOSARIO-SERVICE] Cache keys:',
      Array.from(this.cache.keys()),
    );
    if (!this.currentBranch) {
      console.log('[GLOSARIO-SERVICE] No current branch set');
      return null;
    }
    const cached = this.cache.get(this.currentBranch);
    console.log('[GLOSARIO-SERVICE] Cached data for branch:', cached);
    return cached;
  }

  /**
   * Clear cache when branch changes
   */
  onBranchChange(newBranch) {
    console.log('[GLOSARIO-SERVICE] Branch changed to:', newBranch);
    if (this.currentBranch !== newBranch) {
      this.currentBranch = newBranch;
      // Cache remains, but will be refreshed on next access
    }
  }

  /**
   * Check if we have cached steps for a branch
   */
  hasCachedSteps(branch) {
    return this.cache.has(branch);
  }

  /**
   * Get steps by type (Given/When/Then)
   */
  getStepsByType(type) {
    const cached = this.getCachedSteps();
    if (!cached || !cached.steps) {
      return [];
    }

    return cached.steps.filter((step) => step.type === type);
  }

  /**
   * Search steps by text
   */
  searchSteps(query) {
    const cached = this.getCachedSteps();
    if (!cached || !cached.steps) {
      return [];
    }

    const lowercaseQuery = query.toLowerCase();
    return cached.steps.filter(
      (step) =>
        step.text.toLowerCase().includes(lowercaseQuery) ||
        step.type.toLowerCase().includes(lowercaseQuery) ||
        step.file.toLowerCase().includes(lowercaseQuery),
    );
  }

  /**
   * Get unique files from steps
   */
  getUniqueFiles() {
    const cached = this.getCachedSteps();
    if (!cached || !cached.steps) {
      return [];
    }

    const fileSet = new Set();
    cached.steps.forEach((step) => {
      fileSet.add(step.file);
    });

    return Array.from(fileSet).sort();
  }
}

// Export singleton instance
const glosarioService = new GlosarioService();

// Registrar en el service registry
if (typeof serviceRegistry !== 'undefined') {
  serviceRegistry.register('glosario', glosarioService);
} else if (typeof window !== 'undefined') {
  // Fallback para compatibilidad temporal
  window.glosarioService = glosarioService;
}

export default glosarioService;
