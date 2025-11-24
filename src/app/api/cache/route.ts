import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/lib/cacheService';
import { Logger } from '@/lib/logger';

const logger = new Logger(true);
const cacheService = new CacheService(logger);

// Initialize cache service
let isInitialized = false;
async function initializeCache() {
  if (!isInitialized) {
    await cacheService.loadCache();
    isInitialized = true;
  }
}

export async function GET() {
  try {
    await initializeCache();
    // Reload cache from disk to ensure we have the latest stats
    await cacheService.refreshCache();
    const stats = cacheService.getCacheStats();
    return NextResponse.json(stats);
  } catch (error) {
    logger.error(`Error getting cache stats: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await initializeCache();
    await cacheService.clearCache();
    return NextResponse.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    logger.error(`Error clearing cache: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await initializeCache();
    const body = await request.json();
    
    if (body.action === 'removePdfs') {
      // Default to only remove PDFs analyzed after 2025-11-21
      const minDate = body.minDate || '2025-11-21T00:00:00.000Z';
      const removedCount = await cacheService.removePdfFilesFromCache(minDate);
      const stats = cacheService.getCacheStats();
      return NextResponse.json({ 
        success: true, 
        message: `Removed ${removedCount} PDF files from cache (analyzed after ${minDate})`,
        removedCount,
        remainingCount: stats.total
      });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error(`Error removing PDF files from cache: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 