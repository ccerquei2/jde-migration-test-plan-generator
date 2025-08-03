
import React, { useRef } from 'react';
import { FileIcon, UploadIcon, XCircleIcon } from './Icons';

interface MultiFileUploaderProps {
  title: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
}

export const MultiFileUploader: React.FC<MultiFileUploaderProps> = ({ title, files, onFilesChange, accept, disabled = false }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const selectedFiles = event.target.files ? Array.from(event.target.files) : [];
    // Prevent duplicates
    const newFiles = selectedFiles.filter(sf => !files.some(f => f.name === sf.name && f.size === sf.size));
    onFilesChange([...files, ...newFiles]);
    if (inputRef.current) {
        inputRef.current.value = ""; // Reset for next selection
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    event.preventDefault();
  };
  
  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    event.preventDefault();
    const droppedFiles = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    const newFiles = droppedFiles.filter(df => !files.some(f => f.name === df.name && f.size === df.size));
    onFilesChange([...files, ...newFiles]);
  };

  const removeFile = (indexToRemove: number) => {
    if (disabled) return;
    onFilesChange(files.filter((_, index) => index !== indexToRemove));
  }

  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <h3 className="font-semibold text-slate-600 mb-2">{title}</h3>
      {files.length > 0 && (
        <div className="space-y-2 mb-2">
            {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center justify-between p-3 bg-slate-100 border border-slate-300 rounded-lg">
                <div className="flex items-center gap-2 overflow-hidden">
                <FileIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-700 font-medium truncate" title={file.name}>{file.name}</span>
                </div>
                <button onClick={() => removeFile(index)} className="p-1 text-slate-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 rounded-full"  disabled={disabled}>
                <XCircleIcon className="w-5 h-5" />
                </button>
            </div>
            ))}
        </div>
      )}
      
      <label
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center w-full min-h-32 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-lg appearance-none ${disabled ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:border-blue-500 focus:outline-none'}`}>
        <UploadIcon className="w-8 h-8 text-slate-400" />
        <span className="flex items-center space-x-2">
          <span className="font-medium text-slate-600 text-center">
            Arraste arquivos ou <span className="text-blue-600 underline">procure</span>
          </span>
        </span>
         <span className="text-xs text-slate-500 mt-1">Suporta .docx, .txt, .md, .pdf</span>
        <input
          ref={inputRef}
          type="file"
          name="file_upload"
          className="hidden"
          accept={accept}
          onChange={handleFileSelect}
          multiple
          disabled={disabled}
        />
      </label>
    </div>
  );
};