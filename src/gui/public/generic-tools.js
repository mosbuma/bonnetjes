export function generateFileName(record) {
    try {
        if (!record.data) {
            return '';
        }

        const cleanField = (field) => {
            return field
                .replace(/[<>:"/\\|?*.,]/g, '_') // Replace illegal characters with underscore
                .replace(/\s+/g, '_')            // Replace spaces with underscore
                .replace(/_+/g, '_')             // Replace multiple underscores with single underscore
                .replace(/^_+|_+$/g, '');        // Remove leading/trailing underscores
        };

        let newFilename;
        const filename = record.currentPath.split('/').pop();
        const ext = filename.split('.').pop();
        const dirPath = record.currentPath.substring(0, record.currentPath.lastIndexOf('/'));

        switch (record.documentType) {
            case 'invoice':
                const { invoice_date, company_name, description, invoice_amount, invoice_currency } = record.data;
                const cleanCompanyName = cleanField(company_name);
                const cleanDescription = cleanField(description);
                const cleanAmount = cleanField(invoice_amount);
                newFilename = `${invoice_date}-${cleanCompanyName}-${cleanDescription}-${invoice_currency}${cleanAmount}.${ext}`;
                break;

            case 'generic':
                const genericParts = [
                    cleanField(record.data.document_date),
                    cleanField(record.data.document_category),
                    cleanField(record.data.source),
                    cleanField(record.data.description)
                ].filter(Boolean);
                newFilename = genericParts.join('_');
                break;

            case 'movie_cover':
                const { movie_title, duration } = record.data;
                const cleanTitle = cleanField(movie_title);
                const cleanDuration = cleanField(duration);
                newFilename = `${cleanTitle}-${cleanDuration}.${ext}`;
                break;

            default:
                return record.currentPath;
        }

        return `${dirPath}/${newFilename}`;
    } catch (error) {
        console.error('Error generating filename:', error);
        return record.currentPath;
    }
}