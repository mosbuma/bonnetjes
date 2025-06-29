import { NextResponse } from 'next/server';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';

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

export async function POST() {
  try {
    await initializeState();
    
    // Get all files and filter out renamed ones
    const allFiles = stateService.getKnownFiles();
    const getFilename = (p: string) => p.split('/').pop();
    const filesToKeep = allFiles.filter(file => {
      const originalFilename = getFilename(file.originalPath);
      const currentFilename = getFilename(file.currentPath);
      return originalFilename === currentFilename; // Keep files that haven't been renamed
    });
    const removedCount = allFiles.length - filesToKeep.length;
    
    // Update state with only non-renamed files
    await stateService.removeRenamedFiles();
    
    logger.info(`Removed ${removedCount} renamed files from state`);
    return NextResponse.json({ 
      success: true, 
      removedCount,
      remainingCount: filesToKeep.length
    });
  } catch (error) {
    logger.error(`Error removing renamed files: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 