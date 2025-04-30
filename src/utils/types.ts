export interface InvoiceData {
  invoice_date: string;
  company_name: string;
  description: string;
  invoice_amount: string;
  invoice_currency: string;
  extraction_status: 'success' | 'partial' | 'failed';
  confidence: 'low' | 'medium' | 'high';
}

// export interface CliOptions {
//   dryRun: boolean;
//   verbose: boolean;
// }

export interface FileInfo {
  id: string; // uuidv4
  originalPath: string;      // Original absolute path
  currentPath: string;       // Current absolute path in filesystem
  data?: InvoiceData;       // Invoice data after analysis
  timestamp: string;        // When the file was first seen
  status: 'new' | 'analyzed' | 'renamed';
  error?: string;
  type: 'pdf' | 'image';
}

export interface RenamePlan {
  originalPath: string;
  newPath: string;
  data: InvoiceData;
}

export interface State {
  knownFiles: FileInfo[];
  lastRun: string;
}