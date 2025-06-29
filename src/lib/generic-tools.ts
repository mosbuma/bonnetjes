import { FileInfo, type GenericDocumentData, type InvoiceData, type MovieCoverData } from '@/types';

export function generateFileName(record: FileInfo): string {
    try {
        if (!record.data) {
            return record.currentPath; // Return original path if no data
        }

        const cleanField = (field: string): string => {
            try {
                return field.toString()
                    .replace(/[<>:"/\\|?*.,]/g, '_') // Replace illegal characters with underscore
                    .replace(/\s+/g, '_')            // Replace spaces with underscore
                    .replace(/_+/g, '_')             // Replace multiple underscores with single underscore
                    .replace(/^_+|_+$/g, '');        // Remove leading/trailing underscores
            } catch (error) {
                console.error(`Error cleaning field ${field}:`, error);
                return '';
            }
        };

        let newFilename: string;
        const filename = record.currentPath.split('/').pop() || '';
        const ext = filename.split('.').pop() || '';
        const dirPath = record.currentPath.substring(0, record.currentPath.lastIndexOf('/'));

        if("invoice_date" in record.data) {
            const { invoice_date, company_name, description, invoice_amount, invoice_currency } = record.data as InvoiceData;
            const cleanCompanyName = cleanField(company_name || '');
            const cleanDescription = cleanField(description || '');
            const cleanAmount = cleanField(invoice_amount || '');
            
            // Build filename parts and filter out empty ones
            const parts = [
                invoice_date || '',
                cleanCompanyName,
                cleanDescription,
                (invoice_currency || 'EUR') + cleanAmount
            ].filter(part => part && part.trim() !== '');
            
            // If no valid parts, return original path
            if (parts.length === 0) {
                return record.currentPath;
            }
            
            newFilename = `${parts.join('-')}.${ext}`;
        } else if("movie_title" in record.data) {
            const { movie_title, season, disc_number, media_format, duration } = record.data as MovieCoverData;
            const cleanTitle = cleanField(movie_title || '');
            
            // If no title, return original path
            if (!cleanTitle) {
                return record.currentPath;
            }
            
            const cleanSeason = season ? `S${season}` : '';
            const cleanDisc = cleanField(disc_number || '');
            const cleanFormat = cleanField(media_format || '');
            const cleanDuration = cleanField(duration || '');
            
            // Build filename parts and filter out empty ones
            const parts = [
                'cover',
                cleanTitle,
                cleanSeason,
                cleanDisc,
                cleanFormat,
                cleanDuration
            ].filter(part => part && part.trim() !== '');
            
            newFilename = `${parts.join('-')}.${ext}`;
        } else if("source" in record.data) {
            const { document_date, document_category, source, description } = record.data as GenericDocumentData;
            const genericParts = [
                cleanField(document_date || ''),
                cleanField(document_category || ''),
                cleanField(source || ''),
                cleanField(description || '')
            ].filter(part => part && part.trim() !== '');
            
            // If no valid parts, return original path
            if (genericParts.length === 0) {
                return record.currentPath;
            }
            
            newFilename = `${genericParts.join('_')}.${ext}`;
        } else {
            return record.currentPath;
        }

        // Final validation: ensure the filename is not just an extension
        const finalFilename = newFilename.trim();
        if (!finalFilename || finalFilename === `.${ext}` || finalFilename.startsWith('.')) {
            return record.currentPath;
        }

        return `${dirPath}/${finalFilename}`;
    } catch (error) {
        console.error('Error generating filename:', error);
        return record.currentPath;
    }
} 