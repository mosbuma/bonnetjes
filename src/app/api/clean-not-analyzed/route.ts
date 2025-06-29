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
    // Remove all files with status 'new' from state
    await stateService.removeNotAnalyzedFiles();
    logger.info('Not analyzed files cleaned successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(`Error cleaning not analyzed files: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 