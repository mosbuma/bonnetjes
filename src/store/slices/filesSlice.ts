import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { FileInfo, State } from '@/types';
import { generateFileName } from '@/lib/generic-tools';

interface FilesState {
  files: FileInfo[];
  currentRecord: FileInfo | null;
  loading: boolean;
  error: string | null;
  lastFetchTime: string | null; // ISO timestamp of last fetch
  isAnalyzingAll: boolean;
  shouldStopAnalysis: boolean;
  isAnalyzingSingle: boolean;
  analyzingSingleFile: string | null;
  isRenamingAll: boolean;
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
}

const initialState: FilesState = {
  files: [],
  currentRecord: null,
  loading: false,
  error: null,
  lastFetchTime: null,
  isAnalyzingAll: false,
  shouldStopAnalysis: false,
  isAnalyzingSingle: false,
  analyzingSingleFile: null,
  isRenamingAll: false,
  analysisProgress: null,
  renameProgress: null,
};

// Async thunks for API calls
export const fetchFiles = createAsyncThunk(
  'files/fetchFiles',
  async (since?: string) => {
    const url = since ? `/api/records?since=${encodeURIComponent(since)}` : '/api/records';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch files');
    }
    const data = await response.json();
    return { files: data, isIncremental: !!since };
  }
);

export const scanFiles = createAsyncThunk(
  'files/scanFiles',
  async (_, { dispatch }) => {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Scan failed');
    }
    
    // After successful scan, fetch updated files
    dispatch(fetchFiles());
    return response.json();
  }
);

export const renameFile = createAsyncThunk(
  'files/renameFile',
  async (id: string, { dispatch }) => {
    const response = await fetch('/api/rename-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Rename failed');
    }
    
    // Return response - file data will be used to update state immediately
    const result = await response.json();
    return result;
  }
);

export const cleanupFiles = createAsyncThunk(
  'files/cleanupFiles',
  async (_, { dispatch }) => {
    const response = await fetch('/api/cleanup-nonexistent-files', {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Cleanup failed');
    }
    
    // After cleanup, fetch updated files
    dispatch(fetchFiles());
    return response.json();
  }
);

export const analyzeFile = createAsyncThunk(
  'files/analyzeFile',
  async ({ id, forceReanalyze = false }: { id: string; forceReanalyze?: boolean }, { dispatch, getState }) => {
    const state = getState() as { files: FilesState };
    const file = state.files.files.find(f => f.id === id);
    const fileName = file?.currentPath.split('/').pop() || id;
    
    // Set single file analysis state
    dispatch(setAnalyzingSingleFile(fileName));
    
    // Use batch analyze endpoint with a batch of 1
    const response = await fetch('/api/analyze-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], forceReanalyze }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Analysis failed');
    }
    
    const batchResult = await response.json();
    const fileResult = batchResult.results?.[0];
    
    if (!fileResult || !fileResult.success) {
      throw new Error(fileResult?.error || 'Analysis failed');
    }
    
    // Return result - state will be updated immediately in the reducer
    // No need to fetchFiles since we have the updated file data
    return { 
      data: fileResult.data, 
      usedCache: fileResult.usedCache, 
      cacheHit: fileResult.usedCache,
      cacheStats: batchResult.cacheStats // Include cache stats
    };
  }
);

export const updateFileData = createAsyncThunk(
  'files/updateFileData',
  async ({ id, data }: { id: string; data: any }, { dispatch }) => {
    const response = await fetch('/api/records', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, data }),
    });
    if (!response.ok) {
      throw new Error('Update failed');
    }
    
    // Return response - file data will be used to update state immediately
    const result = await response.json();
    return result;
  }
);

