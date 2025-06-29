import { NextResponse } from 'next/server';
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