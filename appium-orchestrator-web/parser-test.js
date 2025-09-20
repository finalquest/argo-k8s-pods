#!/usr/bin/env node

/**
 * XML Parser Test Script
 *
 * This script helps debug the XML parser by processing captured XML files offline.
 * Usage: node parser-test.js <xml-file>
 */

const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');

class TestInspectorManager {
  constructor() {
    this.parser = new xml2js.Parser();
  }

  async parseUIElements(xmlSource, searchQuery = null, clickableOnly = false, maxElements = null) {
    try {
      console.log('[TEST] Starting XML parsing...');
      const result = await this.parser.parseStringPromise(xmlSource);
      console.log('[TEST] XML parsed successfully, result keys:', Object.keys(result));

      const nodes = this.extractNodes(result);
      console.log('[TEST] Extracted nodes:', nodes.length);

      // Flatten the hierarchy to get all elements
      const flattenedNodes = this.flattenHierarchy(nodes);
      console.log('[TEST] Flattened nodes:', flattenedNodes.length);

      const elements = [];

      for (const node of flattenedNodes) {
        const element = this.normalizeElement(node);

        // Apply filters
        if (searchQuery && !this.elementMatchesSearch(element, searchQuery)) {
          continue;
        }

        if (clickableOnly && !element.clickable) {
          continue;
        }

        elements.push(element);

        if (maxElements && elements.length >= maxElements) {
          break;
        }
      }

      console.log('[TEST] Final elements after filtering:', elements.length);
      if (elements.length > 0) {
        console.log('[TEST] Sample element:', elements[0]);
        console.log('[TEST] All element classes:', elements.map(e => e.class));

        // Show elements with content-desc and their locators
        const elementsWithContentDesc = elements.filter(e => e.contentDesc);
        console.log(`[TEST] Elements with content-desc: ${elementsWithContentDesc.length}`);

        if (elementsWithContentDesc.length > 0) {
          console.log('[TEST] Elements with content-desc and their locators:');
          elementsWithContentDesc.slice(0, 5).forEach((element, index) => {
            console.log(`[TEST] ${index + 1}. ${element.class} - contentDesc: "${element.contentDesc}"`);
            console.log(`[TEST]    Locators:`, element.locators);
          });
        }
      }

      return this.sortElementsByPriority(elements);
    } catch (error) {
      console.error('[TEST] Error parsing UI elements:', error.message);
      console.error('[TEST] Error details:', error);
      return [];
    }
  }

