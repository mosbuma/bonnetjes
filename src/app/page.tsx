'use client';

import React, { useEffect } from 'react';
import Header from '@/components/Header';
import RecordList from '@/components/RecordList';
import FileViewer from '@/components/FileViewer';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchFiles, scanFiles } from '@/store/slices/filesSlice';

export default function Home() {
  const dispatch = useAppDispatch();
  const { files, loading, error, currentRecord } = useAppSelector((state) => state.files);

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
              <Header onScan={handleScan} />
              {loading && (
                <div className="text-center mb-3">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              )}
              <div className="row">
                <div className="col-md-6">
                  <RecordList 
                    records={files}
                    onRecordSelect={(record) => dispatch({ type: 'files/setCurrentRecord', payload: record })}
                    onRecordUpdate={(record) => dispatch({ type: 'files/updateFile', payload: record })}
                    currentRecord={currentRecord}
                  />
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
