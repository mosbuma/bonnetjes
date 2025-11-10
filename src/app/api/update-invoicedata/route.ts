import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(request: NextRequest) {
  try {
    await initializeState();
    const { id, data } = await request.json();
    const fileInfo = stateService.getFileById(id);
    if (fileInfo) {
      fileInfo.data = { ...fileInfo.data, ...data };
      fileInfo.status = 'analyzed';
      stateService.markFileModified(id);
      await stateService.saveState();
      logger.success(`Updated file: ${fileInfo.currentPath}`);
      return NextResponse.json({ success: true });
    } else {
      logger.error(`File not found: ${id}`);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    logger.error(`Error updating record: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
 