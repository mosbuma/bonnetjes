import { StateService } from '../services/stateService.js';
import { DocumentData, FileInfo } from '../utils/types.js';
import { LlmService } from '../services/llmService.js';
import { PdfService } from '../services/pdfService.js';
import path from 'path';

// Helper functions
export async function processFile(file: FileInfo, pdfService: PdfService, llmService: LlmService): Promise<DocumentData | null> {
    let imagePaths: string[] = [];
    try {
        // Always convert PDFs to images
        if (file.type === 'pdf') {
            imagePaths = await pdfService.convertPdfToImages(file.currentPath);
        } else {
            // For image files, ensure they're in a supported format
            const ext = path.extname(file.currentPath).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
                imagePaths = [file.currentPath];
            } else {
                throw new Error(`Unsupported image format: ${ext}. Supported formats are: png, jpg, jpeg, gif, webp`);
            }
        }

        if (imagePaths.length === 0) {
            throw new Error('No valid images found to process');
        }

        const invoiceDataArray = await llmService.extractDocumentData(file.currentPath, imagePaths);
        return invoiceDataArray[0];
    } finally {
        if (file.type === 'pdf') {
            await pdfService.cleanupTempImages(imagePaths);
        }
    }
}
