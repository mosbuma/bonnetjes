'use client';

import React, { useState } from 'react';
import { FileInfo, DocumentData, DocumentType } from '@/types';
import { generateFileName } from '@/lib/generic-tools';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { analyzeFile, renameFile, updateFileData, mergeFiles } from '@/store/slices/filesSlice';

interface RecordCardProps {
  record: FileInfo;
  isSelected: boolean;
  onSelect: (record: FileInfo) => void;
  onUpdate: (record: FileInfo) => void;
}

const RecordCard: React.FC<RecordCardProps> = ({ 
  record, 
  isSelected, 
  onSelect, 
  onUpdate
}) => {
  const dispatch = useAppDispatch();
  const { files } = useAppSelector((state) => state.files);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const getFieldsForDocumentType = (documentType: DocumentType): string[] => {
    switch (documentType) {
      case DocumentType.INVOICE:
        return ['invoice_date', 'company_name', 'description', 'invoice_currency', 'invoice_amount'];
      case DocumentType.REKENINGAFSCHRIFT:
        return ['document_date', 'document_category', 'description', 'source', 'bank_account_number', 'account_holder_name', 'page_number', 'number_of_pages'];
      case DocumentType.GENERIC:
        return ['document_date', 'document_category', 'description', 'source'];
      case DocumentType.MOVIE_COVER:
        return ['movie_title', 'type', 'season', 'disc_number', 'media_format', 'description', 'duration', 'imdb_id'];
      default:
        return [];
    }
  };

  const checkForChanges = (record: FileInfo): boolean => {
    if (!record.data) return false;
    
    const fields = getFieldsForDocumentType(record.documentType);
    return fields.some(field => {
      const input = document.querySelector(`input[data-field="${field}"][data-record-id="${record.id}"]`) as HTMLInputElement;
      const currentValue = (record.data as unknown as Record<string, string>)[field] || '';
      return input && input.value !== currentValue;
    });
  };

  const handleFieldChange = (field: string, value: string) => {
    const updatedRecord = {
      ...record,
      data: {
        ...record.data,
        [field]: value
      } as DocumentData
    };
    onUpdate(updatedRecord);
  };

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAnalyzing(true);
    
    try {
      // Check cache first - only force reanalyze if explicitly requested
      await dispatch(analyzeFile({ id: record.id, forceReanalyze: false })).unwrap();
    } catch (error) {
      console.error('Error analyzing file:', error);
      alert('Error analyzing file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleMergeWithPrev = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = files.findIndex((f: FileInfo) => f.id === record.id);
    if (currentIndex <= 0) {
      alert('No previous file to merge with');
      return;
    }
    
    const prevFile = files[currentIndex - 1];
    setIsMerging(true);
    
    try {
      await dispatch(mergeFiles({
        currentFileId: record.id,
        targetFileId: prevFile.id,
        mergeDirection: 'prev'
      })).unwrap();
      alert('Files merged successfully!');
    } catch (error) {
      console.error('Error merging files:', error);
      alert('Error merging files: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsMerging(false);
    }
  };

  const handleMergeWithNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = files.findIndex((f: FileInfo) => f.id === record.id);
    if (currentIndex >= files.length - 1) {
      alert('No next file to merge with');
      return;
    }
    
    const nextFile = files[currentIndex + 1];
    setIsMerging(true);
    
    try {
      await dispatch(mergeFiles({
        currentFileId: record.id,
        targetFileId: nextFile.id,
        mergeDirection: 'next'
      })).unwrap();
      alert('Files merged successfully!');
    } catch (error) {
      console.error('Error merging files:', error);
      alert('Error merging files: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsMerging(false);
    }
  };

  const handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUpdating(true);
    
    const hasChanges = checkForChanges(record);
    
    if (hasChanges) {
      // Update file data
      try {
        await dispatch(updateFileData({ id: record.id, data: record.data })).unwrap();
      } catch (error) {
        console.error('Error updating file:', error);
        alert('Error updating file. Please try again.');
      } finally {
        setIsUpdating(false);
      }
    } else {
      // Rename file
      try {
        await dispatch(renameFile(record.id)).unwrap();
      } catch (error) {
        console.error('Error renaming file:', error);
        alert('Error renaming file: ' + (error instanceof Error ? error.message : 'Unknown error'));
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const getActionButtonText = (): string => {
    const hasChanges = checkForChanges(record);
    const currentFilename = record.currentPath.split('/').pop();
    const proposedFilename = generateFileName(record).split('/').pop();
    
    if (record.status === 'new') {
      return '';
    } else if (hasChanges) {
      return 'Update';
    } else if (currentFilename !== proposedFilename) {
      return 'Rename';
    } else {
      return '';
    }
  };

  const shouldShowActionButton = (): boolean => {
    const hasChanges = checkForChanges(record);
    const currentFilename = record.currentPath.split('/').pop();
    const proposedFilename = generateFileName(record).split('/').pop();
    
    if (record.status === 'new' || record.status === 'bad') {
      return false;
    } else if (hasChanges) {
      return true;
    } else if (currentFilename !== proposedFilename && proposedFilename && proposedFilename !== `.${currentFilename?.split('.').pop()}`) {
      return true;
    } else {
      return false;
    }
  };

  const getDocumentTypeDisplay = (): string => {
    if (!record.data) return '';
    
    if ('movie_title' in record.data && record.data.movie_title) {
      return 'Movie Cover';
    } else if ('document_category' in record.data && record.data.document_category) {
      return 'Generic';
    } else {
      return 'Invoice';
    }
  };

  const showFields = (record.status === 'analyzed') && ("data" in record === true);
  // console.log(`showFields - show: ${showFields} / doctype: ${record.documentType}`, record);

  // Show the proposed filename below the current filename
  const currentFilename = record.currentPath.split('/').pop();
  const proposedFilename = generateFileName(record).split('/').pop();
  const isValidProposedFilename = proposedFilename && 
    proposedFilename !== currentFilename && 
    proposedFilename !== `.${currentFilename?.split('.').pop()}` &&
    !proposedFilename.startsWith('.');

  // Derive isRenamed from filename difference
  const getFilename = (p: string) => p.split('/').pop();
  const isRenamed = getFilename(record.originalPath) !== getFilename(record.currentPath);

  return (
    <div 
      className={`record-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(record)}
    >
      <div className="record-header">
        <div className="title-container">
          <h3>{currentFilename}</h3>
          {isValidProposedFilename && (
            <div className="predicted-filename" style={{ fontSize: '0.95em', color: '#888', marginTop: 2 }}>
              Proposed: <span style={{ fontWeight: 500 }}>{proposedFilename}</span>
            </div>
          )}
        </div>
        
        <div className="badges-container">
          <span className={`status-badge status-${record.status}`}>
            {record.status}
          </span>
          
          {record.data && (
            <span className="status-badge status-type">
              {getDocumentTypeDisplay()}
            </span>
          )}
          {isRenamed && (
            <span className="status-badge status-renamed">
              Renamed
            </span>
          )}
        </div>
      </div>
      
      {record.status === 'bad' && record.error && (
        <div className="error-message" style={{ 
          backgroundColor: '#ffebee', 
          color: '#c62828', 
          padding: '0.5rem', 
          margin: '0.5rem 0', 
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          <strong>Analysis Failed:</strong> {record.error}
        </div>
      )}
      
      <div className="record-fields">
        {showFields && (
          <>
            {getFieldsForDocumentType(record.documentType).map(fieldName => (
              <div key={fieldName} className="field-group">
                <label>{fieldName.replace('_', ' ').toUpperCase()}</label>
                <input
                  type="text"
                  value={(record.data as unknown as Record<string, string>)[fieldName] || ''}
                  placeholder={`Enter ${fieldName.replace('_', ' ')}`}
                  data-field={fieldName}
                  data-record-id={record.id}
                  onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </>
        )}
        
        <div className="action-buttons">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleAnalyze}
            disabled={isAnalyzing || record.status === 'bad'}
            title={record.status === 'bad' ? 'File marked as bad after failed analysis' : ''}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
          
          <button
            className="btn btn-info btn-sm"
            onClick={handleMergeWithPrev}
            disabled={isMerging || files.findIndex((f: FileInfo) => f.id === record.id) <= 0}
            title="Merge with previous file"
          >
            {isMerging ? 'Merging...' : 'Merge Prev'}
          </button>
          
          <button
            className="btn btn-info btn-sm"
            onClick={handleMergeWithNext}
            disabled={isMerging || files.findIndex((f: FileInfo) => f.id === record.id) >= files.length - 1}
            title="Merge with next file"
          >
            {isMerging ? 'Merging...' : 'Merge Next'}
          </button>
          
          {shouldShowActionButton() && (
            <button
              className="btn btn-primary btn-sm btn-actionbutton"
              onClick={handleAction}
              disabled={isUpdating}
            >
              {isUpdating ? 'Updating...' : getActionButtonText()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordCard;