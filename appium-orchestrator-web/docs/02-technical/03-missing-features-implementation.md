# Autocomplete Features Implementation Plan

## Overview

This document outlines the technical implementation strategy to address missing autocomplete features in the Appium Orchestrator Web application. The implementation focuses on three core areas: auto-trigger repair, variable replacement system, and JSON objects integration.

## Phase 1: Auto-Triggers Repair

### Current Issues Analysis

The existing auto-trigger system in `autocomplete-service.js` has several critical issues preventing proper functionality:

1. **Incomplete Trigger Detection**: The system doesn't properly handle all Gherkin keyword variations and line positions
2. **Missing State Management**: No proper tracking of when auto-triggers should be active vs. suppressed
3. **Context Detection Flaws**: The `isGherkinKeywordTrigger` method uses incomplete regex patterns

### Implementation Plan

#### 1.1 Enhanced Trigger Detection System

**File**: `public/js/autocomplete/autocomplete-service.js`

**New Properties**:

```javascript
this.autoTriggerState = {
  isEnabled: true,
  lastTriggerLine: -1,
  lastTriggerTime: 0,
  recentInsertions: new Set(),
  suppressUntil: 0,
};
```

**Enhanced Methods**:

```javascript
isGherkinKeywordTrigger(line, cursorPos) {
  // Extended patterns for all Gherkin keywords with flexible spacing
  const gherkinPatterns = [
    /^\s*Given\s*$/,           // Given at line end
    /^\s*When\s*$/,            // When at line end
    /^\s*Then\s*$/,            // Then at line end
    /^\s*And\s*$/,             // And at line end
    /^\s*But\s*$/,             // But at line end
    /^\s*Given\s+\w*$/,        // Given with partial word
    /^\s*When\s+\w*$/,         // When with partial word
    /^\s*Then\s+\w*$/,         // Then with partial word
    /^\s*And\s+\w*$/,          // And with partial word
    /^\s*But\s+\w*$/,          // But with partial word
  ];

  const textBeforeCursor = line.substring(0, cursorPos);
  const trimmedBefore = textBeforeCursor.trim();

  // Check if we just inserted a keyword (should suppress auto-trigger)
  if (this.autoTriggerState.recentInsertions.has(trimmedBefore)) {
    return false;
  }

  return gherkinPatterns.some(pattern => pattern.test(textBeforeCursor));
}
```

#### 1.2 Smart Suppression System

**New Method**:

```javascript
shouldSuppressAutoTrigger(change) {
  const now = Date.now();

  // Suppress if recently inserted (prevents double triggers)
  if (now - this.autoTriggerState.lastTriggerTime < 500) {
    return true;
  }

  // Suppress if we're in a JSON context
  if (this.isInJsonContext(change)) {
    return true;
  }

  // Suppress if cursor is in middle of existing word
  const line = this.codeMirror.getLine(change.from.line);
  const cursorPos = change.from.ch;
  const wordBefore = line.substring(0, cursorPos).match(/\w+$/);
  const wordAfter = line.substring(cursorPos).match(/^\w+/);

  if (wordBefore && wordAfter) {
    return true; // Cursor is in middle of a word
  }

  return false;
}
```

#### 1.3 Enhanced Event Handling

**Modified `handleTextChange`**:

```javascript
handleTextChange(instance, change) {
  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer);
  }

  this.debounceTimer = setTimeout(() => {
    if (!this.isAutoTriggerEnabled) {
      return;
    }

    if (!change || !change.from) {
      return;
    }

    // NEW: Smart suppression logic
    if (this.shouldSuppressAutoTrigger(change)) {
      return;
    }

    // Existing persistent mode logic
    if (this.hintWidget.isPersistentMode && this.hintWidget.isVisible) {
      this.schedulePersistentUpdate();
      return;
    }

    const { from } = change;
    const line = this.codeMirror.getLine(from.line);
    const cursorPos = from.ch;

    // Enhanced auto-triggers with better detection
    const triggers = [
      { condition: () => this.isGherkinKeywordTrigger(line, cursorPos), priority: 1 },
      { condition: () => this.isJsonReferenceTrigger(line, cursorPos), priority: 2 },
      { condition: () => this.isContextualTrigger(line, cursorPos), priority: 3 }
    ];

    // Find the highest priority trigger that matches
    const activeTrigger = triggers.find(t => t.condition());
    if (activeTrigger) {
      this.autoTriggerState.lastTriggerLine = from.line;
      this.autoTriggerState.lastTriggerTime = Date.now();
      this.showHints();
    }
  }, 300);
}
```

