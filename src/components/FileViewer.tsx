'use client';

import React, { useEffect, useState } from 'react';
import { FileInfo } from '@/types';
import PdfViewer from './PdfViewer';
import Image from 'next/image';

interface FileViewerProps {
  record: FileInfo | null;
}

const FileViewer: React.FC<FileViewerProps> = ({ record }) => {
  const [previewContent, setPreviewContent] = useState<{
    type: 'image' | 'pdf' | 'none';
    data: string | null;
    error?: string;
    isLoading?: boolean;
  }>({ type: 'none', data: null });

  useEffect(() => {
    const loadPreview = async (path: string) => {
      setPreviewContent({ type: 'none', data: null, isLoading: true });
      
      try {
        const ext = path.split('.').pop()?.toLowerCase();
        
        if (ext === 'pdf') {
          await loadPdfPreview(path);
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
          await loadImagePreview(path);
        } else {
          setPreviewContent({ type: 'none', data: null });
        }
      } catch (error) {
        console.error('Error loading preview:', error);
        setPreviewContent({ 
          type: 'none', 
          data: null, 
          error: `Failed to load preview: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    };

    if (record) {
      loadPreview(record.currentPath);
    } else {
      setPreviewContent({ type: 'none', data: null });
    }
  }, [record]);

  const loadPdfPreview = async (path: string) => {
    try {
      // Test if the PDF endpoint is accessible
      const testUrl = `/api/get-pdf?path=${encodeURIComponent(path)}`;
      const response = await fetch(testUrl, { method: 'HEAD' });
      
      if (!response.ok) {
        throw new Error(`PDF not accessible: ${response.status} ${response.statusText}`);
      }

      console.log('PDF response:', response);

      setPreviewContent({ type: 'pdf', data: testUrl });
    } catch (error) {
      console.error('Error loading PDF preview:', error);
      throw error;
    }
  };

  const loadImagePreview = async (path: string) => {
    try {
      const response = await fetch(`/api/get-image?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      
      setPreviewContent({ type: 'image', data: imageUrl });
    } catch (error) {
      console.error('Error loading image preview:', error);
      throw error;
    }
  };

  // Clean up object URLs when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewContent.data && previewContent.type === 'image') {
        URL.revokeObjectURL(previewContent.data);
      }
    };
  }, [previewContent.data, previewContent.type]);

  const renderPreview = () => {
    if (previewContent.isLoading) {
      return (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      );
    }

    if (previewContent.error) {
      return (
        <div className="alert alert-danger m-3">
          <h6>Preview Error</h6>
          <p className="mb-0">{previewContent.error}</p>
        </div>
      );
    }

    if (previewContent.type === 'image' && previewContent.data) {
      return (
        <div className="text-center p-3">
          <Image 
            src={previewContent.data} 
            alt="Preview" 
            width={800}
            height={600}
            style={{ 
              maxWidth: '100%', 
              maxHeight: '80vh',
              height: 'auto',
              border: '1px solid #dee2e6',
              borderRadius: '4px'
            }}
            unoptimized
            onError={() => {
              setPreviewContent({ 
                type: 'none', 
                data: null, 
                error: 'Failed to display image' 
              });
            }}
          />
        </div>
      );
    }

    if (previewContent.type === 'pdf' && previewContent.data) {
      return (
        <div className="pdf-container" style={{ padding: '10px' }}>
          <PdfViewer src={previewContent.data} />
          <div className="mt-2 text-center">
            <small className="text-muted">
              PDF not displaying correctly? 
              <a 
                href={previewContent.data} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ms-1"
              >
                Open in new tab
              </a>
            </small>
          </div>
        </div>
      );
    }

    if (!record) {
      return (
        <div className="text-center text-muted p-5">
          <i className="fas fa-file-alt fa-3x mb-3"></i>
          <p>Select a file to preview</p>
        </div>
      );
    }

    return (
      <div className="text-center text-muted p-5">
        <i className="fas fa-file fa-3x mb-3"></i>
        <p>No preview available for this file type</p>
        <small>Supported formats: PDF, JPG, PNG, GIF, WebP</small>
      </div>
    );
  };

  return (
    <div id="viewer-container" className="viewer-pane">
      <div className="viewer-header d-flex justify-content-between align-items-center p-3 border-bottom">
        <h5 className="mb-0">Preview</h5>
        {record && (
          <small className="text-muted">
            {record.currentPath.split('/').pop()}
          </small>
        )}
      </div>
      <div className="viewer-content">
        <div id="viewer" style={{ minHeight: '400px' }}>
          {renderPreview()}
        </div>
      </div>
    </div>
  );
};

export default FileViewer; 