  extractNodes(obj, nodes = []) {
    if (!obj || typeof obj !== 'object') return nodes;

    console.log('[TEST] extractNodes called with keys:', Object.keys(obj));

    // Handle different XML structures from different Android versions
    if (obj.hierarchy && obj.hierarchy.node) {
      console.log('[TEST] Found hierarchy.node structure');
      this.processNodes(obj.hierarchy.node, nodes);
    } else if (obj.hierarchy && Array.isArray(obj.hierarchy)) {
      console.log('[TEST] Found hierarchy array structure');
      this.processNodes(obj.hierarchy, nodes);
    } else if (obj.node) {
      console.log('[TEST] Found direct node structure');
      this.processNodes(obj.node, nodes);
    } else if (obj.hierarchy) {
      console.log('[TEST] Found hierarchy object, checking for widget properties...');
      console.log('[TEST] Hierarchy object keys:', Object.keys(obj.hierarchy));

      // Look for widget properties in the hierarchy object
      const widgetKeys = Object.keys(obj.hierarchy).filter(key =>
        key !== '$' && key !== 'node' && typeof obj.hierarchy[key] === 'object'
      );

      console.log('[TEST] Potential widget keys:', widgetKeys);

      for (const widgetKey of widgetKeys) {
        const widgetData = obj.hierarchy[widgetKey];
        console.log(`[TEST] Checking widget key "${widgetKey}":`, Array.isArray(widgetData) ? `array with ${widgetData.length} items` : 'object');

        if (Array.isArray(widgetData)) {
          // Handle array of widgets - flatten the hierarchy to get ALL widgets
          if (widgetData.length > 0 && widgetData[0].$) {
            console.log(`[TEST] Found widget array with ${widgetData.length} items under "${widgetKey}"`);
            this.processNodes(widgetData, nodes);
            console.log(`[TEST] After processing ${widgetKey}, nodes count:`, nodes.length);
          }
        } else if (widgetData.$) {
          // Handle single widget
          console.log(`[TEST] Found single widget under "${widgetKey}"`);
          this.processNodes(widgetData, nodes);
          console.log(`[TEST] After processing ${widgetKey}, nodes count:`, nodes.length);
        }
      }

      console.log(`[TEST] Total extracted nodes from all widget keys:`, nodes.length);
    } else {
      console.log('[TEST] No recognized XML structure found');
      console.log('[TEST] Available keys:', Object.keys(obj));
      // Try to find any node-like structure
      for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object') {
          console.log(`[TEST] Checking key "${key}":`, typeof obj[key], Array.isArray(obj[key]) ? 'array' : 'object');
          if (obj[key].node) {
            console.log(`[TEST] Found node under key "${key}"`);
            this.processNodes(obj[key].node, nodes);
          } else if (Array.isArray(obj[key]) && obj[key].length > 0) {
            console.log(`[TEST] Found array under key "${key}" with ${obj[key].length} items`);
            // Check if first item has node structure
            if (obj[key][0] && obj[key][0].$) {
              console.log(`[TEST] Array items appear to be nodes, processing...`);
              this.processNodes(obj[key], nodes);
            }
          }
        }
      }
    }

    return nodes;
  }

  processNodes(nodes, result, parent = null) {
    if (!nodes) return;

    if (Array.isArray(nodes)) {
      nodes.forEach((node) => this.processNode(node, result, parent));
    } else {
      this.processNode(nodes, result, parent);
    }
  }

  processNode(node, result, parent = null) {
    // Debug: Log the node structure
    console.log('[TEST] Processing node:', {
      class: node.$?.class,
      hasChildren: !!node.node,
      keys: Object.keys(node),
      nodeKeys: node.node ? Object.keys(node.node) : [],
      isArray: Array.isArray(node.node)
    });

    const element = {
      ...node,
      parent,
      children: [],
    };

    result.push(element);
    console.log(`[TEST] Added node to result. Result count:`, result.length);

    // Handle children - Appium can store them in different structures
    if (node.node) {
      if (Array.isArray(node.node)) {
        console.log(`[TEST] Node has ${node.node.length} array children`);
        this.processNodes(node.node, element.children, element);
      } else {
        console.log('[TEST] Node has single child object');
        this.processNodes(node.node, element.children, element);
      }
    } else {
      // Look for children in other possible locations
      const childKeys = Object.keys(node).filter(key => key !== '$' && key !== 'parent' && key !== 'children');
      if (childKeys.length > 0) {
        console.log(`[TEST] Looking for children in keys:`, childKeys);
        for (const key of childKeys) {
          if (typeof node[key] === 'object' && node[key] !== null) {
            if (Array.isArray(node[key])) {
              console.log(`[TEST] Found array children under key "${key}":`, node[key].length);
              // Only add to parent's children array to avoid infinite loop
              this.processNodes(node[key], element.children, element);
            } else if (node[key].$) {
              console.log(`[TEST] Found single child under key "${key}"`);
              // Only add to parent's children array to avoid infinite loop
              this.processNodes(node[key], element.children, element);
            }
          }
        }
      }
    }
  }

  normalizeElement(node) {
    // Debug: Log the actual node structure
    console.log('[TEST] normalizeElement called with node:', {
      nodeKeys: Object.keys(node),
      hasDollar: !!node.$,
      dollarKeys: node.$ ? Object.keys(node.$) : [],
      dollarClass: node.$?.class,
      dollarBounds: node.$?.bounds,
      // Sample a few other properties
      sampleProps: Object.keys(node).filter(k => k !== '$' && k !== 'parent' && k !== 'children').slice(0, 3)
    });

    // Try to extract attributes from different possible locations
    let attributes = {};

    // Primary location: node.$ (standard xml2js format)
    if (node.$ && typeof node.$ === 'object') {
      attributes = node.$;
    }

    // Fallback: If node is a widget class name itself
    const widgetKeys = Object.keys(node).filter(key =>
      key !== '$' && key !== 'parent' && key !== 'children' &&
      typeof node[key] === 'object' && node[key] !== null
    );

    if (widgetKeys.length > 0 && !attributes.class) {
      // This node might be a container with widget properties
      console.log('[TEST] Node has widget properties:', widgetKeys);
    }

    console.log('[TEST] Using attributes:', attributes);

    const bounds = this.parseBounds(attributes.bounds || '[0,0][0,0]');
    const rect = this.boundsToRect(bounds);

    const element = {
      id: this.generateElementId(node),
      class: attributes.class || '',
      resourceId: attributes['resource-id'] || '',
      contentDesc: attributes['content-desc'] || '',
      text: attributes.text || '',
      clickable: attributes.clickable === 'true',
      enabled: attributes.enabled === 'true',
      focused: attributes.focused === 'true',
      bounds: bounds,
      rect: rect,
      locators: this.generateLocators(node),
    };

    console.log('[TEST] Normalized element:', {
      id: element.id,
      class: element.class,
      resourceId: element.resourceId,
      text: element.text,
      clickable: element.clickable,
      hasBounds: !!attributes.bounds
    });

    return element;
  }

  parseBounds(boundsStr) {
    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (match) {
      return {
        left: parseInt(match[1]),
        top: parseInt(match[2]),
        right: parseInt(match[3]),
        bottom: parseInt(match[4]),
      };
    }
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  boundsToRect(bounds) {
    return {
      x: bounds.left,
      y: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    };
  }

  generateElementId(node) {
    const parts = [
      node.$?.class || 'unknown',
      node.$?.['resource-id'] || '',
      node.$?.['content-desc'] || '',
    ];
    return Buffer.from(parts.join('|')).toString('base64').substring(0, 16);
  }

  generateLocators(node) {
    const locators = [];

    // 1. Content-desc format (highest priority)
    if (node.$?.['content-desc']) {
      locators.push({
        type: 'content-desc',
        value: `@content-desc='${node.$['content-desc']}'`,
        priority: 1,
      });
    }

    // 2. Resource ID
    if (node.$?.['resource-id']) {
      locators.push({
        type: 'id',
        value: node.$['resource-id'],
        priority: 2,
      });
    }

    return locators;
  }

  generateXPath(node) {
    const attrs = [];

    if (node.$?.class) {
      attrs.push(`@class='${node.$.class}'`);
    }

    if (node.$?.['resource-id']) {
      attrs.push(`@resource-id='${node.$['resource-id']}'`);
    }

    if (node.$?.['content-desc']) {
      attrs.push(`@content-desc='${node.$['content-desc']}'`);
    }

    if (attrs.length > 0) {
      return `//*[@${attrs.join(' and ')}]`;
    }

    return null;
  }

  elementMatchesSearch(element, searchQuery) {
    const query = searchQuery.toLowerCase();
    return (
      element.class.toLowerCase().includes(query) ||
      element.resourceId.toLowerCase().includes(query) ||
      element.contentDesc.toLowerCase().includes(query) ||
      element.text.toLowerCase().includes(query)
    );
  }

  flattenHierarchy(nodes, result = []) {
    if (!nodes) return result;

    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        result.push(node);
        // Recursively add all children
        if (node.children && node.children.length > 0) {
          this.flattenHierarchy(node.children, result);
        }
      }
    } else {
      // Single node
      result.push(nodes);
      // Recursively add all children
      if (nodes.children && nodes.children.length > 0) {
        this.flattenHierarchy(nodes.children, result);
      }
    }

    return result;
  }

  sortElementsByPriority(elements) {
    return elements.sort((a, b) => {
      // Priority: clickable > with content-desc > with resource-id
      const aPriority = (a.clickable ? 3 : 0) +
                       (a.contentDesc ? 2 : 0) +
                       (a.resourceId ? 1 : 0);
      const bPriority = (b.clickable ? 3 : 0) +
                       (b.contentDesc ? 2 : 0) +
                       (b.resourceId ? 1 : 0);
      return bPriority - aPriority;
    });
  }
}