#### 1.4 State Management Integration

**New Methods**:

```javascript
trackKeywordInsertion(keyword) {
  this.autoTriggerState.recentInsertions.add(keyword.trim());
  this.autoTriggerState.lastTriggerTime = Date.now();

  // Clear recent insertions after 1 second
  setTimeout(() => {
    this.autoTriggerState.recentInsertions.clear();
  }, 1000);
}

isInJsonContext(change) {
  const line = this.codeMirror.getLine(change.from.line);
  const textBefore = line.substring(0, change.from.ch);

  // Count braces to determine if we're in a JSON object
  const openBraces = (textBefore.match(/\{/g) || []).length;
  const closeBraces = (textBefore.match(/\}/g) || []).length;

  return openBraces > closeBraces;
}
```

### Phase 2: Variable Replacement System

#### 2.1 JSON Variable Provider

**New File**: `public/js/autocomplete/providers/json-variable-provider.js`

```javascript
class JsonVariableProvider {
  constructor(glosarioService) {
    this.glosarioService = glosarioService;
    this.type = 'jsonvar';
    this.variableCache = new Map();
  }

  async getHints(context) {
    const variables = await this.extractVariables(context);
    if (!variables.length) {
      return { list: [] };
    }

    const currentWord = context.currentWord || '';
    const hints = [];

    for (const variable of variables) {
      if (
        currentWord &&
        !variable.name.toLowerCase().includes(currentWord.toLowerCase())
      ) {
        continue;
      }

      hints.push({
        text: this.formatVariable(variable),
        displayText: variable.name,
        type: 'jsonvar',
        description: `${variable.type} • ${variable.source}`,
        score: this.calculateVariableScore(variable, context),
        originalVariable: variable,
        replacementData: variable,
      });
    }

    return {
      list: hints.sort((a, b) => b.score - a.score).slice(0, 20),
      from: this.getVariableStartPosition(context),
      to: this.getVariableEndPosition(context),
    };
  }

  async extractVariables(context) {
    const cachedJson = this.glosarioService.getCachedJsonReferences();
    if (!cachedJson || !cachedJson.data) {
      return [];
    }

    const variables = [];

    // Extract variables from JSON references
    if (cachedJson.data.files) {
      for (const [filename, fileData] of Object.entries(
        cachedJson.data.files,
      )) {
        if (fileData.variables) {
          for (const variable of fileData.variables) {
            variables.push({
              name: variable.name || variable.path,
              value: variable.value,
              type: variable.type || 'string',
              source: filename,
              path: variable.path,
              description: variable.description,
            });
          }
        }
      }
    }

    // Cache for performance
    this.variableCache.set(context.line, variables);
    return variables;
  }

  formatVariable(variable) {
    // Format as ${variable.name} for direct insertion
    return `\${${variable.name}}`;
  }

  calculateVariableScore(variable, context) {
    let score = 70; // Base score for variables

    // Bonus for exact name match
    if (
      context.currentWord &&
      variable.name.toLowerCase().startsWith(context.currentWord.toLowerCase())
    ) {
      score += 40;
    }

    // Bonus for commonly used variable types
    const highValueTypes = ['string', 'number', 'boolean'];
    if (highValueTypes.includes(variable.type)) {
      score += 20;
    }

    // Bonus for descriptive names
    if (variable.name.length > 3 && variable.name.length < 20) {
      score += 10;
    }

    return score;
  }

  getVariableStartPosition(context) {
    const line = context.line;
    const cursor = context.ch;
    const lineText = context.lineText;

    // Find the start of the current variable reference
    let start = cursor;
    while (
      start > 0 &&
      lineText[start - 1] !== '{' &&
      lineText[start - 1] !== '$'
    ) {
      start--;
    }

    return { line, ch: start };
  }

  getVariableEndPosition(context) {
    return context.codeMirror.getCursor();
  }

  handleVariableInsertion(hint, context) {
    const cursor = context.codeMirror.getCursor();
    const fromPos = this.getVariableStartPosition(context);
    const toPos = this.getVariableEndPosition(context);

    // Insert the formatted variable
    context.codeMirror.replaceRange(hint.text, fromPos, toPos);

    // Position cursor after insertion
    const endPos = { line: cursor.line, ch: fromPos.ch + hint.text.length };
    context.codeMirror.setCursor(endPos);

    // Optional: Show variable value in a tooltip
    this.showVariableTooltip(hint.originalVariable, endPos);
  }

  showVariableTooltip(variable, position) {
    // Implementation for showing variable value tooltip
    // This would integrate with existing tooltip systems
  }

  destroy() {
    this.variableCache.clear();
  }
}

export default JsonVariableProvider;
```

