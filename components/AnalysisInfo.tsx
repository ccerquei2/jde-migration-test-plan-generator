
import React from 'react';
import { LightBulbIcon } from './Icons';

interface AnalysisInfoProps {
  isLoading: boolean;
  progress: string;
}

export const AnalysisInfo: React.FC<AnalysisInfoProps> = ({ isLoading, progress }) => {
    if (isLoading) {
        return (
            <div className="text-center py-10">
                <div className="animate-pulse flex flex-col items-center gap-4">
                    <svg className="w-12 h-12 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                    </svg>
                    <p className="text-lg font-semibold text-slate-600">
                      {progress || 'Gerando seu plano de testes...'}
                    </p>
                    <p className="text-sm text-slate-500">O Gemini está analisando as diferenças de código. Isso pode levar alguns minutos para arquivos grandes.</p>
                </div>
            </div>
        )
    }
  return (
    <div className="space-y-6 p-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="text-2xl font-semibold text-slate-700 flex items-center gap-2">
                <LightBulbIcon className="w-6 h-6 text-blue-600" />
                Como Funciona
            </h2>
            <p className="mt-2 text-slate-600">
                Esta ferramenta otimiza os testes de migração. Carregue seus arquivos de código-fonte (padrão e customizado).
                Ao usar a **Análise Detalhada**, a ferramenta divide o código em funções, analisa cada mudança individualmente e depois sintetiza os resultados em um relatório completo.
                Isso ajuda a focar seus esforços de QA no que é mais importante, com maior profundidade e precisão.
            </p>
        </div>
    </div>
  );
};
