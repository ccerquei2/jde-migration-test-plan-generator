
import React, { useState, useCallback, useEffect } from 'react';
import { FileUploader } from './components/FileUploader';
import { ReportDisplay } from './components/ReportDisplay';
import { AnalysisInfo } from './components/AnalysisInfo';
import { generateTestPlan, FunctionalSpec } from './services/geminiService';
import { PROVIDER_MODELS, unlockTopModel, RESTRICTED_MODELS } from './lib/llmClient';
import { GeminiIcon, SparklesIcon } from './components/Icons';
import { MultiFileUploader } from './components/MultiFileUploader';
import mammoth from 'mammoth';

const ToggleSwitch: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void; }> = ({ enabled, onChange }) => {
  return (
    <div className="flex items-center justify-between mt-6">
      <label htmlFor="metrics-toggle" className="flex flex-col cursor-pointer" onClick={() => onChange(!enabled)}>
        <span className="font-semibold text-slate-700">Análise Detalhada de Código</span>
        <span className="text-sm text-slate-500">Gera um relatório mais profundo usando uma análise em múltiplas etapas.</span>
      </label>
      <button
        id="metrics-toggle"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
          enabled ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};


const App: React.FC = () => {
  const [vanillaFile, setVanillaFile] = useState<File | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [functionalSpecFiles, setFunctionalSpecFiles] = useState<File[]>([]);

  const [vanillaFileContent, setVanillaFileContent] = useState<string>('');
  const [customFileContent, setCustomFileContent] = useState<string>('');
  const [processedSpecs, setProcessedSpecs] = useState<FunctionalSpec[]>([]);
  
  const [programName, setProgramName] = useState<string>('');
  
  const [report, setReport] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [progress, setProgress] = useState<string>('');
  const [includeEnhancedAnalysis, setIncludeEnhancedAnalysis] = useState<boolean>(true);
  const [manufacturingBranch, setManufacturingBranch] = useState<string>('0015');
  const [distributionBranch, setDistributionBranch] = useState<string>('0030');
  const envProvider = process.env.LLM_PROVIDER;
  const initialProviderRaw = envProvider && envProvider !== 'undefined' ? envProvider.toLowerCase() : 'openai';
  const initialProvider = PROVIDER_MODELS[initialProviderRaw] ? initialProviderRaw : 'openai';
  const [module, setModule] = useState<string>('Manufatura');
  const [llmProvider, setLlmProvider] = useState<string>(initialProvider);
  const [llmModel, setLlmModel] = useState<string>(PROVIDER_MODELS[initialProvider][0]);
  const [premiumUnlocked, setPremiumUnlocked] = useState<boolean>(false);

  const isSpecAnalysis = functionalSpecFiles.length > 0;
  const isCodeAnalysis = customFile !== null;
  const analysisChosen = isSpecAnalysis || isCodeAnalysis;

  useEffect(() => {
    const modelList = PROVIDER_MODELS[llmProvider] || PROVIDER_MODELS.openai;
    setLlmModel(modelList[0]);
  }, [llmProvider]);

  useEffect(() => {
    const fileForName = vanillaFile || customFile;
    if (fileForName) {
        const name = fileForName.name.split('.').slice(0, -1).join('.') || fileForName.name;
        setProgramName(name.toUpperCase());
    } else {
        setProgramName('');
    }
  }, [vanillaFile, customFile]);

  useEffect(() => {
    if (process.env.TOP_MODEL_PWD) {
      try {
        unlockTopModel(process.env.TOP_MODEL_PWD);
        setPremiumUnlocked(true);
      } catch {
        /* ignore invalid pwd */
      }
    }
  }, []);

  const readTextFileContent = (file: File, setter: (content: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => setter(e.target?.result as string);
    reader.readAsText(file);
  }

  const handleVanillaFileChange = (file: File | null) => {
    setVanillaFile(file);
    if (file) {
      setFunctionalSpecFiles([]);
      setProcessedSpecs([]);
      readTextFileContent(file, setVanillaFileContent);
    } else {
      setVanillaFileContent('');
    }
  };

  const handleCustomFileChange = (file: File | null) => {
    setCustomFile(file);
    if (file) {
      setFunctionalSpecFiles([]);
      setProcessedSpecs([]);
      readTextFileContent(file, setCustomFileContent);
    } else {
      setCustomFileContent('');
    }
  };

  const handleModelChange = (model: string) => {
    if (RESTRICTED_MODELS.includes(model as any) && !premiumUnlocked) {
      const pwd = window.prompt('Digite a senha do dia (ddmmaa) para usar modelos premium:');
      if (!pwd) return;
      try {
        unlockTopModel(pwd);
        setPremiumUnlocked(true);
      } catch {
        window.alert('Senha incorreta.');
        return;
      }
    }
    setLlmModel(model);
  };
  
  const handleFunctionalSpecFilesChange = (files: File[]) => {
      setFunctionalSpecFiles(files);
      if (files.length > 0) {
          setVanillaFile(null);
          setCustomFile(null);
          setVanillaFileContent('');
          setCustomFileContent('');
          
          setProgress('Processando documentos...');
          const allPromises = files.map(file => processSpecFile(file));

          Promise.all(allPromises)
              .then(results => {
                  setProcessedSpecs(results);
                  setProgress('');
              })
              .catch(err => {
                  console.error("Error processing spec files:", err);
                  setError("Erro ao processar um ou mais arquivos de especificação. Apenas .docx, .txt e .md são suportados.");
                  setProgress('');
              });
      } else {
          setProcessedSpecs([]);
      }
  };

  const processSpecFile = (file: File): Promise<FunctionalSpec> => {
      return new Promise(async (resolve, reject) => {
          const reader = new FileReader();
          
          if (file.name.endsWith('.docx')) {
              reader.onload = async (e) => {
                  try {
                      const arrayBuffer = e.target?.result as ArrayBuffer;
                      const result = await mammoth.convertToHtml({ arrayBuffer });
                      const images: { mimeType: string, data: string }[] = [];
                      // Mammoth does not directly give base64 images, this is a limitation
                      // In a real app we would need a more powerful parser or backend processing.
                      // For now, we pass the HTML content.
                      resolve({ fileName: file.name, htmlContent: result.value, images: [] });
                  } catch (err) {
                      reject(err);
                  }
              };
              reader.readAsArrayBuffer(file);
          } else { // txt, md
              reader.onload = (e) => {
                  const textContent = e.target?.result as string;
                  // Convert markdown to basic HTML for consistency
                  const htmlContent = textContent.replace(/\n/g, '<br/>');
                  resolve({ fileName: file.name, htmlContent, images: [] });
              };
              reader.readAsText(file);
          }
          reader.onerror = (e) => reject(e);
      });
  }

  const handleAnalyze = useCallback(async () => {
    if (!analysisChosen) {
      setError('Por favor, carregue o código-fonte customizado ou pelo menos um documento de especificação funcional.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setReport('');
    setProgress('');

    try {
      const result = await generateTestPlan(
          vanillaFileContent, 
          customFileContent,
          processedSpecs,
          programName, 
          includeEnhancedAnalysis, 
          manufacturingBranch, 
          distributionBranch,
          module,
          llmProvider,
          llmModel,
          setProgress
      );
      setReport(result);
    } catch (err) {
      console.error('Error generating test plan:', err);
      setError(`Falha ao gerar o plano de testes. ${err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.'}`);
    } finally {
      setIsLoading(false);
      setProgress('');
    }
  }, [analysisChosen, vanillaFileContent, customFileContent, processedSpecs, programName, includeEnhancedAnalysis, manufacturingBranch, distributionBranch, module, llmProvider, llmModel]);

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <main className="container mx-auto px-4 py-8">
        <header className="text-center mb-10">
          <div className="flex items-center justify-center gap-4">
            <img
              src="data:image/jpeg;base64,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"
              alt="Logo"
              className="w-12 h-12"
            />
            <h1 className="text-4xl font-bold text-slate-800">Gerador de Plano de Testes</h1>
          </div>
          <p className="text-lg text-slate-600 mt-2">
            Geração de Planos de Testes através de Especificações Funcionais ou do Código-Fonte
          </p>
          <p className="text-sm text-slate-500 mt-1">Casa Granado Phebo - Tecnologia da Informação</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md border border-slate-200 space-y-6">
            <h2 className="text-2xl font-semibold text-slate-700 flex items-center gap-2">
              <SparklesIcon className="w-6 h-6 text-indigo-500" />
              Configuração da Análise
            </h2>
            
            <div className="space-y-4 p-4 border border-slate-200 rounded-lg">
                <h3 className="font-semibold text-slate-700 -mb-2">Análise por Código-Fonte</h3>
                <FileUploader
                    title="1. Carregar Fonte Padrão (Opcional)"
                    file={vanillaFile}
                    onFileChange={handleVanillaFileChange}
                    accept=".txt,.c,.h,.er"
                    disabled={isSpecAnalysis}
                />
                <FileUploader
                    title="2. Carregar Fonte Customizado"
                    file={customFile}
                    onFileChange={handleCustomFileChange}
                    accept=".txt,.c,.h,.er"
                    disabled={isSpecAnalysis}
                />
            </div>

            <div className="relative flex items-center">
                <div className="flex-grow border-t border-slate-300"></div>
                <span className="flex-shrink mx-4 text-slate-500 font-semibold">OU</span>
                <div className="flex-grow border-t border-slate-300"></div>
            </div>

            <div className="space-y-4 p-4 border border-slate-200 rounded-lg">
                 <h3 className="font-semibold text-slate-700 -mb-2">Análise por Especificação Funcional</h3>
                <MultiFileUploader
                    title="Carregar Definição(ões) Funcional(is)"
                    files={functionalSpecFiles}
                    onFilesChange={handleFunctionalSpecFilesChange}
                    accept=".txt,.md,.docx"
                    disabled={isCodeAnalysis}
                />
            </div>
            
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                 <h3 className="font-semibold text-slate-700 -mb-2">Contexto da Empresa (Opcional)</h3>
                <div className="space-y-2">
                    <label htmlFor="module-select" className="font-semibold text-slate-600 text-sm">Módulo Principal</label>
                    <select
                        id="module-select"
                        value={module}
                        onChange={(e) => setModule(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
                    >
                        <option value="Manufatura">Manufatura</option>
                        <option value="Distribuição">Distribuição</option>
                        <option value="Financeiro">Financeiro</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label htmlFor="provider-select" className="font-semibold text-slate-600 text-sm">Provedor de IA</label>
                    <select
                        id="provider-select"
                        value={llmProvider}
                        onChange={(e) => setLlmProvider(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
                    >
                        <option value="openai">OpenAI</option>
                        <option value="groq">Groq</option>
                        <option value="gemini">Gemini</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label htmlFor="model-select" className="font-semibold text-slate-600 text-sm">Modelo</label>
                    <select
                        id="model-select"
                        value={llmModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
                    >
                        {(PROVIDER_MODELS[llmProvider] || PROVIDER_MODELS.openai).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>
                 <div className="space-y-2">
                    <label htmlFor="fabril-branch" className="font-semibold text-slate-600 text-sm">Filial Fabril Principal</label>
                    <input
                        id="fabril-branch"
                        type="text"
                        value={manufacturingBranch}
                        onChange={(e) => setManufacturingBranch(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        placeholder="Ex: 0015"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="dist-branch" className="font-semibold text-slate-600 text-sm">Filial de Distribuição Principal</label>
                    <input
                        id="dist-branch"
                        type="text"
                        value={distributionBranch}
                        onChange={(e) => setDistributionBranch(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        placeholder="Ex: 0030"
                    />
                </div>
            </div>
            
            {!isSpecAnalysis && (
              <ToggleSwitch enabled={includeEnhancedAnalysis} onChange={setIncludeEnhancedAnalysis} />
            )}

            <button
              onClick={handleAnalyze}
              disabled={isLoading || !analysisChosen}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {progress || 'Analisando...'}
                </>
              ) : (
                'Gerar Documento de Teste'
              )}
            </button>
            {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
          </div>

          <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-md border border-slate-200">
            {report ? (
              <ReportDisplay report={report} />
            ) : (
              <AnalysisInfo isLoading={isLoading} progress={progress} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;