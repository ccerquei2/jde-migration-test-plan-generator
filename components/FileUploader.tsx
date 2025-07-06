
import React, { useRef } from 'react';
import { FileIcon, UploadIcon, XCircleIcon } from './Icons';

interface FileUploaderProps {
  title: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ title, file, onFileChange, accept }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    onFileChange(selectedFile);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };
  
  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0] || null;
    onFileChange(droppedFile);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onFileChange(null);
    if(inputRef.current) {
        inputRef.current.value = "";
    }
  }

  return (
    <div>
      <h3 className="font-semibold text-slate-600 mb-2">{title}</h3>
      {file ? (
        <div className="flex items-center justify-between p-3 bg-slate-100 border border-slate-300 rounded-lg">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-700 font-medium truncate" title={file.name}>{file.name}</span>
          </div>
          <button onClick={clearFile} className="p-1 text-slate-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 rounded-full">
            <XCircleIcon className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <label
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-lg appearance-none cursor-pointer hover:border-blue-500 focus:outline-none">
          <UploadIcon className="w-8 h-8 text-slate-400" />
          <span className="flex items-center space-x-2">
            <span className="font-medium text-slate-600">
              Arraste o arquivo ou <span className="text-blue-600 underline">procure</span>
            </span>
          </span>
          <input
            ref={inputRef}
            type="file"
            name="file_upload"
            className="hidden"
            accept={accept}
            onChange={handleFileSelect}
          />
        </label>
      )}
    </div>
  );
};