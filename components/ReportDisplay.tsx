
import React, { useState } from 'react';
import { ClipboardCheckIcon, ClipboardIcon, DocumentTextIcon, DownloadIcon } from './Icons';

interface ReportDisplayProps {
  report: string;
}

export const ReportDisplay: React.FC<ReportDisplayProps> = ({ report }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const blob = new Blob([report], { type: 'text/html' });
      const data = [new ClipboardItem({ [blob.type]: blob })];
      await navigator.clipboard.write(data);
    } catch (err) {
      console.error('Falha ao copiar HTML, tentando como texto plano.', err);
      // Fallback para texto plano se a cópia de HTML falhar
      navigator.clipboard.writeText(report);
    } finally {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>Plano de Teste JDE</title>
            <!--[if gte mso 9]>
            <xml>
                <w:WordDocument>
                    <w:View>Print</w:View>
                    <w:Zoom>90</w:Zoom>
                    <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
                <w:LatentStyles DefLockedState="false" DefUnhideWhenUsed="true"
                    DefSemiHidden="true" DefQFormat="false" DefPriority="99"
                    LatentStyleCount="267">
                </w:LatentStyles>
            </xml>
            <![endif]-->
            <style>
                @page {
                    size: 11in 8.5in;
                    mso-page-orientation: landscape;
                    margin: 1in;
                }
            </style>
        </head>
        <body>`;

    const footer = "</body></html>";
    const sourceHTML = header + report + footer;

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = 'plano-de-teste-jde.doc';
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
            {copied ? 'Copiado!' : 'Copiar'}
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
