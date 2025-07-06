
import { GoogleGenAI } from "@google/genai";
import diff_match_patch from 'diff-match-patch';

const systemInstructionAntiHallucination = "Sua resposta deve se basear estritamente nas informações fornecidas no prompt. Não invente informações, nomes de programas ou dados não presentes no contexto fornecido.";
const systemInstructionForJsonFix = "Você é um especialista em corrigir JSON. Dado um texto, retorne APENAS o objeto JSON válido contido nele. Não inclua texto explicativo ou cercas de markdown.";

// --- Funções de Análise de Código ---

function parseFunctions(code: string): Map<string, string> {
    const functions = new Map<string, string>();
    const functionRegex = /^(?:[a-zA-Z_][\w\s\*<>,]+?)\s+([a-zA-Z_]\w*)\s*\((?:[^)]|\n)*\)\s*\{/gm;
    let match;
    while ((match = functionRegex.exec(code)) !== null) {
        const functionName = match[1];
        if (!functionName || functions.has(functionName)) continue;
        const startIndex = match.index;
        let openBraces = 0;
        let endIndex = -1;
        const bodyStartIndex = code.indexOf('{', startIndex);
        if (bodyStartIndex === -1) continue;
        for (let i = bodyStartIndex; i < code.length; i++) {
            if (code[i] === '{') openBraces++;
            else if (code[i] === '}') {
                openBraces--;
                if (openBraces === 0) {
                    endIndex = i + 1;
                    break;
                }
            }
        }
        if (endIndex !== -1) functions.set(functionName, code.substring(startIndex, endIndex));
    }
    return functions;
}

function createFunctionDiff(vanillaCode: string, customCode: string): string {
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(vanillaCode, customCode);
    dmp.diff_cleanupSemantic(diffs);
    return diffs.map(([op, text]) => {
        if (op === diff_match_patch.DIFF_EQUAL) return null;
        const prefix = op === diff_match_patch.DIFF_INSERT ? '+' : '-';
        return text.split('\n').filter(line => line.trim() !== '').map(line => `${prefix} ${line}`).join('\n');
    }).filter(Boolean).join('\n');
}

async function parseAndCorrectJson(text: string, ai: GoogleGenAI): Promise<any> {
    const fenceRegex = /^`{3}(json)?\s*\n?(.*?)\n?`{3}$/s;
    let jsonText = text.trim();
    const match = jsonText.match(fenceRegex);
    if (match && match[2]) {
        jsonText = match[2].trim();
    }
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.warn("Análise JSON inicial falhou. Tentando autocorreção...", { error: e, text: jsonText });
        const prompt = `O seguinte texto deveria ser um JSON, mas está malformado. Por favor, corrija-o e retorne apenas o objeto JSON válido.\n\nJSON Inválido:\n${jsonText}`;
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: prompt,
            config: {
                systemInstruction: systemInstructionForJsonFix,
                temperature: 0,
                responseMimeType: 'application/json'
            }
        });
        let correctedJsonText = result.text.trim();
        const correctedMatch = correctedJsonText.match(fenceRegex);
        if (correctedMatch && correctedMatch[2]) {
            correctedJsonText = correctedMatch[2].trim();
        }
        return JSON.parse(correctedJsonText);
    }
}

// --- Novas Funções de Geração e Montagem de Relatório ---

const getComprehensionPrompt = (functionName: string, programName: string, diff: string) => `
Você é um desenvolvedor sênior especialista em JD Edwards com 20 anos de experiência.
Sua tarefa é analisar profundamente a seguinte alteração de código para a função \`${functionName}\` no programa \`${programName}\`.

**Análise Requerida (NÃO gere casos de teste ainda):**
1.  **Resumo da Mudança:** Explique a principal alteração na lógica de programação em 1-2 frases.
2.  **Impacto de Negócio:** Descreva o impacto funcional ou de negócio que esta mudança provavelmente causará.
3.  **Elementos JDE Afetados:** Identifique e liste quaisquer elementos específicos do JDE impactados. Preste muita atenção a:
    *   **UDCs (User Defined Codes):** Existe alguma referência a UDCs (ex: '58', '55')? Se sim, quais?
    *   **Processing Options (PO):** A lógica usa valores de Opções de Processamento?
    *   **Business Functions (BSFN):** Há chamadas para BSFNs (ex: 'B4200310', 'XT4111Z1')?
    *   **Table I/O (TIO):** Quais tabelas (ex: F4211, F4101) estão sendo lidas ou gravadas de forma diferente?
4.  **Risco Potencial:** Classifique o risco de regressão (Baixo, Médio, Alto) e justifique brevemente.
5.  **Nao omita diferenças você precisa ser o mais critico possivel.

**REGRAS:**
- Seja extremamente minucioso. Sua análise é a base para a criação de testes críticos.
- Foque exclusivamente no diff fornecido.
- Refira-se ao programa **apenas** como \`${programName}\`. NÃO mencione outros programas.

**Diff da Função para Análise:**
\`\`\`diff
${diff}
\`\`\`
`;

