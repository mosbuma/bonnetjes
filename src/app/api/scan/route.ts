import { NextResponse } from 'next/server';
import { StateService } from '@/lib/stateService';
import { FileService } from '@/lib/fileService';
import { Logger } from '@/lib/logger';

const logger = new Logger(true);
const stateService = new StateService(logger);
const fileService = new FileService(logger);

// Initialize state service
let isInitialized = false;
async function initializeState() {
  if (!isInitialized) {
    await stateService.loadState();
    isInitialized = true;
  }
}

export async function POST() {
  try {
    await initializeState();
    logger.debug('Starting scan process');
    
    await stateService.cleanupNonExistentFiles();
    logger.debug('Cleaned up non-existent files');
    
    // Use FOLDERS environment variable or default to test-scans directory
    let folders = process.env.FOLDERS?.split(',') || [];
    if (folders.length === 0) {
      // Default to test-scans directory in the project root
      const testScansPath = process.cwd() + '/test-scans';
      folders = [testScansPath];
      logger.debug(`No FOLDERS environment variable found, using default: ${testScansPath}`);
    }
    
    logger.debug(`Folders to scan: ${folders.join(', ')}`);

    const files = await fileService.findFiles(folders);
    logger.debug(`Found ${files.length} files to process`);

    let newFilesCount = 0;
    for (const file of files) {
      const fileInfo = stateService.getFileByCurrentPath(file.currentPath);
      if (fileInfo !== undefined) {
        const filename = file.currentPath.split('/').pop();
        if (fileInfo?.status === 'new') {
          logger.info(`Not analyzed: ${filename}`);
        } else if (!fileInfo?.data || !stateService.hasCompleteData(fileInfo)) {
          logger.info(`Incomplete data: ${filename} - ${JSON.stringify(fileInfo?.data, null, 2)}`);
        } else {
          logger.info(`Complete data: ${filename}`);
        } 
        
        continue;
      }

      try {
        logger.info(`Adding ${file.currentPath}`);
        await stateService.createFileInfo(file);
        newFilesCount++;
      } catch (error) {
        console.log(error);
        logger.error(`Error processing file ${file.currentPath}: ${error}`);
        throw error;
      }
    }

    // Reload state to ensure it's fresh
    await stateService.loadState();
    
    logger.debug(`Scan process completed successfully. Added ${newFilesCount} new files.`);
    return NextResponse.json({ 
      success: true, 
      newFilesCount,
      totalFilesFound: files.length 
    });
  } catch (error) {
    logger.error(`Error running scan: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 