#### 2.2 Enhanced Context Detection

**Enhanced `isJsonReferenceTrigger`**:

```javascript
isJsonReferenceTrigger(line, cursorPos) {
  const textBeforeCursor = line.substring(0, cursorPos);

  // Trigger on opening brace
  if (textBeforeCursor.includes('{')) {
    return true;
  }

  // Trigger on dollar sign (for variables)
  if (textBeforeCursor.includes('$')) {
    return true;
  }

  // Trigger on specific patterns in JSON context
  const jsonPatterns = [
    /"\w*$/,           // Inside JSON string
    /:\s*\w*$/,        // After JSON colon
    /\[\s*\w*$/        // Inside JSON array
  ];

  return jsonPatterns.some(pattern => pattern.test(textBeforeCursor));
}
```

#### 2.3 Variable Replacement Service

**New File**: `public/js/services/variable-replacement-service.js`

```javascript
class VariableReplacementService {
  constructor(glosarioService) {
    this.glosarioService = glosarioService;
    this.variablePattern = /\$\{([^}]+)\}/g;
    this.replacementCache = new Map();
  }

  async replaceVariables(text) {
    const matches = text.match(this.variablePattern);
    if (!matches) {
      return text;
    }

    let result = text;
    for (const match of matches) {
      const variableName = match.slice(2, -1); // Remove ${ and }
      const value = await this.getVariableValue(variableName);

      if (value !== null) {
        result = result.replace(match, value);
      }
    }

    return result;
  }

  async getVariableValue(variableName) {
    // Check cache first
    if (this.replacementCache.has(variableName)) {
      return this.replacementCache.get(variableName);
    }

    // Get from glosario service
    const jsonRefs = this.glosarioService.getCachedJsonReferences();
    if (!jsonRefs || !jsonRefs.data) {
      return null;
    }

    // Search for variable in all files
    for (const fileData of Object.values(jsonRefs.data.files)) {
      if (fileData.variables) {
        const variable = fileData.variables.find(
          (v) => v.name === variableName,
        );
        if (variable) {
          const value = this.processVariableValue(variable);
          this.replacementCache.set(variableName, value);
          return value;
        }
      }
    }

    return null;
  }

  processVariableValue(variable) {
    let value = variable.value;

    // Handle different variable types
    switch (variable.type) {
      case 'number':
        value = Number(value);
        break;
      case 'boolean':
        value = Boolean(value);
        break;
      case 'string':
      default:
        // Ensure string values are properly quoted if needed
        if (
          typeof value === 'string' &&
          !value.startsWith('"') &&
          !value.startsWith("'")
        ) {
          value = `"${value}"`;
        }
        break;
    }

    return value;
  }

  extractVariables(text) {
    const variables = [];
    let match;

    while ((match = this.variablePattern.exec(text)) !== null) {
      variables.push({
        name: match[1],
        fullMatch: match[0],
        position: match.index,
      });
    }

    return variables;
  }

  clearCache() {
    this.replacementCache.clear();
  }

  destroy() {
    this.clearCache();
  }
}

export default VariableReplacementService;
```

### Phase 3: JSON Objects Integration

#### 3.1 Enhanced JSON Reference Provider

**Enhanced `JsonReferenceHintProvider`**:

