// eslint.config.js
import globals from 'globals';
import pluginJs from '@eslint/js';
import pluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  // 1) Ignora primero (afecta a todo)
  {
    ignores: ['**/wiremock/**', 'public/reports/**'],
  },

  // 2) Resto de la configuración
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
      },
      ecmaVersion: 12,
    },
  },

  // 3) Presets/plugins
  pluginJs.configs.recommended,
  pluginPrettierRecommended,
];
