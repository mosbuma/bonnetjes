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
    // Reset state to empty
    await stateService.resetState();
    logger.info('State cleared successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(`Error clearing state: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 