import { NextResponse } from 'next/server';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';

const logger = new Logger(true);
const stateService = new StateService(logger);

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
    await stateService.cleanupNonExistentFiles();
    const files = stateService.getKnownFiles();
    logger.info(`Cleaned up non-existent files. Returning ${files.length} records.`);
    return NextResponse.json(files);
  } catch (error) {
    logger.error(`Error cleaning up files: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 