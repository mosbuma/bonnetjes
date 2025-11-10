import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { generateFileName } from '@/lib/generic-tools';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';

const logger = new Logger(true);
const stateService = new StateService(logger);

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Missing record id' }, { status: 400 });
    }

    // Load state using StateService
    await stateService.loadState();
    const record = stateService.getFileById(id);
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

    const alreadyExists = await fs.access(absNewPath).then(() => true).catch(() => false);
    if(alreadyExists) {
      return NextResponse.json({ error: 'File already exists' }, { status: 400 });
    } 
    // Rename the file
    await fs.rename(absOldPath, absNewPath);

    // Update state using StateService (which handles atomic writes and backups)
    await stateService.loadState();
    const fileInfo = stateService.getFileById(id);
    if (fileInfo) {
      fileInfo.currentPath = newPath;
      fileInfo.lastModified = new Date().toISOString();
      await stateService.saveState();
      
      // Return the full updated file so client can update state immediately
      return NextResponse.json({ success: true, newPath, file: fileInfo });
    }

    return NextResponse.json({ success: true, newPath });
  } catch (error) {
    console.error('Error renaming file:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 