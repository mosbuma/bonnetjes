'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Header from '@/components/Header';
import RecordList from '@/components/RecordList';
import FileViewer from '@/components/FileViewer';
import OperationStatus from '@/components/OperationStatus';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchFiles, scanFiles } from '@/store/slices/filesSlice';

export default function Home() {
  const dispatch = useAppDispatch();
  const { 
    files, 
    loading, 
    error, 
    currentRecord, 
    isAnalyzingAll,
    isRenamingAll,
    isAnalyzingSingle,
    analyzingSingleFile,
    analysisProgress,
    renameProgress
  } = useAppSelector((state) => state.files);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'analyzed' | 'bad'>('all');
  const [lastOperationName, setLastOperationName] = useState<string>('');
  const [wasShowingOperationStatus, setWasShowingOperationStatus] = useState(false);

  // Determine if we should show operation status instead of file list
  const showOperationStatus = useMemo(() => {
    return isAnalyzingAll || isRenamingAll || isAnalyzingSingle || 
           (loading && (lastOperationName === 'Clear State' || 
                       lastOperationName === 'Clean Not Analyzed' || 
                       lastOperationName === 'Cleanup Files' || 
                       lastOperationName === 'Remove Renamed Files' || 
                       lastOperationName === 'Reset Bad Files'));
  }, [isAnalyzingAll, isRenamingAll, isAnalyzingSingle, loading, lastOperationName]);

  // Clear operation name when loading completes
  useEffect(() => {
    if (!loading && lastOperationName) {
      setLastOperationName('');
    }
  }, [loading, lastOperationName]);

  // Clear preview when switching back to list mode after a long-running operation
  useEffect(() => {
    // Track when we transition from operation status mode to list mode
    if (wasShowingOperationStatus && !showOperationStatus) {
      // Clear the current record to reset the preview when switching back to list mode
      dispatch({ type: 'files/setCurrentRecord', payload: null });
    }
    setWasShowingOperationStatus(showOperationStatus);
  }, [showOperationStatus, wasShowingOperationStatus, dispatch]);

  const handleOperationStart = (operationName: string) => {
    setLastOperationName(operationName);
  };

  // Initial load - fetch all files on page load
  useEffect(() => {
    dispatch(fetchFiles());
  }, [dispatch]);

  const handleScan = async () => {
    try {
      const result = await dispatch(scanFiles()).unwrap();
      
      // Show detailed feedback to user
      if (result.success) {
        const message = `Scan completed successfully!\n\n` +
          `Total files found: ${result.totalFilesFound}\n` +
          `New files added: ${result.newFilesCount}\n\n` +
          `Files are now available in the list.`;
        alert(message);
      }
    } catch (error) {
      console.error('Error during scan:', error);
      alert('Error during scan: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <div className="container-fluid mt-4">
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <Header 
                onScan={handleScan}
                searchText={searchText}
                statusFilter={statusFilter}
                onSearchChange={setSearchText}
                onStatusFilterChange={setStatusFilter}
                onOperationStart={handleOperationStart}
              />
              {loading && (
                <div className="text-center mb-3">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              )}
              <div className="row">
                <div className="col-md-6" style={{ position: 'relative' }}>
                  {/* Operation Status - shown when showOperationStatus is true */}
                  <div style={{ display: showOperationStatus ? 'block' : 'none' }}>
                    <OperationStatus
                      isAnalyzingAll={isAnalyzingAll}
                      isRenamingAll={isRenamingAll}
                      isAnalyzingSingle={isAnalyzingSingle}
                      analyzingSingleFile={analyzingSingleFile}
                      analysisProgress={analysisProgress}
                      renameProgress={renameProgress}
                      operationName={lastOperationName || 
                        (isAnalyzingAll ? 'Analyze All' : 
                         isRenamingAll ? 'Rename All' : 
                         isAnalyzingSingle ? 'Analyze Single File' : 
                         'Processing')}
                      currentRecord={currentRecord}
                      onRecordSelect={(record) => dispatch({ type: 'files/setCurrentRecord', payload: record })}
                      onRecordUpdate={(record) => dispatch({ type: 'files/updateFile', payload: record })}
                    />
                  </div>
                  {/* Record List - always rendered but hidden when showing operation status */}
                  <div style={{ display: showOperationStatus ? 'none' : 'block' }}>
                    <RecordList 
                      records={files}
                      searchText={searchText}
                      statusFilter={statusFilter}
                      onRecordSelect={(record) => dispatch({ type: 'files/setCurrentRecord', payload: record })}
                      onRecordUpdate={(record) => dispatch({ type: 'files/updateFile', payload: record })}
                      currentRecord={currentRecord}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <FileViewer 
                    record={currentRecord}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
