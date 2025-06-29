import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { FileInfo, State } from '@/types';
import { generateFileName } from '@/lib/generic-tools';

interface FilesState {
  files: FileInfo[];
  currentRecord: FileInfo | null;
  loading: boolean;
  error: string | null;
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
  async () => {
    const response = await fetch('/api/records');
    if (!response.ok) {
      throw new Error('Failed to fetch files');
    }
    return response.json();
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
    
    // After successful rename, fetch updated files
    dispatch(fetchFiles());
    return response.json();
  }
);

export const cleanupFiles = createAsyncThunk(
  'files/cleanupFiles',
  async () => {
    const response = await fetch('/api/cleanup-nonexistent-files', {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Cleanup failed');
    }
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
    
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, forceReanalyze }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Analysis failed');
    }
    
    // After successful analysis, fetch updated files
    dispatch(fetchFiles());
    return response.json();
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
    
    // After successful update, fetch updated files
    dispatch(fetchFiles());
    return response.json();
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
    
    // After merging, fetch updated files
    dispatch(fetchFiles());
    return response.json();
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
        
        // Analyze individual file
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: file.id }),
        });
        
        if (response.ok) {
          processedCount++;
          // Refresh state after each successful analysis to show real-time progress
          dispatch(fetchFiles());
        } else {
          failedCount++;
          console.warn(`Failed to analyze file ${file.currentPath}:`, await response.text());
          // Also refresh state after failed analysis to show updated status
          dispatch(fetchFiles());
        }
        
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failedCount++;
        console.error(`Error analyzing file ${file.currentPath}:`, error);
        // Refresh state after error to show updated status
        dispatch(fetchFiles());
      }
    }
    
    // Final progress update
    dispatch(setAnalysisProgress({
      total: filesToAnalyze.length,
      processed: processedCount,
      failed: failedCount,
      currentFile: null
    }));
    
    // Final fetch to ensure we have the latest state
    dispatch(fetchFiles());
    
    return {
      total: filesToAnalyze.length,
      processed: processedCount,
      failed: failedCount
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
    
    let processedCount = 0;
    let failedCount = 0;
    
    for (const file of filesToRename) {
      // Check if we should stop
      const currentState = getState() as { files: FilesState };
      if (currentState.files.shouldStopAnalysis) {
        break;
      }
      
      try {
        // Update progress
        dispatch(setRenameProgress({
          total: filesToRename.length,
          processed: processedCount,
          failed: failedCount,
          currentFile: file.currentPath.split('/').pop() || file.id
        }));
        
        // Rename individual file
        const response = await fetch('/api/rename-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: file.id }),
        });
        
        if (response.ok) {
          processedCount++;
          // Refresh state after each successful rename to show real-time progress
          dispatch(fetchFiles());
        } else {
          failedCount++;
          console.warn(`Failed to rename file ${file.currentPath}:`, await response.text());
          // Also refresh state after failed rename to show updated status
          dispatch(fetchFiles());
        }
        
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failedCount++;
        console.error(`Error renaming file ${file.currentPath}:`, error);
        // Refresh state after error to show updated status
        dispatch(fetchFiles());
      }
    }
    
    // Final progress update
    dispatch(setRenameProgress({
      total: filesToRename.length,
      processed: processedCount,
      failed: failedCount,
      currentFile: null
    }));
    
    // Final fetch to ensure we have the latest state
    dispatch(fetchFiles());
    
    return {
      total: filesToRename.length,
      processed: processedCount,
      failed: failedCount
    };
  }
);

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
        state.files = action.payload;
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
        // Files will be updated by the fetchFiles call
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
        // Files will be updated by the fetchFiles call
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
        // Files will be updated by the fetchFiles call
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
        state.analysisProgress = { current: 0, total: 0, currentFile: '' };
      })
      .addCase(analyzeAll.fulfilled, (state) => {
        state.loading = false;
        state.isAnalyzingAll = false;
        state.shouldStopAnalysis = false;
        state.analysisProgress = { current: 0, total: 0, currentFile: '' };
      })
      .addCase(analyzeAll.rejected, (state, action) => {
        state.loading = false;
        state.isAnalyzingAll = false;
        state.shouldStopAnalysis = false;
        state.analysisProgress = { current: 0, total: 0, currentFile: '' };
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
        state.renameProgress = { current: 0, total: 0, currentFile: '' };
      })
      .addCase(renameAll.fulfilled, (state) => {
        state.loading = false;
        state.isRenamingAll = false;
        state.renameProgress = { current: 0, total: 0, currentFile: '' };
      })
      .addCase(renameAll.rejected, (state, action) => {
        state.loading = false;
        state.isRenamingAll = false;
        state.renameProgress = { current: 0, total: 0, currentFile: '' };
        state.error = action.error.message || 'Rename all failed';
      })
      // Merge files
      .addCase(mergeFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(mergeFiles.fulfilled, (state) => {
        state.loading = false;
        // Files will be updated by the fetchFiles call
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