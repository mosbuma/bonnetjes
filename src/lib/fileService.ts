import { FileInfo, DocumentType } from '@/types';
import { Logger } from './logger';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

export class FileService {
  private logger: Logger;
  private readonly SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async findFiles(folders: string[]): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    for (const folder of folders) {
      this.logger.debug(`Scanning folder: ${folder}`);
      await this.scanFolder(folder, files);
      this.logger.debug(`Found ${files.length} files so far`);
    }

    this.logger.info(`Total files found across all folders: ${files.length}`);
    return files;
  }

  private async scanFolder(folder: string, files: FileInfo[]): Promise<void> {
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(folder, entry.name);

        if (entry.isDirectory()) {
          this.logger.debug(`Scanning subfolder: ${fullPath}`);
          await this.scanFolder(fullPath, files);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.SUPPORTED_EXTENSIONS.includes(ext)) {
            this.logger.debug(`Found supported file: ${fullPath}`);
            files.push({
              id: uuidv4(),
              originalPath: fullPath,
              currentPath: fullPath,
              timestamp: new Date().toISOString(),
              status: 'new',
              type: ext === '.pdf' ? 'pdf' : 'image',
              documentType: DocumentType.INVOICE
            });
          } else {
            this.logger.debug(`Skipping unsupported file: ${fullPath} (extension: ${ext})`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error scanning folder ${folder}: ${error}`);
    }
  }

  async createOutputDirectory(): Promise<void> {
    const outputDir = path.join(process.cwd(), 'output');
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      this.logger.error(`Error creating output directory: ${error}`);
      throw error;
    }
  }

  async moveFile(sourcePath: string, targetPath: string): Promise<void> {
    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.rename(sourcePath, targetPath);
    } catch (error) {
      this.logger.error(`Error moving file ${sourcePath} to ${targetPath}: ${error}`);
      throw error;
    }
  }
} 