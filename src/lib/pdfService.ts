import { Logger } from './logger';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export class PdfService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async convertPdfToImages(pdfPath: string, useJPG: boolean=true): Promise<string[]> {
    const outputDir = path.join(path.dirname(pdfPath), 'temp_images');
    const outputPrefix = path.join(outputDir, path.basename(pdfPath, '.pdf'));
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
              const files = await fs.readdir(outputDir);
              const imageFiles = files
                .filter(file => file.endsWith('.'+imgtype))
                .map(file => path.join(outputDir, file));
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
        await fs.unlink(imagePath);
      }
      const tempDir = path.dirname(imagePaths[0]);
      console.debug(`Removing temp directory: ${tempDir} for path: ${path.dirname(imagePaths[0])}`);
      await fs.rmdir(tempDir);
    } catch {
      // this.logger.error(`Error cleaning up temporary images: ${error}`);
    }
  }
} 