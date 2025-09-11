const path = require('path');
const fs = require('fs');

describe('Server.js Smoke Test', () => {
  test('server.js should have valid JavaScript syntax', () => {
    // Este test verifica que el archivo server.js tenga sintaxis válida
    // sin intentar ejecutarlo
    const serverPath = path.resolve(__dirname, '../../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Verificar que el archivo pueda ser parseado como JavaScript válido
    expect(() => {
      // Intentar crear una función con el contenido del archivo
      // Esto detectará errores de sintaxis
      new Function(serverContent);
    }).not.toThrow();
  });

  test('server.js should have proper module imports', () => {
    const serverPath = path.resolve(__dirname, '../../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Verificar que las importaciones principales existan
    expect(serverContent).toContain("require('express')");
    expect(serverContent).toContain("require('http')");
    expect(serverContent).toContain(
      "require('./src/modules/security/authentication')",
    );
    expect(serverContent).toContain(
      "require('./src/modules/core/branch-manager')",
    );
    expect(serverContent).toContain(
      "require('./src/modules/core/device-manager')",
    );
    expect(serverContent).toContain(
      "require('./src/modules/core/apk-manager')",
    );
    expect(serverContent).toContain(
      "require('./src/modules/core/feature-manager')",
    );
    expect(serverContent).toContain(
      "require('./src/modules/core/workspace-manager')",
    );
  });

  test('server.js should define essential API endpoints', () => {
    const serverPath = path.resolve(__dirname, '../../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Verificar que los endpoints principales estén definidos
    expect(serverContent).toContain("'/api/branches'");
    expect(serverContent).toContain("'/api/apk/versions'");
    expect(serverContent).toContain("'/api/features'");
    expect(serverContent).toContain("'/api/local-devices'");
    expect(serverContent).toContain("'/api/config'");
  });

  test('server.js should initialize all required managers', () => {
    const serverPath = path.resolve(__dirname, '../../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Verificar que todos los managers se inicialicen
    expect(serverContent).toContain(
      'const authManager = new AuthenticationManager()',
    );
    expect(serverContent).toContain(
      'const configManager = new ConfigurationManager()',
    );
    expect(serverContent).toContain(
      'const validationManager = new ValidationManager()',
    );
    expect(serverContent).toContain('const branchManager = new BranchManager(');
    expect(serverContent).toContain('const deviceManager = new DeviceManager(');
    expect(serverContent).toContain('const apkManager = new ApkManager(');
    expect(serverContent).toContain(
      'const featureManager = new FeatureManager(',
    );
    expect(serverContent).toContain(
      'const workspaceManager = new WorkspaceManager(',
    );
  });

  test('server.js should have proper structure', () => {
    const serverPath = path.resolve(__dirname, '../../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Verificar que el archivo tenga la estructura básica esperada
    expect(serverContent).toContain('const app = express()');
    expect(serverContent).toContain('const server = http.createServer(app)');
    expect(serverContent).toContain('server.listen(PORT');
    expect(serverContent).toContain('app.use(express.json');
    expect(serverContent).toContain('app.use(express.static');
  });

  test('server.js should not have syntax errors like unmatched braces', () => {
    const serverPath = path.resolve(__dirname, '../../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Verificar que no haya llaves desbalanceadas
    const openBraces = (serverContent.match(/{/g) || []).length;
    const closeBraces = (serverContent.match(/}/g) || []).length;

    expect(openBraces).toBe(closeBraces);

    // Verificar que no haya paréntesis desbalanceados
    const openParens = (serverContent.match(/\(/g) || []).length;
    const closeParens = (serverContent.match(/\)/g) || []).length;

    expect(openParens).toBe(closeParens);

    // Verificar que no haya corchetes desbalanceados
    const openBrackets = (serverContent.match(/\[/g) || []).length;
    const closeBrackets = (serverContent.match(/\]/g) || []).length;

    expect(openBrackets).toBe(closeBrackets);
  });
});
