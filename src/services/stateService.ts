import { Logger } from '../utils/logger.js';
import { State, FileInfo, InvoiceData } from '../utils/types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
export class StateService {
  private logger: Logger;
  private statePath: string;
  private state: State;

  constructor(logger: Logger) {
    this.logger = logger;
    this.statePath = path.join(process.cwd(), 'state.json');
    this.state = {
      knownFiles: [],
      lastRun: new Date().toISOString(),
    };
  }

  async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      this.state = JSON.parse(data);

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('No state file found, creating new state file');
        this.state = {
          knownFiles: [],
          lastRun: new Date().toISOString(),
        };
        await this.saveState();
      } else {
        this.logger.warn(`Error reading state: ${error}`);
        this.state = {
          knownFiles: [],
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
      } catch (error) {
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
    

    if(!fileInfo.data || fileInfo.data.invoice_date === '') {
      missingData.push("invoice_date");
    }

    if(!fileInfo.data || fileInfo.data.company_name === '') {
      missingData.push("company_name");
    }

    if(!fileInfo.data || fileInfo.data.description === '') {
      missingData.push("description");
    }

    if(!fileInfo.data || fileInfo.data.invoice_amount === '') {
      missingData.push("invoice_amount");
    }

    console.log(`${fileInfo.currentPath} is missing data: ${missingData.join(', ')}`);

    return missingData.length === 0;
  }
} 