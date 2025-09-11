// String Utilities Module
// Handles string manipulation, formatting, validation, and text processing

class StringUtilities {
  constructor(validationManager) {
    this.validationManager = validationManager;
  }

  /**
   * Convert string to uppercase
   */
  toUpperCase(str) {
    return str ? str.toUpperCase() : '';
  }

  /**
   * Convert string to lowercase
   */
  toLowerCase(str) {
    return str ? str.toLowerCase() : '';
  }

  /**
   * Capitalize first letter of string
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Capitalize first letter of each word
   */
  titleCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
    );
  }

  /**
   * Remove leading and trailing whitespace
   */
  trim(str) {
    return str ? str.trim() : '';
  }

  /**
   * Remove all whitespace from string
   */
  removeAllWhitespace(str) {
    return str ? str.replace(/\s+/g, '') : '';
  }

  /**
   * Normalize whitespace (replace multiple spaces with single space)
   */
  normalizeWhitespace(str) {
    return str ? str.replace(/\s+/g, ' ').trim() : '';
  }

  /**
   * Split string by delimiter
   */
  split(str, delimiter, limit) {
    if (!str) return [];
    return limit ? str.split(delimiter, limit) : str.split(delimiter);
  }

  /**
   * Join array elements with separator
   */
  join(array, separator = ',') {
    if (!Array.isArray(array)) return '';
    return array.join(separator);
  }

  /**
   * Check if string contains substring
   */
  includes(str, substring, caseSensitive = true) {
    if (!str || !substring) return false;
    if (caseSensitive) {
      return str.includes(substring);
    }
    return str.toLowerCase().includes(substring.toLowerCase());
  }

  /**
   * Check if string starts with prefix
   */
  startsWith(str, prefix, caseSensitive = true) {
    if (!str || !prefix) return false;
    if (caseSensitive) {
      return str.startsWith(prefix);
    }
    return str.toLowerCase().startsWith(prefix.toLowerCase());
  }

  /**
   * Check if string ends with suffix
   */
  endsWith(str, suffix, caseSensitive = true) {
    if (!str || !suffix) return false;
    if (caseSensitive) {
      return str.endsWith(suffix);
    }
    return str.toLowerCase().endsWith(suffix.toLowerCase());
  }

  /**
   * Extract substring between start and end indices
   */
  substring(str, start, end) {
    if (!str) return '';
    return end !== undefined ? str.substring(start, end) : str.substring(start);
  }

  /**
   * Extract substring using slice
   */
  slice(str, start, end) {
    if (!str) return '';
    return end !== undefined ? str.slice(start, end) : str.slice(start);
  }

  /**
   * Pad string with characters on the left
   */
  padStart(str, targetLength, padChar = ' ') {
    if (!str) return '';
    return str.padStart(targetLength, padChar);
  }

  /**
   * Pad string with characters on the right
   */
  padEnd(str, targetLength, padChar = ' ') {
    if (!str) return '';
    return str.padEnd(targetLength, padChar);
  }

  /**
   * Repeat string n times
   */
  repeat(str, count) {
    if (!str) return '';
    return str.repeat(count);
  }

  /**
   * Replace all occurrences of search string with replacement
   */
  replaceAll(str, search, replacement) {
    if (!str) return '';
    return str.split(search).join(replacement);
  }

  /**
   * Replace using regular expression
   */
  replaceRegex(str, regex, replacement) {
    if (!str) return '';
    return str.replace(regex, replacement);
  }

  /**
   * Convert string to camelCase
   */
  toCamelCase(str) {
    if (!str) return '';
    return str
      .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
      .replace(/^[A-Z]/, (firstChar) => firstChar.toLowerCase());
  }

  /**
   * Convert string to snake_case
   */
  toSnakeCase(str) {
    if (!str) return '';
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[-\s]+/g, '_')
      .toLowerCase();
  }

  /**
   * Convert string to kebab-case
   */
  toKebabCase(str) {
    if (!str) return '';
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase();
  }

  /**
   * Convert string to PascalCase
   */
  toPascalCase(str) {
    if (!str) return '';
    const camelCase = this.toCamelCase(str);
    return this.capitalize(camelCase);
  }

  /**
   * Truncate string to specified length
   */
  truncate(str, maxLength, suffix = '...') {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Extract file extension from path
   */
  getFileExtension(path) {
    if (!path) return '';
    const lastDot = path.lastIndexOf('.');
    return lastDot === -1 ? '' : path.slice(lastDot + 1);
  }

  /**
   * Extract filename without extension from path
   */
  getFileName(path) {
    if (!path) return '';
    const fileName = path.split('/').pop().split('\\').pop();
    const lastDot = fileName.lastIndexOf('.');
    return lastDot === -1 ? fileName : fileName.slice(0, lastDot);
  }

  /**
   * Generate random string
   */
  generateRandom(length = 8, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    if (length <= 0) return '';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  /**
   * Generate UUID-like string
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Format string with template variables
   */
  format(template, variables) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(str) {
    if (!str) return '';
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
  }

  /**
   * Unescape HTML special characters
   */
  unescapeHtml(str) {
    if (!str) return '';
    const htmlUnescapes = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'"
    };
    return str.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => htmlUnescapes[entity]);
  }

  /**
   * Sanitize string for safe usage
   */
  sanitize(str, allowedChars = 'a-zA-Z0-9_.-') {
    if (!str) return '';
    return str.replace(new RegExp(`[^${allowedChars}]`, 'g'), '_');
  }

  /**
   * Count occurrences of substring in string
   */
  countOccurrences(str, substring) {
    if (!str || !substring) return 0;
    return (str.match(new RegExp(this.escapeRegex(substring), 'g')) || []).length;
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(str) {
    if (!str) return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Reverse string
   */
  reverse(str) {
    if (!str) return '';
    return str.split('').reverse().join('');
  }

  /**
   * Check if string is empty or contains only whitespace
   */
  isEmpty(str) {
    return !str || str.trim().length === 0;
  }

  /**
   * Check if string is not empty
   */
  isNotEmpty(str) {
    return !this.isEmpty(str);
  }

  /**
   * Convert string to URL slug
   */
  toSlug(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Convert bytes to human readable format
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  }

  /**
   * Convert number to formatted string with separators
   */
  formatNumber(num, locale = 'en-US') {
    if (num === undefined || num === null) return '';
    return new Intl.NumberFormat(locale).format(num);
  }

  /**
   * Convert date to formatted string
   */
  formatDate(date, format = 'YYYY-MM-DD') {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * Extract numbers from string
   */
  extractNumbers(str) {
    if (!str) return [];
    return str.match(/\d+/g) || [];
  }

  /**
   * Extract email addresses from string
   */
  extractEmails(str) {
    if (!str) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return str.match(emailRegex) || [];
  }

  /**
   * Extract URLs from string
   */
  extractUrls(str) {
    if (!str) return [];
    const urlRegex = /https?:\/\/[^\s]+/g;
    return str.match(urlRegex) || [];
  }

  /**
   * Validate if string is a valid email
   */
  isValidEmail(str) {
    if (!str) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(str);
  }

  /**
   * Validate if string is a valid URL
   */
  isValidUrl(str) {
    if (!str) return false;
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate if string contains only alphanumeric characters
   */
  isAlphanumeric(str) {
    if (!str) return false;
    return /^[a-zA-Z0-9]+$/.test(str);
  }

  /**
   * Validate if string contains only alphabetic characters
   */
  isAlphabetic(str) {
    if (!str) return false;
    return /^[a-zA-Z]+$/.test(str);
  }

  /**
   * Validate if string contains only numeric characters
   */
  isNumeric(str) {
    if (!str) return false;
    return /^[0-9]+$/.test(str);
  }

  /**
   * Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate similarity ratio between two strings (0-1)
   */
  similarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    const distance = this.levenshteinDistance(str1, str2);
    return (maxLength - distance) / maxLength;
  }
}

module.exports = StringUtilities;