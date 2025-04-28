export interface InvoiceData {
  invoice_date: string;
  company_name: string;
  description: string;
  invoice_amount: string;
  invoice_currency: string;
  extraction_status: 'success' | 'partial' | 'failed';
  confidence: 'low' | 'medium' | 'high';
  original_filename: string;
}

// export interface CliOptions {
//   dryRun: boolean;
//   verbose: boolean;
// }

export interface FileInfo {
  path: string;
  type: 'pdf' | 'image';
}

export interface RenamePlan {
  originalPath: string;
  newPath: string;
  data: InvoiceData;
}

export interface AnalyzedFile {
  originalPath: string;
  currentPath: string;
  proposedPath?: string;
  data: InvoiceData;
  timestamp: string;
  status: 'analyzed' | 'renamed';
  error?: string;
  type: 'pdf' | 'image';
}

export interface State {
  analyzedFiles: AnalyzedFile[];
  lastRun: string;
} e