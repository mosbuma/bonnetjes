import { Logger } from '../utils/logger.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export class PdfService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async convertPdfToImages(pdfPath: string): Promise<string[]> {
    const outputDir = path.join(path.dirname(pdfPath), 'temp_images');
    const outputPrefix = path.join(outputDir, path.basename(pdfPath, '.pdf'));

    try {
      await fs.mkdir(outputDir, { recursive: true });

      return new Promise((resolve, reject) => {
        const pdftoppm = spawn('pdftoppm', [
          '-png',
          '-r', '300',
          pdfPath,
          outputPrefix
        ]);

        const imagePaths: string[] = [];

        pdftoppm.stdout.on('data', (data) => {
          this.logger.debug(`pdftoppm stdout: ${data}`);
        });

        pdftoppm.stderr.on('data', (data) => {
          this.logger.debug(`pdftoppm stderr: ${data}`);
        });

        pdftoppm.on('close', async (code) => {
          if (code === 0) {
            try {
              const files = await fs.readdir(outputDir);
              const pngFiles = files
                .filter(file => file.endsWith('.png'))
                .map(file => path.join(outputDir, file));
              resolve(pngFiles);
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
        await fs.unlink(imagePath);
      }
      const tempDir = path.dirname(imagePaths[0]);
      console.debug(`Removing temp directory: ${tempDir} for path: ${path.dirname(imagePaths[0])}`);
      await fs.rmdir(tempDir);
    } catch (error) {
      // this.logger.error(`Error cleaning up temporary images: ${error}`);
    }
  }
} 