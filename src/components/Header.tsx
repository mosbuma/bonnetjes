'use client';

import React, { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { cleanupFiles, clearState, cleanNotAnalyzed, resetBadFiles, analyzeAll, stopAnalysis, renameAll, removeRenamedFiles } from '@/store/slices/filesSlice';

interface HeaderProps {
  onScan: () => void;
  searchText: string;
  statusFilter: 'all' | 'new' | 'analyzed' | 'bad';
  onSearchChange: (text: string) => void;
  onStatusFilterChange: (filter: 'all' | 'new' | 'analyzed' | 'bad') => void;
  onOperationStart?: (operationName: string) => void;
  isMergeMode: boolean;
  onMergeModeToggle: () => void;
  selectedFileIds: Set<string>;
  onMerge: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onCancelMerge: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onScan, 
  searchText, 
  statusFilter, 
  onSearchChange, 
  onStatusFilterChange, 
  onOperationStart,
  isMergeMode,
  onMergeModeToggle,
  selectedFileIds,
  onMerge,
  onSelectAll,
  onSelectNone,
  onRotateLeft,
  onRotateRight,
  onCancelMerge
}) => {
  const dispatch = useAppDispatch();
  const { loading, isAnalyzingAll, shouldStopAnalysis, analysisProgress, isAnalyzingSingle, analyzingSingleFile, isRenamingAll, renameProgress, files } = useAppSelector((state) => state.files);
  const [cacheStats, setCacheStats] = useState<{ total: number; lastUpdated: string } | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState<{ isSharedData: boolean; privacyMode: 'shared' | 'private' } | null>(null);

  useEffect(() => {
    // Load cache stats
    loadCacheStats();
    // Load privacy status
    loadPrivacyStatus();
  }, []);

  // Reload cache stats when single file analysis completes
  const prevIsAnalyzingSingle = React.useRef(isAnalyzingSingle);
  useEffect(() => {
    // Only reload if we transitioned from analyzing to not analyzing
    if (prevIsAnalyzingSingle.current && !isAnalyzingSingle) {
      // Small delay to ensure server has saved cache
      setTimeout(() => {
        loadCacheStats();
      }, 200);
    }
    prevIsAnalyzingSingle.current = isAnalyzingSingle;
  }, [isAnalyzingSingle]);

  const loadCacheStats = async () => {
    try {
      const response = await fetch('/api/cache');
      if (response.ok) {
        const stats = await response.json();
        setCacheStats(stats);
      }
    } catch (error) {
      console.error('Error loading cache stats:', error);
    }
  };

  const loadPrivacyStatus = async () => {
    try {
      const response = await fetch('/api/privacy-status');
      if (response.ok) {
        const status = await response.json();
        setPrivacyStatus(status);
      }
    } catch (error) {
      console.error('Error loading privacy status:', error);
    }
  };

  const handleClearCache = async () => {
    if (confirm('Are you sure you want to clear the analysis cache? This will force re-analysis of all files.')) {
      try {
        const response = await fetch('/api/cache', { method: 'DELETE' });
        if (response.ok) {
          alert('Cache cleared successfully!');
          loadCacheStats(); // Refresh stats
        } else {
          const data = await response.json();
          alert(`Error: ${data.error || 'Failed to clear cache'}`);
        }
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleRemovePdfFilesFromCache = async () => {
    if (confirm('Are you sure you want to remove PDF files from the analysis cache that were analyzed after November 21, 2025? This will force re-analysis of those PDF files only.')) {
      try {
        const response = await fetch('/api/cache', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'removePdfs' })
        });
        if (response.ok) {
          const data = await response.json();
          const message = `PDF files removed from cache successfully!\n\n` +
            `Files removed: ${data.removedCount}\n` +
            `Files remaining: ${data.remainingCount}`;
          alert(message);
          loadCacheStats(); // Refresh stats
        } else {
          const data = await response.json();
          alert(`Error: ${data.error || 'Failed to remove PDF files from cache'}`);
        }
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleRemoveRenamedFiles = async () => {
    if (confirm('Are you sure you want to remove all renamed files from the state? This will remove all files that have been successfully renamed.')) {
      try {
        onOperationStart?.('Remove Renamed Files');
        const result = await dispatch(removeRenamedFiles()).unwrap();
        const message = `Renamed files removed successfully!\n\n` +
          `Files removed: ${result.removedCount}\n` +
          `Files remaining: ${result.remainingCount}`;
        alert(message);
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleClearState = async () => {
    if (confirm('Are you sure you want to clear the state? This will remove all analyzed files from the state.')) {
      try {
        onOperationStart?.('Clear State');
        await dispatch(clearState()).unwrap();
        // alert('State cleared successfully!');
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleCleanNotAnalyzed = async () => {
    if (confirm('Are you sure you want to remove all not analyzed files from the state? This will only remove files that have not been processed yet.')) {
      try {
        onOperationStart?.('Clean Not Analyzed');
        await dispatch(cleanNotAnalyzed()).unwrap();
        alert('Not analyzed files cleaned successfully!');
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleResetBadFiles = async () => {
    if (confirm('Are you sure you want to reset all bad files? This will allow them to be analyzed again.')) {
      try {
        onOperationStart?.('Reset Bad Files');
        await dispatch(resetBadFiles()).unwrap();
        alert('Bad files reset successfully!');
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleCleanupNonExistent = async () => {
    if (confirm('Are you sure you want to remove all non-existent files from the state? This will remove all files that do not exist on the filesystem.')) {
      try {
        onOperationStart?.('Cleanup Files');
        await dispatch(cleanupFiles()).unwrap();
        alert('Non-existent files cleaned successfully!');
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleAnalyzeAll = async () => {
    try {
      const result = await dispatch(analyzeAll()).unwrap();
      const message = `Analysis completed!\n\n` +
        `Total files processed: ${result.total}\n` +
        `Successfully analyzed: ${result.processed}\n` +
        `Failed: ${result.failed}`;
      alert(message);
      
      // Update cache stats if provided in result
      if (result.cacheStats) {
        setCacheStats(result.cacheStats);
      } else {
        // Fallback: reload cache stats
        loadCacheStats();
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleStopAnalysis = async () => {
    try {
      await dispatch(stopAnalysis()).unwrap();
      alert('Analysis stopped successfully!');
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRenameAll = async () => {
    try {
      const result = await dispatch(renameAll()).unwrap();
      const message = `Rename completed!\n\n` +
        `Total files processed: ${result.total}\n` +
        `Successfully renamed: ${result.processed}\n` +
        `Failed: ${result.failed}`;
      alert(message);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const headerTitle = privacyStatus?.isSharedData 
    ? 'Bonnetje (Shared data)' 
    : 'Bonnetje (Private data)';
  
  const headerClassName = privacyStatus?.isSharedData 
    ? 'header header-shared-data' 
    : 'header';

  return (
    <div className={headerClassName}>
      <h1>{headerTitle}</h1>
      
      <div className="row mb-3">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center">
            {/* Search and Filter Controls */}
            <div className="d-flex align-items-center gap-3">
              {/* Search Input */}
              <div className="search-container">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search..."
                  value={searchText}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
              
              {/* Status Filter Buttons */}
              <div className="btn-group" role="group">
                <button
                  type="button"
                  className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => onStatusFilterChange('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${statusFilter === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => onStatusFilterChange('new')}
                >
                  New
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${statusFilter === 'analyzed' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => onStatusFilterChange('analyzed')}
                >
                  Analyzed
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${statusFilter === 'bad' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => onStatusFilterChange('bad')}
                >
                  Bad
                </button>
              </div>
              
              {/* Cache Stats */}
              {cacheStats && (
                <div className="cache-stats">
                  <small className="text-muted">
                    Cache: {cacheStats.total} entries
                  </small>
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="scan-buttons">
              {isMergeMode ? (
                <>
                  <button
                    className="btn btn-outline-secondary me-2"
                    onClick={onSelectAll}
                    title="Select All Image Files"
                  >
                    ☑ Select All
                  </button>
                  <button
                    className="btn btn-outline-secondary me-2"
                    onClick={onSelectNone}
                    disabled={selectedFileIds.size === 0}
                    title="Deselect All Files"
                  >
                    ☐ Select None
                  </button>
                  <button
                    className="btn btn-outline-primary me-2"
                    onClick={onRotateLeft}
                    disabled={
                      selectedFileIds.size === 0 ||
                      Array.from(selectedFileIds).some(id => {
                        const file = files.find(f => f.id === id);
                        return !file || file.type !== 'image';
                      })
                    }
                    title="Rotate Left (90° counterclockwise)"
                  >
                    ↺ Rotate Left
                  </button>
                  <button
                    className="btn btn-outline-primary me-2"
                    onClick={onRotateRight}
                    disabled={
                      selectedFileIds.size === 0 ||
                      Array.from(selectedFileIds).some(id => {
                        const file = files.find(f => f.id === id);
                        return !file || file.type !== 'image';
                      })
                    }
                    title="Rotate Right (90° clockwise)"
                  >
                    ↻ Rotate Right
                  </button>
                  <button
                    className="btn btn-primary me-2"
                    onClick={onMerge}
                    disabled={
                      selectedFileIds.size < 2 ||
                      Array.from(selectedFileIds).some(id => {
                        const file = files.find(f => f.id === id);
                        return !file || file.type !== 'image';
                      })
                    }
                  >
                    Merge
                  </button>
                  <button
                    className="btn btn-outline-secondary me-2"
                    onClick={onCancelMerge}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-outline-primary me-2"
                    onClick={onScan}
                  >
                    Import Files
                  </button>
                  
                  <button
                    className="btn btn-outline-primary me-2"
                    onClick={isAnalyzingAll ? handleStopAnalysis : handleAnalyzeAll}
                    disabled={isAnalyzingAll && shouldStopAnalysis}
                  >
                    {isAnalyzingAll ? 'Stop' : 'Analyze All'}
                  </button>
                  
                  <button
                    className="btn btn-outline-success me-2"
                    onClick={handleRenameAll}
                    disabled={isRenamingAll || loading}
                  >
                    Rename All
                  </button>
                  
                  <button
                    className="btn btn-outline-info me-2"
                    onClick={onMergeModeToggle}
                  >
                    Merge Mode
                  </button>
                  
                  <div className="col-md-3">
                    <div className="btn-group" role="group">
                      <button 
                        className="btn btn-warning" 
                        onClick={handleCleanupNonExistent}
                        disabled={loading}
                      >
                        Remove Non-Existent Files
                      </button>
                      <button 
                        className="btn btn-danger" 
                        onClick={handleClearState}
                        disabled={loading}
                      >
                        Clear State
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={handleCleanNotAnalyzed}
                        disabled={loading}
                      >
                        Clean Not Analyzed
                      </button>
                      <button 
                        className="btn btn-info" 
                        onClick={handleResetBadFiles}
                        disabled={loading}
                      >
                        Reset Bad Files
                      </button>
                      <button 
                        className="btn btn-outline-secondary" 
                        onClick={handleRemoveRenamedFiles}
                        disabled={loading}
                      >
                        Remove Renamed Files
                      </button>
                      <button 
                        className="btn btn-outline-secondary" 
                        onClick={handleClearCache}
                        disabled={loading}
                      >
                        Clear Cache
                      </button>
                      <button 
                        className="btn btn-outline-warning" 
                        onClick={handleRemovePdfFilesFromCache}
                        disabled={loading}
                      >
                        Remove PDFs from Cache
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Analysis Progress Row */}
      {(isAnalyzingAll || isAnalyzingSingle || isRenamingAll) && (
        <div className="row mt-2">
          <div className="col-12">
            <div className="analysis-progress-container p-2 bg-light rounded">
              <div className="d-flex justify-content-between align-items-center">
                <div className="progress-info">
                  <strong>Progress:</strong>
                  {isAnalyzingAll && analysisProgress && (
                    <>
                      <span className="ms-2">
                        Analysis: {analysisProgress.processed + analysisProgress.failed}/{analysisProgress.total} files processed
                      </span>
                      {analysisProgress.currentFile && (
                        <span className="ms-3 text-primary">
                          Currently analyzing: <strong>{analysisProgress.currentFile}</strong>
                        </span>
                      )}
                    </>
                  )}
                  {isAnalyzingSingle && analyzingSingleFile && (
                    <span className="ms-2 text-primary">
                      Analyzing single file: <strong>{analyzingSingleFile}</strong>
                    </span>
                  )}
                  {isRenamingAll && renameProgress && (
                    <>
                      <span className="ms-2">
                        Renaming: {renameProgress.processed + renameProgress.failed}/{renameProgress.total} files processed
                      </span>
                      {renameProgress.currentFile && (
                        <span className="ms-3 text-success">
                          Currently renaming: <strong>{renameProgress.currentFile}</strong>
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="progress-stats">
                  {isAnalyzingAll && analysisProgress && (
                    <>
                      {analysisProgress.processed > 0 && (
                        <span className="text-success me-3">
                          ✓ Success: {analysisProgress.processed}
                        </span>
                      )}
                      {analysisProgress.failed > 0 && (
                        <span className="text-warning me-3">
                          ✗ Failed: {analysisProgress.failed}
                        </span>
                      )}
                    </>
                  )}
                  {isAnalyzingSingle && (
                    <span className="text-info me-3">
                      ⏳ Processing...
                    </span>
                  )}
                  {isRenamingAll && renameProgress && (
                    <>
                      {renameProgress.processed > 0 && (
                        <span className="text-success me-3">
                          ✓ Renamed: {renameProgress.processed}
                        </span>
                      )}
                      {renameProgress.failed > 0 && (
                        <span className="text-warning me-3">
                          ✗ Failed: {renameProgress.failed}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Header; 