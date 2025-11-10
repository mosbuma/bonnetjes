import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from './logger';

// Standard DVD cover dimensions in inches
const DVD_COVER_WIDTH_INCHES = 5.5;
const DVD_COVER_HEIGHT_INCHES = 7.5;
const MAX_DPI = 300;

export class ImageService {
  private logger: Logger;
  private tempDir: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.tempDir = path.join(process.cwd(), 'temp_images');
  }

  /**
   * Calculate DPI assuming the image is a standard DVD cover
   * @param imagePath Path to the image file
   * @returns DPI value or null if unable to calculate
   */
  async calculateDPI(imagePath: string): Promise<number | null> {
    try {
      const metadata = await sharp(imagePath).metadata();
      const width = metadata.width;
      const height = metadata.height;

      if (!width || !height) {
        this.logger.warn(`Unable to get image dimensions for ${imagePath}`);
        return null;
      }

      // Calculate DPI based on DVD cover dimensions
      // Use the larger dimension to be conservative
      const dpiWidth = width / DVD_COVER_WIDTH_INCHES;
      const dpiHeight = height / DVD_COVER_HEIGHT_INCHES;
      const dpi = Math.max(dpiWidth, dpiHeight);

      this.logger.debug(`Image ${imagePath}: ${width}x${height}px, calculated DPI: ${dpi.toFixed(2)}`);
      return dpi;
    } catch (error) {
      this.logger.error(`Error calculating DPI for ${imagePath}: ${error}`);
      return null;
    }
  }

  /**
   * Rescale image to 300 DPI if it exceeds that value
   * @param imagePath Path to the source image
   * @returns Path to the rescaled image (or original if no rescaling needed)
   */
  async rescaleIfNeeded(imagePath: string): Promise<string> {
    try {
      const dpi = await this.calculateDPI(imagePath);
      
      if (dpi === null) {
        this.logger.warn(`Could not calculate DPI for ${imagePath}, skipping rescale`);
        return imagePath;
      }

      if (dpi <= MAX_DPI) {
        this.logger.debug(`Image ${imagePath} has DPI ${dpi.toFixed(2)} <= ${MAX_DPI}, no rescaling needed`);
        return imagePath;
      }

      // Calculate new dimensions to achieve 300 DPI
      const scaleFactor = MAX_DPI / dpi;
      const metadata = await sharp(imagePath).metadata();
      const newWidth = Math.round((metadata.width || 0) * scaleFactor);
      const newHeight = Math.round((metadata.height || 0) * scaleFactor);

      this.logger.info(`Rescaling ${imagePath} from ${metadata.width}x${metadata.height} (DPI: ${dpi.toFixed(2)}) to ${newWidth}x${newHeight} (DPI: ${MAX_DPI})`);

      // Create temp directory if it doesn't exist
      await fs.mkdir(this.tempDir, { recursive: true });

      // Generate temp file path
      const ext = path.extname(imagePath);
      const basename = path.basename(imagePath, ext);
      const tempPath = path.join(this.tempDir, `${basename}_rescaled_${Date.now()}${ext}`);

      // Rescale and save
      await sharp(imagePath)
        .resize(newWidth, newHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toFile(tempPath);

      this.logger.debug(`Rescaled image saved to ${tempPath}`);
      return tempPath;
    } catch (error) {
      this.logger.error(`Error rescaling image ${imagePath}: ${error}`);
      // Return original path if rescaling fails
      return imagePath;
    }
  }

  /**
   * Rescale multiple images if needed
   * @param imagePaths Array of image paths
   * @returns Array of paths (rescaled or original)
   */
  async rescaleImagesIfNeeded(imagePaths: string[]): Promise<string[]> {
    const results = await Promise.all(
      imagePaths.map(path => this.rescaleIfNeeded(path))
    );
    return results;
  }

  /**
   * Cleanup temporary rescaled images
   * @param imagePaths Array of image paths to clean up
   */
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
    } catch (error) {
      this.logger.error(`Error cleaning up temp images: ${error}`);
    }
  }
}