// Main execution
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node parser-test.js <xml-file>');
    process.exit(1);
  }

  const xmlFile = process.argv[2];

  if (!fs.existsSync(xmlFile)) {
    console.error(`File not found: ${xmlFile}`);
    process.exit(1);
  }

  console.log(`[TEST] Loading XML from: ${xmlFile}`);

  try {
    const xmlSource = fs.readFileSync(xmlFile, 'utf8');
    console.log(`[TEST] XML loaded, length: ${xmlSource.length} characters`);

    const inspector = new TestInspectorManager();
    const elements = await inspector.parseUIElements(xmlSource);

    console.log(`\n[TEST] === FINAL RESULTS ===`);
    console.log(`[TEST] Total elements parsed: ${elements.length}`);
    console.log(`[TEST] Element types found:`);

    const typeCounts = {};
    elements.forEach(element => {
      typeCounts[element.class] = (typeCounts[element.class] || 0) + 1;
    });

    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`[TEST]   ${type}: ${count}`);
    });

    console.log(`\n[TEST] First 5 elements:`);
    elements.slice(0, 5).forEach((element, index) => {
      console.log(`[TEST]   ${index + 1}. ${element.class} - "${element.text}" - ${element.clickable ? 'clickable' : 'not clickable'}`);
    });

  } catch (error) {
    console.error('[TEST] Error:', error.message);
    console.error('[TEST] Stack:', error.stack);
  }
}

if (require.main === module) {
  main();
}

module.exports = TestInspectorManager;