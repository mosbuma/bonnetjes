import { Logger } from '../utils/logger.js';
import { State, AnalyzedFile, InvoiceData } from '../utils/types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class StateService {
  private logger: Logger;
  private statePath: string;
  private state: State;

  constructor(logger: Logger) {
    this.logger = logger;
    this.statePath = path.join(process.cwd(), 'state.json');
    this.state = {
      analyzedFiles: [],
      lastRun: new Date().toISOString(),
    };
  }

  async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      this.state = JSON.parse(data);
      
      // Migrate existing records
      let hasChanges = false;
      this.state.analyzedFiles = this.state.analyzedFiles.map(file => {
        const changes: Partial<AnalyzedFile> = {};
        
        // Add missing invoice_currency
        if (!file.data.invoice_currency) {
          changes.data = {
            ...file.data,
            invoice_currency: 'EUR'
          };
          hasChanges = true;
        }

        // Add missing type field
        if (!file.type) {
          changes.type = file.originalPath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
          hasChanges = true;
        }

        // Add missing extraction_status
        if (!file.data.extraction_status) {
          changes.data = {
            ...file.data,
            extraction_status: 'success'
          };
          hasChanges = true;
        }

        // Add missing confidence
        if (!file.data.confidence) {
          changes.data = {
            ...file.data,
            confidence: 'high'
          };
          hasChanges = true;
        }

        // Add missing original_filename
        if (!file.data.original_filename) {
          changes.data = {
            ...file.data,
            original_filename: path.basename(file.originalPath)
          };
          hasChanges = true;
        }

        // Add missing currentPath
        if (!file.currentPath) {
          changes.currentPath = file.originalPath;
          hasChanges = true;
        }

        if (hasChanges) {
          return {
            ...file,
            ...changes,
            data: changes.data || file.data
          };
        }
        return file;
      });

      if (hasChanges) {
        await this.saveState();
        this.logger.info('Migrated existing records to include all required fields');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('No state file found, creating new state file');
        this.state = {
          analyzedFiles: [],
          lastRun: new Date().toISOString(),
        };
        await this.saveState();
      } else {
        this.logger.warn(`Error reading state: ${error}`);
        this.state = {
          analyzedFiles: [],
          lastRun: new Date().toISOString(),
        };
      }
    }
  }

  async saveState(): Promise<void> {
    try {
      await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
      this.logger.debug('State saved successfully');
    } catch (error) {
      this.logger.error(`Error saving state: ${error}`);
      throw error;
    }
  }

  resetState(): void {
    this.state = {
      analyzedFiles: [],
      lastRun: new Date().toISOString()
    };
    this.logger.info('State reset to empty');
  }

  async cleanupNonExistentFiles(): Promise<void> {
    const files = this.state.analyzedFiles;
    const cleanedFiles = [];
    
    for (const file of files) {
      try {
        await fs.access(file.currentPath);
        // If file exists, keep it in state
        cleanedFiles.push(file);
      } catch (error) {
        // If file doesn't exist, log it and skip it
        this.logger.warn(`File no longer exists, removing from state: ${file.currentPath}`);
      }
    }
    
    // Update state with only existing files
    this.state.analyzedFiles = cleanedFiles;
    await this.saveState();
  }

  isFileAnalyzed(filePath: string): boolean {
    return this.state.analyzedFiles.some(file => file.currentPath === filePath);
  }

  getAnalyzedFile(filePath: string): AnalyzedFile | undefined {
    return this.state.analyzedFiles.find(file => file.currentPath === filePath);
  }

  addAnalyzedFile(file: AnalyzedFile): void {
    // Remove any existing entry for this file
    this.state.analyzedFiles = this.state.analyzedFiles.filter(
      f => f.currentPath !== file.currentPath
    );
    
    // Add the new entry
    this.state.analyzedFiles.push(file);
    this.logger.debug(`Added analyzed file: ${file.currentPath}`);
  }

  updateFileStatus(filePath: string, status: 'analyzed' | 'renamed', newPath?: string): void {
    const file = this.getAnalyzedFile(filePath);
    if (file) {
      file.status = status;
      if (newPath) {
        file.currentPath = newPath;
      }
      this.logger.debug(`Updated file status: ${filePath} -> ${status}`);
    }
  }

  getAnalyzedFiles(): AnalyzedFile[] {
    return this.state.analyzedFiles;
  }

  getLastRun(): string {
    return this.state.lastRun;
  }

  hasCompleteData(data: InvoiceData): boolean {
    return (
      data.invoice_date !== '' &&
      data.company_name !== '' &&
      data.description !== '' &&
      data.invoice_amount !== ''
    );
  }

  isFileRenamedAndMoved(filePath: string): boolean {
    const file = this.getAnalyzedFile(filePath);
    return file?.status === 'renamed' && file?.currentPath !== file?.originalPath;
  }
} 