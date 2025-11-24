import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';
import { PDFDocument } from 'pdf-lib';

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
    const { fileIds } = await req.json();
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 2) {
      return NextResponse.json({ 
        error: 'Missing or invalid fileIds parameter. Must be an array with at least 2 file IDs.' 
      }, { status: 400 });
    }

    await initializeState();
    
    // Get all files by IDs
    const files = fileIds.map(id => stateService.getFileById(id)).filter(Boolean);
    
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

    // Get file paths in order
    const filePaths = files.map(f => f.currentPath);
    
    // Create merged PDF - use first file's directory and name
    const firstFile = files[0];
    const mergedPdfPath = await mergeFilesToPdf(filePaths, firstFile.currentPath);
    
    // Rename original files to _delete_ format
    const deletePaths: string[] = [];
    for (const file of files) {
      const fileDir = path.dirname(file.currentPath);
      const fileExt = path.extname(file.currentPath);
      const fileBase = path.basename(file.currentPath, fileExt);
      const deletePath = path.join(fileDir, `_delete_${fileBase}${fileExt}`);
      await fs.rename(file.currentPath, deletePath);
      deletePaths.push(deletePath);
    }
    
    // Update state - remove all original files and add the merged file
    const mergedFileId = generateId();
    const mergedFile = {
      id: mergedFileId,
      originalPath: mergedPdfPath,
      currentPath: mergedPdfPath,
      timestamp: new Date().toISOString(),
      status: 'new' as const,
      type: 'pdf' as const,
      documentType: 'generic' as const,
    };
    
    // Remove original files from state
    for (const fileId of fileIds) {
      stateService.removeFileById(fileId);
    }
    
    // Add merged file to state
    await stateService.createFileInfo(mergedFile, false); // Don't save immediately
    await stateService.loadState(); // Reload to get the file with generated ID
    const savedMergedFile = stateService.getFileById(mergedFileId);
    
    // Save the updated state
    await stateService.saveState();
    
    logger.info(`Successfully merged ${files.length} files into: ${mergedPdfPath}`);
    
    return NextResponse.json({ 
      success: true, 
      mergedFilePath: mergedPdfPath,
      mergedFile: savedMergedFile || mergedFile, // Return the merged file for immediate state update
      deletedFileIds: fileIds, // Return IDs of deleted files
      deletedFiles: deletePaths
    });
    
  } catch (error) {
    logger.error(`Error merging files: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function mergeFilesToPdf(filePaths: string[], outputFilePath: string): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  
  // Helper function to add image to PDF
  async function addImageToPdf(imagePath: string) {
    const imageBytes = await fs.readFile(imagePath);
    const imageExt = path.extname(imagePath).toLowerCase();
    
    let image;
    if (imageExt === '.jpg' || imageExt === '.jpeg') {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (imageExt === '.png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      throw new Error(`Unsupported image format: ${imageExt}`);
    }
    
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }
  
  // Process all files in order (all should be images based on validation)
  for (const filePath of filePaths) {
    await addImageToPdf(filePath);
  }
  
  // Save merged PDF with the first file's name
  const mergedPdfBytes = await pdfDoc.save();
  const outputDir = path.dirname(outputFilePath);
  const outputBase = path.basename(outputFilePath, path.extname(outputFilePath));
  const mergedPdfPath = path.join(outputDir, `${outputBase}.pdf`);
  
  await fs.writeFile(mergedPdfPath, mergedPdfBytes);
  
  // Preserve timestamps from the first file
  try {
    const firstFileStats = await fs.stat(filePaths[0]);
    await fs.utimes(mergedPdfPath, firstFileStats.atime, firstFileStats.mtime);
  } catch (error) {
    logger.warn(`Could not preserve timestamps for merged file: ${error}`);
  }
  
  return mergedPdfPath;
}

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
} 