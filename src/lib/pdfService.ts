import { Logger } from './logger';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export class PdfService {
  private logger: Logger;
  private tempDir: string;

  constructor(logger: Logger) {
    this.logger = logger;
    // Use a centralized temp_images directory in the project root, outside scanned folders
    this.tempDir = path.join(process.cwd(), 'temp_images');
  }

  /**
   * Wait for files to be fully written to disk after pdftoppm completes
   * This prevents race conditions where files aren't ready yet
   */
  private async waitForFiles(outputDir: string, imgtype: string, filePrefix: string, maxWaitMs: number = 5000, checkIntervalMs: number = 100): Promise<string[]> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const files = await fs.readdir(outputDir);
        // Filter for files that match the prefix and have the correct extension
        const imageFiles = files.filter(file => 
          file.startsWith(filePrefix) && file.endsWith('.' + imgtype)
        );
        
        if (imageFiles.length > 0) {
          // Check that all files are readable and have non-zero size
          const fileChecks = await Promise.all(
            imageFiles.map(async (file) => {
              const filePath = path.join(outputDir, file);
              try {
                const stats = await fs.stat(filePath);
                return stats.size > 0;
              } catch {
                return false;
              }
            })
          );
          
          // If all files are readable and have content, return them
          if (fileChecks.every(check => check === true)) {
            return imageFiles;
          }
        }
      } catch (error) {
        // Directory might not exist yet, continue waiting
        this.logger.debug(`Waiting for files in ${outputDir}: ${error}`);
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
    
    // Final attempt to read files
    const files = await fs.readdir(outputDir);
    return files.filter(file => 
      file.startsWith(filePrefix) && file.endsWith('.' + imgtype)
    );
  }

  async convertPdfToImages(pdfPath: string, useJPG: boolean=true): Promise<string[]> {
    // Use centralized temp directory outside scanned folders
    const outputDir = this.tempDir;
    // Create unique filename to avoid conflicts when processing multiple PDFs
    const uniqueId = `${path.basename(pdfPath, '.pdf')}_${Date.now()}`;
    const outputPrefix = path.join(outputDir, uniqueId);
    const imgtype= useJPG ? 'jpg': 'png';

    try {
      await fs.mkdir(outputDir, { recursive: true });

      return new Promise((resolve, reject) => {
        const pdftoppm = spawn('pdftoppm', [
          useJPG ? '-jpeg': '-png',
          '-r', useJPG ?'300':'300',
          pdfPath,
          outputPrefix
        ]);

        pdftoppm.stdout.on('data', (data) => {
          this.logger.debug(`pdftoppm stdout: ${data}`);
        });

        pdftoppm.stderr.on('data', (data) => {
          this.logger.debug(`pdftoppm stderr: ${data}`);
        });

        pdftoppm.on('close', async (code) => {
          if (code === 0) {
            try {
              // Wait for files to be fully written to disk, filtering by the unique prefix
              const files = await this.waitForFiles(outputDir, imgtype, uniqueId);
              const imageFiles = files.map(file => path.join(outputDir, file));
              resolve(imageFiles);
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error(`pdftoppm process exited with code ${code}`));
          }
        });
      });
    } catch (error) {
      this.logger.error(`Error converting PDF to images: ${error}`);
      throw error;
    }
  }

  async cleanupTempImages(imagePaths: string[]): Promise<void> {
    try {
      for (const imagePath of imagePaths) {
        // Only delete if it's in the temp directory
        if (imagePath.startsWith(this.tempDir)) {
          try {
            await fs.unlink(imagePath);
            this.logger.debug(`Cleaned up temp image: ${imagePath}`);
          } catch (error) {
            // File might already be deleted, ignore
            this.logger.debug(`Could not delete temp image ${imagePath}: ${error}`);
          }
        }
      }
      // Note: We don't remove the temp directory itself since it's shared and may contain other files
    } catch (error) {
      this.logger.error(`Error cleaning up temporary images: ${error}`);
    }
  }
} 