import express, { Request, Response, RequestHandler } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { StateService } from '../services/stateService.js';
import { Logger } from '../utils/logger.js';
import { InvoiceData, FileInfo } from '../utils/types.js';
import { FileService } from '../services/fileService.js';
import { LlmService } from '../services/llmService.js';
import { PdfService } from '../services/pdfService.js';
import { generateFileName } from './public/generic-tools.js';
import { processFile } from './server-tools.js';
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
app.get('/api/records', async (_req: Request<{}, {}, {}, { }>, res: Response) => {
  try {
    const files = stateService.getKnownFiles();
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
        logger.debug('Starting scan process');
        
        await stateService.cleanupNonExistentFiles();
        logger.debug('Cleaned up non-existent files');
        
        const folders = process.env.FOLDERS?.split(',') || [];
        logger.debug(`Folders to scan: ${folders.join(', ')}`);
        
        if (folders.length === 0) {
            throw new Error('FOLDERS environment variable is required');
        }

        const files = await fileService.findFiles(folders);
        logger.debug(`Found ${files.length} files to process`);
        // logger.debug(`Found ${files.length} files to process: ${files.map(f => `${f.currentPath} (${f.type})`).join(', ')}`);

        for (const file of files) {
            const fileInfo = stateService.getFileByCurrentPath(file.currentPath);
            if (fileInfo !== undefined) {
                const filename = file.currentPath.split('/').pop();
                if (fileInfo?.status === 'new') {
                  logger.info(`Not analyzed: ${filename}`);
                } else if (!fileInfo?.data || !stateService.hasCompleteData(fileInfo)) {
                  logger.info(`Incomplete data: ${filename} - ${JSON.stringify(fileInfo?.data, null, 2)}`);
                } else {
                  logger.info(`Complete data: ${filename}`);
                } 
                
                continue;
            }

            try {
              logger.info(`Adding ${file.currentPath}`);
              await stateService.createFileInfo(file);
            } catch (error) {
                console.log(error);
                logger.error(`Error processing file ${file.currentPath}: ${error}`);
                throw error;
            }
        }

        logger.debug('Scan process completed successfully');
        res.json({ success: true });
    } catch (error) {
        logger.error(`Error running scan: ${error}`);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}) as RequestHandler);


app.post('/api/update-invoicedata', async (req: Request<{}, {}, FileInfo>, res: Response) => {
  try {
    const { id, data } = req.body;
    const fileInfo = stateService.getFileById(id);
    if (fileInfo) {
      fileInfo.data = { ...fileInfo.data, ...data } as InvoiceData;
      fileInfo.status = 'analyzed';
      await stateService.saveState();
      logger.success(`Updated file: ${fileInfo.currentPath}`);
      res.json({ success: true });
    } else {
      logger.error(`File not found: ${id}`);
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    logger.error(`Error updating record: ${error}`);
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

app.get('/api/get-image', (async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    // Read the file and send it
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    }[ext] || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}) as RequestHandler);

app.post('/api/clear-state', async (_req: Request, res: Response) => {
  try {
    // Reset state to empty
    await stateService.resetState();
    logger.info('State cleared successfully');
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error clearing state: ${error}`);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/analyze', (async (req: Request<{}, {}, { id: string }>, res: Response<{ data?: FileInfo, error?: string }>) => {
    try {
        const { id } = req.body;
        if (!id) {
            return resizeBy.status(400).json({ error: 'ID is required' });
        }


        const fileInfo = stateService.getFileById(id);
        if (!fileInfo) {
            return res.status(404).json({ error: 'File not found' });
        }

        logger.debug(`Analyze file: ${fileInfo?.currentPath}`);
        const invoiceData = await processFile(fileInfo, pdfService, llmService);
        if (invoiceData) {
            fileInfo.data = { ...fileInfo.data, ...invoiceData } as InvoiceData;
            fileInfo.status = 'analyzed';
            await stateService.saveState();
  
            logger.debug(`Analyze file done: ${fileInfo?.currentPath}`);
            res.json({ data: fileInfo });
        } else {
          logger.debug(`Analyze file error`);
          res.status(500).json({ error: 'Failed to analyze file' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}) as RequestHandler);

app.post('/api/rename-file', async (req: Request<{}, {}, { id: string }>, res: Response) => {
  try {
    const { id } = req.body;
    const fileInfo = stateService.getFileById(id);
    if (fileInfo) {
      if (fileInfo.data && stateService.hasCompleteData(fileInfo)) {
        const newPath = generateFileName(fileInfo);
        
        // Execute rename plan
        try {
          await fs.rename(fileInfo.currentPath, newPath);
          
          // Update file status and path
          fileInfo.status = 'renamed';
          fileInfo.currentPath = newPath;
          await stateService.saveState();
          
          logger.success(`Renamed: ${fileInfo.currentPath} -> ${newPath}`);

          res.json({ success: true, newPath });
        } catch (error) {
          logger.error(`Failed to rename: ${fileInfo.currentPath}`);
          throw error;
        }
      } else {
        res.status(400).json({ error: 'File data is incomplete' });
      }
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Start server
const startServer = async (port: number, isFirstStart: boolean = true): Promise<void> => {
  try {
    app.listen(port, () => {
      console.log(`GUI server running at http://localhost:${port}`);
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