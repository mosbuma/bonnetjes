import { Logger } from './logger';
import { State, FileInfo, MovieCoverData, GenericDocumentData, InvoiceData } from '@/types';
import { promises as fs } from 'node:fs';
import path from 'path';

export class StateService {
  private logger: Logger;
  private statePath: string;
  private state: State;
  private stopSignal: boolean = false;
  private isInitialized: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger;
    this.statePath = path.join(process.cwd(), 'state', 'state.json');
    this.state = {
      knownFiles: [],
      lastRun: new Date().toISOString(),
    };
  }

  setStopSignal(stop: boolean): void {
    this.stopSignal = stop;
  }

  shouldStop(): boolean {
    return this.stopSignal;
  }

  async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      this.state = JSON.parse(data);
      this.isInitialized = true;
      this.logger.debug('State loaded successfully');

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('No state file found, creating new state file');
        this.state = {
          knownFiles: [],
          lastRun: new Date().toISOString(),
        };
        await this.saveState();
        this.isInitialized = true;
      } else if (error instanceof SyntaxError) {
        // JSON parsing error - file is corrupted
        this.logger.error(`State file is corrupted (JSON parse error): ${error.message}`);
        
        // Create backup of corrupted file
        const backupPath = `${this.statePath}.corrupted.${Date.now()}`;
        try {
          const corruptedData = await fs.readFile(this.statePath, 'utf-8');
          await fs.writeFile(backupPath, corruptedData, 'utf-8');
          this.logger.info(`Backed up corrupted state file to: ${backupPath}`);
        } catch (backupError) {
          this.logger.error(`Failed to backup corrupted state file: ${backupError}`);
        }
        
        // Try to recover partial data by reading up to the error position
        try {
          const corruptedData = await fs.readFile(this.statePath, 'utf-8');
          const errorPos = (error as SyntaxError).message.match(/position (\d+)/)?.[1];
          if (errorPos) {
            const pos = parseInt(errorPos, 10);
            // Try to find the last complete file entry before the error
            const partialData = corruptedData.substring(0, pos);
            const lastCompleteEntry = partialData.lastIndexOf('},');
            if (lastCompleteEntry > 0) {
              // Try to extract valid JSON up to the last complete entry
              const validPart = partialData.substring(0, lastCompleteEntry + 1);
              const closingBrackets = ']}';
              try {
                const recoveredState = JSON.parse(validPart + closingBrackets);
                if (recoveredState.knownFiles && Array.isArray(recoveredState.knownFiles)) {
                  this.logger.warn(`Recovered ${recoveredState.knownFiles.length} files from corrupted state`);
                  this.state = recoveredState;
                  await this.saveState();
                  this.isInitialized = true;
                  return;
                }
              } catch (recoveryError) {
                this.logger.warn(`Failed to recover partial state: ${recoveryError}`);
              }
            }
          }
        } catch (recoveryError) {
          this.logger.warn(`Failed to attempt recovery: ${recoveryError}`);
        }
        
        // If recovery failed, start with empty state
        this.logger.warn('Starting with empty state due to corruption');
        this.state = {
          knownFiles: [],
          lastRun: new Date().toISOString(),
        };
        await this.saveState();
        this.isInitialized = true;
      } else {
        this.logger.warn(`Error reading state: ${error}`);
        this.state = {
          knownFiles: [],
          lastRun: new Date().toISOString(),
        };
        this.isInitialized = true;
      }
    }
  }

  async refreshState(): Promise<void> {
    this.isInitialized = false;
    await this.loadState();
    this.logger.debug('State refreshed from disk');
  }

  async saveState(): Promise<void> {
    try {
      // Validate state before saving
      if (!this.state || typeof this.state !== 'object') {
        throw new Error('Invalid state object');
      }
      
      // Create backup before writing (keep last 3 backups)
      const backupDir = path.join(process.cwd(), 'state', 'backups');
      try {
        await fs.mkdir(backupDir, { recursive: true });
        const backupPath = path.join(backupDir, `state.backup.${Date.now()}.json`);
        if (await fs.access(this.statePath).then(() => true).catch(() => false)) {
          await fs.copyFile(this.statePath, backupPath);
          
          // Clean up old backups (keep only last 3)
          const backups = (await fs.readdir(backupDir))
            .filter(f => f.startsWith('state.backup.') && f.endsWith('.json'))
            .sort()
            .reverse();
          
          if (backups.length > 3) {
            for (const oldBackup of backups.slice(3)) {
              await fs.unlink(path.join(backupDir, oldBackup)).catch(() => {});
            }
          }
        }
      } catch (backupError) {
        // Don't fail if backup fails, just log it
        this.logger.warn(`Failed to create backup: ${backupError}`);
      }
      
      // Write to temporary file first, then rename (atomic write)
      const tempPath = `${this.statePath}.tmp`;
      const jsonString = JSON.stringify(this.state, null, 2);
      
      // Validate JSON can be parsed before writing
      JSON.parse(jsonString);
      
      await fs.writeFile(tempPath, jsonString, 'utf-8');
      await fs.rename(tempPath, this.statePath);
      
      // Only log state saves in verbose mode, and even then, reduce frequency
      // This prevents log spam during bulk operations
    } catch (error) {
      this.logger.error(`Error saving state: ${error}`);
      // Try to clean up temp file if it exists
      const tempPath = `${this.statePath}.tmp`;
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  async resetState(): Promise<void> {
    this.state = {
      knownFiles: [],
      lastRun: new Date().toISOString()
    };
    this.logger.info('State reset to empty');

    await this.saveState();
  }

  async cleanupNonExistentFiles(): Promise<void> {
    const files = this.state.knownFiles;
    const cleanedFiles = [];
    let removedCount = 0;
    
    for (const file of files) {
      try {
        await fs.access(file.currentPath);
        // If file exists, keep it in state
        cleanedFiles.push(file);
      } catch {
        // If file doesn't exist, log it and skip it
        this.logger.warn(`File no longer exists, removing from state: ${file.currentPath}`);
        removedCount++;
      }
    }
    
    // Update state with only existing files
    const initialCount = this.state.knownFiles.length;
    this.state.knownFiles = cleanedFiles;
    
    // Only save if files were actually removed
    if (removedCount > 0) {
      this.logger.info(`Removed ${removedCount} non-existent files from state (${initialCount} -> ${cleanedFiles.length})`);
      await this.saveState();
    } else {
      this.logger.debug(`No non-existent files to remove (${initialCount} files checked)`);
    }
  }

  isFileKnown(currentPath: string): boolean {
    return this.state.knownFiles.some(file => file.currentPath === currentPath);
  }

  getFileByCurrentPath(currentPath: string): FileInfo | undefined {
    return this.state.knownFiles.find(file => file.currentPath === currentPath);
  }

  getFileById(id: string): FileInfo | undefined {
    return this.state.knownFiles.find(file => file.id === id);
  }

  removeFileById(id: string): void {
    this.state.knownFiles = this.state.knownFiles.filter(file => file.id !== id);
    this.logger.debug(`Removed file with ID: ${id}`);
  }

  async createFileInfo(file: FileInfo, saveImmediately: boolean = true): Promise<void> {
    if(this.isFileKnown(file.currentPath)) {
      this.logger.debug(`File already known: ${file.currentPath}`);
      throw new Error(`File already known: ${file.currentPath}`);
    }
    
    // Set lastModified for new files
    file.lastModified = new Date().toISOString();
    
    // Add the new entry
    this.state.knownFiles.push(file);
    this.logger.debug(`Added file: ${file.currentPath}`);
    
    // Only save immediately if requested (default true for backward compatibility)
    // During bulk operations, it's better to save in batches
    if (saveImmediately) {
      await this.saveState();
    }
  }

  getKnownFiles(): FileInfo[] {
    return this.state.knownFiles;
  }

  /**
   * Mark a file as modified by updating its lastModified timestamp
   */
  markFileModified(fileId: string): void {
    const file = this.state.knownFiles.find(f => f.id === fileId);
    if (file) {
      file.lastModified = new Date().toISOString();
      this.logger.debug(`Marked file ${fileId} as modified`);
    }
  }

  getLastRun(): string {
    return this.state.lastRun;
  }

  hasCompleteData(fileInfo: FileInfo): boolean {
    const missingData = [];
    
    if (!fileInfo.data) {
      console.log(`${fileInfo.currentPath} has no data at all`);
      return false;
    }

    // Check based on document type
    switch (fileInfo.documentType) {
      case 'invoice': {
        const data = fileInfo.data as InvoiceData;
        if (!data.invoice_date || data.invoice_date === '') {
      missingData.push("invoice_date");
    }
        if (!data.company_name || data.company_name === '') {
      missingData.push("company_name");
    }
        if (!data.description || data.description === '') {
      missingData.push("description");
    }
        if (!data.invoice_amount || data.invoice_amount === '') {
      missingData.push("invoice_amount");
        }
        break;
      }

      case 'movie_cover': {
        const data = fileInfo.data as MovieCoverData;
        if (!data.movie_title || data.movie_title === '') {
          missingData.push("movie_title");
        }
        if (!data.type) {
          missingData.push("type");
        }
        if (!data.media_format) {
          missingData.push("media_format");
        }
        break;
      }

      case 'generic': {
        const data = fileInfo.data as GenericDocumentData;
        if (!data.document_date || data.document_date === '') {
          missingData.push("document_date");
        }
        if (!data.document_category || data.document_category === '') {
          missingData.push("document_category");
        }
        if (!data.description || data.description === '') {
          missingData.push("description");
        }
        break;
      }

      default:
        console.log(`${fileInfo.currentPath} has unknown document type: ${fileInfo.documentType}`);
        return false;
    }

    console.log(`${fileInfo.currentPath} is missing data: ${missingData.join(', ')}`);
    return missingData.length === 0;
  }

  async removeNotAnalyzedFiles(): Promise<void> {
    const initialCount = this.state.knownFiles.length;
    this.state.knownFiles = this.state.knownFiles.filter(file => file.status !== 'new' && file.status !== 'bad');
    const removedCount = initialCount - this.state.knownFiles.length;
    
    this.logger.info(`Removed ${removedCount} not analyzed and bad files from state`);
    await this.saveState();
  }

  async resetBadFiles(): Promise<void> {
    // Reload state to ensure we have the latest data from disk
    await this.loadState();
    
    const files = this.state.knownFiles;
    let resetCount = 0;
    
    for (const file of files) {
      if (file.status === 'bad') {
        file.status = 'new';
        file.error = undefined;
        file.lastModified = new Date().toISOString();
        this.markFileModified(file.id);
        resetCount++;
        this.logger.debug(`Reset bad file: ${file.currentPath}`);
      }
    }
    
    if (resetCount > 0) {
      await this.saveState();
      this.logger.info(`Reset ${resetCount} bad files successfully`);
    } else {
      this.logger.info('No bad files found to reset');
    }
  }

  async removeRenamedFiles(): Promise<void> {
    const files = this.state.knownFiles;
    const getFilename = (p: string) => p.split('/').pop();
    const filesToKeep = files.filter(file => {
      const originalFilename = getFilename(file.originalPath);
      const currentFilename = getFilename(file.currentPath);
      return originalFilename === currentFilename; // Keep files that haven't been renamed
    });
    const removedCount = files.length - filesToKeep.length;
    
    this.state.knownFiles = filesToKeep;
    await this.saveState();
    
    this.logger.info(`Removed ${removedCount} renamed files from state`);
  }

  dumpState(): void {
    console.log(JSON.stringify(this.state, null, 2));
  }
}