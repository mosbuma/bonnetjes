import { DocumentData, FileInfo } from '@/types';
import { LlmService } from './llmService';
import { PdfService } from './pdfService';
import path from 'path';

// Helper functions
export async function processFile(file: FileInfo, pdfService: PdfService, llmService: LlmService): Promise<{ data: DocumentData, documentType: string } | null> {
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
        const data = invoiceDataArray[0];
        
        // Determine document type from the data
        let documentType = 'invoice'; // default
        if ('movie_title' in data && data.movie_title) {
            documentType = 'movie_cover';
        } else if ('document_category' in data && data.document_category) {
            documentType = 'generic';
        }
        
        return { data, documentType };
    } finally {
        if (file.type === 'pdf') {
            await pdfService.cleanupTempImages(imagePaths);
        }
    }
} 