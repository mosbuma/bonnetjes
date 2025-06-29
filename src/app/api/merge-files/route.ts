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
    const { currentFileId, targetFileId, mergeDirection } = await req.json();
    
    if (!currentFileId || !targetFileId || !mergeDirection) {
      return NextResponse.json({ 
        error: 'Missing required parameters: currentFileId, targetFileId, mergeDirection' 
      }, { status: 400 });
    }

    await initializeState();
    
    const currentFile = stateService.getFileById(currentFileId);
    const targetFile = stateService.getFileById(targetFileId);
    
    if (!currentFile || !targetFile) {
      return NextResponse.json({ error: 'One or both files not found' }, { status: 404 });
    }

    // Check if files exist on disk
    try {
      await fs.access(currentFile.currentPath);
      await fs.access(targetFile.currentPath);
    } catch {
      return NextResponse.json({ error: 'One or both files do not exist on disk' }, { status: 404 });
    }

    // Create merged PDF with logical order
    const mergedPdfPath = await mergeFilesToPdf(currentFile.currentPath, targetFile.currentPath, currentFile.currentPath, mergeDirection);
    
    // Rename original files to _delete_ format
    const currentDir = path.dirname(currentFile.currentPath);
    const currentExt = path.extname(currentFile.currentPath);
    const currentBase = path.basename(currentFile.currentPath, currentExt);
    const targetExt = path.extname(targetFile.currentPath);
    const targetBase = path.basename(targetFile.currentPath, targetExt);
    
    const currentDeletePath = path.join(currentDir, `_delete_${currentBase}${currentExt}`);
    const targetDeletePath = path.join(currentDir, `_delete_${targetBase}${targetExt}`);
    
    // Rename files
    await fs.rename(currentFile.currentPath, currentDeletePath);
    await fs.rename(targetFile.currentPath, targetDeletePath);
    
    // Update state - remove both original files and add the merged file
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
    stateService.removeFileById(currentFileId);
    stateService.removeFileById(targetFileId);
    
    // Add merged file to state
    await stateService.createFileInfo(mergedFile);
    
    // Save the updated state
    await stateService.saveState();
    
    logger.info(`Successfully merged files: ${currentFile.currentPath} + ${targetFile.currentPath} -> ${mergedPdfPath}`);
    
    return NextResponse.json({ 
      success: true, 
      mergedFilePath: mergedPdfPath,
      deletedFiles: [currentDeletePath, targetDeletePath]
    });
    
  } catch (error) {
    logger.error(`Error merging files: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function mergeFilesToPdf(file1Path: string, file2Path: string, currentFilePath: string, mergeDirection: string): Promise<string> {
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
  
  // Helper function to add PDF to PDF
  async function addPdfToPdf(pdfPath: string) {
    const pdfBytes = await fs.readFile(pdfPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = await pdfDoc.embedPdf(pdf);
    
    for (let i = 0; i < pages.length; i++) {
      const page = pdfDoc.addPage();
      page.drawPage(pages[i]);
    }
  }
  
  // Helper function to process a file
  async function processFile(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      await addPdfToPdf(filePath);
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      await addImageToPdf(filePath);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }
  }
  
  // Determine file order based on merge direction
  let firstFile: string;
  let secondFile: string;
  
  if (mergeDirection === 'prev') {
    // Merge prev: previous doc first, then button doc
    firstFile = file2Path;  // target file (previous)
    secondFile = file1Path; // current file (button doc)
  } else {
    // Merge next: button doc first, then next doc
    firstFile = file1Path;  // current file (button doc)
    secondFile = file2Path; // target file (next)
  }
  
  // Process files in logical order
  await processFile(firstFile);
  await processFile(secondFile);
  
  // Save merged PDF with the current file's name
  const mergedPdfBytes = await pdfDoc.save();
  const outputDir = path.dirname(currentFilePath);
  const currentBase = path.basename(currentFilePath, path.extname(currentFilePath));
  const mergedPdfPath = path.join(outputDir, `${currentBase}.pdf`);
  
  await fs.writeFile(mergedPdfPath, mergedPdfBytes);
  
  // Preserve timestamps from the button document (current file)
  try {
    const currentStats = await fs.stat(currentFilePath);
    await fs.utimes(mergedPdfPath, currentStats.atime, currentStats.mtime);
  } catch (error) {
    logger.warn(`Could not preserve timestamps for merged file: ${error}`);
  }
  
  return mergedPdfPath;
}

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
} 