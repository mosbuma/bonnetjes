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
      await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
      this.logger.debug('State saved successfully');
    } catch (error) {
      this.logger.error(`Error saving state: ${error}`);
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
    
    for (const file of files) {
      try {
        await fs.access(file.currentPath);
        // If file exists, keep it in state
        cleanedFiles.push(file);
      } catch {
        // If file doesn't exist, log it and skip it
        this.logger.warn(`File no longer exists, removing from state: ${file.currentPath}`);
      } finally {
        await this.saveState();
      }
    }
    
    // Update state with only existing files
    this.state.knownFiles = cleanedFiles;
    await this.saveState();
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

  async createFileInfo(file: FileInfo): Promise<void> {
    if(this.isFileKnown(file.currentPath)) {
      this.logger.debug(`File already known: ${file.currentPath}`);
      throw new Error(`File already known: ${file.currentPath}`);
    }
    
    // Add the new entry
    this.state.knownFiles.push(file);
    this.logger.debug(`Added file: ${file.currentPath}`);
    
    await this.saveState();
  }

  getKnownFiles(): FileInfo[] {
    return this.state.knownFiles;
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
    const files = this.state.knownFiles;
    
    for (const file of files) {
      if (file.status === 'bad') {
        file.status = 'new';
        file.error = undefined;
        this.logger.debug(`Reset bad file: ${file.currentPath}`);
      }
    }
    
    await this.saveState();
    this.logger.info('Bad files reset successfully');
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