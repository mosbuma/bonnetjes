import { NextRequest, NextResponse } from 'next/server';
import { StateService } from '@/lib/stateService';
import { LlmService } from '@/lib/llmService';
import { PdfService } from '@/lib/pdfService';
import { ImageService } from '@/lib/imageService';
import { CacheService } from '@/lib/cacheService';
import { Logger } from '@/lib/logger';
import { DocumentType, FileInfo } from '@/types';
import { processFile } from '@/lib/server-tools';

const logger = new Logger(true);
const stateService = new StateService(logger);
const llmService = new LlmService(logger);
const pdfService = new PdfService(logger);
const imageService = new ImageService(logger);
const cacheService = new CacheService(logger);

// Initialize services
let isInitialized = false;
async function initializeServices() {
  if (!isInitialized) {
    await stateService.loadState();
    await cacheService.loadCache();
    isInitialized = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    await initializeServices();
    // Reload latest state from disk each request so IDs match front-end after rescans
    await stateService.loadState();
    const { ids, forceReanalyze = false } = await request.json();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs array is required' }, { status: 400 });
    }

    const results: Array<{ 
      id: string; 
      success: boolean; 
      data?: FileInfo; 
      error?: string;
      usedCache?: boolean;
    }> = [];

    for (const id of ids) {
      let fileInfo: FileInfo | undefined = undefined;
      
      try {
        fileInfo = stateService.getFileById(id);
        if (!fileInfo) {
          results.push({ id, success: false, error: 'File not found' });
          continue;
        }

        // Check if file has already been marked as bad
        if (fileInfo.status === 'bad') {
          results.push({ id, success: false, error: 'File has been marked as bad after failed analysis' });
          continue;
        }

        logger.debug(`Analyze file: ${fileInfo.currentPath}`);

        // Check cache first (unless force reanalyze is requested)
        let result = null;
        let usedCache = false;
        
        if (!forceReanalyze) {
          const cachedResult = await cacheService.getCachedResult(fileInfo.currentPath);
          if (cachedResult) {
            logger.info(`Using cached result for file: ${fileInfo.currentPath}`);
            result = {
              data: cachedResult.analysisResult,
              documentType: cachedResult.documentType,
            };
            usedCache = true;
          }
        }

        // If no cached result or force reanalyze, process the file
        if (!result) {
          logger.info(`Processing file with LLM: ${fileInfo.currentPath}`);
          const processResult = await processFile(fileInfo, pdfService, llmService, imageService);
          
          if (processResult) {
            // Convert string documentType to enum
            let documentType: DocumentType;
            switch (processResult.documentType) {
              case 'invoice':
                documentType = DocumentType.INVOICE;
                break;
              case 'generic':
                documentType = DocumentType.GENERIC;
                break;
              case 'movie_cover':
                documentType = DocumentType.MOVIE_COVER;
                break;
              default:
                documentType = DocumentType.INVOICE;
            }
            
            result = {
              data: processResult.data,
              documentType: documentType,
            };
            
            // Cache the new result
            await cacheService.cacheResult(fileInfo.currentPath, result.data, result.documentType);
          }
        }
        
        if (result) {
          fileInfo.data = result.data;
          fileInfo.documentType = result.documentType;
          fileInfo.status = 'analyzed';
          fileInfo.error = undefined; // Clear any previous errors
          stateService.markFileModified(fileInfo.id);
          
          const action = usedCache ? 'Retrieved cached analysis' : 'Analyzed file';
          logger.success(`${action}: ${fileInfo.currentPath}`);
          
          results.push({ 
            id, 
            success: true, 
            data: fileInfo,
            usedCache
          });
        } else {
          fileInfo.status = 'bad';
          fileInfo.error = 'Failed to analyze file';
          stateService.markFileModified(fileInfo.id);
          logger.error(`File marked as bad after failed analysis: ${fileInfo.currentPath}`);
          results.push({ 
            id, 
            success: false, 
            error: 'Failed to analyze file'
          });
        }
      } catch (error) {
        if (fileInfo) {
          fileInfo.status = 'bad';
          fileInfo.error = `Error analyzing file: ${error instanceof Error ? error.message : String(error)}`;
          stateService.markFileModified(fileInfo.id);
          logger.error(`File marked as bad after error: ${fileInfo.currentPath}`);
        }
        
        logger.error(`Error analyzing file ${id}: ${error}`);
        results.push({ 
          id, 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Save state once after all analyses are complete
    await stateService.saveState();

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Get updated cache stats after analysis
    // The cache is updated in-memory by cacheResult calls, so we can read directly
    // But refresh from disk to ensure we have the absolute latest (in case of concurrent updates)
    await cacheService.refreshCache();
    const cacheStats = cacheService.getCacheStats();

    return NextResponse.json({
      success: true,
      total: ids.length,
      successful: successCount,
      failed: failureCount,
      results,
      cacheStats // Include cache stats in response
    });
  } catch (error) {
    logger.error(`Error in batch analyze: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

