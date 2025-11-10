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
    // Reset bad files will reload state internally, so we don't need to reload here
    await stateService.resetBadFiles();
    
    // Get count of reset files by checking how many files have status 'new' that were previously 'bad'
    // (We can't easily track this, but the method logs it)
    const files = stateService.getKnownFiles();
    const newFilesCount = files.filter(f => f.status === 'new').length;
    
    logger.info('Bad files reset successfully');
    return NextResponse.json({ 
      success: true,
      message: 'Bad files reset successfully'
    });
  } catch (error) {
    logger.error(`Error resetting bad files: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 