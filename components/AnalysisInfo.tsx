
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
                    <p className="text-sm text-slate-500">O Gemini está analisando os arquivos. Isso pode levar alguns minutos para documentos ou códigos grandes.</p>
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
                Esta ferramenta acelera a criação de planos de teste. Você pode:
            </p>
            <ul className="list-disc list-inside mt-2 text-slate-600 space-y-2 pl-2">
                <li><strong>Analisar Código-Fonte:</strong> Carregue o código JDE customizado (e o padrão, opcionalmente) para gerar testes baseados nas modificações técnicas. A "Análise Detalhada" quebra o código em funções para um resultado mais preciso.</li>
                <li><strong>Analisar Documentos:</strong> Carregue um ou mais documentos de especificação funcional. A IA irá interpretar os requisitos de negócio e criar um plano de teste focado no usuário final, em linguagem não técnica.</li>
            </ul>
            <p className="mt-4 text-slate-600">
                O resultado é um documento de teste profissional, pronto para ser usado por sua equipe de QA, economizando tempo e focando nos pontos mais importantes.
            </p>
        </div>
    </div>
  );
};
