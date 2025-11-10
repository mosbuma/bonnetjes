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

export async function GET(request: Request) {
  try {
    await initializeState();
    // No need to refresh state on every read - state is already in memory
    // Only refresh if we suspect it might be stale (e.g., after a long time)
    const files = stateService.getKnownFiles();
    
    // Check for 'since' query parameter
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');
    
    if (sinceParam) {
      // Return only files modified after the 'since' timestamp
      const sinceTimestamp = new Date(sinceParam).getTime();
      const changedFiles = files.filter(file => {
        // Check if file was modified after 'since' timestamp
        const fileModified = file.lastModified 
          ? new Date(file.lastModified).getTime()
          : new Date(file.timestamp).getTime();
        return fileModified > sinceTimestamp;
      });
      
      logger.debug(`Returning ${changedFiles.length} changed records (since ${sinceParam})`);
      return NextResponse.json(changedFiles);
    }
    
    // No 'since' parameter - return all files (for initial load)
    logger.debug(`Returning ${files.length} records (full list)`);
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