const getComprehensionPrompt_FromScratch = (functionName: string, programName: string, functionBody: string) => `
Você é um desenvolvedor sênior especialista em JD Edwards com 20 anos de experiência.
Sua tarefa é analisar a seguinte função \`${functionName}\` do programa customizado \`${programName}\` que foi criado do zero.

**Análise Requerida (NÃO gere casos de teste ainda):**
1.  **Objetivo da Função:** Descreva o propósito principal da função em 1-2 frases.
2.  **Lógica Principal:** Explique a lógica de negócio chave implementada na função.
3.  **Elementos JDE Utilizados:** Identifique e liste quaisquer elementos específicos do JDE utilizados. Preste muita atenção a:
    *   **UDCs (User Defined Codes):** Existe alguma referência a UDCs (ex: '58', '55')? Se sim, quais?
    *   **Processing Options (PO):** A lógica usa valores de Opções de Processamento?
    *   **Business Functions (BSFN):** Há chamadas para BSFNs (ex: 'B4200310', 'XT4111Z1')?
    *   **Table I/O (TIO):** Quais tabelas (ex: F4211, F4101) estão sendo lidas, gravadas ou atualizadas?
4.  **Risco Potencial:** Classifique o risco de bugs ou comportamento inesperado (Baixo, Médio, Alto) e justifique brevemente.

**REGRAS:**
- Seja extremamente minucioso. Sua análise é a base para a criação de testes críticos.
- Foque exclusivamente no código da função fornecida.
- Refira-se ao programa **apenas** como \`${programName}\`. NÃO mencione outros programas.

**Código da Função para Análise:**
\`\`\`c
${functionBody}
\`\`\`
`;


const getTestCaseGenerationPrompt = (functionName: string, programName: string, analysisContext: string, manufacturingBranch: string, distributionBranch: string) => `
Você é um Engenheiro de QA sênior, especialista em testes de software JD Edwards.
Baseado na análise de desenvolvimento fornecida, sua tarefa é criar um conjunto **extenso e profissional** de cenários de teste para a função \`${functionName}\` do programa \`${programName}\`.

**Análise do Desenvolvedor (Contexto Crítico para seus testes):**
\`\`\`text
${analysisContext}
\`\`\`

**REQUISITOS PARA OS TESTES (SEJA RIGOROSO):**
1.  **Cobertura Completa:** Crie testes que cubram TODOS os pontos levantados na análise, especialmente os "Elementos JDE Afetados" (UDCs, POs, BSFNs, TIOs). Se a análise mencionou a UDC '58/20', deve haver um teste específico para validar seu uso.
2.  **Contexto da Empresa:** Utilize os dados da empresa fornecidos para criar cenários realistas sempre que aplicável.
    *   Filial Fabril Principal: \`${manufacturingBranch}\`
    *   Filial de Distribuição Principal: \`${distributionBranch}\`
3.  **Profundidade:** Inclua testes de caminho feliz (happy path), caminhos de exceção (negative testing) e casos de borda (edge cases).
4.  **Clareza:** Os procedimentos devem ser claros e passo a passo. Os resultados esperados devem ser específicos e mensuráveis.
5.  **FOCO TOTAL:** Não invente funcionalidades. Baseie-se estritamente na análise fornecida.

**FORMATO DE SAÍDA (JSON ESTRITO E OBRIGATÓRIO):**
Retorne sua resposta como um objeto JSON. Não inclua nenhum texto explicativo, comentários ou cercas de markdown.
{
  "test_scenarios": [
    {
      "procedure": "O procedimento de teste detalhado, passo a passo.",
      "expected_result": "O resultado esperado exato e verificável."
    }
  ]
}
`;

