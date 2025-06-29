'use client';

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const PdfViewer = ({ src }: { src: string }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setError(null);
  }

  function onDocumentLoadError(error: Error) {
    setError(error.message);
  }

  return (
    <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', height: '600px', backgroundColor: '#f8f9fa', position: 'relative', padding: 8 }}>
      {error ? (
        <div className="alert alert-warning m-3">
          <h6>PDF Viewer Error</h6>
          <p className="mb-2">{error}</p>
          <div className="d-flex gap-2">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Open PDF in New Tab
            </a>
            <a
              href={src}
              download
              className="btn btn-outline-secondary btn-sm"
            >
              Download PDF
            </a>
          </div>
        </div>
      ) : (
        <Document
          file={src}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="d-flex justify-content-center align-items-center" style={{ height: '100%' }}>
              <div className="text-center">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading PDF...</span>
                </div>
                <p className="mt-2 text-muted">Loading PDF...</p>
              </div>
            </div>
          }
          error={
            <div className="alert alert-warning m-3">
              <h6>PDF Viewer Error</h6>
              <p className="mb-2">Failed to load PDF.</p>
            </div>
          }
        >
          <Page pageNumber={pageNumber} width={600} />
          {numPages && numPages > 1 && (
            <div className="d-flex justify-content-center align-items-center mt-2 gap-2">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
              >
                Previous
              </button>
              <span>
                Page {pageNumber} of {numPages}
              </span>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                disabled={pageNumber >= numPages}
              >
                Next
              </button>
            </div>
          )}
        </Document>
      )}
    </div>
  );
};

export default PdfViewer; 