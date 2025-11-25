import { NextRequest, NextResponse } from 'next/server';
import { promises as fs, FileHandle } from 'fs';

export async function GET(request: NextRequest) {
  let fileHandle: FileHandle | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    
    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }
    
    // Open file handle explicitly to ensure proper cleanup
    fileHandle = await fs.open(path, 'r');
    const fileBuffer = await fileHandle.readFile();
    await fileHandle.close(); // Explicitly close the handle
    fileHandle = null; // Clear reference
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour to reduce file access
      },
    });
  } catch (error) {
    // Ensure file handle is closed even on error
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch {
        // Ignore close errors
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 