export const clearState = createAsyncThunk(
  'files/clearState',
  async (_, { dispatch }) => {
    const response = await fetch('/api/clear-state', {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Clear state failed');
    }
    
    // After clearing state, fetch updated files (should be empty)
    dispatch(fetchFiles());
    return response.json();
  }
);

export const cleanNotAnalyzed = createAsyncThunk(
  'files/cleanNotAnalyzed',
  async (_, { dispatch }) => {
    const response = await fetch('/api/clean-not-analyzed', {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Clean not analyzed failed');
    }
    
    // After cleaning, fetch updated files
    dispatch(fetchFiles());
    return response.json();
  }
);

export const resetBadFiles = createAsyncThunk(
  'files/resetBadFiles',
  async (_, { dispatch }) => {
    const response = await fetch('/api/reset-bad-files', {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Reset bad files failed');
    }
    
    // After resetting, fetch updated files
    dispatch(fetchFiles());
    return response.json();
  }
);

export const removeRenamedFiles = createAsyncThunk(
  'files/removeRenamedFiles',
  async (_, { dispatch }) => {
    const response = await fetch('/api/remove-renamed-files', {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Remove renamed files failed');
    }
    
    // After removing, fetch updated files
    dispatch(fetchFiles());
    return response.json();
  }
);

export const mergeFiles = createAsyncThunk(
  'files/mergeFiles',
  async ({ currentFileId, targetFileId, mergeDirection }: {
    currentFileId: string;
    targetFileId: string;
    mergeDirection: 'prev' | 'next';
  }, { dispatch }) => {
    const response = await fetch('/api/merge-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentFileId, targetFileId, mergeDirection }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Merge files failed');
    }
    
    // Return response - file data will be used to update state immediately
    const result = await response.json();
    return result;
  }
);

export const analyzeAll = createAsyncThunk(
  'files/analyzeAll',
  async (_, { dispatch, getState }) => {
    const state = getState() as { files: FilesState };
    const filesToAnalyze = state.files.files.filter(file => 
      file.status === 'new' || file.status === 'bad'
    );
    
    if (filesToAnalyze.length === 0) {
      throw new Error('No files to analyze');
    }
    
    let processedCount = 0;
    let failedCount = 0;
    let lastCacheStats: { total: number; lastUpdated: string } | null = null;
    
    for (const file of filesToAnalyze) {
      // Check if we should stop
      const currentState = getState() as { files: FilesState };
      if (currentState.files.shouldStopAnalysis) {
        break;
      }
      
      try {
        // Update progress
        dispatch(setAnalysisProgress({
          total: filesToAnalyze.length,
          processed: processedCount,
          failed: failedCount,
          currentFile: file.currentPath.split('/').pop() || file.id
        }));
        
        // Analyze individual file using batch endpoint
        const response = await fetch('/api/analyze-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [file.id] }),
        });
        
        if (response.ok) {
          const batchResult = await response.json();
          const fileResult = batchResult.results?.[0];
          
          // Capture cache stats from the batch result
          if (batchResult.cacheStats) {
            lastCacheStats = batchResult.cacheStats;
          }
          
          if (fileResult && fileResult.success && fileResult.data) {
            processedCount++;
            // Set the analyzed file as the current record to display its results
            const analyzedRecord = {
              ...fileResult.data,
              status: 'analyzed' as const,
            };
            dispatch(setCurrentRecord(analyzedRecord));
            // Update file in state immediately (no need to fetchFiles)
            dispatch({ type: 'files/updateFile', payload: analyzedRecord });
          } else {
            failedCount++;
            console.warn(`Failed to analyze file ${file.currentPath}:`, fileResult?.error || 'Unknown error');
          }
        } else {
          failedCount++;
          const errorText = await response.text();
          console.warn(`Failed to analyze file ${file.currentPath}:`, errorText);
        }
        
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failedCount++;
        console.error(`Error analyzing file ${file.currentPath}:`, error);
      }
    }
    
    // Final progress update
    dispatch(setAnalysisProgress({
      total: filesToAnalyze.length,
      processed: processedCount,
      failed: failedCount,
      currentFile: null
    }));
    
    // Final sync fetch to ensure we have the latest state (optional, but good for consistency)
    // State is already updated incrementally during the loop
    setTimeout(() => {
      dispatch(fetchFiles());
    }, 500);
    
    return {
      total: filesToAnalyze.length,
      processed: processedCount,
      failed: failedCount,
      cacheStats: lastCacheStats // Include cache stats from last analysis
    };
  }
);

export const stopAnalysis = createAsyncThunk(
  'files/stopAnalysis',
  async (_, { dispatch }) => {
    // Set the stop flag - the analyze all loop will check this and stop
    dispatch(setShouldStopAnalysis(true));
    return { success: true };
  }
);

export const renameAll = createAsyncThunk(
  'files/renameAll',
  async (_, { dispatch, getState }) => {
    const state = getState() as { files: FilesState };
    const filesToRename = state.files.files.filter(file => {
      // Only rename files that are analyzed
      if (file.status !== 'analyzed') return false;
      
      // Check if the proposed filename is valid
      const currentFilename = file.currentPath.split('/').pop() || '';
      const proposedFilename = generateFileName(file).split('/').pop() || '';
      const extension = currentFilename.split('.').pop() || '';
      
      // Skip if proposed filename is invalid (blank, just extension, or starts with dot)
      if (!proposedFilename || 
          proposedFilename === `.${extension}` || 
          proposedFilename.startsWith('.') ||
          proposedFilename === currentFilename) {
        return false;
      }
      
      return true;
    });
    
    if (filesToRename.length === 0) {
      throw new Error('No files to rename');
    }
    
    // Sort files to match the visible list order (alphabetically by basename, then extension)
    const sortedFilesToRename = [...filesToRename].sort((a, b) => {
      const aBasename = a.currentPath.split('/').pop()?.split('.').shift() || '';
      const bBasename = b.currentPath.split('/').pop()?.split('.').shift() || '';
      const aExtension = a.currentPath.split('/').pop()?.split('.').pop() || '';
      const bExtension = b.currentPath.split('/').pop()?.split('.').pop() || '';
      return aBasename.localeCompare(bBasename) || aExtension.localeCompare(bExtension);
    });
    
    // Check if we should stop before starting
    const currentState = getState() as { files: FilesState };
    if (currentState.files.shouldStopAnalysis) {
      throw new Error('Operation cancelled');
    }
    
    // Update initial progress
    dispatch(setRenameProgress({
      total: sortedFilesToRename.length,
      processed: 0,
      failed: 0,
      currentFile: 'Processing...'
    }));
    
    // Collect all file IDs in sorted order
    const fileIds = sortedFilesToRename.map(file => file.id);
    
    try {
      // Make single batch API call
      const response = await fetch('/api/rename-files-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: fileIds }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Batch rename failed');
      }
      
      const result = await response.json();
      
      // Update final progress
      dispatch(setRenameProgress({
        total: result.total,
        processed: result.successful,
        failed: result.failed,
        currentFile: null
      }));
      
      // Return results with file data for immediate state update
      // State will be updated in the reducer, no need for fetchFiles
      return {
        total: result.total,
        processed: result.successful,
        failed: result.failed,
        results: result.results // Include results with file data
      };
    } catch (error) {
      // Update progress with error
      dispatch(setRenameProgress({
        total: sortedFilesToRename.length,
        processed: 0,
        failed: sortedFilesToRename.length,
        currentFile: null
      }));
      
      throw error;
    }
  }
);

// Helper function to update a file in state
function updateFileInState(state: FilesState, updatedFile: FileInfo): void {
  const index = state.files.findIndex(f => f.id === updatedFile.id);
  if (index !== -1) {
    state.files[index] = updatedFile;
    // Also update currentRecord if it's the same file
    if (state.currentRecord?.id === updatedFile.id) {
      state.currentRecord = updatedFile;
    }
  }
}

// Helper function to remove files from state by IDs
function removeFilesFromState(state: FilesState, fileIds: string[]): void {
  state.files = state.files.filter(f => !fileIds.includes(f.id));
  // Clear currentRecord if it was removed
  if (state.currentRecord && fileIds.includes(state.currentRecord.id)) {
    state.currentRecord = null;
  }
}

const filesSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    setCurrentRecord: (state, action: PayloadAction<FileInfo | null>) => {
      state.currentRecord = action.payload;
    },
    updateFile: (state, action: PayloadAction<FileInfo>) => {
      const index = state.files.findIndex(file => file.id === action.payload.id);
      if (index !== -1) {
        state.files[index] = action.payload;
        if (state.currentRecord?.id === action.payload.id) {
          state.currentRecord = action.payload;
        }
      }
    },
    clearError: (state) => {
      state.error = null;
    },
    setLastRun: (state, action: PayloadAction<string>) => {
      state.lastRun = action.payload;
    },
    setAnalysisProgress: (state, action: PayloadAction<{
      total: number;
      processed: number;
      failed: number;
      currentFile: string | null;
    }>) => {
      state.analysisProgress = action.payload;
    },
    setShouldStopAnalysis: (state, action: PayloadAction<boolean>) => {
      state.shouldStopAnalysis = action.payload;
    },
    // Initialize state from existing state file format
    initializeFromState: (state, action: PayloadAction<State>) => {
      state.files = action.payload.knownFiles;
      state.lastRun = action.payload.lastRun;
    },
    setAnalyzingSingleFile: (state, action: PayloadAction<string | null>) => {
      state.isAnalyzingSingle = !!action.payload;
      state.analyzingSingleFile = action.payload;
    },
    setRenameProgress: (state, action: PayloadAction<{
      total: number;
      processed: number;
      failed: number;
      currentFile: string | null;
    }>) => {
      state.renameProgress = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch files
      .addCase(fetchFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFiles.fulfilled, (state, action) => {
        state.loading = false;
        const { files, isIncremental } = action.payload;
        
        // Store current record ID before updating files
        const currentRecordId = state.currentRecord?.id;
        
        if (isIncremental) {
          // Merge changes: update existing files or add new ones
          const filesMap = new Map(state.files.map(f => [f.id, f]));
          files.forEach((file) => {
            filesMap.set(file.id, file);
          });
          state.files = Array.from(filesMap.values());
        } else {
          // Initial load: replace entire list
          state.files = files;
        }
        
        // Update currentRecord if it still exists in the files list
        // Preserve analysis data if currentRecord has it and the updated record doesn't
        // This ensures we show the latest analysis results during analyzeAll operations
        if (currentRecordId) {
          const updatedRecord = state.files.find(f => f.id === currentRecordId);
          if (updatedRecord) {
            // Prefer the version with analysis data, or the one with newer lastModified
            const currentHasData = state.currentRecord?.data && state.currentRecord.status === 'analyzed';
            const updatedHasData = updatedRecord.data && updatedRecord.status === 'analyzed';
            
            if (currentHasData && !updatedHasData && state.currentRecord) {
              // Current record has analysis data but updated doesn't - preserve it
              state.currentRecord = {
                ...updatedRecord,
                data: state.currentRecord.data,
                documentType: state.currentRecord.documentType,
                status: state.currentRecord.status,
              };
            } else if (updatedHasData && !currentHasData) {
              // Updated record has analysis data but current doesn't - use updated
              state.currentRecord = updatedRecord;
            } else if (currentHasData && updatedHasData) {
              // Both have data - prefer the one with newer lastModified, or keep current if equal
              const currentModified = state.currentRecord?.lastModified || state.currentRecord?.timestamp || '';
              const updatedModified = updatedRecord.lastModified || updatedRecord.timestamp || '';
              if (updatedModified > currentModified) {
                state.currentRecord = updatedRecord;
              }
              // Otherwise keep currentRecord as is (it's already set)
            } else {
              // Neither has data, or both are in same state - use updated record
              state.currentRecord = updatedRecord;
            }
          }
        }
        
        // Update last fetch time
        state.lastFetchTime = new Date().toISOString();
      })
      .addCase(fetchFiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch files';
      })
      // Scan files
      .addCase(scanFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(scanFiles.fulfilled, (state, action) => {
        state.loading = false;
        // Files will be updated by the fetchFiles call
      })
      .addCase(scanFiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Scan failed';
      })
      // Rename file
      .addCase(renameFile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(renameFile.fulfilled, (state, action) => {
        state.loading = false;
        // Update file immediately if returned in response
        if (action.payload?.file) {
          updateFileInState(state, action.payload.file);
        }
      })
      .addCase(renameFile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Rename failed';
      })
      // Cleanup files
      .addCase(cleanupFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cleanupFiles.fulfilled, (state) => {
        state.loading = false;
        // Files will be updated by the fetchFiles call
      })
      .addCase(cleanupFiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Cleanup failed';
      })
      // Analyze file
      .addCase(analyzeFile.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.isAnalyzingSingle = true;
      })
      .addCase(analyzeFile.fulfilled, (state, action) => {
        state.loading = false;
        state.isAnalyzingSingle = false;
        state.analyzingSingleFile = null;
        
        // Update the file in state immediately with the result
        if (action.payload?.data) {
          updateFileInState(state, action.payload.data);
          // Always set the analyzed file as the current record to show it in the preview
          state.currentRecord = action.payload.data;
        }
      })
      .addCase(analyzeFile.rejected, (state, action) => {
        state.loading = false;
        state.isAnalyzingSingle = false;
        state.analyzingSingleFile = null;
        state.error = action.error.message || 'Analysis failed';
      })
      // Update file data
      .addCase(updateFileData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateFileData.fulfilled, (state, action) => {
        state.loading = false;
        // Update file immediately if returned in response (PUT /api/records returns the file)
        if (action.payload) {
          updateFileInState(state, action.payload);
        }
      })
      .addCase(updateFileData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Update failed';
      })
      // Clear state
      .addCase(clearState.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(clearState.fulfilled, (state) => {
        state.loading = false;
        state.files = [];
        state.currentRecord = null;
      })
      .addCase(clearState.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Clear state failed';
      })
      // Clean not analyzed
      .addCase(cleanNotAnalyzed.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cleanNotAnalyzed.fulfilled, (state) => {
        state.loading = false;
        // Files will be updated by the fetchFiles call
      })
      .addCase(cleanNotAnalyzed.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Clean not analyzed failed';
      })
      // Reset bad files
      .addCase(resetBadFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(resetBadFiles.fulfilled, (state) => {
        state.loading = false;
        // Files will be updated by the fetchFiles call
      })
      .addCase(resetBadFiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Reset bad files failed';
      })
      // Remove renamed files
      .addCase(removeRenamedFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(removeRenamedFiles.fulfilled, (state) => {
        state.loading = false;
        // Files will be updated by the fetchFiles call
      })
      .addCase(removeRenamedFiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Remove renamed files failed';
      })
      // Analyze all
      .addCase(analyzeAll.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.isAnalyzingAll = true;
        state.shouldStopAnalysis = false;
        state.analysisProgress = { total: 0, processed: 0, failed: 0, currentFile: null };
      })
      .addCase(analyzeAll.fulfilled, (state) => {
        state.loading = false;
        state.isAnalyzingAll = false;
        state.shouldStopAnalysis = false;
        state.analysisProgress = { total: 0, processed: 0, failed: 0, currentFile: null };
      })
      .addCase(analyzeAll.rejected, (state, action) => {
        state.loading = false;
        state.isAnalyzingAll = false;
        state.shouldStopAnalysis = false;
        state.analysisProgress = { total: 0, processed: 0, failed: 0, currentFile: null };
        state.error = action.error.message || 'Analyze all failed';
      })
      // Stop analysis
      .addCase(stopAnalysis.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.shouldStopAnalysis = true;
      })
      .addCase(stopAnalysis.fulfilled, (state) => {
        state.shouldStopAnalysis = true;
      })
      .addCase(stopAnalysis.rejected, (state, action) => {
        state.loading = false;
        state.shouldStopAnalysis = false;
        state.error = action.error.message || 'Stop analysis failed';
      })
      // Rename all
      .addCase(renameAll.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.isRenamingAll = true;
        state.renameProgress = { total: 0, processed: 0, failed: 0, currentFile: null };
      })
      .addCase(renameAll.fulfilled, (state, action) => {
        state.loading = false;
        state.isRenamingAll = false;
        state.renameProgress = { total: 0, processed: 0, failed: 0, currentFile: null };
        
        // Update files immediately from batch results
        if (action.payload?.results) {
          for (const result of action.payload.results) {
            if (result.success && result.file) {
              updateFileInState(state, result.file);
            }
          }
        }
      })
      .addCase(renameAll.rejected, (state, action) => {
        state.loading = false;
        state.isRenamingAll = false;
        state.renameProgress = { total: 0, processed: 0, failed: 0, currentFile: null };
        state.error = action.error.message || 'Rename all failed';
      })
      // Merge files
      .addCase(mergeFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(mergeFiles.fulfilled, (state, action) => {
        state.loading = false;
        // Remove deleted files and add merged file immediately
        if (action.payload?.deletedFileIds) {
          removeFilesFromState(state, action.payload.deletedFileIds);
        }
        if (action.payload?.mergedFile) {
          // Add the merged file to state
          state.files.push(action.payload.mergedFile);
        }
      })
      .addCase(mergeFiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Merge files failed';
      });
  },
});

export const { 
  setCurrentRecord, 
  updateFile, 
  clearError, 
  setLastRun, 
  initializeFromState,
  setAnalysisProgress,
  setShouldStopAnalysis,
  setAnalyzingSingleFile,
  setRenameProgress
} = filesSlice.actions;

export default filesSlice.reducer; 