
import { generateChat } from '../lib/llmClient.js';
import diff_match_patch from 'diff-match-patch';

export interface FunctionalSpec {
  fileName: string;
  htmlContent: string;
  images: {
    mimeType: string;
    data: string; // base64 encoded
  }[];
}

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

const DEFAULT_MODELS: Record<string, string> = {
    openai: 'gpt-3.5-turbo-0125',
    groq: 'groq/llama3-8b-8192',
    gemini: 'gemini-2.5-flash'
};

function getModel(provider: string): string {
    return DEFAULT_MODELS[provider] || DEFAULT_MODELS['openai'];
}

async function parseAndCorrectJson(text: string, provider: string): Promise<any> {
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
        const result = await generateChat({
            model: getModel(provider),
            provider,
            prompt,
            systemPrompt: systemInstructionForJsonFix,
            temperature: 0,
            responseMimeType: 'application/json'
        });
        let correctedJsonText = result.content.trim();
        const correctedMatch = correctedJsonText.match(fenceRegex);
        if (correctedMatch && correctedMatch[2]) {
            correctedJsonText = correctedMatch[2].trim();
        }
        return JSON.parse(correctedJsonText);
    }
}

// --- Funções de Geração e Montagem de Relatório ---

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
- Para qualquer ênfase no texto, use tags HTML <strong> ao invés de markdown.

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
- Para qualquer ênfase no texto, use tags HTML <strong> ao invés de markdown.

**Código da Função para Análise:**
\`\`\`c
${functionBody}
\`\`\`
`;


const getTestCaseGenerationPrompt = (functionName: string, programName: string, analysisContext: string, manufacturingBranch: string, distributionBranch: string) => `
Você é um Engenheiro de QA sênior e Analista de Negócios, especialista em traduzir análises técnicas do JD Edwards em planos de teste funcionais e focados no usuário.
Sua tarefa é criar um conjunto **abrangente e de alta qualidade** de cenários de teste para a função \`${functionName}\` do programa \`${programName}\`, seguindo um processo rigoroso.

**Análise do Desenvolvedor (Contexto Técnico):**
\`\`\`text
${analysisContext}
\`\`\`

**PROCESSO DE GERAÇÃO DE TESTES (SIGA ESTRITAMENTE):**

**Passo 1: Checklist de Pontos de Teste (Seu Raciocínio Interno)**
- Primeiro, leia a "Análise do Desenvolvedor" e crie uma lista interna de todos os pontos de mudança, impactos de negócio, e elementos JDE afetados. Este será seu checklist para garantir 100% de cobertura.

**Passo 2: Geração Sistemática de Cenários**
- Para **CADA** item do seu checklist, gere um conjunto de testes que inclua:
    1.  **Caminho Sucesso:** Um teste para o cenário de sucesso principal.
    2.  **Caminhos de Exceção:** Testes para dados inválidos, erros esperados e violações de regras de negócio. Testes para valores limite (ex: zero, nulo, datas extremas, primeiro/último item de uma lista).
- Seu objetivo é a **cobertura total**, não a quantidade mínima.

**Passo 3: Refinamento e Enriquecimento**
- Revise a lista completa de testes que você gerou.
- **Consolide, não delete:** Se dois testes forem muito semelhantes, combine-os em um cenário mais robusto que teste ambas as condições, em vez de remover um deles.
- **Verifique a Cobertura:** Compare seus testes com seu checklist inicial. Se algum ponto da análise não foi testado, **adicione o teste faltante agora.**
- **Adicione Contexto de Negócio:** Utilize os dados da empresa fornecidos para criar cenários realistas.
    *   Filial Fabril Principal: \`${manufacturingBranch}\`
    *   Filial de Distribuição Principal: \`${distributionBranch}\`
- **Garanta Clareza:** Escreva os campos "procedure" e "expected_result" em linguagem de negócio clara, como se fosse para um usuário final.
    *   **Procedure:** Ações do usuário na tela (ex: 'Preencher o campo "Tipo de Ordem" com "WO"'). EVITE jargões técnicos.
    *   **Expected Result:** O que o usuário deve ver ou verificar. É aceitável mencionar tabelas (ex: F4211), mas sempre explique o *significado de negócio* (ex: '...o status 540, indicando que está pronta para faturamento'). Use tags <strong> para ênfase, não markdown.

**Passo 4: Formatação Final**
- Apenas após concluir os passos anteriores, formate o resultado final como um único objeto JSON.

**FORMATO DE SAÍDA (JSON ESTRITO E OBRIGATÓRIO):**
Retorne sua resposta como um objeto JSON. Não inclua nenhum texto explicativo, comentários ou cercas de markdown.
{
  "test_scenarios": [
    {
      "procedure": "O procedimento de teste funcional, passo a passo, do ponto de vista do usuário.",
      "expected_result": "O resultado de negócio esperado, detalhado e verificável. Use <strong> para negrito."
    }
  ]
}
`;

