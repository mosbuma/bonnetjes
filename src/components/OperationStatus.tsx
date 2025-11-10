'use client';

import React from 'react';
import { FileInfo } from '@/types';
import RecordCard from './RecordCard';

interface OperationStatusProps {
  isAnalyzingAll: boolean;
  isRenamingAll: boolean;
  isAnalyzingSingle: boolean;
  analyzingSingleFile: string | null;
  analysisProgress: {
    total: number;
    processed: number;
    failed: number;
    currentFile: string | null;
  } | null;
  renameProgress: {
    total: number;
    processed: number;
    failed: number;
    currentFile: string | null;
  } | null;
  operationName: string;
  currentRecord: FileInfo | null;
  onRecordSelect: (record: FileInfo) => void;
  onRecordUpdate: (record: FileInfo) => void;
}

const OperationStatus: React.FC<OperationStatusProps> = ({
  isAnalyzingAll,
  isRenamingAll,
  isAnalyzingSingle,
  analyzingSingleFile,
  analysisProgress,
  renameProgress,
  operationName,
  currentRecord,
  onRecordSelect,
  onRecordUpdate,
}) => {
  return (
    <div className="operation-status-container">
      <div className="card mb-3">
        <div className="card-body">
          <h5 className="card-title">Operation in Progress: {operationName}</h5>
          
          {/* Analysis Progress */}
          {isAnalyzingAll && analysisProgress && (
            <div className="mb-3">
              <div className="progress mb-2" style={{ height: '25px' }}>
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated"
                  role="progressbar"
                  style={{
                    width: `${(analysisProgress.processed + analysisProgress.failed) / analysisProgress.total * 100}%`
                  }}
                >
                  {analysisProgress.processed + analysisProgress.failed} / {analysisProgress.total}
                </div>
              </div>
              <div className="d-flex justify-content-between">
                <div>
                  <span className="badge bg-success me-2">✓ Success: {analysisProgress.processed}</span>
                  <span className="badge bg-warning me-2">✗ Failed: {analysisProgress.failed}</span>
                </div>
                {analysisProgress.currentFile && (
                  <div className="text-muted">
                    Processing: <strong>{analysisProgress.currentFile}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rename Progress */}
          {isRenamingAll && renameProgress && (
            <div className="mb-3">
              <div className="progress mb-2" style={{ height: '25px' }}>
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated bg-success"
                  role="progressbar"
                  style={{
                    width: `${(renameProgress.processed + renameProgress.failed) / renameProgress.total * 100}%`
                  }}
                >
                  {renameProgress.processed + renameProgress.failed} / {renameProgress.total}
                </div>
              </div>
              <div className="d-flex justify-content-between">
                <div>
                  <span className="badge bg-success me-2">✓ Renamed: {renameProgress.processed}</span>
                  <span className="badge bg-warning me-2">✗ Failed: {renameProgress.failed}</span>
                </div>
                {renameProgress.currentFile && (
                  <div className="text-muted">
                    Renaming: <strong>{renameProgress.currentFile}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Single File Analysis */}
          {isAnalyzingSingle && analyzingSingleFile && (
            <div className="mb-3">
              <div className="d-flex align-items-center">
                <div className="spinner-border spinner-border-sm me-2" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <span>Analyzing: <strong>{analyzingSingleFile}</strong></span>
              </div>
            </div>
          )}

          {/* Generic Loading */}
          {!isAnalyzingAll && !isRenamingAll && !isAnalyzingSingle && (
            <div className="mb-3">
              <div className="d-flex align-items-center">
                <div className="spinner-border spinner-border-sm me-2" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <span>Processing...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Show last returned record if available */}
      {currentRecord && (
        <div>
          <h6 className="mb-2">Last Updated Record:</h6>
          <RecordCard
            key={currentRecord.id}
            record={currentRecord}
            isSelected={true}
            onSelect={onRecordSelect}
            onUpdate={onRecordUpdate}
          />
        </div>
      )}
    </div>
  );
};

export default OperationStatus;