```javascript
async getHints(context) {
  const cachedRefs = this.glosarioService.getCachedJsonReferences();
  if (!cachedRefs || !cachedRefs.data) {
    return { list: [] };
  }

  const hints = [];
  const currentWord = context.currentWord || '';
  const lineText = context.lineText;

  // Enhanced JSON context detection
  if (!this.isJsonContext(lineText, context.ch)) {
    return { list: [] };
  }

  // Extract both references and objects
  const jsonItems = this.extractJsonItems(cachedRefs.data);

  for (const item of jsonItems) {
    if (currentWord && !item.name.toLowerCase().includes(currentWord.toLowerCase())) {
      continue;
    }

    hints.push({
      text: this.formatJsonItem(item, context),
      displayText: item.name,
      type: item.type === 'object' ? 'jsonobj' : 'jsonref',
      description: this.getItemDescription(item),
      score: this.calculateJsonScore(item, context),
      originalItem: item,
      preview: item.preview
    });
  }

  return {
    list: hints.sort((a, b) => b.score - a.score).slice(0, 15),
    from: this.getHintPosition(context),
    to: this.getHintEndPosition(context)
  };
}

extractJsonItems(data) {
  const items = [];

  if (data.files) {
    for (const [filename, fileData] of Object.entries(data.files)) {
      // Add file-level references
      if (fileData.references) {
        for (const reference of fileData.references) {
          items.push({
            name: `${filename}.${reference}`,
            type: 'reference',
            source: filename,
            path: reference
          });
        }
      }

      // Add JSON objects
      if (fileData.objects) {
        for (const [objName, objData] of Object.entries(fileData.objects)) {
          items.push({
            name: objName,
            type: 'object',
            source: filename,
            data: objData,
            preview: this.generateObjectPreview(objData)
          });
        }
      }

      // Add variables (from Phase 2)
      if (fileData.variables) {
        for (const variable of fileData.variables) {
          items.push({
            name: variable.name,
            type: 'variable',
            source: filename,
            data: variable,
            preview: `${variable.name}: ${variable.value}`
          });
        }
      }
    }
  }

  return items;
}

generateObjectPreview(objData) {
  if (typeof objData === 'string') {
    return objData.length > 50 ? objData.substring(0, 50) + '...' : objData;
  }

  if (typeof objData === 'object') {
    const keys = Object.keys(objData);
    if (keys.length > 0) {
      return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''} }`;
    }
  }

  return String(objData);
}

formatJsonItem(item, context) {
  if (item.type === 'object') {
    // Format as JSON object
    return JSON.stringify(item.data);
  } else if (item.type === 'variable') {
    // Format as variable reference
    return `\${${item.name}}`;
  } else {
    // Format as regular reference
    return item.name;
  }
}

getItemDescription(item) {
  switch (item.type) {
    case 'object':
      return `JSON Object • ${item.source}`;
    case 'variable':
      return `Variable • ${item.data.type}`;
    default:
      return `Reference • ${item.source}`;
  }
}
```

#### 3.2 JSON Object Preview Widget

**New File**: `public/js/autocomplete/json-preview-widget.js`

```javascript
class JsonPreviewWidget {
  constructor(autocompleteService) {
    this.autocompleteService = autocompleteService;
    this.isVisible = false;
    this.currentPreview = null;
    this.createPreviewElement();
  }

  createPreviewElement() {
    this.element = document.createElement('div');
    this.element.className = 'json-preview-widget';
    this.element.innerHTML = `
      <div class="preview-header">
        <span class="preview-title">JSON Preview</span>
        <button class="preview-close">&times;</button>
      </div>
      <div class="preview-content"></div>
      <div class="preview-footer">
        <button class="preview-insert">Insert</button>
        <button class="preview-copy">Copy</button>
      </div>
    `;

    // Event handlers
    this.element
      .querySelector('.preview-close')
      .addEventListener('click', () => {
        this.hide();
      });

    this.element
      .querySelector('.preview-insert')
      .addEventListener('click', () => {
        this.insertCurrentPreview();
      });

    this.element
      .querySelector('.preview-copy')
      .addEventListener('click', () => {
        this.copyCurrentPreview();
      });

    document.body.appendChild(this.element);
  }

  show(jsonData, position) {
    this.currentPreview = jsonData;
    this.updateContent(jsonData);
    this.positionAt(position);
    this.element.classList.add('visible');
    this.isVisible = true;
  }

  updateContent(jsonData) {
    const content = this.element.querySelector('.preview-content');

    if (typeof jsonData === 'string') {
      content.textContent = jsonData;
    } else if (typeof jsonData === 'object') {
      content.textContent = JSON.stringify(jsonData, null, 2);
    } else {
      content.textContent = String(jsonData);
    }
  }

