'use client';

import React, { useMemo, useState } from 'react';
import { FileInfo } from '@/types';
import RecordCard from './RecordCard';

interface RecordListProps {
  records: FileInfo[];
  searchText: string;
  statusFilter: 'all' | 'new' | 'analyzed' | 'bad';
  onRecordSelect: (record: FileInfo) => void;
  onRecordUpdate: (record: FileInfo) => void;
  currentRecord: FileInfo | null;
  isMergeMode: boolean;
  selectedFileIds: Set<string>;
  onFileSelectionChange: (fileId: string, isSelected: boolean) => void;
}

const ITEMS_PER_PAGE = 50;

const RecordList: React.FC<RecordListProps> = ({ 
  records, 
  searchText,
  statusFilter,
  onRecordSelect, 
  onRecordUpdate, 
  currentRecord,
  isMergeMode,
  selectedFileIds,
  onFileSelectionChange
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const getEmptyStateMessage = (): string => {
    if (records.length === 0) {
      return 'No files found.';
    }
    return 'No files found.';
  };

  // Apply filters and sorting - memoized to avoid re-computation
  const filteredAndSortedRecords = useMemo(() => {
    let filtered = [...records];

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

    // Sort by basename, then extension
    return filtered.sort((a, b) => {
      const aBasename = a.currentPath.split('/').pop()?.split('.').shift() || '';
      const bBasename = b.currentPath.split('/').pop()?.split('.').shift() || '';
      const aExtension = a.currentPath.split('/').pop()?.split('.').pop() || '';
      const bExtension = b.currentPath.split('/').pop()?.split('.').pop() || '';
      return aBasename.localeCompare(bBasename) || aExtension.localeCompare(bExtension);
    });
  }, [records, searchText, statusFilter]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchText, statusFilter]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredAndSortedRecords.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRecords = filteredAndSortedRecords.slice(startIndex, endIndex);

  // Reset to page 1 if current page is out of bounds
  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
  };

  return (
    <div id="records-container">
      {records.length === 0 ? (
        <p>{getEmptyStateMessage()}</p>
      ) : (
        <>
          {/* Pagination Info */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              Showing {startIndex + 1} - {Math.min(endIndex, filteredAndSortedRecords.length)} of {filteredAndSortedRecords.length} files
              {filteredAndSortedRecords.length !== records.length && (
                <span className="text-muted ms-2">
                  (filtered from {records.length} total)
                </span>
              )}
              {isMergeMode && selectedFileIds.size > 0 && (
                <span className="text-primary ms-2">
                  ({selectedFileIds.size} selected)
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="d-flex gap-2 align-items-center">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Records List */}
          {paginatedRecords.map(record => (
            <RecordCard
              key={record.id}
              record={record}
              isSelected={currentRecord?.id === record.id}
              onSelect={onRecordSelect}
              onUpdate={onRecordUpdate}
              isMergeMode={isMergeMode}
              isSelectedForMerge={selectedFileIds.has(record.id)}
              onMergeSelectionChange={onFileSelectionChange}
            />
          ))}

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="d-flex justify-content-center mt-3">
              <div className="d-flex gap-2 align-items-center">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                >
                  First
                </button>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RecordList; 