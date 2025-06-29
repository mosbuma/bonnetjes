import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { generateFileName } from '@/lib/generic-tools';
import { FileInfo, State } from '@/types';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';

const logger = new Logger(true);
const stateService = new StateService(logger);
const STATE_PATH = path.resolve(process.cwd(), 'state', 'state.json');

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Missing record id' }, { status: 400 });
    }

    // Load state.json
    const stateRaw = await fs.readFile(STATE_PATH, 'utf-8');
    const state = JSON.parse(stateRaw) as State;
    const record: FileInfo | undefined = state.knownFiles.find((f: FileInfo) => f.id === id);
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Generate new filename
    const newPath = generateFileName(record);
    if (!newPath || newPath === record.currentPath) {
      return NextResponse.json({ error: 'No new filename generated' }, { status: 400 });
    }

    // Use the actual file paths from the record
    const absOldPath = record.currentPath;
    const absNewPath = newPath;

    // Rename the file
    await fs.rename(absOldPath, absNewPath);

    // Update state
    record.currentPath = newPath;
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');

    // Refresh the state service to ensure it's in sync
    await stateService.refreshState();

    return NextResponse.json({ success: true, newPath });
  } catch (error) {
    console.error('Error renaming file:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 