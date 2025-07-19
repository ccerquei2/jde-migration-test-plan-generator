
import React, { useState } from 'react';
import { ClipboardCheckIcon, ClipboardIcon, DocumentTextIcon, DownloadIcon } from './Icons';

interface ReportDisplayProps {
  report: string;
}

export const ReportDisplay: React.FC<ReportDisplayProps> = ({ report }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(report).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
        console.error('Falha ao copiar o HTML.', err);
    });
  };

  const handleDownload = () => {
    // The 'report' variable now contains a full, self-contained HTML document with all necessary styles.
    const sourceHTML = report;
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = 'plano-de-teste.doc';
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-slate-700 flex items-center gap-2">
          <DocumentTextIcon className="w-6 h-6 text-green-600" />
          Documento de Teste Gerado
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-md transition-colors"
          >
            {copied ? <ClipboardCheckIcon className="w-5 h-5 text-green-600" /> : <ClipboardIcon className="w-5 h-5" />}
            {copied ? 'Copiado!' : 'Copiar HTML'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-md transition-colors"
          >
            <DownloadIcon className="w-5 h-5" />
            Baixar como Word
          </button>
        </div>
      </div>
      <div 
        className="bg-white p-8 rounded-md border border-slate-300 shadow-lg max-h-[75vh] overflow-y-auto"
        id="report-content"
      >
        <div dangerouslySetInnerHTML={{ __html: report }} />
      </div>
    </div>
  );
};
