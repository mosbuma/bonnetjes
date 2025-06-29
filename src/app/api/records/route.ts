import { NextResponse } from 'next/server';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';
import { FileInfo } from '@/types';

const logger = new Logger(true);
const stateService = new StateService(logger);

export type RecordsResponse = FileInfo[];

// Initialize state service
let isInitialized = false;
async function initializeState() {
  if (!isInitialized) {
    await stateService.loadState();
    isInitialized = true;
  }
}

export async function GET() {
  try {
    await initializeState();
    // Always refresh state to ensure we get the latest data
    await stateService.refreshState();
    const files = stateService.getKnownFiles();
    logger.debug(`Returning ${files.length} records`);
    return NextResponse.json(files);
  } catch (error) {
    logger.error(`Error getting records: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    await initializeState();
    const { id, ...updateFields } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const files = stateService.getKnownFiles();
    const file = files.find(f => f.id === id);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    Object.assign(file, updateFields);
    await stateService.saveState();
    return NextResponse.json(file);
  } catch (error) {
    logger.error(`Error updating record: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  // POST handler removed as per the instructions
} 