const getTranscriptionPrompt = (scenariosJson: string, startingIndex: number) => `
Sua tarefa é transcrever os seguintes cenários de teste JSON em linhas de tabela HTML (\`<tr>\`).
Para CADA objeto no array JSON, gere UMA linha \`<tr>\`.
A numeração dos casos de teste deve ser sequencial, começando em ${startingIndex}.

**REGRAS:**
1.  **Numeração:** O primeiro campo de cada linha (\`<tr>\`) deve ser uma célula (\`<td>\`) contendo o número do caso de teste.
2.  **Transcrição Literal:** NÃO resuma, agrupe ou omita nenhum cenário. Apenas transcreva o conteúdo de "procedure" e "expected_result" para suas respectivas células. Use o HTML exatamente como fornecido, incluindo tags <strong>.
3.  **Coluna de Resultado:** A quarta coluna ('RESULTADO OBTIDO') deve conter o texto '☐ Aprovado<br>☐ Reprovado'.
4.  **Formato:** O resultado deve ser apenas o conteúdo da tabela (as linhas \`<tr>\`), sem cabeçalhos ou a tag \`<table>\`.

**JSON dos Cenários:**
${scenariosJson}

**Exemplo de Saída para o primeiro cenário (assumindo startingIndex=${startingIndex}):**
<tr>
    <td style="padding: 8px; text-align: center; vertical-align: top; font-weight: bold;">${startingIndex}</td>
    <td style="padding: 8px; text-align: left; vertical-align: top;">(Conteúdo da 'procedure' do primeiro objeto JSON)</td>
    <td style="padding: 8px; text-align: left; vertical-align: top;">(Conteúdo da 'expected_result' do primeiro objeto JSON)</td>
    <td style="padding: 8px; text-align: left; vertical-align: top;">☐ Aprovado<br>☐ Reprovado</td>
    <td style="padding: 8px; text-align: left; vertical-align: top;"></td>
    <td style="padding: 8px; text-align: left; vertical-align: top;"></td>
</tr>
`;

