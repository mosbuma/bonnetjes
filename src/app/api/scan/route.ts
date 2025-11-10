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
    const BATCH_SIZE = 100; // Save state every 100 files to avoid too many writes
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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
        // Don't save immediately during bulk scan - save in batches
        const saveImmediately = (i + 1) % BATCH_SIZE === 0 || i === files.length - 1;
        await stateService.createFileInfo(file, saveImmediately);
        newFilesCount++;
        
        // Log progress for large scans
        if ((i + 1) % 500 === 0) {
          logger.info(`Progress: ${i + 1}/${files.length} files processed, ${newFilesCount} new files added`);
        }
      } catch (error) {
        console.log(error);
        logger.error(`Error processing file ${file.currentPath}: ${error}`);
        // Don't throw - continue processing other files
        // throw error;
      }
    }

    // Final save to ensure all files are persisted
    if (newFilesCount > 0) {
      logger.info(`Saving final state with ${newFilesCount} new files...`);
      await stateService.saveState();
    }

    // Reload state to ensure it's fresh and verify count
    await stateService.loadState();
    const finalFileCount = stateService.getKnownFiles().length;
    
    logger.info(`Scan process completed. Added ${newFilesCount} new files. Total files in state: ${finalFileCount}`);
    
    if (newFilesCount > 0 && finalFileCount < newFilesCount) {
      logger.warn(`WARNING: Expected at least ${newFilesCount} new files, but state only contains ${finalFileCount} total files. Some files may not have been saved.`);
    }
    
    return NextResponse.json({ 
      success: true, 
      newFilesCount,
      totalFilesFound: files.length,
      totalFilesInState: finalFileCount
    });
  } catch (error) {
    logger.error(`Error running scan: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}