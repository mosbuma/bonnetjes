import { Logger } from './logger';
import { promises as fs } from 'node:fs';
import path from 'path';
import crypto from 'crypto';
import { DocumentType } from '@/types';

export interface CachedAnalysis {
  fileHash: string;
  originalPath: string;
  analysisResult: unknown;
  documentType: DocumentType;
  timestamp: string;
  confidence?: string;
  extractionStatus?: string;
}

export interface AnalysisCache {
  cachedResults: CachedAnalysis[];
  lastUpdated: string;
}

export class CacheService {
  private logger: Logger;
  private cachePath: string;
  private cache: AnalysisCache;

  constructor(logger: Logger) {
    this.logger = logger;
    this.cachePath = path.join(process.cwd(), 'state', 'analysis-cache.json');
    this.cache = {
      cachedResults: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  async loadCache(): Promise<void> {
    try {
      const data = await fs.readFile(this.cachePath, 'utf-8');
      this.cache = JSON.parse(data);
      this.logger.debug('Analysis cache loaded successfully');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('No analysis cache found, creating new cache file');
        this.cache = {
          cachedResults: [],
          lastUpdated: new Date().toISOString(),
        };
        await this.saveCache();
      } else {
        this.logger.warn(`Error reading analysis cache: ${error}`);
        this.cache = {
          cachedResults: [],
          lastUpdated: new Date().toISOString(),
        };
      }
    }
  }

  async saveCache(): Promise<void> {
    try {
      this.cache.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.cachePath, JSON.stringify(this.cache, null, 2));
      this.logger.debug('Analysis cache saved successfully');
    } catch (error) {
      this.logger.error(`Error saving analysis cache: ${error}`);
      throw error;
    }
  }

  async calculateFileHash(filePath: string): Promise<string> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256');
      hash.update(fileBuffer);
      return hash.digest('hex');
    } catch (error) {
      this.logger.error(`Error calculating file hash for ${filePath}: ${error}`);
      throw error;
    }
  }

  async getCachedResult(filePath: string): Promise<CachedAnalysis | null> {
    try {
      const fileHash = await this.calculateFileHash(filePath);
      const cachedResult = this.cache.cachedResults.find(result => result.fileHash === fileHash);
      
      if (cachedResult) {
        this.logger.debug(`Cache hit for file: ${filePath}`);
        return cachedResult;
      }
      
      this.logger.debug(`Cache miss for file: ${filePath}`);
      return null;
    } catch (error) {
      this.logger.error(`Error getting cached result for ${filePath}: ${error}`);
      return null;
    }
  }

  async cacheResult(filePath: string, analysisResult: unknown, documentType: string): Promise<void> {
    try {
      const fileHash = await this.calculateFileHash(filePath);
      
      // Remove existing cache entry if it exists
      this.cache.cachedResults = this.cache.cachedResults.filter(
        result => result.fileHash !== fileHash
      );
      
      // Add new cache entry
      const cachedAnalysis: CachedAnalysis = {
        fileHash,
        originalPath: filePath,
        analysisResult,
        documentType,
        timestamp: new Date().toISOString(),
        confidence: analysisResult.confidence,
        extractionStatus: analysisResult.extraction_status,
      };
      
      this.cache.cachedResults.push(cachedAnalysis);
      await this.saveCache();
      
      this.logger.debug(`Cached analysis result for file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Error caching result for ${filePath}: ${error}`);
      throw error;
    }
  }

  async updateCachedResult(filePath: string, analysisResult: unknown, documentType: string): Promise<void> {
    await this.cacheResult(filePath, analysisResult, documentType);
  }

  async removeCachedResult(filePath: string): Promise<void> {
    try {
      const fileHash = await this.calculateFileHash(filePath);
      this.cache.cachedResults = this.cache.cachedResults.filter(
        result => result.fileHash !== fileHash
      );
      await this.saveCache();
      this.logger.debug(`Removed cached result for file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Error removing cached result for ${filePath}: ${error}`);
    }
  }

  async clearCache(): Promise<void> {
    this.cache.cachedResults = [];
    await this.saveCache();
    this.logger.info('Analysis cache cleared');
  }

  async removePdfFilesFromCache(minDate?: string): Promise<number> {
    const initialCount = this.cache.cachedResults.length;
    const minDateObj = minDate ? new Date(minDate) : null;
    
    this.cache.cachedResults = this.cache.cachedResults.filter(
      result => {
        // Keep non-PDF files
        if (!result.originalPath.toLowerCase().endsWith('.pdf')) {
          return true;
        }
        
        // Remove PDF files that were analyzed after the minimum date (if specified)
        if (minDateObj) {
          const resultDate = new Date(result.timestamp);
          return resultDate <= minDateObj;
        }
        
        // If no date filter, remove all PDFs (backward compatibility)
        return false;
      }
    );
    
    const removedCount = initialCount - this.cache.cachedResults.length;
    await this.saveCache();
    const dateFilter = minDate ? ` analyzed after ${minDate}` : '';
    this.logger.info(`Removed ${removedCount} PDF files from cache${dateFilter}`);
    return removedCount;
  }

  getCacheStats(): { total: number; lastUpdated: string } {
    return {
      total: this.cache.cachedResults.length,
      lastUpdated: this.cache.lastUpdated,
    };
  }

  async refreshCache(): Promise<void> {
    await this.loadCache();
    this.logger.debug('Analysis cache refreshed from disk');
  }
} 