const getTranscriptionPrompt = (scenariosJson: string) => `
Sua tarefa é transcrever os seguintes cenários de teste JSON em linhas de tabela HTML (\`<tr>\`).
Para CADA objeto no array JSON, gere UMA linha \`<tr>\`.
NÃO resuma, agrupe ou omita nenhum cenário. Apenas transcreva.
O resultado deve ser apenas o conteúdo da tabela (as linhas \`<tr>\`), sem cabeçalhos ou a tag \`<table>\`.
Mantenha o conteúdo das colunas "procedure" e "expected_result" exatamente como está no JSON.

**JSON dos Cenários:**
${scenariosJson}

**Exemplo de Saída para um cenário:**
<tr>
    <td style="padding: 8px; text-align: left; vertical-align: top;">Verificar cálculo X.</td>
    <td style="padding: 8px; text-align: left; vertical-align: top;">O sistema deve calcular Y.</td>
    <td style="padding: 8px; text-align: left; vertical-align: top;"></td>
    <td style="padding: 8px; text-align: left; vertical-align: top;"><label class="checkbox-label"><input type="checkbox" class="checkbox"> Passou</label><label class="checkbox-label"><input type="checkbox" class="checkbox"> Falhou</label></td>
    <td style="padding: 8px; text-align: left; vertical-align: top;"></td>
</tr>
`;

