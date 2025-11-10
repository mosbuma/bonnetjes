import { NextRequest, NextResponse } from 'next/server';
import { StateService } from '@/lib/stateService';
import { LlmService } from '@/lib/llmService';
import { PdfService } from '@/lib/pdfService';
import { ImageService } from '@/lib/imageService';
import { CacheService } from '@/lib/cacheService';
import { Logger } from '@/lib/logger';
import { DocumentType } from '@/types';
import { processFile } from '@/lib/server-tools';
import { FileInfo } from '@/types';

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
  let fileInfo: FileInfo | undefined = undefined;
  
  try {
    await initializeServices();
    const { id, forceReanalyze = false } = await request.json();
    
    if (!id) {
      logger.error('ID is required');
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    fileInfo = stateService.getFileById(id);
    if (!fileInfo) {
      logger.error(`File not found: ${id}`);
      stateService.dumpState();
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Check if file has already been marked as bad
    if (fileInfo.status === 'bad') {
      logger.warn(`File has been marked as bad after failed analysis: ${id}`);
      return NextResponse.json({ error: 'File has been marked as bad after failed analysis' }, { status: 400 });
    }

    logger.debug(`Analyze file: ${fileInfo?.currentPath}`);

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
      await stateService.saveState();
      
      const action = usedCache ? 'Retrieved cached analysis' : 'Analyzed file';
      logger.success(`${action}: ${fileInfo.currentPath}`);
      
      return NextResponse.json({ 
        data: fileInfo,
        usedCache,
        cacheHit: usedCache
      });
    } else {
      fileInfo.status = 'bad';
      fileInfo.error = 'Failed to analyze file';
      stateService.markFileModified(fileInfo.id);
      await stateService.saveState();
      logger.error(`File marked as bad after failed analysis: ${fileInfo.currentPath}`);
      return NextResponse.json({ 
        error: 'Failed to analyze file',
        status: fileInfo.status
      }, { status: 500 });
    }
  } catch (error) {
    if (fileInfo) {
      fileInfo.status = 'bad';
      fileInfo.error = `Error analyzing file: ${error instanceof Error ? error.message : String(error)}`;
      stateService.markFileModified(fileInfo.id);
      await stateService.saveState();
      logger.error(`File marked as bad after error: ${fileInfo.currentPath}`);
    }
    
    logger.error(`Error analyzing file: ${error}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 