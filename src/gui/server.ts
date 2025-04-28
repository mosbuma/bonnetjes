import express, { Request, Response, RequestHandler } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import open from 'open';
import { StateService } from '../services/stateService.js';
import { Logger } from '../utils/logger.js';
import { InvoiceData, FileInfo } from '../utils/types.js';
import { FileService } from '../services/fileService.js';
import { LlmService } from '../services/llmService.js';
import { PdfService } from '../services/pdfService.js';
import { processFile, updateFileState } from './server-tools.js';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Initialize services
const logger = new Logger(true);
const stateService = new StateService(logger);
const fileService = new FileService(logger);
const pdfService = new PdfService(logger);
const llmService = new LlmService(logger);

// Load state on startup
await stateService.loadState();

// API Routes
app.get('/api/records', async (_req: Request, res: Response) => {
  try {
    const files = stateService.getAnalyzedFiles();
    logger.debug(`Returning ${files.length} records`);
    res.json(files);
  } catch (error) {
    logger.error(`Error getting records: ${error}`);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Update the scan endpoint
app.post('/api/scan', (async (req: Request<{}, {}, { }>, res: Response) => {
    try {
        const { test } = req.body;
        logger.debug(`Starting scan process (test: ${test})`);
        
        await stateService.cleanupNonExistentFiles();
        logger.debug('Cleaned up non-existent files');
        
        const folders = process.env.FOLDERS?.split(',') || [];
        logger.debug(`Folders to scan: ${folders.join(', ')}`);
        
        if (folders.length === 0) {
            throw new Error('FOLDERS environment variable is required');
        }

        const files = await fileService.findFiles(folders);
        logger.debug(`Found ${files.length} files to process: ${files.map(f => `${f.path} (${f.type})`).join(', ')}`);

        // const renamePlans: { originalPath: string; newPath: string; data: InvoiceData }[] = [];

        for (const file of files) {
            logger.debug(`Processing file: ${file.path} (${file.type})`);
            
            if (stateService.isFileAnalyzed(file.path)) {
                const analyzedFile = stateService.getAnalyzedFile(file.path);
                logger.debug(`File already analyzed: ${file.path} (status: ${analyzedFile?.status}, hasCompleteData: ${analyzedFile ? stateService.hasCompleteData(analyzedFile.data) : false})`);
                
                if (analyzedFile && stateService.hasCompleteData(analyzedFile.data)) {
                    logger.info(`File already analyzed with complete data: ${file.path}`);
                    // const newPath = analyzedFile.proposedPath;
                    // if (newPath) {
                    //     renamePlans.push({
                    //         originalPath: file.path,
                    //         newPath: newPath,
                    //         data: analyzedFile.data,
                    //     });
                    //     logger.debug(`Added to rename plans: ${file.path} -> ${newPath}`);
                    // }
                } else {
                    logger.info(`File analyzed but missing data: ${file.path}`);
                }
                continue;
            }

            logger.info(`Processing ${file.path}`);
            try {
                const invoiceData = await processFile(file, stateService, pdfService, llmService);
                logger.debug(`Processed file: ${file.path} (hasData: ${!!invoiceData}, date: ${invoiceData?.invoice_date}, company: ${invoiceData?.company_name}, status: ${invoiceData?.extraction_status}, confidence: ${invoiceData?.confidence})`);
                
                if (invoiceData) {
                    await updateFileState(file.path, invoiceData, stateService);
                    logger.debug(`Updated file state: ${file.path}`);

                    // if (stateService.hasCompleteData(invoiceData)) {
                    //     const newPath = generateFileName(invoiceData, file.path);
                    //     renamePlans.push({
                    //         originalPath: file.path,
                    //         newPath: newPath,
                    //         data: invoiceData,
                    //     });
                    //     logger.debug(`Added to rename plans: ${file.path} -> ${newPath}`);
                    // } else {
                    //     logger.warn(`Incomplete data for ${file.path}, skipping rename`);
                    // }
                }
            } catch (error) {
                console.log(error);
                logger.error(`Error processing file ${file.path}: ${error}`);
                throw error;
            }
        }

        // for (const plan of renamePlans) {
        //     try {
        //         logger.debug(`Attempting rename: ${plan.originalPath} -> ${plan.newPath}`);
        //         await fs.rename(plan.originalPath, plan.newPath);
        //         logger.success(`Renamed: ${plan.originalPath} -> ${plan.newPath}`);
        //         logger.info(`Extraction status: ${plan.data.extraction_status}, Confidence: ${plan.data.confidence}`);
                
        //         // Update the current path after rename
        //         const file = stateService.getAnalyzedFile(plan.originalPath);
        //         if (file) {
        //             file.currentPath = plan.newPath;
        //             file.status = 'renamed';
        //             stateService.addAnalyzedFile(file);
        //             await stateService.saveState();
        //             logger.debug(`Updated file state after rename: ${plan.originalPath} -> ${plan.newPath}`);
        //         }
        //     } catch (error) {
        //         logger.error(`Failed to rename: ${plan.originalPath} - ${error}`);
        //         await updateFileState(plan.originalPath, plan.data, stateService, 'analyzed', error instanceof Error ? error.message : String(error));
        //     }
        // }

        await stateService.loadState();
        logger.debug('Scan process completed successfully');
        res.json({ success: true });
    } catch (error) {
        logger.error(`Error running scan: ${error}`);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}) as RequestHandler);

interface UpdateRecordRequest {
  originalPath: string;
  data: Partial<InvoiceData>;
  status?: 'analyzed' | 'renamed';
}

app.post('/api/update-record', async (req: Request<{}, {}, UpdateRecordRequest>, res: Response) => {
  try {
    const { originalPath, data, status } = req.body;
    const file = stateService.getAnalyzedFile(originalPath);
    if (file) {
      // Update the file data
      file.data = { ...file.data, ...data };
      if (status) {
        file.status = status;
      }
      
      // Save the updated state
      stateService.addAnalyzedFile(file);
      await stateService.saveState();
      
      // If the file is now analyzed with complete data, trigger the rename workflow
      if (status === 'analyzed' && stateService.hasCompleteData(file.data)) {
        const newPath = generateFileName(file.data, file.originalPath);
        
        // Create rename plan
        const renamePlan = {
          originalPath: file.originalPath,
          newPath: newPath,
          data: file.data,
        };

        // Execute rename plan
        try {
          await fs.rename(renamePlan.originalPath, renamePlan.newPath);
          logger.success(`Renamed: ${renamePlan.originalPath} -> ${renamePlan.newPath}`);
          
          // Update file status to renamed
          file.status = 'renamed';
          file.currentPath = newPath;
          stateService.addAnalyzedFile(file);
          await stateService.saveState();
        } catch (error) {
          logger.error(`Failed to rename: ${renamePlan.originalPath}`);
          throw error;
        }
      }
      
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/get-pdf', (async (req: Request, res: Response) => {
  try {
    const { path } = req.query;
    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    // Read the file and send it
    const fileBuffer = await fs.readFile(path as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}) as RequestHandler);

app.get('/api/open-file', (async (req: Request, res: Response) => {
  try {
    const { path } = req.query;
    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    // Open the file using the system's default application
    await open(path as string);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}) as RequestHandler);

app.post('/api/clear-state', async (_req: Request, res: Response) => {
  try {
    // Reset state to empty
    stateService.resetState();
    await stateService.saveState();
    logger.info('State cleared successfully');
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error clearing state: ${error}`);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Update the reanalyze endpoint
app.post('/api/reanalyze', (async (req: Request, res: Response) => {
    try {
        const { path } = req.body;
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const file = stateService.getAnalyzedFile(path);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        const fileInfo: FileInfo = {
            path: file.originalPath,
            type: file.type
        };

        const invoiceData = await processFile(fileInfo, stateService, pdfService, llmService);
        if (invoiceData) {
            await updateFileState(file.originalPath, invoiceData, stateService);
            res.json({ success: true, data: invoiceData });
        } else {
            res.status(500).json({ error: 'Failed to analyze file' });
        }
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}) as RequestHandler);

function generateFileName(data: InvoiceData, currentPath: string): string {
  const { invoice_date, company_name, description, invoice_amount } = data;
  
  // Clean all fields to remove illegal characters
  const cleanField = (field: string): string => {
    return field
      .replace(/[<>:"/\\|?*.,]/g, '_') // Replace illegal characters with underscore
      .replace(/\s+/g, '_')            // Replace spaces with underscore
      .replace(/_+/g, '_')             // Replace multiple underscores with single underscore
      .replace(/^_+|_+$/g, '');        // Remove leading/trailing underscores
  };
  
  // Clean each field
  const cleanCompanyName = cleanField(company_name);
  const cleanDescription = cleanField(description);
  const cleanAmount = cleanField(invoice_amount);
  
  // Get the original file extension
  const ext = path.extname(currentPath).toLowerCase();
  
  return path.join(
    path.dirname(currentPath),
    `${invoice_date}-${cleanCompanyName}-${cleanDescription}-eu${cleanAmount}${ext}`
  );
}

// Start server
const startServer = async (port: number, isFirstStart: boolean = true): Promise<void> => {
  try {
    app.listen(port, () => {
      console.log(`GUI server running at http://localhost:${port}`);
      // Only open browser on first start
      if (isFirstStart) {
        open(`http://localhost:${port}`);
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('EADDRINUSE')) {
      console.log(`Port ${port} is in use, trying ${port + 1}...`);
      await startServer(port + 1, isFirstStart);
    } else {
      throw error;
    }
  }
};

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development';
startServer(3000, !isDev); 