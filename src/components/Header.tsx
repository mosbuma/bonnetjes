'use client';

import React, { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { cleanupFiles, clearState, cleanNotAnalyzed, resetBadFiles, analyzeAll, stopAnalysis, renameAll, removeRenamedFiles } from '@/store/slices/filesSlice';

interface HeaderProps {
  onScan: () => void;
}

const Header: React.FC<HeaderProps> = ({ onScan }) => {
  const dispatch = useAppDispatch();
  const { loading, isAnalyzingAll, shouldStopAnalysis, analysisProgress, isAnalyzingSingle, analyzingSingleFile, isRenamingAll, renameProgress } = useAppSelector((state) => state.files);
  const [searchText, setSearchText] = useState('');
  const [cacheStats, setCacheStats] = useState<{ total: number; lastUpdated: string } | null>(null);

  useEffect(() => {
    // Load cache stats
    loadCacheStats();
  }, []);

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

  const handleRemoveRenamedFiles = async () => {
    if (confirm('Are you sure you want to remove all renamed files from the state? This will remove all files that have been successfully renamed.')) {
      try {
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
        await dispatch(clearState()).unwrap();
        alert('State cleared successfully!');
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleCleanNotAnalyzed = async () => {
    if (confirm('Are you sure you want to remove all not analyzed files from the state? This will only remove files that have not been processed yet.')) {
      try {
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

  return (
    <div className="header">
      <h1>Bonnetje</h1>
      
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
                  onChange={(e) => setSearchText(e.target.value)}
                />
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
                </div>
              </div>
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