function assembleFinalReport(programName: string, metrics: any, tableRows: string, isFromScratch: boolean): string {
    const currentDate = new Date().toLocaleDateString('pt-BR');
    const metricsHtml = isFromScratch ? `
        <p><strong>Linhas de Código (Customizado):</strong> ${metrics.customLines}</p>
        <p><strong>Total de Funções Analisadas:</strong> ${metrics.analyzedFunctions}</p>
    ` : `
        <p><strong>Linhas de Código (Padrão):</strong> ${metrics.vanillaLines}</p>
        <p><strong>Linhas de Código (Customizado):</strong> ${metrics.customLines}</p>
        <p><strong>Total de Funções Encontradas:</strong> ${metrics.totalFunctions}</p>
        <p><strong>Funções Modificadas com Lógica Alterada:</strong> ${metrics.modifiedFunctions}</p>
    `;
    
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Plano de Teste: ${programName}</title>
    <style>
        body { font-family: Calibri, 'Segoe UI', sans-serif; line-height: 1.15; color: #333; }
        h1, h2, h3 { color: #2F5496; font-weight: 600; }
        h1 { font-size: 18pt; text-align: center; margin-bottom: 24px; }
        h2 { font-size: 14pt; border-bottom: 1px solid #BFBFBF; padding-bottom: 4px; margin-top: 24px; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 10pt; }
        th, td { border: 1px solid #BFBFBF; padding: 8px; text-align: left; vertical-align: top; }
        th { background-color: #4472C4; color: white; font-weight: bold; }
        p { margin-top: 4px; margin-bottom: 12px; }
        .header-info { background-color: #F2F2F2; padding: 12px; border-left: 4px solid #4472C4; margin-bottom: 24px; }
        .header-info p { margin: 4px 0; font-size: 11pt; }
        .checkbox-label { display: block; margin-right: 15px; font-size: 10pt; white-space: nowrap; }
        .checkbox { vertical-align: middle; margin-right: 5px; }
    </style>
</head>
<body>
    <h1>Plano de Teste - ${isFromScratch ? 'Validação de Programa Customizado' : 'Migração JDE 9.2'}</h1>
    <div class="header-info">
        <p><strong>Assunto:</strong> Análise de Customização e Plano de Teste para ${programName}${isFromScratch ? ' (Criado do Zero)' : ''}</p>
        <p><strong>Data de Geração:</strong> ${currentDate}</p>
        ${metricsHtml}
    </div>

    <h2>FOLHA DE TESTE</h2>
    <p>Esta seção detalha os casos de teste recomendados para validar as customizações. Preencha as colunas 'RESULTADO OBTIDO', 'CONCLUSÃO' e 'DESVIO' durante a execução dos testes.</p>
    <table>
        <thead>
            <tr>
                <th style="width:35%;">PROCEDIMENTO</th>
                <th style="width:40%;">RESULTADO ESPERADO</th>
                <th style="width:10%;">RESULTADO OBTIDO</th>
                <th style="width:10%;">CONCLUSÃO</th>
                <th style="width:5%;">DESVIO</th>
            </tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>
</body>
</html>`;
}

// --- Orquestrador Principal ---

async function runMultiStepAnalysis(
    vanillaCode: string, 
    customCode: string, 
    programName: string,
    manufacturingBranch: string, 
    distributionBranch: string, 
    onProgress: (message: string) => void
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const isFromScratch = !vanillaCode.trim();
    
    onProgress('Analisando a estrutura do código...');
    const customFunctions = parseFunctions(customCode);

    if (customFunctions.size === 0) {
        onProgress('Nenhuma função C-like encontrada. Realizando análise simples...');
        return runSimpleAnalysis(vanillaCode, customCode, programName, manufacturingBranch, distributionBranch);
    }
    
    const functionsToAnalyze: { name: string, content: string, type: 'diff' | 'full' }[] = [];
    
    if (isFromScratch) {
        for (const [name, body] of customFunctions.entries()) {
            functionsToAnalyze.push({ name, content: body, type: 'full' });
        }
    } else {
        const vanillaFunctions = parseFunctions(vanillaCode);
        for (const [name, customBody] of customFunctions.entries()) {
            const vanillaBody = vanillaFunctions.get(name);
            if (!vanillaBody || vanillaBody !== customBody) {
                const diff = createFunctionDiff(vanillaBody || '', customBody);
                const hasLogicChange = diff.split('\n').some(line => {
                    const trimmedContent = line.substring(1).trim();
                    return trimmedContent && !trimmedContent.startsWith('//') && !trimmedContent.startsWith('/*');
                });

                if (hasLogicChange) {
                    functionsToAnalyze.push({ name, content: diff, type: 'diff' });
                }
            }
        }
    }

    if (functionsToAnalyze.length === 0) {
        return "<p>Nenhuma diferença funcional (lógica de código) encontrada entre os arquivos. As mudanças podem ser apenas em comentários ou formatação. Nenhum plano de testes é necessário.</p>";
    }
    
    let allTestScenarios: any[] = [];
    for (let i = 0; i < functionsToAnalyze.length; i++) {
        const func = functionsToAnalyze[i];
        
        try {
            // Etapa 1: Compreensão do Código
            onProgress(`Analisando função ${i + 1}/${functionsToAnalyze.length}: ${func.name}`);
            const comprehensionPrompt = func.type === 'diff' 
                ? getComprehensionPrompt(func.name, programName, func.content)
                : getComprehensionPrompt_FromScratch(func.name, programName, func.content);

            const comprehensionResult = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-04-17',
                contents: comprehensionPrompt,
                config: { systemInstruction: systemInstructionAntiHallucination, temperature: 0.1 }
            });
            const analysisContext = comprehensionResult.text;

            // Etapa 2: Geração de Casos de Teste
            onProgress(`Gerando testes para a função ${i + 1}/${functionsToAnalyze.length}: ${func.name}`);
            const testCasePrompt = getTestCaseGenerationPrompt(func.name, programName, analysisContext, manufacturingBranch, distributionBranch);
            const testCaseResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-04-17',
                contents: testCasePrompt,
                config: { 
                    responseMimeType: "application/json",
                    systemInstruction: systemInstructionAntiHallucination,
                    temperature: 0.2
                }
            });
            
            const parsedJson = await parseAndCorrectJson(testCaseResponse.text, ai);
            if (parsedJson && parsedJson.test_scenarios && Array.isArray(parsedJson.test_scenarios)) {
                allTestScenarios = allTestScenarios.concat(parsedJson.test_scenarios);
            }

        } catch (error) {
            console.error(`Falha ao analisar a função ${func.name}:`, error);
            onProgress(`Falha ao analisar ${func.name}, pulando...`);
        }
    }

    if (allTestScenarios.length === 0) {
        throw new Error("A análise das funções não gerou cenários de teste válidos. Não foi possível gerar o relatório.");
    }
    
    onProgress('Transcrevendo cenários de teste...');
    const BATCH_SIZE = 20;
    let allTableRows = '';
    for (let i = 0; i < allTestScenarios.length; i += BATCH_SIZE) {
        const batch = allTestScenarios.slice(i, i + BATCH_SIZE);
        onProgress(`Formatando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(allTestScenarios.length / BATCH_SIZE)}...`);
        
        try {
            const transcriptionPrompt = getTranscriptionPrompt(JSON.stringify(batch));
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-04-17',
                contents: transcriptionPrompt,
                config: { systemInstruction: systemInstructionAntiHallucination, temperature: 0 }
            });
            allTableRows += response.text.replace(/`{3}(html)?/g, '').trim();
        } catch (error) {
            console.error(`Falha ao transcrever o lote ${i / BATCH_SIZE}:`, error);
        }
    }

    onProgress('Montando o relatório final...');
    const metrics = isFromScratch 
    ? {
        customLines: customCode.split('\n').length,
        analyzedFunctions: functionsToAnalyze.length
    }
    : {
        vanillaLines: vanillaCode.split('\n').length,
        customLines: customCode.split('\n').length,
        totalFunctions: customFunctions.size,
        modifiedFunctions: functionsToAnalyze.length
    };
    
    return assembleFinalReport(programName, metrics, allTableRows, isFromScratch);
}

async function runSimpleAnalysis(vanillaCode: string, customCode: string, programName: string, manufacturingBranch: string, distributionBranch: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const isFromScratch = !vanillaCode.trim();

    let prompt: string;
    let metrics: any;
    
    if (isFromScratch) {
        prompt = `
            Você é um Engenheiro de QA especializado em JDE. Sua tarefa é criar um Plano de Testes em HTML baseado no código-fonte completo de um programa customizado fornecido. O programa é ${programName}.

            **REGRAS:**
            1. **FOCO NO CÓDIGO:** Crie cenários de teste que validem as funcionalidades implementadas no código.
            2. **FORMATO HTML:** Retorne um documento HTML completo, seguindo a estrutura exata do exemplo abaixo.
            3. **DADOS DA EMPRESA:** Utilize os dados fornecidos (Filiais ${manufacturingBranch} e ${distributionBranch}) nos cenários de teste quando for relevante.
            4. **NOME DO PROGRAMA:** Em toda a sua resposta, refira-se ao programa **exclusivamente** como \`${programName}\`. Não mencione outros nomes.

            **Código-fonte completo para análise:**
            \`\`\`c
            ${customCode}
            \`\`\`

            **ESTRUTURA DE SAÍDA HTML (Use esta estrutura exata):**
            ${assembleFinalReport(programName, {
                customLines: customCode.split('\n').length,
                analyzedFunctions: 'N/A'
            }, '<!-- Insira as linhas de teste <tr> aqui -->', true)}
        `;
    } else {
        const diffText = createFunctionDiff(vanillaCode, customCode);
        if (!diffText.trim()) {
            return "<p>Nenhuma diferença encontrada entre os dois arquivos.</p>";
        }
        prompt = `
            Você é um Engenheiro de QA especializado em JDE. Sua tarefa é criar um Plano de Testes em HTML baseado no diff de código fornecido para o programa ${programName}.

            **REGRAS:**
            1. **FOCO NO DIFF:** Crie cenários de teste que validem as linhas de código modificadas (marcadas com '+' ou '-').
            2. **FORMATO HTML:** Retorne um documento HTML completo, seguindo a estrutura exata do exemplo abaixo.
            3. **DADOS DA EMPRESA:** Utilize os dados fornecidos (Filiais ${manufacturingBranch} e ${distributionBranch}) nos cenários de teste quando for relevante.
            4. **NOME DO PROGRAMA:** Em toda a sua resposta, refira-se ao programa **exclusivamente** como \`${programName}\`. NÃO mencione ou faça referência a nenhum outro nome de programa.

            **Diff do Código:**
            \`\`\`diff
            ${diffText}
            \`\`\`

            **ESTRUTURA DE SAÍDA HTML (Use esta estrutura exata):**
            ${assembleFinalReport(programName, {
                vanillaLines: vanillaCode.split('\n').length,
                customLines: customCode.split('\n').length,
                totalFunctions: 'N/A',
                modifiedFunctions: 'N/A'
            }, '<!-- Insira as linhas de teste <tr> aqui -->', false)}
        `;
    }

    const response = await ai.models.generateContent({
         model: 'gemini-2.5-flash-preview-04-17', 
         contents: prompt,
         config: { systemInstruction: systemInstructionAntiHallucination }
    });
     // Limpa a resposta para garantir que seja apenas HTML
    let reportHtml = response.text;
    const fenceRegex = /^`{3}(html)?\s*\n?(.*?)\n?`{3}$/s;
    const match = reportHtml.match(fenceRegex);
    if (match && match[2]) {
        reportHtml = match[2].trim();
    }
    return reportHtml;
}

export async function generateTestPlan(
    vanillaCode: string, 
    customCode: string,
    programName: string, 
    includeEnhancedAnalysis: boolean,
    manufacturingBranch: string,
    distributionBranch: string,
    onProgress: (message: string) => void
): Promise<string> {
    if (!process.env.API_KEY) {
        throw new Error("A variável de ambiente API_KEY não está configurada.");
    }
    
    if (!customCode.trim()) {
        throw new Error("O código-fonte customizado não pode estar vazio.");
    }
    
    const finalProgramName = programName || "Programa Desconhecido";

    if (includeEnhancedAnalysis) {
        return runMultiStepAnalysis(vanillaCode, customCode, finalProgramName, manufacturingBranch, distributionBranch, onProgress);
    } else {
        onProgress('Executando análise simples...');
        return runSimpleAnalysis(vanillaCode, customCode, finalProgramName, manufacturingBranch, distributionBranch);
    }
}
