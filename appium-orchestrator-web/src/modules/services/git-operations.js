// Git Operations Service Module
// Handles Git operations, authentication, and repository management

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class GitOperationsService {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
  }

  /**
   * Get authenticated Git URL
   */
  getAuthenticatedUrl() {
    try {
      const url = new URL(this.configManager.get('GIT_REPO_URL'));
      url.username = this.configManager.get('GIT_USER');
      url.password = this.configManager.get('GIT_PAT');
      return url.toString();
    } catch (error) {
      console.error('Error al parsear GIT_REPO_URL:', error);
      return this.configManager.get('GIT_REPO_URL');
    }
  }

  /**
   * Execute Git command in a specific directory
   */
  executeGitCommand(workingDir, command, args = []) {
    return new Promise((resolve, reject) => {
      const gitProcess = spawn(command, args, {
        cwd: workingDir,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
        },
      });

      let output = '';
      let errorOutput = '';

      gitProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      gitProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${errorOutput}`));
        }
      });

      gitProcess.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Check if Git repository has uncommitted changes
   */
  hasUncommittedChanges(workspacePath) {
    try {
      const command = `git -C ${workspacePath} status --porcelain test/features/`;
      const { stdout } = require('child_process').execSync(command, { encoding: 'utf8' });
      return stdout.trim().length > 0;
    } catch (error) {
      console.error('Error checking uncommitted changes:', error);
      return false;
    }
  }

  /**
   * Get detailed Git status information
   */
  getGitStatus(workspacePath) {
    try {
      const command = `git -C ${workspacePath} status --porcelain test/features/`;
      const { stdout } = require('child_process').execSync(command, { encoding: 'utf8' });
      
      const changes = stdout.trim().split('\n').filter(Boolean);
      const modifiedFiles = changes.length;
      
      const stagedChanges = changes.filter(line => line.startsWith('M  ') || line.startsWith('A  ')).length;
      const unstagedChanges = changes.filter(line => line.startsWith(' M ') || line.startsWith(' D')).length;
      
      return {
        hasChanges: changes.length > 0,
        modifiedFiles,
        stagedChanges,
        unstagedChanges,
        changes: changes.map(change => ({
          status: change.substring(0, 2).trim(),
          file: change.substring(3)
        }))
      };
    } catch (error) {
      console.error('Error getting Git status:', error);
      return {
        hasChanges: false,
        modifiedFiles: 0,
        stagedChanges: 0,
        unstagedChanges: 0,
        changes: []
      };
    }
  }

  /**
   * Set remote URL for Git repository
   */
  async setRemoteUrl(workspacePath, authenticatedUrl) {
    await this.executeGitCommand(workspacePath, 'git', [
      'remote',
      'set-url',
      'origin',
      authenticatedUrl,
    ]);
  }

  /**
   * Pull latest changes from remote
   */
  async pullChanges(workspacePath, branch) {
    await this.executeGitCommand(workspacePath, 'git', [
      'pull',
      '--rebase',
      'origin',
      branch
    ]);
  }

  /**
   * Push changes to remote
   */
  async pushChanges(workspacePath, branch) {
    await this.executeGitCommand(workspacePath, 'git', [
      'push',
      'origin',
      branch
    ]);
  }

  /**
   * Add files to staging area
   */
  async addFiles(workspacePath, files = ['.']) {
    await this.executeGitCommand(workspacePath, 'git', [
      'add',
      ...Array.isArray(files) ? files : [files]
    ]);
  }

  /**
   * Create commit with message
   */
  async createCommit(workspacePath, message) {
    await this.executeGitCommand(workspacePath, 'git', [
      'commit',
      '-m',
      message
    ]);
  }

  /**
   * Get commit status for a branch
   */
  async getCommitStatus(workspacePath, branch) {
    try {
      await this.executeGitCommand(workspacePath, 'git', ['status']);
      
      // Check if there are commits to push
      const { stdout: logOutput } = require('child_process').execSync(
        `git -C ${workspacePath} log origin/${branch}..HEAD --oneline`,
        { encoding: 'utf8' }
      );
      
      const commitsToPush = logOutput.trim().split('\n').filter(Boolean).length;
      
      return {
        hasPendingCommits: commitsToPush > 0,
        commitsToPush,
        lastCommit: commitsToPush > 0 ? logOutput.split('\n')[0] : null
      };
    } catch (error) {
      console.error('Error getting commit status:', error);
      return {
        hasPendingCommits: false,
        commitsToPush: 0,
        lastCommit: null
      };
    }
  }

  /**
   * Clone repository
   */
  async cloneRepository(url, targetPath) {
    await this.executeGitCommand(path.dirname(targetPath), 'git', [
      'clone',
      url,
      targetPath
    ]);
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus(workspacePath) {
    try {
      const git = require('simple-git')(workspacePath);
      const status = await git.status();
      
      return {
        currentBranch: status.current,
        trackingBranch: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        isClean: status.isClean(),
        modified: status.modified,
        staged: status.staged,
        files: status.files
      };
    } catch (error) {
      console.error('Error getting repository status:', error);
      return {
        currentBranch: null,
        trackingBranch: null,
        ahead: 0,
        behind: 0,
        isClean: true,
        modified: [],
        staged: [],
        files: []
      };
    }
  }

  /**
   * Create and push changes with complete workflow
   */
  async commitAndPush(workspacePath, branch, message) {
    const authenticatedUrl = this.getAuthenticatedUrl();
    
    // Step 1: Set remote URL
    await this.setRemoteUrl(workspacePath, authenticatedUrl);
    
    // Step 2: Add all changes
    await this.addFiles(workspacePath);
    
    // Step 3: Create commit
    await this.createCommit(workspacePath, message);
    
    // Step 4: Pull latest changes (rebase)
    await this.pullChanges(workspacePath, branch);
    
    // Step 5: Push changes
    await this.pushChanges(workspacePath, branch);
  }

  /**
   * Validate Git repository URL
   */
  validateGitUrl(url) {
    try {
      new URL(url);
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Check if directory is a Git repository
   */
  isGitRepository(directoryPath) {
    return fs.existsSync(path.join(directoryPath, '.git'));
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(workspacePath) {
    try {
      const { stdout } = require('child_process').execSync(
        `git -C ${workspacePath} branch --show-current`,
        { encoding: 'utf8' }
      );
      return stdout.trim();
    } catch (error) {
      console.error('Error getting current branch:', error);
      return null;
    }
  }
}

module.exports = GitOperationsService;