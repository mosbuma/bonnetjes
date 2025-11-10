import { DocumentData, FileInfo } from '@/types';
import { LlmService } from './llmService';
import { PdfService } from './pdfService';
import { ImageService } from './imageService';
import path from 'path';

// Helper functions
export async function processFile(file: FileInfo, pdfService: PdfService, llmService: LlmService, imageService: ImageService): Promise<{ data: DocumentData, documentType: string } | null> {
    let imagePaths: string[] = [];
    let rescaledImagePaths: string[] = [];
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

        // Rescale images if they exceed 300 DPI
        const processedImagePaths = await imageService.rescaleImagesIfNeeded(imagePaths);
        
        // Track which images were rescaled (those different from original)
        rescaledImagePaths = processedImagePaths.filter((p, index) => 
            p !== imagePaths[index]
        );

        const invoiceDataArray = await llmService.extractDocumentData(file.currentPath, processedImagePaths);
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
        // Cleanup PDF temp images
        if (file.type === 'pdf') {
            await pdfService.cleanupTempImages(imagePaths);
        }
        // Cleanup rescaled images
        if (rescaledImagePaths.length > 0) {
            await imageService.cleanupTempImages(rescaledImagePaths);
        }
    }
} 