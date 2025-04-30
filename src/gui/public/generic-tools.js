export function generateFileName(record) {
    try {
        if (!record.data) {
            return '';
        }

        const { invoice_date, company_name, description, invoice_amount, invoice_currency } = record.data;
        
        // Clean all fields to remove illegal characters
        const cleanField = (field) => {
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
        
        const filename = record.currentPath.split('/').pop();
        const ext = filename.split('.').pop();
        
        const newFilename = `${invoice_date}-${cleanCompanyName}-${cleanDescription}-${invoice_currency}${cleanAmount}.${ext}`;

        const dirPath = record.currentPath.substring(0, record.currentPath.lastIndexOf('/'));
        return `${dirPath}/${newFilename}`;
    } catch (error) {
        console.error('Error generating filename:', error);
        return record.currentPath;
    }
}