'use client';

import React from 'react';
import { FileInfo } from '@/types';
import RecordCard from './RecordCard';

interface RecordListProps {
  records: FileInfo[];
  onRecordSelect: (record: FileInfo) => void;
  onRecordUpdate: (record: FileInfo) => void;
  currentRecord: FileInfo | null;
}

const RecordList: React.FC<RecordListProps> = ({ 
  records, 
  onRecordSelect, 
  onRecordUpdate, 
  currentRecord 
}) => {
  const getEmptyStateMessage = (): string => {
    if (records.length === 0) {
      return 'No files found.';
    }
    return 'No files found.';
  };

  return (
    <div id="records-container">
      {records.length === 0 ? (
        <p>{getEmptyStateMessage()}</p>
      ) : (
        records.map(record => (
          <RecordCard
            key={record.id}
            record={record}
            isSelected={currentRecord?.id === record.id}
            onSelect={onRecordSelect}
            onUpdate={onRecordUpdate}
          />
        ))
      )}
    </div>
  );
};

export default RecordList; 