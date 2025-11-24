'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Header from '@/components/Header';
import RecordList from '@/components/RecordList';
import FileViewer from '@/components/FileViewer';
import OperationStatus from '@/components/OperationStatus';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchFiles, scanFiles, mergeFiles, rotateImages } from '@/store/slices/filesSlice';

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
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

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

  const handleMergeModeToggle = () => {
    setIsMergeMode(!isMergeMode);
    if (isMergeMode) {
      // Exiting merge mode - clear selections
      setSelectedFileIds(new Set());
    }
  };

  const handleFileSelectionChange = (fileId: string, isSelected: boolean) => {
    setSelectedFileIds(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(fileId);
      } else {
        newSet.delete(fileId);
      }
      return newSet;
    });
  };

  const handleMerge = async () => {
    if (selectedFileIds.size < 2) {
      alert('Please select at least 2 files to merge.');
      return;
    }

    // Validate all selected files are image files
    const selectedFiles = files.filter(f => selectedFileIds.has(f.id));
    const nonImageFiles = selectedFiles.filter(f => f.type !== 'image');
    
    if (nonImageFiles.length > 0) {
      alert('All selected files must be image files. Please deselect non-image files.');
      return;
    }

    try {
      const fileIdsArray = Array.from(selectedFileIds);
      const result = await dispatch(mergeFiles({ fileIds: fileIdsArray })).unwrap();
      
      // The reducer already updates state immediately (removes deleted files, adds merged file)
      // But we refresh from server to ensure everything is in sync
      // Small delay to ensure server state is saved
      await new Promise(resolve => setTimeout(resolve, 100));
      await dispatch(fetchFiles());
      
      alert('Files merged successfully!');
      
      // Exit merge mode and clear selections
      setIsMergeMode(false);
      setSelectedFileIds(new Set());
    } catch (error) {
      console.error('Error merging files:', error);
      alert('Error merging files: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleRotate = async (direction: 'left' | 'right') => {
    if (selectedFileIds.size === 0) {
      alert('Please select at least one image file to rotate.');
      return;
    }

    // Validate all selected files are image files
    const selectedFiles = files.filter(f => selectedFileIds.has(f.id));
    const nonImageFiles = selectedFiles.filter(f => f.type !== 'image');
    
    if (nonImageFiles.length > 0) {
      alert('All selected files must be image files. Please deselect non-image files.');
      return;
    }

    try {
      const fileIdsArray = Array.from(selectedFileIds);
      await dispatch(rotateImages({ fileIds: fileIdsArray, direction })).unwrap();
      
      // Refresh files to show updated images
      await dispatch(fetchFiles());
    } catch (error) {
      console.error('Error rotating images:', error);
      alert('Error rotating images: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleSelectAll = () => {
    // Apply the same filters as RecordList
    let filtered = [...files];
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(record => record.status === statusFilter);
    }
    
    // Apply search filter
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(record => {
        const filename = record.currentPath.split('/').pop() || '';
        const originalFilename = record.originalPath.split('/').pop() || '';
        return filename.toLowerCase().includes(searchLower) || 
               originalFilename.toLowerCase().includes(searchLower);
      });
    }
    
    // Select only image files from the filtered results
    const imageFileIds = filtered.filter(f => f.type === 'image').map(f => f.id);
    setSelectedFileIds(new Set(imageFileIds));
  };

  const handleSelectNone = () => {
    setSelectedFileIds(new Set());
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
                isMergeMode={isMergeMode}
                onMergeModeToggle={handleMergeModeToggle}
                selectedFileIds={selectedFileIds}
                onMerge={handleMerge}
                onSelectAll={handleSelectAll}
                onSelectNone={handleSelectNone}
                onRotateLeft={() => handleRotate('left')}
                onRotateRight={() => handleRotate('right')}
                onCancelMerge={() => {
                  setIsMergeMode(false);
                  setSelectedFileIds(new Set());
                }}
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
                      isMergeMode={isMergeMode}
                      selectedFileIds={selectedFileIds}
                      onFileSelectionChange={handleFileSelectionChange}
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
