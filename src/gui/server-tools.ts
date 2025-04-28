import { StateService } from '../services/stateService.js';
import { InvoiceData, FileInfo, AnalyzedFile } from '../utils/types.js';
import { LlmService } from '../services/llmService.js';
import { PdfService } from '../services/pdfService.js';
import path from 'path';

// Helper functions
export async function processFile(file: FileInfo, stateService: StateService, pdfService: PdfService, llmService: LlmService): Promise<InvoiceData | null> {
    let imagePaths: string[] = [];
    try {
        // Always convert PDFs to images
        if (file.type === 'pdf') {
            imagePaths = await pdfService.convertPdfToImages(file.path);
        } else {
            // For image files, ensure they're in a supported format
            const ext = path.extname(file.path).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
                imagePaths = [file.path];
            } else {
                throw new Error(`Unsupported image format: ${ext}. Supported formats are: png, jpg, jpeg, gif, webp`);
            }
        }

        if (imagePaths.length === 0) {
            throw new Error('No valid images found to process');
        }

        const invoiceDataArray = await llmService.extractInvoiceData(file.path, imagePaths);
        const data = invoiceDataArray[0];
        if (data) {
            // Set original filename only if it's not already set
            if (!data.original_filename) {
                data.original_filename = path.basename(file.path);
            }
        }
        return data;
    } finally {
        if (file.type === 'pdf') {
            await pdfService.cleanupTempImages(imagePaths);
        }
    }
}

export async function updateFileState(
    path: string,
    data: AnalyzedFile,
    stateService: StateService,
    status: 'analyzed' | 'renamed' = 'analyzed',
    error?: string
): Promise<void> {
    const proposedPath = generateFileName(data);
    stateService.addAnalyzedFile({
        originalPath: path,
        currentPath: path,
        proposedPath,
        data: data.data,
        timestamp: new Date().toISOString(),
        status,
        error,
        type: path.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'
    });
    await stateService.saveState();
}

export function generateFileName(file: AnalyzedFile): string     {
    const { invoice_date, company_name, description, invoice_amount, original_filename } = file.data;
    
    // Clean company name and description
    const cleanCompanyName = company_name.replace(/[<>:"/\\|?*]/g, '_');
    const cleanDescription = description.replace(/[<>:"/\\|?*]/g, '_');
    
    // Format invoice amount
    const cleanAmount = invoice_amount.replace(/[,.]/g, '_');
    
    // Get the original file extension from the current path
    const extension = original_filename ? path.extname(original_filename).toLowerCase() : '';
    return `${invoice_date}-${cleanCompanyName}-${cleanDescription}-eu${cleanAmount}.${extension}`;
}

