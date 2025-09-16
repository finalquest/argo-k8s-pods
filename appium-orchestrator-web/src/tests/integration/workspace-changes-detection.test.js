const BranchManager = require('../../../src/modules/core/branch-manager');
const ConfigurationManager = require('../../../src/modules/security/configuration');
const ValidationManager = require('../../../src/modules/security/validation');

// Mock the dependencies
jest.mock('simple-git');
jest.mock('fs');

const simpleGit = require('simple-git');
const fs = require('fs');

describe('Workspace Changes Detection', () => {
  let branchManager;
  let mockGit;
  let configManager;
  let validationManager;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock managers
    configManager = new ConfigurationManager();
    // Mock the methods we need
    configManager.getGitConfig = jest.fn().mockReturnValue({
      url: 'https://github.com/test/repo.git',
    });
    configManager.isEnabled = jest.fn().mockReturnValue(true);
    configManager.get = jest.fn().mockReturnValue('/tmp/workspaces');

    validationManager = new ValidationManager();
    // Mock the methods we need
    validationManager.validateBranchName = jest.fn().mockReturnValue([]);
    validationManager.sanitize = jest
      .fn()
      .mockImplementation((branch) => branch.replace(/[^a-zA-Z0-9-_]/g, '-'));

    branchManager = new BranchManager(configManager, validationManager);

    // Setup mock git instance
    mockGit = {
      status: jest.fn(),
      log: jest.fn(),
      listRemote: jest.fn(),
    };
    simpleGit.mockReturnValue(mockGit);

    // Mock fs.existsSync
    fs.existsSync = jest.fn().mockReturnValue(true);
  });

  describe('getWorkspaceChanges', () => {
    it('should return no changes when workspace has only untracked files', async () => {
      // Simular estado con solo archivos no trackeados
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: [],
        staged: [],
        not_added: ['test.feature', 'README.md'],
        deleted: [],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.modifiedFiles).toBe(0);
      expect(result.stagedFiles).toBe(0);
      expect(result.unstagedFiles).toBe(2);
      expect(result.message).toBe('');
    });

    it('should return changes when workspace has modified files', async () => {
      // Simular estado con archivos modificados
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: ['feature1.feature', 'feature2.feature'],
        staged: [],
        not_added: ['untracked.file'],
        deleted: [],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.modifiedFiles).toBe(2);
      expect(result.stagedFiles).toBe(0);
      expect(result.unstagedFiles).toBe(1);
      expect(result.message).toBe('Hay 2 archivo(s) modificado(s)');
    });

    it('should return changes when workspace has staged files', async () => {
      // Simular estado con archivos staged
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: [],
        staged: ['feature1.feature'],
        not_added: ['untracked.file'],
        deleted: [],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.modifiedFiles).toBe(0);
      expect(result.stagedFiles).toBe(1);
      expect(result.unstagedFiles).toBe(1);
      expect(result.message).toBe('Hay 1 archivo(s) modificado(s)');
    });

    it('should return changes when workspace has both modified and staged files', async () => {
      // Simular estado con archivos modificados y staged
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: ['feature1.feature'],
        staged: ['feature2.feature'],
        not_added: ['untracked.file'],
        deleted: [],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.modifiedFiles).toBe(1);
      expect(result.stagedFiles).toBe(1);
      expect(result.unstagedFiles).toBe(1);
      expect(result.message).toBe('Hay 2 archivo(s) modificado(s)');
    });

    it('should return no changes when workspace is clean', async () => {
      // Simular estado limpio
      mockGit.status.mockResolvedValue({
        isClean: () => true,
        modified: [],
        staged: [],
        not_added: [],
        deleted: [],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.modifiedFiles).toBe(0);
      expect(result.stagedFiles).toBe(0);
      expect(result.unstagedFiles).toBe(0);
      expect(result.message).toBe('');
    });

    it('should return no changes when workspace only has deleted files', async () => {
      // Simular estado con solo archivos eliminados
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: [],
        staged: [],
        not_added: [],
        deleted: ['old-file.txt'],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.modifiedFiles).toBe(0);
      expect(result.stagedFiles).toBe(0);
      expect(result.unstagedFiles).toBe(0);
      expect(result.message).toBe('');
    });

    it('should return changes when workspace has created files', async () => {
      // Simular estado con archivos nuevos pero trackeados (creados)
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: [],
        staged: [],
        not_added: ['untracked.file'],
        deleted: [],
        created: ['new-tracked-file.txt'],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false); // Los archivos creados no se cuentan para hasChanges
      expect(result.modifiedFiles).toBe(0);
      expect(result.stagedFiles).toBe(0);
      expect(result.unstagedFiles).toBe(1);
      expect(result.message).toBe('');
    });

    it('should handle missing workspace directory', async () => {
      // Simular que el workspace no existe
      fs.existsSync.mockReturnValue(false);

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      // When workspace doesn't exist, some fields may be undefined
      expect(result.modifiedFiles).toBeUndefined();
      expect(result.stagedFiles).toBeUndefined();
      expect(result.unstagedFiles).toBeUndefined();
    });

    it('should handle persistent workspaces disabled', async () => {
      // Simular que los workspaces persistentes están deshabilitados
      configManager.isEnabled.mockReturnValue(false);

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'La funcionalidad de workspaces persistentes no está habilitada',
      );
    });

    it('should handle git status errors', async () => {
      // Simular error en git status
      mockGit.status.mockRejectedValue(new Error('Git error'));

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Error interno al obtener los cambios del workspace.',
      );
    });

    it('should validate branch names', async () => {
      // Simular error de validación
      validationManager.validateBranchName.mockReturnValue([
        'Invalid branch name',
      ]);

      const result = await branchManager.getWorkspaceChanges('invalid@branch');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid branch name');
      expect(result.details).toEqual(['Invalid branch name']);
    });
  });

  describe('Header Behavior Integration', () => {
    it('should calculate total changes correctly for frontend display', async () => {
      // Escenario: 2 modificados, 1 staged, 3 no trackeados
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: ['feature1.feature', 'feature2.feature'],
        staged: ['feature3.feature'],
        not_added: ['untracked1.txt', 'untracked2.txt', 'untracked3.txt'],
        deleted: [],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      // Para el frontend, solo deberían contar los archivos trackeados
      const frontendTotalChanges = result.modifiedFiles + result.stagedFiles;

      expect(result.hasChanges).toBe(true);
      expect(frontendTotalChanges).toBe(3); // 2 modificados + 1 staged
      expect(result.unstagedFiles).toBe(3); // Los no trackeados se mantienen separados
    });

    it('should not show header when only untracked files exist', async () => {
      // Escenario: solo archivos no trackeados
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: [],
        staged: [],
        not_added: ['untracked1.txt', 'untracked2.txt'],
        deleted: [],
        created: [],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.hasChanges).toBe(false);
      expect(result.message).toBe('');
    });

    it('should show header with correct count for mixed changes', async () => {
      // Escenario mixto realista
      mockGit.status.mockResolvedValue({
        isClean: () => false,
        modified: ['login.feature', 'dashboard.feature'],
        staged: ['api.feature'],
        not_added: ['notes.txt', 'temp.log'],
        deleted: ['old-config.json'],
        created: ['new-helper.js'],
        renamed: [],
      });

      const result = await branchManager.getWorkspaceChanges('test-branch');

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedFiles).toBe(2);
      expect(result.stagedFiles).toBe(1);
      expect(result.unstagedFiles).toBe(2);
      expect(result.message).toBe('Hay 3 archivo(s) modificado(s)');
    });
  });
});
