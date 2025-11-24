import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';
import sharp from 'sharp';

const logger = new Logger(true);
const stateService = new StateService(logger);

// Initialize state service
let isInitialized = false;
async function initializeState() {
  if (!isInitialized) {
    await stateService.loadState();
    isInitialized = true;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fileIds, direction } = await req.json();
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ 
        error: 'Missing or invalid fileIds parameter. Must be a non-empty array.' 
      }, { status: 400 });
    }

    if (!direction || !['left', 'right'].includes(direction)) {
      return NextResponse.json({ 
        error: 'Missing or invalid direction parameter. Must be "left" or "right".' 
      }, { status: 400 });
    }

    await initializeState();
    
    // Get all files by IDs
    const files = fileIds.map(id => stateService.getFileById(id)).filter((f): f is NonNullable<typeof f> => f !== null && f !== undefined);
    
    if (files.length !== fileIds.length) {
      return NextResponse.json({ error: 'One or more files not found' }, { status: 404 });
    }

    // Validate all files are image files
    const nonImageFiles = files.filter(f => f.type !== 'image');
    if (nonImageFiles.length > 0) {
      return NextResponse.json({ 
        error: 'All files must be image files. Non-image files found.' 
      }, { status: 400 });
    }

    // Check if files exist on disk
    try {
      for (const file of files) {
        await fs.access(file.currentPath);
      }
    } catch {
      return NextResponse.json({ error: 'One or more files do not exist on disk' }, { status: 404 });
    }

    // Rotate images
    const rotationAngle = direction === 'left' ? -90 : 90;
    const rotatedFiles: Array<{ id: string; currentPath: string }> = [];

    for (const file of files) {
      try {
        // Preserve timestamps before modification
        let originalStats;
        try {
          originalStats = await fs.stat(file.currentPath);
        } catch (error) {
          logger.warn(`Could not read stats for ${file.currentPath}: ${error}`);
        }

        // Read the image
        const imageBuffer = await fs.readFile(file.currentPath);
        const image = sharp(imageBuffer);
        
        // Rotate using sharp with full metadata preservation
        // .withMetadata() preserves all EXIF, IPTC, XMP, and other metadata
        const rotatedBuffer = await image
          .rotate(rotationAngle)
          .withMetadata() // Preserves all metadata including EXIF orientation, GPS, etc.
          .toBuffer();

        // Write back to the same file
        await fs.writeFile(file.currentPath, rotatedBuffer);

        // Restore timestamps
        if (originalStats) {
          try {
            await fs.utimes(file.currentPath, originalStats.atime, originalStats.mtime);
          } catch (error) {
            logger.warn(`Could not restore timestamps for rotated file: ${error}`);
          }
        }

        rotatedFiles.push({
          id: file.id,
          currentPath: file.currentPath
        });

        logger.info(`Successfully rotated ${file.currentPath} ${direction} with metadata preserved`);
      } catch (error) {
        logger.error(`Error rotating file ${file.currentPath}: ${error}`);
        throw error;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      rotatedFiles: rotatedFiles
    });
    
  } catch (error) {
    logger.error(`Error rotating images: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

