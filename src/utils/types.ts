export interface BaseDocumentData {
  extraction_status: 'success' | 'partial' | 'failed';
  confidence: 'low' | 'medium' | 'high';
}

export interface InvoiceData extends BaseDocumentData {
  invoice_date: string;
  company_name: string;
  description: string;
  invoice_amount: string;
  invoice_currency: string;
}

export interface GenericDocumentData extends BaseDocumentData {
  document_date: string;
  document_category: string;
  description: string;
  source: string;
}

export interface MovieCoverData extends BaseDocumentData {
  movie_title: string;
  movie_description: string;
  duration: string;
}

export type DocumentData = InvoiceData | GenericDocumentData | MovieCoverData;

// export interface CliOptions {
//   dryRun: boolean;
//   verbose: boolean;
// }

export interface FileInfo {
  id: string; // uuidv4
  originalPath: string;      // Original absolute path
  currentPath: string;       // Current absolute path in filesystem
  data?: DocumentData;       // Document data after analysis
  timestamp: string;        // When the file was first seen
  status: 'new' | 'analyzed' | 'renamed';
  error?: string;
  type: 'pdf' | 'image';
  documentType: 'invoice' | 'generic' | 'movie_cover';
}

export interface RenamePlan {
  originalPath: string;
  newPath: string;
  data: DocumentData;
}

export interface State {
  knownFiles: FileInfo[];
  lastRun: string;
}