function assembleFinalReport(programName: string, metrics: any, tableRows: string, isFromScratch: boolean): string {
    const currentDate = new Date().toLocaleDateString('pt-BR');
    let metricsHtml = '';

    if (metrics.source === 'Especificação Funcional') {
        metricsHtml = `
            <p><strong>Fonte da Análise:</strong> Documento(s) de Especificação Funcional</p>
            <p><strong>Total de Documentos:</strong> ${metrics.totalDocs}</p>
        `;
    } else if (isFromScratch) {
        metricsHtml = `
            <p><strong>Fonte da Análise:</strong> Código-Fonte (Criado do Zero)</p>
            <p><strong>Linhas de Código (Customizado):</strong> ${metrics.customLines}</p>
            <p><strong>Total de Funções Analisadas:</strong> ${metrics.analyzedFunctions}</p>
        `;
    } else {
        metricsHtml = `
            <p><strong>Fonte da Análise:</strong> Comparativo de Código-Fonte</p>
            <p><strong>Linhas de Código (Padrão):</strong> ${metrics.vanillaLines}</p>
            <p><strong>Linhas de Código (Customizado):</strong> ${metrics.customLines}</p>
            <p><strong>Total de Funções Encontradas:</strong> ${metrics.totalFunctions}</p>
            <p><strong>Funções Modificadas com Lógica Alterada:</strong> ${metrics.modifiedFunctions}</p>
        `;
    }
    
    const reportType = metrics.source === 'Especificação Funcional' ? 'Validação Funcional' : 'Análise de Código-Fonte';
    const subject = metrics.source === 'Especificação Funcional' 
        ? `Plano de Teste Funcional para ${programName}`
        : `Análise de Customização e Plano de Teste para ${programName}${isFromScratch ? ' (Criado do Zero)' : ''}`;

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Plano de Teste: ${programName}</title>
    <style>
        @page WordSection1 {
            size: 11.0in 8.5in;
            mso-page-orientation: landscape;
            margin: 0.75in;
        }
        div.WordSection1 {
            page: WordSection1;
        }
        body { font-family: Calibri, 'Segoe UI', sans-serif; line-height: 1.15; color: #333; }
        h1, h2, h3 { color: #2F5496; font-weight: 600; }
        h1 { font-size: 18pt; text-align: center; margin-bottom: 24px; }
        h2 { font-size: 14pt; border-bottom: 1px solid #BFBFBF; padding-bottom: 4px; margin-top: 24px; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 10pt; }
        th, td { border: 1px solid #BFBFBF; padding: 8px; text-align: left; vertical-align: top; }
        th { background-color: #4472C4; color: white; font-weight: bold; }
        p { margin-top: 4px; margin-bottom: 12px; }
        strong { font-weight: bold; }
        .header-info { background-color: #F2F2F2; padding: 12px; border-left: 4px solid #4472C4; margin-bottom: 24px; }
        .header-info p { margin: 4px 0; font-size: 11pt; }
    </style>
</head>
<body>
<div class="WordSection1">
    <h1>Plano de Teste - ${reportType}</h1>
    <div class="header-info">
        <p><strong>Assunto:</strong> ${subject}</p>
        <p><strong>Data de Geração:</strong> ${currentDate}</p>
        ${metricsHtml}
    </div>

    <h2>FOLHA DE TESTE</h2>
    <p>Esta seção detalha os casos de teste recomendados para validar as funcionalidades. Preencha as colunas 'RESULTADO OBTIDO', 'CONCLUSÃO' e 'DESVIO' durante a execução dos testes.</p>
    <table>
        <thead>
            <tr>
                <th style="width:5%;">ID</th>
                <th style="width:30%;">PROCEDIMENTO (Ação do Usuário)</th>
                <th style="width:35%;">RESULTADO ESPERADO (Comportamento do Sistema)</th>
                <th style="width:15%;">RESULTADO OBTIDO</th>
                <th style="width:10%;">CONCLUSÃO</th>
                <th style="width:5%;">DESVIO</th>
            </tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>
</div>
</body>
</html>`;
}

// --- Orquestradores ---

async function runFunctionalSpecAnalysis(
    specs: FunctionalSpec[],
    programName: string,
    manufacturingBranch: string,
    distributionBranch: string,
    module: string,
    provider: string,
    onProgress: (message: string) => void
): Promise<string> {
    onProgress('Analisando especificações funcionais...');

    const finalProgramName = programName || 'a ser identificado pelo analista de IA';

    const initialPrompt = `
        Você é um Engenheiro de QA Sênior e Analista de Negócios, especialista em traduzir especificações funcionais em planos de teste claros e focados no usuário para o sistema JD Edwards.
        Sua tarefa é criar um Plano de Testes em formato HTML profissional e detalhado, baseado nos documentos de especificação funcional fornecidos, seguindo um processo de 4 etapas.

        **PROCESSO DE GERAÇÃO DE TESTES (SIGA ESTRITAMENTE):**

        **Passo 1: Identificar o Programa e Deconstruir Requisitos**
        - Primeiro, analise cuidadosamente todo o conteúdo para identificar o nome ou código principal do programa/processo (ex: "RNP48DT", "P4210"). Use este nome no relatório.
        - Em seguida, crie um "checklist" interno e silencioso de cada regra de negócio, requisito funcional e validação de dados mencionados nos documentos. Este checklist é a sua base para garantir cobertura total.

        **Passo 2: Geração Sistemática e Abrangente de Cenários**
        - Para CADA item do seu checklist, gere um conjunto diversificado de testes:
            1.  **Caminho Sucesso:** O cenário de sucesso principal.
            2.  **Caminhos de Exceção:** Testes para dados inválidos, erros esperados e violações de regras de negócio. Testes para valores limite (ex: zero, nulo, datas extremas, primeiro/último item de uma lista).
        - Aplique estritamente o contexto de negócio:
            *   **Módulo:** ${module}
            *   **Filial Fabril Principal:** ${manufacturingBranch} (para processos de Manufatura)
            *   **Filial de Distribuição Principal:** ${distributionBranch} (para processos de Distribuição/Financeiro)

        **Passo 3: Revisão, Refinamento e Enriquecimento**
        - Revise a lista completa de testes que você gerou.
        - **Verifique a Cobertura:** Compare seus testes com seu checklist inicial. Se algum requisito da especificação não foi testado, **adicione o teste faltante agora.**
        - **Consolide Inteligentemente:** Combine testes muito similares em um cenário único e mais robusto.
        - **Garanta Clareza:** Escreva todos os testes na perspectiva do usuário final. Use tags <strong> para negrito. Evite jargões técnicos.

        **Passo 4: Formatação do Relatório Final em HTML**
        - Apenas após concluir os passos anteriores, monte o documento HTML final.
        - Numere os testes sequencialmente na primeira coluna da tabela, começando em 1.
        - Na coluna 'RESULTADO OBTIDO', insira o texto '☐ Aprovado<br>☐ Reprovado'.
        - Use a estrutura HTML exata fornecida abaixo.

        **ESTRUTURA DE SAÍDA HTML (Use esta estrutura exata, preenchendo com o nome do programa que você identificou):**
        ${assembleFinalReport(finalProgramName, {
            source: 'Especificação Funcional',
            totalDocs: specs.length
        }, '<!-- As linhas de teste <tr> geradas pela IA devem ser inseridas aqui, seguindo todas as regras descritas. -->', false)}
    `;
    
    let promptText = initialPrompt;

    for (const spec of specs) {
        promptText += `\n\n--- INÍCIO DO DOCUMENTO: ${spec.fileName} ---\n\n`;
        promptText += spec.htmlContent;
        for (const image of spec.images) {
            promptText += `\n[imagem ${image.mimeType} omitida]\n`;
        }
        promptText += `\n\n--- FIM DO DOCUMENTO: ${spec.fileName} ---\n\n`;
    }

    const response = await generateChat({
         model: getModel(provider),
         provider,
         prompt: promptText,
         systemPrompt: "Sua resposta deve ser um documento HTML completo e válido, baseado estritamente nas informações e metodologia fornecidas. Foque em uma linguagem de negócios clara, use <strong> para negrito e garanta cobertura total dos requisitos."
    });
    let reportHtml = response.content;
    const fenceRegex = /^`{3}(html)?\s*\n?(.*?)\n?`{3}$/s;
    const match = reportHtml.match(fenceRegex);
    if (match && match[2]) {
        reportHtml = match[2].trim();
    }
    return reportHtml;
}


async function runMultiStepAnalysis(
    vanillaCode: string,
    customCode: string,
    programName: string,
    manufacturingBranch: string,
    distributionBranch: string,
    provider: string,
    onProgress: (message: string) => void
): Promise<string> {
    const isFromScratch = !vanillaCode.trim();
    
    onProgress('Analisando a estrutura do código...');
    const customFunctions = parseFunctions(customCode);

    if (customFunctions.size === 0) {
        onProgress('Nenhuma função C-like encontrada. Realizando análise simples...');
        return runSimpleAnalysis(vanillaCode, customCode, programName, manufacturingBranch, distributionBranch, provider);
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

            const comprehensionResult = await generateChat({
                model: getModel(provider),
                provider,
                prompt: comprehensionPrompt,
                systemPrompt: systemInstructionAntiHallucination,
                temperature: 0.1
            });
            const analysisContext = comprehensionResult.content;

            // Etapa 2: Geração de Casos de Teste
            onProgress(`Gerando testes para a função ${i + 1}/${functionsToAnalyze.length}: ${func.name}`);
            const testCasePrompt = getTestCaseGenerationPrompt(func.name, programName, analysisContext, manufacturingBranch, distributionBranch);
            const testCaseResponse = await generateChat({
                model: getModel(provider),
                provider,
                prompt: testCasePrompt,
                systemPrompt: systemInstructionAntiHallucination,
                temperature: 0.2,
                responseMimeType: "application/json"
            });
            const parsedJson = await parseAndCorrectJson(testCaseResponse.content, provider);
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
            const transcriptionPrompt = getTranscriptionPrompt(JSON.stringify(batch), i + 1);
            const response = await generateChat({
                model: getModel(provider),
                provider,
                prompt: transcriptionPrompt,
                systemPrompt: systemInstructionAntiHallucination,
                temperature: 0
            });
            allTableRows += response.content.replace(/`{3}(html)?/g, '').trim();
        } catch (error) {
            console.error(`Falha ao transcrever o lote ${i / BATCH_SIZE}:`, error);
        }
    }

    onProgress('Montando o relatório final...');
    const metrics = isFromScratch 
    ? {
        source: 'Código-Fonte',
        customLines: customCode.split('\n').length,
        analyzedFunctions: functionsToAnalyze.length
    }
    : {
        source: 'Código-Fonte',
        vanillaLines: vanillaCode.split('\n').length,
        customLines: customCode.split('\n').length,
        totalFunctions: customFunctions.size,
        modifiedFunctions: functionsToAnalyze.length
    };
    
    return assembleFinalReport(programName, metrics, allTableRows, isFromScratch);
}

async function runSimpleAnalysis(vanillaCode: string, customCode: string, programName: string, manufacturingBranch: string, distributionBranch: string, provider: string): Promise<string> {
    const isFromScratch = !vanillaCode.trim();

    let prompt: string;
    const baseMethodology = `
        **METODOLOGIA DE GERAÇÃO DE TESTES (SIGA ESTRITAMENTE):**
        1.  **Checklist Interno:** Analise todo o código/diff e crie uma lista mental de todas as mudanças lógicas, regras de negócio e funcionalidades.
        2.  **Geração Abrangente:** Para cada item do seu checklist, crie testes de caminho Sucesso, exceção e casos de borda. O objetivo é a cobertura completa.
        3.  **Tradução para Negócio:** Traduza a lógica técnica em passos que um usuário final possa executar. Descreva os resultados esperados em termos de impacto no negócio, não apenas em jargão técnico. Use <strong> para negrito.
        4.  **Contexto da Empresa:** Use as filiais ${manufacturingBranch} (Fabril) e ${distributionBranch} (Distribuição) para criar cenários realistas.
        5.  **Revisão e Verificação:** Revise sua lista de testes, consolide cenários similares em testes mais robustos e verifique se todos os pontos do seu checklist foram cobertos. Adicione testes se encontrar lacunas.
        6.  **Formato Final:** Após a revisão, monte o relatório HTML. Numere os testes sequencialmente, começando em 1. A coluna 'RESULTADO OBTIDO' deve conter '☐ Aprovado<br>☐ Reprovado'.
    `;

    if (isFromScratch) {
        prompt = `
            Você é um Engenheiro de QA sênior especialista em JD Edwards. Sua tarefa é criar um Plano de Testes HTML completo e de alta qualidade a partir do código-fonte de um novo programa.

            **Programa para Análise:** \`${programName}\`
            **Código-fonte completo:**
            \`\`\`c
            ${customCode}
            \`\`\`
            ${baseMethodology}
            **ESTRUTURA DE SAÍDA HTML (Use esta estrutura exata, preenchendo as linhas da tabela):**
            ${assembleFinalReport(programName, {
                source: 'Código-Fonte',
                customLines: customCode.split('\n').length,
                analyzedFunctions: 'N/A'
            }, '<!-- Insira as linhas de teste <tr> aqui, seguindo a metodologia descrita. -->', true)}
        `;
    } else {
        const diffText = createFunctionDiff(vanillaCode, customCode);
        if (!diffText.trim()) {
            return "<p>Nenhuma diferença encontrada entre os dois arquivos.</p>";
        }
        prompt = `
            Você é um Engenheiro de QA sênior especialista em JD Edwards. Sua tarefa é criar um Plano de Testes HTML completo e de alta qualidade a partir de um diff de código.

            **Programa para Análise:** \`${programName}\`
            **Diff do Código:**
            \`\`\`diff
            ${diffText}
            \`\`\`
            ${baseMethodology}
            **ESTRUTURA DE SAÍDA HTML (Use esta estrutura exata, preenchendo as linhas da tabela):**
            ${assembleFinalReport(programName, {
                source: 'Código-Fonte',
                vanillaLines: vanillaCode.split('\n').length,
                customLines: customCode.split('\n').length,
                totalFunctions: 'N/A',
                modifiedFunctions: 'N/A'
            }, '<!-- Insira as linhas de teste <tr> aqui, seguindo a metodologia descrita. -->', false)}
        `;
    }

    const response = await generateChat({
         model: getModel(provider),
         provider,
         prompt,
         systemPrompt: "Sua resposta deve ser um documento HTML completo e válido, baseado estritamente na metodologia fornecida. Garanta cobertura total das mudanças ou funcionalidades do código."
    });
     // Limpa a resposta para garantir que seja apenas HTML
    let reportHtml = response.content;
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
    functionalSpecs: FunctionalSpec[],
    programName: string,
    includeEnhancedAnalysis: boolean,
    manufacturingBranch: string,
    distributionBranch: string,
    module: string,
    provider: string,
    onProgress: (message: string) => void
): Promise<string> {
    provider = (provider || process.env.LLM_PROVIDER || 'openai').toLowerCase();
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
        throw new Error("A variável de ambiente OPENAI_API_KEY não está configurada.");
    }
    if (provider === 'groq' && !process.env.GROQ_API_KEY) {
        throw new Error("A variável de ambiente GROQ_API_KEY não está configurada.");
    }
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY && !process.env.API_KEY) {
        throw new Error("A variável de ambiente GEMINI_API_KEY não está configurada.");
    }
    
    const finalProgramName = programName || "Programa Desconhecido";

    // Prioritize functional spec analysis
    if (functionalSpecs && functionalSpecs.length > 0) {
        return runFunctionalSpecAnalysis(functionalSpecs, finalProgramName, manufacturingBranch, distributionBranch, module, provider, onProgress);
    }

    if (!customCode.trim()) {
        throw new Error("O código-fonte customizado não pode estar vazio para uma análise de código.");
    }

    if (includeEnhancedAnalysis) {
        onProgress('Executando análise detalhada de código...');
        return runMultiStepAnalysis(vanillaCode, customCode, finalProgramName, manufacturingBranch, distributionBranch, provider, onProgress);
    } else {
        onProgress('Executando análise simples de código...');
        return runSimpleAnalysis(vanillaCode, customCode, finalProgramName, manufacturingBranch, distributionBranch, provider);
    }
}