  positionAt(cursorPos) {
    const editor = this.autocompleteService.codeMirror;
    const coords = editor.cursorCoords(cursorPos);

    this.element.style.left = `${coords.left}px`;
    this.element.style.top = `${coords.bottom + 5}px`;
  }

  hide() {
    this.element.classList.remove('visible');
    this.isVisible = false;
    this.currentPreview = null;
  }

  insertCurrentPreview() {
    if (!this.currentPreview) return;

    const editor = this.autocompleteService.codeMirror;
    const cursor = editor.getCursor();

    // Insert formatted JSON at cursor position
    const jsonText =
      typeof this.currentPreview === 'string'
        ? this.currentPreview
        : JSON.stringify(this.currentPreview, null, 2);

    editor.replaceRange(jsonText, cursor);
    this.hide();
  }

  async copyCurrentPreview() {
    if (!this.currentPreview) return;

    const text =
      typeof this.currentPreview === 'string'
        ? this.currentPreview
        : JSON.stringify(this.currentPreview, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      // Show feedback (could integrate with existing notification system)
      this.showCopyFeedback();
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  showCopyFeedback() {
    const button = this.element.querySelector('.preview-copy');
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

export default JsonPreviewWidget;
```

#### 3.3 Enhanced Autocomplete Service Integration

**Modified `initializeProviders`**:

```javascript
initializeProviders() {
  // Import new providers
  import JsonVariableProvider from './providers/json-variable-provider.js';

  this.providers = [
    new StepHintProvider(this.glosarioService),
    new JsonReferenceHintProvider(this.glosarioService),
    new JsonVariableProvider(this.glosarioService),  // NEW
    new GherkinKeywordHintProvider(),
    new ContextualHintProvider(this.glosarioService),
  ];

  // Initialize JSON preview widget
  this.jsonPreviewWidget = new JsonPreviewWidget(this);
}
```

### Testing Strategy

#### Unit Tests

1. **Auto-Trigger Tests**:
   - Test trigger detection for all Gherkin keywords
   - Test suppression logic works correctly
   - Test state management prevents double triggers

2. **Variable Replacement Tests**:
   - Test variable extraction from various text patterns
   - Test value replacement with different variable types
   - Test cache functionality

3. **JSON Object Tests**:
   - Test JSON object extraction from glosario data
   - Test preview widget functionality
   - Test insertion and copy operations

#### Integration Tests

1. **End-to-End Autocomplete**:
   - Test complete workflow from trigger to insertion
   - Test integration with existing glosario system
   - Test performance with large datasets

2. **Cross-Feature Integration**:
   - Test variable replacement works with step insertion
   - Test JSON objects integrate with existing hints
   - Test persistent mode compatibility

### Performance Considerations

1. **Caching Strategy**:
   - Implement multi-level caching (variables, JSON objects, references)
   - Cache invalidation on glosario updates
   - Debounce and throttle expensive operations

2. **Memory Management**:
   - Proper cleanup of event listeners
   - Cache size limits and expiration
   - Efficient data structures for lookups

3. **Response Time Optimization**:
   - Lazy loading of large JSON objects
   - Progressive loading of hints
   - Background preprocessing

### Error Handling

1. **Graceful Degradation**:
   - Fallback to basic functionality if providers fail
   - Error boundaries for individual providers
   - User-friendly error messages

2. **Recovery Mechanisms**:
   - Automatic retry for failed operations
   - Cache rebuilding on corruption
   - State reset on critical errors

### Deployment Plan

1. **Phase 1 (Week 1)**: Auto-trigger repair and testing
2. **Phase 2 (Week 2)**: Variable replacement system implementation
3. **Phase 3 (Week 3)**: JSON objects integration and preview widget
4. **Testing & Optimization (Week 4)**: Comprehensive testing and performance tuning

### Success Metrics

1. **Functional Metrics**:
   - Auto-triggers work for all Gherkin patterns (100%)
   - Variable replacement completes successfully (>95%)
   - JSON objects display correctly with preview

2. **Performance Metrics**:
   - Autocomplete response time < 200ms
   - Memory usage increase < 10%
   - No impact on editor typing performance

3. **User Experience Metrics**:
   - Reduced manual Ctrl+Space usage
   - Increased successful hint insertions
   - Positive user feedback on new features
