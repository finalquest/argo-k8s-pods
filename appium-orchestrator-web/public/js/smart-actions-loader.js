// Smart Actions Module Loader
// Sistema de módulos frontend para smart actions

// Importar clases desde public/js/smart-actions/
import { SmartActionsManager } from './smart-actions/smart-actions-manager.js';
import { ActionRegistry } from './smart-actions/action-registry.js';
import { ActionContext } from './smart-actions/action-context.js';
import { BaseAction } from './smart-actions/base-action.js';
import { InsertStepAction } from './smart-actions/actions/insert-step-action.js';
import { CopyStepAction } from './smart-actions/actions/copy-step-action.js';
import { InsertJsonReferenceAction } from './smart-actions/actions/insert-json-reference-action.js';

// Exportar como módulo ES6 - sin variables globales
export {
  SmartActionsManager,
  ActionRegistry,
  ActionContext,
  BaseAction,
  InsertStepAction,
  CopyStepAction,
  InsertJsonReferenceAction,
};

// Sin variables globales - todo el código usa imports ES6
