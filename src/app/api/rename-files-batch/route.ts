import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { generateFileName } from '@/lib/generic-tools';
import { FileInfo } from '@/types';
import { StateService } from '@/lib/stateService';
import { Logger } from '@/lib/logger';

const logger = new Logger(true);
const stateService = new StateService(logger);

async function generateUniquePath(basePath: string, usedPaths?: Set<string>): Promise<string> {
  // Check if the file already exists or is already used in this batch
  const isPathAvailable = async (path: string): Promise<boolean> => {
    // Check if used in batch
    if (usedPaths && usedPaths.has(path)) {
      return false;
    }
    // Check if exists on disk
    try {
      await fs.access(path);
      return false; // File exists
    } catch {
      return true; // File doesn't exist
    }
  };
  
  // Check if base path is available
  if (await isPathAvailable(basePath)) {
    return basePath;
  }
  
  // Extract directory, filename without extension, and extension
  const dirPath = basePath.substring(0, basePath.lastIndexOf('/'));
  const filename = basePath.split('/').pop() || '';
  const ext = filename.split('.').pop() || '';
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
  
  // Find a unique filename by adding an index
  let index = 1;
  let uniquePath: string;
  
  do {
    uniquePath = `${dirPath}/${nameWithoutExt}_${index}.${ext}`;
    if (await isPathAvailable(uniquePath)) {
      break; // Found available path
    }
    index++;
  } while (index < 1000); // Prevent infinite loop
  
  return uniquePath;
}

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid file ids array' }, { status: 400 });
    }

    // Load state using StateService
    await stateService.loadState();
    
    const results: Array<{ id: string; success: boolean; newPath?: string; error?: string }> = [];
    const updatedRecords: FileInfo[] = [];
    
    // Track all new paths to avoid conflicts within the same batch
    const usedPaths = new Set<string>();
    
    for (const id of ids) {
      const record = stateService.getFileById(id);
      if (!record) {
        results.push({ id, success: false, error: 'Record not found' });
        continue;
      }

      try {
        // Generate new filename
        let basePath = generateFileName(record);
        if (!basePath || basePath === record.currentPath) {
          results.push({ id, success: false, error: 'No new filename generated' });
          continue;
        }

        // Generate unique path (checks both disk and batch conflicts)
        const newPath = await generateUniquePath(basePath, usedPaths);
        
        const absOldPath = record.currentPath;
        
        // Rename the file
        await fs.rename(absOldPath, newPath);
        
        // Mark this path as used
        usedPaths.add(newPath);
        
        // Update state
        record.currentPath = newPath;
        record.lastModified = new Date().toISOString();
        updatedRecords.push(record);
        
        // Return full file data so client can update state immediately
        results.push({ id, success: true, newPath, file: record });
      } catch (error) {
        results.push({ id, success: false, error: (error as Error).message });
      }
    }
    
    // Write state once after all renames using StateService (atomic write with backup)
    if (updatedRecords.length > 0) {
      await stateService.loadState();
      for (const updatedRecord of updatedRecords) {
        const fileInfo = stateService.getFileById(updatedRecord.id);
        if (fileInfo) {
          fileInfo.currentPath = updatedRecord.currentPath;
          fileInfo.lastModified = updatedRecord.lastModified;
        }
      }
      await stateService.saveState();
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    return NextResponse.json({ 
      success: true, 
      total: ids.length,
      successful: successCount,
      failed: failureCount,
      results 
    });
  } catch (error) {
    console.error('Error batch renaming files:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

