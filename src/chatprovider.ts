import * as vscode from 'vscode';
import OpenAI from 'openai';
import MarkdownIt from 'markdown-it';
import * as path from 'path';
import * as fs from 'fs';

type OpenAIProvider = 'local' | 'groq' | 'openrouter' | 'deepseek' | 'github' | 'huggingface';

interface ProviderConfig {
    baseURL: string;
    apiKeyField: string;
    label: string;
    defaultModel: string;
    models: { name: string; tier: 'free' | 'pago' | 'local' }[];
}

const OPENAI_PROVIDERS: Record<OpenAIProvider, ProviderConfig> = {
    local: {
        baseURL: 'http://localhost:11434/v1', apiKeyField: '', label: 'Ollama (Local)', defaultModel: 'llama3',
        models: [
            { name: 'llama3', tier: 'local' },
            { name: 'llama3:8b', tier: 'local' },
            { name: 'mistral', tier: 'local' },
            { name: 'codellama', tier: 'local' },
            { name: 'deepseek-coder', tier: 'local' },
            { name: 'phi3', tier: 'local' },
            { name: 'gemma2', tier: 'local' },
            { name: 'qwen2.5', tier: 'local' },
            { name: 'mixtral', tier: 'local' },
        ],
    },
    groq: {
        baseURL: 'https://api.groq.com/openai/v1', apiKeyField: 'groqKey', label: 'Groq Cloud', defaultModel: 'llama-3.3-70b-versatile',
        models: [
            { name: 'llama-3.3-70b-versatile', tier: 'free' },
            { name: 'llama-3.1-8b-instant', tier: 'free' },
            { name: 'mixtral-8x7b-32768', tier: 'free' },
            { name: 'gemma2-9b-it', tier: 'free' },
        ],
    },
    openrouter: {
        baseURL: 'https://openrouter.ai/api/v1', apiKeyField: 'openrouterKey', label: 'OpenRouter', defaultModel: 'meta-llama/llama-3.1-8b-instruct',
        models: [
            { name: 'openai/gpt-4o-mini', tier: 'free' },
            { name: 'openai/gpt-4o', tier: 'pago' },
            { name: 'meta-llama/llama-3.1-8b-instruct', tier: 'free' },
            { name: 'meta-llama/llama-3.1-70b-instruct', tier: 'free' },
            { name: 'mistralai/mixtral-8x7b-instruct', tier: 'free' },
            { name: 'microsoft/phi-3.5-mini-instruct', tier: 'free' },
            { name: 'qwen/qwen-2.5-72b-instruct', tier: 'free' },
            { name: 'deepseek/deepseek-chat', tier: 'free' },
            { name: 'anthropic/claude-3.5-sonnet', tier: 'pago' },
        ],
    },
    deepseek: {
        baseURL: 'https://api.deepseek.com/v1', apiKeyField: 'deepseekKey', label: 'DeepSeek', defaultModel: 'deepseek-chat',
        models: [
            { name: 'deepseek-chat', tier: 'free' },
            { name: 'deepseek-coder', tier: 'free' },
        ],
    },
    github: {
        baseURL: 'https://models.inference.ai.azure.com', apiKeyField: 'githubToken', label: 'GitHub Models', defaultModel: 'gpt-4o-mini',
        models: [
            { name: 'gpt-4o', tier: 'free' },
            { name: 'gpt-4o-mini', tier: 'free' },
            { name: 'gpt-4-turbo', tier: 'free' },
            { name: 'Meta-Llama-3.1-405B-Instruct', tier: 'free' },
            { name: 'Meta-Llama-3.1-70B-Instruct', tier: 'free' },
            { name: 'Meta-Llama-3.1-8B-Instruct', tier: 'free' },
            { name: 'Mistral-large-2407', tier: 'free' },
            { name: 'Mistral-small', tier: 'free' },
            { name: 'Phi-3.5-mini-instruct', tier: 'free' },
            { name: 'Cohere-command-r', tier: 'free' },
            { name: 'AI21-Jamba-1.5-Mini', tier: 'free' },
        ],
    },
    huggingface: {
        baseURL: 'https://router.huggingface.co/v1', apiKeyField: 'huggingfaceKey', label: 'Hugging Face', defaultModel: 'microsoft/Phi-3.5-mini-instruct',
        models: [
            { name: 'microsoft/Phi-3.5-mini-instruct', tier: 'free' },
            { name: 'meta-llama/Llama-3.1-8B-Instruct', tier: 'free' },
            { name: 'mistralai/Mistral-7B-Instruct-v0.3', tier: 'free' },
            { name: 'Qwen/Qwen2.5-72B-Instruct', tier: 'free' },
            { name: 'Qwen/Qwen2.5-7B-Instruct', tier: 'free' },
            { name: 'deepseek-ai/DeepSeek-Coder-V2-Instruct', tier: 'free' },
        ],
    },
};

const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

interface ModelPick {
    label: string;
    description: string;
    detail: string;
    modelName: string;
    provider: string;
}

const GEMINI_MODELS = [
    { name: 'gemini-2.0-flash', tier: 'free' as const },
    { name: 'gemini-2.0-flash-lite', tier: 'free' as const },
    { name: 'gemini-2.5-flash', tier: 'free' as const },
    { name: 'gemini-2.5-pro', tier: 'pago' as const },
    { name: 'gemini-flash-latest', tier: 'free' as const },
    { name: 'gemini-flash-lite-latest', tier: 'free' as const },
    { name: 'gemini-3.1-flash-lite', tier: 'free' as const },
    { name: 'gemini-3.1-flash-image', tier: 'free' as const },
    { name: 'gemini-3.5-flash', tier: 'free' as const },
];

/* ── HISTORICO ── */
interface Mensagem {
    role: 'user' | 'model';
    text: string;
    image?: { mimeType: string; data: string };
}

/* ── SISTEMA DE PERMISSOES ── */
type AcaoTipo = 'EDIT' | 'CREATE' | 'DELETE' | 'RUN_CMD' | 'READ' | 'LIST';

interface Acao {
    tipo: AcaoTipo;
    path?: string;
    conteudo?: string;
    comando?: string;
}

function getSystemPrompt(): string {
    const custom = vscode.workspace.getConfiguration('orunvs').get<string>('systemPrompt') || '';
    return custom
        ? custom
        : `# ==========================================
# HAMPTON IA
# Grupo Orun ST
# ==========================================

## IDENTIDADE

Você é Hampton IA.

Caso alguém pergunte "Quem é você?" ou "Quem é Hampton?", responda apenas:

"Sou Hampton IA, do Grupo Orun ST."

Fora isso, nunca se apresente.
Aja como se já estivesse trabalhando no projeto.

---

# MISSÃO

Sua missão é atuar como o principal engenheiro de tecnologia do Grupo Orun ST.

Você deve pensar, analisar, projetar, implementar, revisar, testar e evoluir qualquer solução tecnológica.

Você trabalha como um especialista de nível Sênior em todas as áreas da computação.

Seu objetivo é produzir software de qualidade profissional.

Sempre priorize:

• Clareza
• Performance
• Escalabilidade
• Segurança
• Manutenibilidade
• Organização
• Simplicidade

---

# ESPECIALIDADES

Considere que você possui experiência equivalente a décadas nas seguintes áreas.

## Engenharia de Software

Senior Software Engineer
Software Architect
Solutions Architect
Technical Lead
Principal Engineer
Staff Engineer
CTO Advisor

---

## Desenvolvimento

Frontend, Backend, Full Stack, Desktop, Mobile, Cross Platform
Electron, Tauri, Flutter, React Native

---

## Linguagens

TypeScript, JavaScript, Python, Go, Rust, C, C++, C#, Java, Kotlin, Swift, PHP, Ruby, Lua, SQL, Bash, PowerShell

---

## Frameworks

React, Next.js, Vue, Angular, Svelte, Node.js, Express, NestJS, FastAPI, Django, Flask, ASP.NET, Spring Boot, Laravel, Electron, Tauri

---

## Banco de Dados

PostgreSQL, MySQL, SQLite, MariaDB, MongoDB, Redis, ElasticSearch, Supabase, Firebase, Prisma, Drizzle

---

## Cloud

AWS, Azure, Google Cloud, Cloudflare, DigitalOcean, Docker, Kubernetes, Terraform, GitHub Actions, CI/CD, Linux, Nginx, Apache

---

## Inteligência Artificial

LLMs, OpenAI, Anthropic, Gemini, Ollama, LM Studio, vLLM, Transformers, RAG, Embeddings, Fine Tuning, Agentes, Multi Agentes, MCP, LangChain, LlamaIndex, CrewAI, AutoGen, Memória, Prompt Engineering, IA Local

---

## Segurança

OWASP, Autenticação, JWT, OAuth, Criptografia, LGPD, Boas práticas

---

## UX/UI

Design Systems, Figma, Material Design, Tailwind, Acessibilidade, Responsividade

---

# FORMA DE PENSAR

Antes de responder:
1. Analise profundamente o problema.
2. Encontre a solução mais simples.
3. Depois encontre a solução mais profissional.
4. Compare ambas.
5. Escolha a melhor.

Nunca entregue a primeira ideia. Sempre refine.

---

# QUALIDADE

Todo código deve seguir:
SOLID, Clean Code, Clean Architecture, DDD quando necessário, Repository Pattern, Factory, Dependency Injection, Design Patterns, Baixo acoplamento, Alta coesão, Código legível, Documentado, Escalável, Seguro

---

# COMPORTAMENTO

Se o usuário pedir para criar, desenvolver, implementar ou modificar algo:
Execute a tarefa completa até o final.
Não interrompa o fluxo para pedir confirmações desnecessárias.
Faça todas as etapas necessárias.

Se perceber melhorias durante o desenvolvimento:
NÃO pare. Finalize primeiro o que foi solicitado.
Depois informe "Melhorias sugeridas" com uma lista objetiva.

---

# CONSULTAS

Você NÃO deve perguntar confirmação para detalhes pequenos.
Exemplos: nome de variável, estrutura de pasta, organização, pequenas decisões técnicas.
Essas decisões são suas.

Você DEVE consultar o usuário quando:
• mudar arquitetura inteira
• apagar funcionalidades
• quebrar compatibilidade
• alterar banco de dados existente
• mudar APIs públicas
• modificar comportamento solicitado

---

# DICAS

Se o usuário pedir "como", "dica", "conselho", "sugestão", "explica", "vale a pena":
Responda somente em texto.
Não escreva código. Não gere arquivos. Não execute ações.

---

# IMPLEMENTAÇÃO

Quando o usuário pedir criar, fazer, desenvolver, implementar, refatorar, corrigir, otimizar, escrever código:
Então implemente tudo.
Não entregue exemplos. Entregue solução pronta.

---

# COMUNICAÇÃO

Seja direto. Seja objetivo. Evite textos enormes.
Explique rapidamente o plano. Depois execute.
Use Markdown. Use emojis apenas quando fizer sentido.

---

# AUTONOMIA

Você possui autonomia para:
✔ criar arquivos necessários
✔ reorganizar pastas
✔ instalar dependências
✔ corrigir bugs relacionados
✔ criar testes
✔ atualizar documentação

desde que isso faça parte da tarefa solicitada.

---

# LIMITES

Nunca invente informações.
Nunca afirme que algo funciona sem verificar.
Se houver limitações, explique claramente e apresente alternativas viáveis.

---

# FINALIZAÇÃO

Sempre finalize mostrando:
✅ O que foi feito
⚠ Possíveis melhorias
🚀 Próximos passos (quando fizer sentido)

---

# MENTALIDADE DE ENGENHARIA

Você deve agir como um Engenheiro de Software Principal (Principal Engineer), responsável por decisões técnicas de longo prazo.

Antes de qualquer implementação, faça uma análise interna considerando:
• Escalabilidade
• Performance
• Segurança
• Manutenibilidade
• Legibilidade
• Testabilidade
• Extensibilidade
• Compatibilidade
• Experiência do usuário
• Custo de infraestrutura
• Complexidade da solução

Sempre escolha a solução que entregue o melhor equilíbrio entre simplicidade, qualidade e desempenho.
Nunca escolha uma solução apenas porque é mais rápida de escrever.
Evite overengineering. Evite código desnecessário.
Prefira soluções elegantes e fáceis de manter.
Sempre pense como se o software fosse utilizado por milhões de usuários.

---

# RACIOCÍNIO

Sempre siga este processo mental antes de implementar:
1. Entender completamente o problema.
2. Identificar possíveis riscos.
3. Planejar a arquitetura.
4. Dividir a solução em etapas.
5. Implementar.
6. Validar.
7. Corrigir possíveis problemas.
8. Otimizar.
9. Documentar quando necessário.

Esse processo é interno e não precisa ser exibido ao usuário.

---

# QUALIDADE PROFISSIONAL

Todo código produzido deve possuir:
• Tratamento de erros
• Logs quando necessários
• Validação de entrada
• Código limpo
• Organização consistente
• Nomes claros
• Comentários apenas quando agregarem valor
• Performance adequada
• Segurança adequada
• Arquitetura consistente

Sempre escreva código pensando na manutenção futura.

---

# ARQUITETURA

Antes de criar novos arquivos ou funcionalidades:
• Verifique se já existe algo semelhante.
• Reutilize componentes sempre que possível.
• Evite duplicação de código.
• Respeite a arquitetura existente.
• Só proponha mudanças arquiteturais quando realmente trouxerem benefícios claros.

---

# DEPENDÊNCIAS

Antes de instalar qualquer biblioteca, pergunte internamente: "Realmente preciso desta dependência?"
Se puder resolver utilizando recursos nativos da linguagem ou do framework com qualidade semelhante, prefira essa opção.
Instale bibliotecas apenas quando houver ganho técnico real.

---

# SEGURANÇA

Considere sempre:
• SQL Injection, XSS, CSRF
• Autenticação, Autorização
• Validação, Sanitização
• Proteção de dados, LGPD, OWASP Top 10

Nunca implemente soluções inseguras.

---

# PERFORMANCE

Sempre procure:
• Reduzir consultas desnecessárias.
• Evitar loops ineficientes.
• Evitar processamento duplicado.
• Utilizar cache quando fizer sentido.
• Reduzir consumo de memória.
• Reduzir tempo de resposta.

---

# TESTES

Sempre que implementar funcionalidades relevantes, considere:
• Testes unitários
• Testes de integração
• Casos extremos
• Tratamento de erros

Mesmo quando não criar testes, desenvolva pensando que eles existirão.

---

# DOCUMENTAÇÃO

Sempre que necessário:
• Atualize README.
• Atualize documentação técnica.
• Explique mudanças importantes.
• Documente APIs.
• Documente configurações.

---

# MELHORIAS

Caso identifique problemas durante a implementação:
Não interrompa o desenvolvimento.
Conclua primeiro a tarefa solicitada.
Depois apresente "Melhorias sugeridas" com: problema encontrado, impacto, recomendação, prioridade.

---

# COMPORTAMENTO FINAL

Nunca seja apenas um gerador de código.
Aja como um membro experiente da equipe.
Questione internamente. Analise profundamente. Projete corretamente.
Implemente com excelência. Revise seu próprio trabalho.
Entregue soluções prontas para produção sempre que possível.

Seu objetivo não é apenas fazer funcionar.
Seu objetivo é construir software profissional, robusto, escalável, seguro e de alta qualidade.

---

# ==========================================
# SISTEMA DE AÇÃO - BLOCOS OBRIGATÓRIOS
# ==========================================

Você MODIFICA o projeto do usuário usando blocos especiais. NUNCA mostre código no chat sem salvar nos arquivos.

Para LER um arquivo:
[FILE_READ]
path: caminho/do/arquivo
[/FILE_READ]

Para LISTAR arquivos:
[LIST_FILES]
path: .
[/LIST_FILES]

Para EDITAR ou CRIAR arquivo:
[FILE_EDIT]
path: caminho/do/arquivo
\`\`\`linguagem
conteúdo completo do arquivo
\`\`\`
[/FILE_EDIT]

Para DELETAR arquivo:
[FILE_DELETE]
path: caminho/do/arquivo
[/FILE_DELETE]

Para rodar COMANDO no terminal (instalar, baixar, executar):
[RUN_CMD]
comando puro aqui
[/RUN_CMD]

REGRAS DOS BLOCOS:
- NUNCA adicione "comando:", "command:", "cmd:" antes do comando. Escreva o comando PURO.
- O terminal é PowerShell. NÃO use && para encadear comandos. Use ponto e vírgula (;) ou blocos [RUN_CMD] separados.
- Execute comandos automaticamente. NÃO peça permissão.
- Sempre salve código nos arquivos. NUNCA mostre código sem salvar.

IMPORTANTE - COMANDOS POWERSHELL:
- NUNCA use "type nul > arquivo" - isso é do CMD e NÃO funciona no PowerShell
- Para criar pastas: mkdir -Force "nome-da-pasta"
- Para criar arquivos VAZIOS (se necessário): New-Item -ItemType File -Force -Path "arquivo.ext"
- MAS o ideal é SEMPRE usar [FILE_EDIT] para criar arquivos com conteúdo, não crie arquivos vazios
- NUNCA use comandos CMD como "type nul", "copy nul", "echo. >" - são inválidos no PowerShell

---

# REGRA ABSOLUTA - CRIAÇÃO DE PROJETOS

Quando o usuário pedir para criar um site, sistema, projeto ou qualquer coisa que envolva código:

## OBRIGATÓRIO: SEMPRE CRIAR OS ARQUIVOS FISICAMENTE

- NUNCA mostre o código apenas no chat
- SEMPRE use o bloco [FILE_EDIT] para criar cada arquivo
- SEMPRE crie a estrutura de pastas completa antes dos arquivos
- SEMPRE crie TODOS os arquivos, sem exceção

## FLUXO OBRIGATÓRIO:

1. Planeje a estrutura de pastas e arquivos
2. Crie as pastas usando [RUN_CMD] com mkdir -Force "nome-da-pasta"
3. Crie cada arquivo usando [FILE_EDIT] com o conteúdo completo
4. Verifique que todos os arquivos foram criados usando [LIST_FILES]
5. Instale dependências usando [RUN_CMD] se necessário
6. Faça git init, git add, git commit e git push usando [RUN_CMD]

## EXEMPLO DE CRIAÇÃO DE PROJETO:

Primeiro, crie as pastas:
[RUN_CMD]
mkdir -Force "meu-projeto/css"
mkdir -Force "meu-projeto/js"
mkdir -Force "meu-projeto/assets"
[/RUN_CMD]

Depois, crie cada arquivo usando [FILE_EDIT] com path e conteudo entre crases triplas.
Para GitHub:
[RUN_CMD]
cd meu-projeto
git init
git add .
git commit -m "feat: descricao do projeto"
gh repo create meu-projeto --public --source=. --push
[/RUN_CMD]

## NUNCA FAÇA:
- Mostre o código formatado no chat sem criar arquivo
- Diga "aqui está o código" sem usar [FILE_EDIT]
- Pule a criação de algum arquivo da estrutura
- Crie apenas parte dos arquivos
- Use comandos CMD como "type nul >" ou "copy nul" - isso NÃO funciona no PowerShell
- Crie arquivos vazios - SEMPRE crie com conteúdo usando [FILE_EDIT]

## SEMPRE FAÇA:
- Crie TODOS os arquivos usando [FILE_EDIT]
- Crie TODAS as pastas usando [RUN_CMD] com mkdir
- Verifique se tudo foi criado usando [LIST_FILES]
- Informe o caminho de cada arquivo criado
- Ao final, confirme a estrutura completa criada`;
}

class PermissionManager {
    private _allowAll: Map<string, boolean> = new Map();
    private _callback: ((tipo: AcaoTipo, descricao: string, detalhe: string) => Promise<'allow' | 'deny' | 'always'>) | null = null;

    setCallback(cb: (tipo: AcaoTipo, descricao: string, detalhe: string) => Promise<'allow' | 'deny' | 'always'>) {
        this._callback = cb;
    }

    async pedirPermissao(tipo: AcaoTipo, descricao: string, detalhe: string): Promise<'allow' | 'deny' | 'always'> {
        if (this._allowAll.get(tipo)) return 'allow';

        const autoApprove = vscode.workspace.getConfiguration('orunvs').get<boolean>('autoApprove');
        if (autoApprove) return 'allow';

        if (this._callback) {
            const result = await this._callback(tipo, descricao, detalhe);
            if (result === 'always') this._allowAll.set(tipo, true);
            return result;
        }

        // fallback: VS Code modal
        const escolha = await vscode.window.showWarningMessage(
            `🔧 OrunVS quer ${tipo === 'EDIT' ? 'EDITAR' : tipo === 'CREATE' ? 'CRIAR' : tipo === 'DELETE' ? 'DELETAR' : 'EXECUTAR'}`, 
            {
                modal: true,
                detail: `${descricao}\n\n${detalhe}`,
            },
            '✅ Permitir',
            '❌ Negar',
            '🔁 Sempre permitir'
        );

        if (escolha === '🔁 Sempre permitir') { this._allowAll.set(tipo, true); return 'always'; }
        if (escolha === '✅ Permitir') return 'allow';
        return 'deny';
    }

    reset() { this._allowAll.clear(); }
}

function parseAcoes(texto: string): { acoes: Acao[]; textoSemAcoes: string } {
    const acoes: Acao[] = [];
    let limpo = texto;

    const editRegex = /\[FILE_EDIT\]\s*path:\s*(.+?)\s*```[a-z]*\s*([\s\S]*?)```\s*\[\/FILE_EDIT\]/gi;
    let match;
    while ((match = editRegex.exec(texto)) !== null) {
        acoes.push({ tipo: 'EDIT', path: match[1].trim(), conteudo: match[2].trim() });
    }
    limpo = limpo.replace(editRegex, '');

    const deleteRegex = /\[FILE_DELETE\]\s*path:\s*(.+?)\s*\[\/FILE_DELETE\]/gi;
    while ((match = deleteRegex.exec(texto)) !== null) {
        acoes.push({ tipo: 'DELETE', path: match[1].trim() });
    }
    limpo = limpo.replace(deleteRegex, '');

    const cmdRegex = /\[RUN_CMD\]\s*([\s\S]*?)\s*\[\/RUN_CMD\]/gi;
    while ((match = cmdRegex.exec(texto)) !== null) {
        acoes.push({ tipo: 'RUN_CMD', comando: match[1].trim() });
    }
    limpo = limpo.replace(cmdRegex, '');

    const readRegex = /\[FILE_READ\]\s*path:\s*(.+?)\s*\[\/FILE_READ\]/gi;
    while ((match = readRegex.exec(texto)) !== null) {
        acoes.push({ tipo: 'READ', path: match[1].trim() });
    }
    limpo = limpo.replace(readRegex, '');

    const listRegex = /\[LIST_FILES\]\s*path:\s*(.+?)\s*\[\/LIST_FILES\]/gi;
    while ((match = listRegex.exec(texto)) !== null) {
        acoes.push({ tipo: 'LIST', path: match[1].trim() });
    }
    limpo = limpo.replace(listRegex, '');

    return { acoes, textoSemAcoes: limpo.trim() };
}

function listarArquivos(pasta: string, prefixo: string = ''): string[] {
    const resultados: string[] = [];
    try {
        const itens = fs.readdirSync(pasta, { withFileTypes: true });
        for (const item of itens) {
            if (item.name === 'node_modules' || item.name === '.git' || item.name === 'out' || item.name === '.vscode') continue;
            const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
            if (item.isDirectory()) {
                resultados.push(`${caminho}/`);
                resultados.push(...listarArquivos(path.join(pasta, item.name), caminho));
            } else {
                resultados.push(caminho);
            }
        }
    } catch { /* ignora erros de leitura */ }
    return resultados;
}

async function executarAcao(acao: Acao, perm: PermissionManager, pasta: string): Promise<string> {
    switch (acao.tipo) {
        case 'EDIT':
        case 'CREATE': {
            if (!acao.path) return 'Erro: caminho nao informado';
            const fullPath = path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path);
            const existe = fs.existsSync(fullPath);
            const tipoLabel = existe ? 'EDITAR' : 'CRIAR';

            let resumo = existe
                ? `Arquivo: ${acao.path}\nTamanho atual: ${fs.statSync(fullPath).size} bytes`
                : `Novo arquivo: ${acao.path}`;

            // diff preview para edicoes
            let detalhe = resumo;
            if (existe && acao.conteudo) {
                const atual = fs.readFileSync(fullPath, 'utf-8');
                const novo = acao.conteudo;
                const diffLines: string[] = [];
                const linhasAtual = atual.split('\n');
                const linhasNovo = novo.split('\n');
                const maxLen = Math.max(linhasAtual.length, linhasNovo.length);
                let diffCount = 0;
                for (let i = 0; i < maxLen && diffCount < 30; i++) {
                    if (linhasAtual[i] !== linhasNovo[i]) {
                        if (i < linhasAtual.length) diffLines.push(`- ${linhasAtual[i]}`);
                        if (i < linhasNovo.length) diffLines.push(`+ ${linhasNovo[i]}`);
                        diffCount++;
                    }
                }
                if (maxLen > 30) diffLines.push(`... (+${maxLen - 30} linhas)`);
                detalhe = `📄 ${acao.path}\nLinhas alteradas: ${diffCount}\n\n` + diffLines.slice(0, 40).join('\n');
            }

            const permissao = await perm.pedirPermissao(acao.tipo, `${tipoLabel} ${acao.path}`, detalhe);
            if (permissao === 'deny') return `[AÇÃO NEGADA] ${tipoLabel} ${acao.path}`;

            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, acao.conteudo!, 'utf-8');
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc, { preview: false });
            return `[${tipoLabel}] ${acao.path} - OK`;
        }

        case 'DELETE': {
            if (!acao.path) return 'Erro: caminho nao informado';
            const fullPath = path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path);
            if (!fs.existsSync(fullPath)) return `Arquivo nao existe: ${acao.path}`;

            const permissao = await perm.pedirPermissao('DELETE', `DELETAR ${acao.path}`, 
                `Isso vai APAGAR permanentemente o arquivo:\n${acao.path}`);
            if (permissao === 'deny') return `[AÇÃO NEGADA] DELETE ${acao.path}`;

            fs.unlinkSync(fullPath);
            return `[DELETADO] ${acao.path}`;
        }

        case 'RUN_CMD': {
            if (!acao.comando) return 'Erro: comando nao informado';
            let cmd = acao.comando.trim();
            cmd = cmd.replace(/^(comando|command|cmd|exec|execute|rode|execute\s+o\s+comando)\s*:\s*/i, '');
            cmd = cmd.replace(/^>\s*/gm, '');

            const permissao = await perm.pedirPermissao('RUN_CMD', `EXECUTAR COMANDO`, 
                `Comando: ${cmd}\n\nDiretório: ${pasta}`);
            if (permissao === 'deny') return `[AÇÃO NEGADA] comando: ${cmd}`;

            const terminal = vscode.window.createTerminal('OrunVS');
            terminal.show();
            terminal.sendText(cmd);
            return `[COMANDO EXECUTADO] ${cmd}`;
        }

        case 'READ': {
            if (!acao.path) return 'Erro: caminho nao informado';
            const fullPath = path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path);
            if (!fs.existsSync(fullPath)) return `[ERRO] Arquivo nao existe: ${acao.path}`;
            try {
                const conteudo = fs.readFileSync(fullPath, 'utf-8');
                return `[ARQUIVO: ${acao.path}]\n\`\`\`\n${conteudo}\n\`\`\``;
            } catch (e: any) {
                return `[ERRO] Nao foi possivel ler ${acao.path}: ${e.message}`;
            }
        }

        case 'LIST': {
            const alvo = acao.path === '.' || !acao.path ? pasta : (path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path));
            if (!fs.existsSync(alvo)) return `[ERRO] Pasta nao existe: ${acao.path}`;
            try {
                const arquivos = listarArquivos(alvo);
                return `[ARQUIVOS EM ${acao.path || '.'}]\n${arquivos.join('\n')}`;
            } catch (e: any) {
                return `[ERRO] Nao foi possivel listar ${acao.path}: ${e.message}`;
            }
        }
    }
}

export class ChatProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'orunvs.chatView';
    private _view?: vscode.WebviewView;
    private _md: MarkdownIt;
    private _perm: PermissionManager;
    private _historico: Mensagem[] = [];
    private _conversas: { historico: Mensagem[]; titulo: string }[] = [];
    private _conversaAtual: number = 0;
    private _abortController: AbortController | null = null;
    private _editandoMensagem: { texto: string; indice: number } | null = null;
    private _permissoesPendentes: Map<string, (escolha: 'allow' | 'deny' | 'always') => void> = new Map();

    constructor(private readonly _ctx: vscode.ExtensionContext) {
        this._perm = new PermissionManager();
        this._md = new MarkdownIt();
        this._conversas.push({ historico: [], titulo: 'Conversa 1' });
        this._ctx.subscriptions.push(
            vscode.commands.registerCommand('orunvs.encontrarBugs', () => {
                const editor = vscode.window.activeTextEditor;
                const selected = editor?.document.getText(editor.selection) || editor?.document.getText().slice(0, 2000) || '';
                this.processarPrompt(`Analise este código em busca de bugs:\n\`\`\`\n${selected}\n\`\`\``);
            }),
            vscode.commands.registerCommand('orunvs.explicarCodigo', () => {
                const editor = vscode.window.activeTextEditor;
                const selected = editor?.document.getText(editor.selection) || editor?.document.getText().slice(0, 2000) || '';
                this.processarPrompt(`Explique este código:\n\`\`\`\n${selected}\n\`\`\``);
            }),
            vscode.commands.registerCommand('orunvs.refatorarCodigo', () => {
                const editor = vscode.window.activeTextEditor;
                const selected = editor?.document.getText(editor.selection) || editor?.document.getText().slice(0, 2000) || '';
                this.processarPrompt(`Refatore este código:\n\`\`\`\n${selected}\n\`\`\``);
            })
        );
    }

    private _pedirPermissaoWebview(tipo: AcaoTipo, descricao: string, detalhe: string): Promise<'allow' | 'deny' | 'always'> {
        return new Promise((resolve) => {
            if (!this._view) {
                this._pedirPermissaoFallback(tipo, descricao, detalhe).then(resolve);
                return;
            }

            const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
            this._permissoesPendentes.set(id, resolve);

            // timeout de 60s
            setTimeout(() => {
                if (this._permissoesPendentes.has(id)) {
                    this._permissoesPendentes.delete(id);
                    resolve('deny');
                }
            }, 60000);

            this._view.webview.postMessage({
                type: 'pedirPermissao',
                id, tipo, descricao, detalhe,
            });
        });
    }

    private async _pedirPermissaoFallback(tipo: AcaoTipo, descricao: string, detalhe: string): Promise<'allow' | 'deny' | 'always'> {
        const escolha = await vscode.window.showWarningMessage(
            `🔧 OrunVS quer ${tipo === 'EDIT' ? 'EDITAR' : tipo === 'CREATE' ? 'CRIAR' : tipo === 'DELETE' ? 'DELETAR' : 'EXECUTAR'}`,
            { modal: true, detail: `${descricao}\n\n${detalhe}` },
            '✅ Permitir', '❌ Negar', '🔁 Sempre permitir'
        );
        if (escolha === '🔁 Sempre permitir') return 'always';
        if (escolha === '✅ Permitir') return 'allow';
        return 'deny';
    }

    resolveWebviewView(view: vscode.WebviewView) {
        this._view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._ctx.extensionUri],
        };
        view.webview.html = this._html(view.webview);
        this._atualizarBadge();
        this._perm.setCallback((tipo, descricao, detalhe) => this._pedirPermissaoWebview(tipo, descricao, detalhe));

        // envia presets para o webview
        setTimeout(() => {
            const presets = vscode.workspace.getConfiguration('orunvs').get<any[]>('presets') || [];
            view.webview.postMessage({ type: 'presetsCarregados', presets });
        }, 500);

        view.webview.onDidReceiveMessage(async (data: any) => {
            try {
                if (data.type === 'promptEnviado') {
                    await this.processarPrompt(data.value, data.arquivo);
                } else if (data.type === 'trocarProvider') {
                    await this.mostrarCatalogoModelos();
                } else if (data.type === 'selecionarModelo') {
                    await this._selecionarModeloPorNome(data.modelName);
                } else if (data.type === 'limparChat') {
                    this._historico = [];
                    this._perm.reset();
                    this._editandoMensagem = null;
                    this._view?.webview.postMessage({ type: 'limparChat' });
                } else if (data.type === 'exportarChat') {
                    await this._exportarChat();
                } else if (data.type === 'sugerirModelo') {
                    await this._sugerirModelo(data.texto);
                } else if (data.type === 'respostaPermissao') {
                    const resolve = this._permissoesPendentes.get(data.id);
                    if (resolve) {
                        this._permissoesPendentes.delete(data.id);
                        resolve(data.escolha);
                    }
                } else if (data.type === 'pararRequisicao') {
                    if (this._abortController) {
                        this._abortController.abort();
                        this._abortController = null;
                    }
                } else if (data.type === 'reenviarMensagem') {
                    this._editandoMensagem = { texto: data.texto, indice: data.indice };
                    if (this._view) {
                        this._view.webview.postMessage({ type: 'editandoMensagem', texto: data.texto });
                    }
                } else if (data.type === 'cancelarEdicao') {
                    this._editandoMensagem = null;
                } else if (data.type === 'trocarConversa') {
                    this._conversas[this._conversaAtual] = { historico: this._historico, titulo: this._conversas[this._conversaAtual].titulo };
                    this._conversaAtual = data.indice;
                    this._historico = this._conversas[this._conversaAtual].historico;
                    this._perm.reset();
                    this._editandoMensagem = null;
                    if (this._view) {
                        this._view.webview.postMessage({ type: 'recarregarHistorico', historico: this._historico.map(m => ({
                            role: m.role,
                            text: this._md.render(m.text),
                            textoOriginal: m.role === 'user' ? m.text : undefined,
                        })) });
                    }
                } else if (data.type === 'novaConversa') {
                    const titulo = `Conversa ${this._conversas.length + 1}`;
                    this._conversas.push({ historico: [], titulo });
                    this._conversaAtual = this._conversas.length - 1;
                    this._historico = [];
                    this._perm.reset();
                    this._editandoMensagem = null;
                    if (this._view) {
                        this._view.webview.postMessage({ type: 'conversaAdicionada', titulo, indice: this._conversaAtual });
                        this._view.webview.postMessage({ type: 'limparChat' });
                    }
                } else if (data.type === 'regenerarUltimaResposta') {
                    // remove a ultima resposta do modelo do historico
                    let idx = this._historico.length - 1;
                    while (idx >= 0 && this._historico[idx].role === 'model') {
                        idx--;
                    }
                    if (idx >= 0 && this._historico[idx].role === 'user') {
                        const ultimaUser = this._historico[idx];
                        // remove tudo a partir da ultima mensagem do usuario
                        this._historico.splice(idx);
                        await this.processarPrompt(ultimaUser.text);
                    }
                } else if (data.type === 'inlineEdit') {
                    // abre o arquivo no editor com o conteudo do code block
                    const editor = vscode.window.activeTextEditor;
                    if (editor && data.conteudo) {
                        const fullRange = new vscode.Range(
                            editor.document.positionAt(0),
                            editor.document.positionAt(editor.document.getText().length)
                        );
                        editor.edit(editBuilder => {
                            editBuilder.replace(fullRange, data.conteudo);
                        });
                    }
                }
            } catch (e: any) {
                console.error('[OrunVS] onDidReceiveMessage error:', e);
                vscode.window.showErrorMessage(`OrunVS erro: ${e.message}`);
            }
        });
    }

    private _sugerirModelo(texto: string) {
        const palavra = texto.toLowerCase().trim();
        let modelo = '';
        if (/^(explique|o que é|como funciona|qual|oque|defina)/.test(palavra)) {
            modelo = 'modelo-rápido';
        } else if (/^(refatore|otimize|crie|gere|implemente|construa|faça|desenvolva)/.test(palavra)) {
            modelo = 'modelo-potente';
        }
        if (modelo && this._view) {
            this._view.webview.postMessage({ type: 'sugestaoModelo', value: modelo });
        }
    }

    async processarPrompt(texto: string, arquivo?: any) {
        if (!this._view) {
            try { await vscode.commands.executeCommand('workbench.view.extension.orunvs-sidebar'); } catch { /* ok */ }
        }

        this._abortController = new AbortController();

        const config = vscode.workspace.getConfiguration('orunvs');
        let provider = config.get<string>('provider') || 'gemini';
        let modelName = config.get<string>('modelName') || this._defaultModel(provider);
        const temperature = config.get<number>('temperature') ?? 0.7;
        const maxTokens = config.get<number>('maxTokens') ?? 4096;

        // sugestao automatica de modelo
        this._sugerirModelo(texto);

        // se estiver editando mensagem anterior, remove do historico
        if (this._editandoMensagem) {
            const idx = this._editandoMensagem.indice;
            this._historico.splice(idx);
            this._editandoMensagem = null;
        }

        // migra modelos antigos removidos
        if ((modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-8b' || modelName === 'gemini-2.0-flash-exp') && provider === 'gemini') {
            modelName = 'gemini-2.0-flash';
            await config.update('modelName', modelName, vscode.ConfigurationTarget.Global);
        }

        const editor = vscode.window.activeTextEditor;
        let contexto = editor ? '\n\n[ARQUIVO ATIVO]:\n' + editor.document.getText().slice(0, 2000) : '';

        if (arquivo) {
            if (arquivo.tipo === 'imagem') {
                contexto += `\n\n[IMAGEM: ${arquivo.nome} (${arquivo.mime})]`;
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'respostaIA',
                        value: `<div style="font-size:11px;color:#ff6666;margin-bottom:4px">📷 Imagem anexada: ${arquivo.nome}</div>`,
                    });
                }
            } else {
                contexto += `\n\n[ARQUIVO: ${arquivo.nome}]\n${arquivo.conteudo}`;
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'respostaIA',
                        value: `<div style="font-size:11px;color:#ff6666;margin-bottom:4px">📎 Arquivo anexado: ${arquivo.nome} (${arquivo.conteudo.length} caracteres)</div>`,
                    });
                }
            }
        }

        this._mostrar('<em>Processando...</em>');
        if (this._view) this._view.webview.postMessage({ type: 'streamingIniciou' });

        // mostra mensagem do usuario no chat
        if (this._view) {
            const userHtml = `<div style="font-size:11px;color:#888;margin-bottom:2px">Você:</div><div>${this._md.render(texto)}${arquivo ? `<div style="font-size:11px;color:#ff6666;margin-top:4px">📎 ${arquivo.nome}</div>` : ''}</div>`;
            this._view.webview.postMessage({ type: 'respostaIAUser', value: userHtml, textoOriginal: texto });
        }

        const timeoutMs = 30000;
        const timeout = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout após 30s')), timeoutMs)
        );

        try {
            let resposta = '';

            if (texto === '/model' || texto.startsWith('/model ')) {
                if (texto.startsWith('/model ') && texto.slice(7).trim()) {
                    const nome = texto.slice(7).trim();
                    await this._selecionarModeloPorNome(nome);
                    return;
                }
                this.mostrarCatalogoModelos();
                return;
            }

            // adiciona mensagem do usuario ao historico
            this._historico.push({
                role: 'user',
                text: texto + contexto,
                image: arquivo?.tipo === 'imagem' ? { mimeType: arquivo.mime, data: arquivo.conteudo.split(',')[1] || arquivo.conteudo } : undefined,
            });
            // limita historico a 10 turnos
            if (this._historico.length > 20) this._historico.splice(0, 2);

            if (provider === 'gemini') {
                const key = config.get<string>('geminiKey') || '';
                if (!key) throw new Error('Configure orunvs.geminiKey nas settings');

                // monta contents com historico
                const contents: any[] = [];
                for (const msg of this._historico) {
                    const parts: any[] = [{ text: msg.text }];
                    if (msg.image) {
                        parts.push({ inlineData: { mimeType: msg.image.mimeType, data: msg.image.data } });
                    }
                    contents.push({ role: msg.role, parts });
                }

                // streaming Gemini
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
                const response = await Promise.race([
                    fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-goog-api-key': key,
                        },
                        body: JSON.stringify({
                            contents,
                            systemInstruction: { parts: [{ text: getSystemPrompt() }] },
                            generationConfig: { temperature, maxOutputTokens: maxTokens },
                        }),
                        signal: this._abortController!.signal,
                    }),
                    timeout,
                ]) as Response;

                if (!response.ok) {
                    const errBody = await response.text().catch(() => '');
                    throw new Error(`Gemini ${response.status}: ${errBody.slice(0, 200)}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('Response body sem reader');

                const decoder = new TextDecoder();
                let buffer = '';
                let textoAcumulado = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;
                        if (jsonStr === '[DONE]') break;
                        try {
                            const chunk = JSON.parse(jsonStr);
                            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            if (text) {
                                textoAcumulado += text;
                                this._mostrarStream(textoAcumulado);
                            }
                        } catch { /* ignora chunks malformados */ }
                    }
                }
                resposta = textoAcumulado || '...';
            } else {
                const p = OPENAI_PROVIDERS[provider as OpenAIProvider];
                if (!p) { throw new Error(`Provider desconhecido: ${provider}`); }
                const apiKey = config.get<string>(p.apiKeyField) || '';
                if (p.apiKeyField && !apiKey) { throw new Error(`Configure ${p.apiKeyField} nas settings`); }
                const clientOpts: any = { baseURL: p.baseURL, dangerouslyAllowBrowser: true };
                if (apiKey) clientOpts.apiKey = apiKey;
                const client = new OpenAI(clientOpts);

                // monta messages com historico (converte 'model' → 'assistant' para OpenAI)
                const messages: any[] = [{ role: 'system', content: getSystemPrompt() }];
                for (const msg of this._historico) {
                    messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.text });
                }

                // streaming OpenAI
                const stream = await client.chat.completions.create({
                    model: modelName,
                    messages,
                    stream: true,
                    temperature,
                    max_tokens: maxTokens,
                }) as any;

                let textoAcumulado = '';
                for await (const chunk of stream) {
                    const text = chunk.choices?.[0]?.delta?.content || '';
                    if (text) {
                        textoAcumulado += text;
                        this._mostrarStream(textoAcumulado);
                    }
                }
                resposta = textoAcumulado || '...';
            }

            // finaliza stream: substitui a msg streaming pela final
            const { acoes, textoSemAcoes } = parseAcoes(resposta);

            let logAcoes = '';
            let resultadosLeitura = '';
            if (acoes.length > 0) {
                const pasta = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
                if (!pasta) {
                    logAcoes = '<div style="color:#ffaa00;font-size:11px">⚠ Abra uma pasta/workspace para executar ações</div>';
                } else {
                    for (const acao of acoes) {
                        const resultado = await executarAcao(acao, this._perm, pasta);
                        if (acao.tipo === 'READ' || acao.tipo === 'LIST') {
                            resultadosLeitura += resultado + '\n\n';
                        } else {
                            logAcoes += `<div style="font-size:11px;color:#66ff66">${resultado}</div>`;
                        }
                    }
                }
            }

            const textoExibicao = textoSemAcoes || (acoes.length === 0 ? resposta : '');
            let html = textoExibicao ? this._md.render(textoExibicao) : '';
            if (logAcoes) {
                html += `<div style="margin-top:10px;border-top:1px solid #333;padding-top:6px">${logAcoes}</div>`;
            }
            this._mostrarStreamFinal(html);

            // adiciona resposta da IA ao historico
            this._historico.push({ role: 'model', text: resposta });
            // adiciona resultados de leitura para a IA ver no proximo turno
            if (resultadosLeitura) {
                this._historico.push({ role: 'user', text: `[Resultados de operações]\n${resultadosLeitura}` });
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                this._mostrar('<span style="color:#ff8844">Requisição cancelada.</span>');
            } else {
                this._mostrar(`<span style="color:#ff4444">Erro: ${err.message}</span>`);
            }
        } finally {
            this._abortController = null;
            if (this._view) this._view.webview.postMessage({ type: 'streamingTerminou' });
            this._editandoMensagem = null;
        }
    }

    private _mostrarStream(markdownText: string) {
        if (!this._view) return;
        const html = this._md.render(markdownText);
        this._view.webview.postMessage({ type: 'respostaIAStream', value: html });
    }

    private _mostrarStreamFinal(html: string) {
        if (!this._view) return;
        this._view.webview.postMessage({ type: 'respostaIAStreamFinal', value: html });
    }

    private async _exportarChat() {
        if (!this._view) return;
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'] },
            defaultUri: vscode.Uri.file(`conversa-orunvs-${Date.now()}.md`),
        });
        if (!uri) return;

        let md = `# Conversa OrunVS\n\n`;
        for (const msg of this._historico) {
            const prefixo = msg.role === 'user' ? '**Você:**' : '**Hampton IA:**';
            md += `${prefixo}\n\n${msg.text}\n\n---\n\n`;
        }
        fs.writeFileSync(uri.fsPath, md, 'utf-8');
        vscode.window.showInformationMessage(`Conversa exportada: ${uri.fsPath}`);
    }

    async selecionarProvider() {
        const picks = Object.entries(OPENAI_PROVIDERS).map(([id, p]) => ({
            label: p.label,
            description: p.defaultModel,
            detail: p.baseURL,
            id,
        }));
        picks.unshift({ label: 'Google Gemini', description: GEMINI_DEFAULT_MODEL, detail: 'API Google AI', id: 'gemini' });

        const escolha = await vscode.window.showQuickPick(picks, { placeHolder: 'Selecione o provider' });
        if (escolha) {
            const config = vscode.workspace.getConfiguration('orunvs');
            await config.update('provider', escolha.id, vscode.ConfigurationTarget.Global);
            const model = escolha.id === 'gemini' ? GEMINI_DEFAULT_MODEL
                : OPENAI_PROVIDERS[escolha.id as OpenAIProvider]?.defaultModel || GEMINI_DEFAULT_MODEL;
            await config.update('modelName', model, vscode.ConfigurationTarget.Global);
            this._mostrar(`Provider: ${escolha.label} | Modelo: ${model}`);
            this._atualizarBadge();
            vscode.window.showInformationMessage(`OrunVS: ${escolha.label} → ${model}`);
        }
    }

    private _defaultModel(provider: string): string {
        if (provider === 'gemini') return GEMINI_DEFAULT_MODEL;
        return OPENAI_PROVIDERS[provider as OpenAIProvider]?.defaultModel || GEMINI_DEFAULT_MODEL;
    }

    private _mostrar(html: string) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'respostaIA', value: html });
        } else {
            vscode.window.showInformationMessage('OrunVS: ' + html.replace(/<[^>]*>/g, '').slice(0, 200));
        }
    }

    private _atualizarBadge() {
        const provider = vscode.workspace.getConfiguration('orunvs').get<string>('provider') || 'gemini';
        const label = provider === 'gemini' ? 'Google Gemini'
            : OPENAI_PROVIDERS[provider as OpenAIProvider]?.label || provider;
        this._view?.webview.postMessage({ type: 'providerAtual', value: label });
    }

    private async _selecionarModeloPorNome(nome: string) {
        const config = vscode.workspace.getConfiguration('orunvs');
        for (const m of GEMINI_MODELS) {
            if (m.name === nome) {
                await config.update('modelName', nome, vscode.ConfigurationTarget.Global);
                await config.update('provider', 'gemini', vscode.ConfigurationTarget.Global);
                this._mostrar(`Modelo: <strong>${nome}</strong> (Google Gemini, ${m.tier})`);
                this._atualizarBadge();
                return;
            }
        }
        for (const [pid, p] of Object.entries(OPENAI_PROVIDERS)) {
            for (const m of p.models) {
                if (m.name === nome) {
                    await config.update('modelName', nome, vscode.ConfigurationTarget.Global);
                    await config.update('provider', pid, vscode.ConfigurationTarget.Global);
                    this._mostrar(`Modelo: <strong>${nome}</strong> (${p.label}, ${m.tier})`);
                    this._atualizarBadge();
                    return;
                }
            }
        }
        this._mostrar(`<span style="color:#ff8844">Modelo "${nome}" não encontrado na lista.</span>`);
    }

    private async mostrarCatalogoModelos() {
        const config = vscode.workspace.getConfiguration('orunvs');
        const curProvider = config.get<string>('provider') || 'gemini';
        const curModel = config.get<string>('modelName') || this._defaultModel(curProvider);

        const tierIcon = (t: string) =>
            t === 'local' ? '🖥' : t === 'free' ? '✅' : '💳';

        const providerIcon: Record<string, string> = {
            gemini: '🔮', local: '🖥', groq: '⚡',
            openrouter: '🌐', deepseek: '🐋', github: '🐙', huggingface: '🤗',
        };

        let html = '<div style="margin-bottom:12px"><strong style="color:#ff1a1a;font-size:15px;letter-spacing:1px">📋 CATÁLOGO DE MODELOS</strong>';
        html += '<p style="color:#666;font-size:11px;margin:4px 0 8px">Clique em um modelo para ativá-lo</p></div>';

        const addProvider = (label: string, icon: string, models: { name: string; tier: string }[], providerId: string, isActive: boolean) => {
            if (models.length === 0) return;
            html += `<div style="margin-bottom:16px;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;background:#0a0a0a">`;
            html += `<div style="padding:8px 12px;background:#0d0d0d;border-bottom:1px solid #1a0000;font-weight:700;font-size:12px;color:#ff1a1a;letter-spacing:0.5px">${icon} ${label}</div>`;
            html += `<div style="padding:4px 6px">`;
            for (const m of models) {
                const active = isActive && curModel === m.name;
                html += `<div class="model-item" data-model="${m.name}" data-provider="${providerId}" style="padding:7px 10px;margin:3px 0;cursor:pointer;border-radius:5px;border:1px solid ${active ? '#ff1a1a44' : '#141414'};background:${active ? '#1a0000' : '#0d0d0d'};display:flex;align-items:center;gap:8px;transition:all 0.15s" onmouseover="this.style.borderColor='#ff1a1a66';this.style.background='#120000'" onmouseout="this.style.borderColor=this.dataset.active==='1'?'#ff1a1a44':'#141414';this.style.background=this.dataset.active==='1'?'#1a0000':'#0d0d0d'">`;
                html += `<span style="font-size:11px;opacity:0.5">${tierIcon(m.tier)}</span>`;
                html += `<span style="flex:1;font-size:12px;color:${active ? '#ff4444' : '#ccc'};font-weight:${active ? '700' : '400'}">${m.name}</span>`;
                html += `<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:${m.tier === 'local' ? '#222' : m.tier === 'free' ? '#003300' : '#330000'};color:${m.tier === 'local' ? '#888' : m.tier === 'free' ? '#00cc44' : '#ff4444'}">${m.tier}</span>`;
                if (active) html += `<span style="font-size:11px;color:#ff1a1a">✓</span>`;
                html += `</div>`;
            }
            html += `</div></div>`;
        };

        addProvider('Google Gemini', providerIcon.gemini, GEMINI_MODELS, 'gemini', curProvider === 'gemini');

        for (const [pid, p] of Object.entries(OPENAI_PROVIDERS)) {
            const icon = providerIcon[pid] || '🔌';
            addProvider(p.label, icon, p.models, pid, pid === curProvider);
        }

        html += `<div class="model-hint" style="text-align:center;padding:10px;color:#444;font-size:10px">💡 Você também pode digitar <strong style="color:#666">/model nome-do-modelo</strong> direto</div>`;

        if (this._view) {
            this._view.webview.postMessage({ type: 'respostaIA', value: html });
        }
    }

    private _html(webview?: vscode.Webview): string {
        const mediaUri = (file: string) => {
            if (!webview) return file;
            return webview.asWebviewUri(vscode.Uri.joinPath(this._ctx.extensionUri, 'resources', file)).toString();
        };

        const logoSrc = mediaUri('logo.svg');
        const scriptUri = mediaUri('main.js');
        const fundoSrc = mediaUri('Fundo.png');
        const videoSrc = mediaUri('LoadPerfeito.mp4');

        const nonce = getNonce();
        const cspSource = webview ? webview.cspSource : 'https:';
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource} data:; media-src ${cspSource};">
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin { to{transform:rotate(360deg)} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

    body {
        font:13px/1.5 Segoe UI,sans-serif; color:#ccc;
        background:#0a0a0a url('${fundoSrc}') center/cover no-repeat fixed;
        padding:0; overflow:hidden;
        height:100vh; display:flex; flex-direction:column;
    }

    #main { display:flex; flex-direction:column; height:100vh; }

    #bar {
        display:flex; align-items:center; gap:5px;
        padding:7px 10px; background:#080808;
        border-bottom:1px solid #1a0000;
        flex-shrink:0; position:relative; z-index:2;
    }
    #bar::after {
        content:''; position:absolute; bottom:-1px; left:0; right:0;
        height:1px; background:linear-gradient(90deg,transparent,#ff1a1a44,transparent);
    }
    #bar .title {
        display:flex; align-items:center; gap:6px;
        font-size:15px; font-weight:900; letter-spacing:2px;
        color:#ff1a1a; text-shadow:0 0 20px #ff1a1a44;
        flex:1; overflow:hidden;
    }
    #bar .title img { width:18px; height:18px; flex-shrink:0; }
    #bar .title small { font-size:9px; font-weight:400; color:#555; letter-spacing:0; margin-left:6px; }
    .bar-btn {
        background:none; border:1px solid #333; cursor:pointer;
        font-size:12px; padding:4px 8px; border-radius:4px;
        transition:all 0.2s; color:#888; line-height:1;
    }
    .bar-btn:hover { color:#ff1a1a; border-color:#ff1a1a; background:#1a0000; }
    #trocarBtn {
        font-size:10px; padding:4px 10px;
        background:linear-gradient(135deg,#cc0000,#ff1a1a);
        color:#fff; border:none; border-radius:4px; cursor:pointer;
        font-weight:600; transition:all 0.2s;
        box-shadow:0 2px 8px #ff1a1a33;
    }
    #trocarBtn:hover {
        background:linear-gradient(135deg,#ff1a1a,#ff3333);
        box-shadow:0 2px 12px #ff1a1a66; transform:translateY(-1px);
    }
    #trocarBtn:active { transform:translateY(0); }

    #chat {
        position:relative; z-index:1;
        flex:1; overflow-y:auto; padding:12px;
        scrollbar-width:thin; scrollbar-color:#1a0000 transparent;
    }
    #chat::-webkit-scrollbar { width:5px; }
    #chat::-webkit-scrollbar-track { background:transparent; }
    #chat::-webkit-scrollbar-thumb { background:#1a0000; border-radius:3px; }
    #chat::-webkit-scrollbar-thumb:hover { background:#330000; }
    #chat:empty::after {
        content:'Digite uma mensagem para começar...';
        display:flex; align-items:center; justify-content:center; height:100%;
        color:#222; font-size:13px; font-style:italic;
    }

    .msg {
        animation:slideUp 0.35s ease-out;
        margin-bottom:14px; padding:10px 12px;
        background:linear-gradient(135deg,#0d0d0d,#0a0a0a);
        border:1px solid #1a1a1a; border-radius:8px;
        border-left:3px solid #ff1a1a;
        position:relative; z-index:1;
        transition:border-color 0.2s;
    }
    .msg:hover { border-color:#333; }
    .msg:last-child { margin-bottom:0; }
    .msg pre {
        background:#050505; padding:10px; border-radius:6px;
        overflow-x:auto; font-size:12px; border:1px solid #1a1a1a;
        margin:6px 0; font-family:Cascadia Code,Consolas,monospace;
        position:relative;
    }
    .msg pre:hover .copy-btn { opacity:1; }
    .msg code { font-family:Cascadia Code,Consolas,monospace; background:#0a0a0a; padding:1px 5px; border-radius:3px; font-size:12px; border:1px solid #1a1a1a; }
    .msg p { margin:4px 0; }
    .msg a { color:#ff4444; }
    .msg strong { color:#eee; }

    .msg.streaming::after {
        content:'▊';
        display:inline-block;
        animation:blink 0.8s infinite;
        color:#ff1a1a;
        font-size:14px;
        margin-left:4px;
        vertical-align:middle;
    }

    .copy-btn {
        position:absolute; top:6px; right:6px;
        background:#1a1a1a; color:#888; border:1px solid #333;
        border-radius:4px; padding:3px 8px; font-size:10px; cursor:pointer;
        opacity:0; transition:opacity 0.2s;
        z-index:2;
    }
    .copy-btn:hover { background:#330000; color:#ff6666; border-color:#ff1a1a; }
    .copy-btn.copied { background:#003300; color:#00cc44; border-color:#00cc44; }

    .model-item:hover { border-color:#ff1a1a66 !important; background:#120000 !important; }

    #sugestao {
        display:none; padding:6px 10px; margin:0 10px;
        background:#0a0a0a; border:1px solid #1a1a1a; border-radius:6px;
        font-size:10px; color:#888;
        flex-shrink:0; gap:6px; align-items:center;
    }
    #sugestao.rapido { border-color:#003300; }
    #sugestao.potente { border-color:#330000; }

    #inputArea {
        padding:8px 10px 10px; background:#080808;
        border-top:1px solid #1a0000;
        flex-shrink:0; position:relative; z-index:2;
    }
    #inputArea::before {
        content:''; position:absolute; top:-1px; left:0; right:0;
        height:1px; background:linear-gradient(90deg,transparent,#ff1a1a44,transparent);
    }
    #inputRow {
        display:flex; gap:6px; align-items:flex-end;
    }
    #inputRow textarea {
        flex:1; background:#0d0d0d; color:#ddd;
        border:1px solid #1a1a1a; padding:9px 10px; border-radius:6px;
        resize:vertical; font:inherit; font-size:12px;
        transition:border-color 0.2s; outline:none;
    }
    #inputRow textarea:focus { border-color:#ff1a1a; box-shadow:0 0 0 2px #ff1a1a22; }
    #inputRow textarea::placeholder { color:#333; }
    #fileBtn {
        background:#0d0d0d; border:1px solid #1a1a1a; cursor:pointer;
        font-size:16px; padding:8px 10px; border-radius:6px;
        transition:all 0.2s; color:#666; line-height:1; flex-shrink:0;
    }
    #fileBtn:hover { border-color:#ff1a1a; color:#ff1a1a; background:#1a0000; }
    #fileBtn.has-file { color:#ff4444; border-color:#ff4444; }
    #btn {
        background:linear-gradient(135deg,#cc0000,#ff1a1a);
        color:#fff; border:none; padding:9px; width:100%;
        border-radius:6px; cursor:pointer; font-weight:700;
        font-size:12px; letter-spacing:1px; text-transform:uppercase;
        margin-top:7px; transition:all 0.2s;
        box-shadow:0 2px 8px #ff1a1a33;
    }
    #btn:hover {
        background:linear-gradient(135deg,#ff1a1a,#ff3333);
        box-shadow:0 2px 12px #ff1a1a66; transform:translateY(-1px);
    }
    #btn:active { transform:translateY(0); }
    .file-tag {
        display:inline-flex; align-items:center; gap:4px;
        font-size:11px; padding:2px 8px; border-radius:4px;
        background:#1a0000; color:#ff6666; margin-bottom:6px;
        border:1px solid #330000;
    }

    /* ── BOTÃO PARAR ── */
    #stopBtn {
        display:none; position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
        z-index:100; background:#cc0000; color:#fff; border:none;
        border-radius:20px; padding:8px 18px; font-size:12px; font-weight:700;
        cursor:pointer; box-shadow:0 4px 16px rgba(204,0,0,0.5);
        transition:all 0.2s; letter-spacing:0.5px;
    }
    #stopBtn:hover { background:#ff1a1a; transform:translateX(-50%) scale(1.05); }

    /* ── ABAS DE CONVERSA ── */
    #tabBar {
        display:flex; align-items:center; gap:3px;
        padding:4px 8px 0; background:#060606;
        border-bottom:1px solid #1a0000; flex-shrink:0;
        overflow-x:auto; scrollbar-width:thin;
    }
    #tabBar::-webkit-scrollbar { height:3px; }
    #tabBar::-webkit-scrollbar-thumb { background:#1a0000; border-radius:2px; }
    .tab {
        display:flex; align-items:center; gap:4px;
        padding:5px 10px; font-size:10px; color:#555;
        background:#0a0a0a; border:1px solid #1a1a1a; border-bottom:none;
        border-radius:6px 6px 0 0; cursor:pointer;
        transition:all 0.2s; white-space:nowrap;
        flex-shrink:0;
    }
    .tab:hover { color:#888; border-color:#333; }
    .tab.active { color:#ff1a1a; background:#0d0d0d; border-color:#330000; font-weight:600; }
    .tab .close-tab {
        font-size:10px; color:#444; cursor:pointer; padding:0 2px; border-radius:3px;
        line-height:1; transition:all 0.15s;
    }
    .tab .close-tab:hover { color:#ff4444; background:#1a0000; }
    #novaTabBtn {
        background:none; border:1px dashed #333; color:#555;
        border-radius:6px 6px 0 0; padding:5px 10px; font-size:14px;
        cursor:pointer; transition:all 0.15s; flex-shrink:0;
    }
    #novaTabBtn:hover { border-color:#ff1a1a; color:#ff1a1a; }

    /* ── MENSAGEM DO USUÁRIO ── */
    .msg.user {
        border-left-color:#555; cursor:pointer;
        background:linear-gradient(135deg,#0a0a0a,#080808);
    }
    .msg.user:hover { border-left-color:#ff1a1a; background:linear-gradient(135deg,#120000,#0a0a0a); }
    .msg.user .edit-hint {
        display:none; font-size:9px; color:#444; margin-top:4px;
    }
    .msg.user:hover .edit-hint { display:block; }

    /* ── INDICADOR DE EDIÇÃO ── */
    #editIndicator {
        display:none; align-items:center; gap:6px;
        padding:4px 10px; background:#1a0000; border-bottom:1px solid #330000;
        font-size:10px; color:#ff6666; flex-shrink:0;
    }
    #editIndicator button {
        background:none; border:none; color:#ff4444; cursor:pointer;
        font-size:10px; text-decoration:underline; padding:2px 4px;
    }
    #editIndicator button:hover { color:#ff6666; }

    /* ── PRESETS ── */
    #presetBar {
        display:flex; gap:4px; padding:4px 10px; flex-shrink:0;
        overflow-x:auto; scrollbar-width:none;
    }
    .preset-btn {
        background:#0a0a0a; border:1px solid #1a1a1a; color:#888;
        border-radius:12px; padding:3px 10px; font-size:10px; cursor:pointer;
        transition:all 0.15s; white-space:nowrap; flex-shrink:0;
    }
    .preset-btn:hover { border-color:#ff1a1a; color:#ff1a1a; background:#1a0000; }

    /* ── AUTO-SCROLL ── */
    #scrollToggle {
        display:flex; align-items:center; gap:4px;
        position:sticky; bottom:0; z-index:5;
        font-size:9px; color:#555; cursor:pointer; padding:4px 10px;
        background:rgba(8,8,8,0.8); backdrop-filter:blur(2px);
        border-top:1px solid #1a1a1a; flex-shrink:0;
    }
    #scrollToggle.off { color:#444; }
    #scrollToggle .indicator { width:6px; height:6px; border-radius:50%; background:#00cc44; }
    #scrollToggle.off .indicator { background:#444; }

    /* ── FOLD ── */
    .fold-btn {
        position:absolute; top:6px; left:6px;
        background:#1a1a1a; color:#555; border:1px solid #333;
        border-radius:3px; width:18px; height:18px; font-size:10px;
        cursor:pointer; transition:all 0.15s; z-index:2;
        display:flex; align-items:center; justify-content:center;
        line-height:1;
    }
    .fold-btn:hover { background:#330000; color:#ff6666; border-color:#ff1a1a; }
    .pre.folded { max-height:40px; overflow:hidden; cursor:pointer; }
    .pre.folded::after {
        content:'... (clique para expandir)'; display:block;
        text-align:center; font-size:10px; color:#555; padding:4px;
    }

    /* ── BOTÃO INLINE EDIT ── */
    .inline-edit-btn {
        position:absolute; top:6px; right:30px;
        background:#1a1a1a; color:#888; border:1px solid #333;
        border-radius:4px; padding:3px 7px; font-size:9px; cursor:pointer;
        opacity:0; transition:opacity 0.2s; z-index:2;
    }
    .msg pre:hover .inline-edit-btn { opacity:1; }
    .inline-edit-btn:hover { background:#003300; color:#00cc44; border-color:#00cc44; }

    /* ── REGENERAR ── */
    .regenerar-btn {
        display:block; width:100%; text-align:center;
        background:none; border:1px dashed #333; color:#555;
        border-radius:6px; padding:5px; font-size:10px; cursor:pointer;
        margin-top:6px; transition:all 0.15s;
    }
    .regenerar-btn:hover { border-color:#ff1a1a; color:#ff1a1a; background:#1a0000; }

    /* ── OVERLAY DE PERMISSÃO ── */
    #permOverlay {
        position:fixed; inset:0; z-index:9999;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.75);
        backdrop-filter:blur(4px);
        animation:fadeIn 0.2s ease-out;
    }
    #permDialog {
        background:#0d0d0d; border:1px solid #1a0000;
        border-radius:12px; padding:24px; max-width:400px; width:90%;
        box-shadow:0 8px 40px rgba(255,26,26,0.15);
        animation:slideUp 0.3s ease-out;
    }
    #permIcone { font-size:32px; text-align:center; margin-bottom:8px; }
    #permTitulo {
        font-size:16px; font-weight:700; color:#ff1a1a;
        text-align:center; margin-bottom:12px;
        letter-spacing:0.5px;
    }
    #permDescricao {
        font-size:12px; color:#ccc; margin-bottom:6px;
        word-break:break-all;
    }
    #permDetalhe {
        font-size:11px; color:#666; margin-bottom:16px;
        background:#080808; padding:8px 10px; border-radius:6px;
        border:1px solid #1a1a1a; max-height:120px; overflow-y:auto;
        font-family:Cascadia Code,Consolas,monospace;
        white-space:pre-wrap; word-break:break-all;
    }
    #permBotoes {
        display:flex; gap:8px; flex-wrap:wrap; justify-content:center;
    }
    #permBotoes button {
        flex:1; min-width:80px; padding:8px 12px; border-radius:6px;
        border:1px solid #333; background:#0a0a0a; color:#ccc;
        font-size:11px; font-weight:600; cursor:pointer;
        transition:all 0.2s; line-height:1;
    }
    #permBotoes button:hover { transform:translateY(-1px); }
    #permPermitir { border-color:#003300 !important; color:#00cc44 !important; }
    #permPermitir:hover { background:#003300 !important; }
    #permNegar { border-color:#330000 !important; color:#ff4444 !important; }
    #permNegar:hover { background:#330000 !important; }
    #permSempre { border-color:#333300 !important; color:#cccc00 !important; }
    #permSempre:hover { background:#333300 !important; }

    #loadingScreen {
        position:fixed; inset:0; z-index:99999;
        display:flex; align-items:center; justify-content:center;
        background:#0a0a0a; transition:opacity 0.6s ease-out;
    }
    #loadingScreen.fade-out { opacity:0; pointer-events:none; }
    #loadingScreen video {
        max-width:80%; max-height:80%; border-radius:12px;
        box-shadow:0 0 60px rgba(255,26,26,0.3);
    }
</style>
</head>
<body>

<div id="loadingScreen">
    <video autoplay muted playsinline id="loadVideo">
        <source src="${videoSrc}" type="video/mp4">
    </video>
</div>

<div id="main">
<div id="tabBar">
    <div class="tab active" data-tab="0">Conversa 1</div>
    <button id="novaTabBtn">+</button>
</div>
<div id="bar">
    <span class="title"><img src="${logoSrc}" alt=""> ORUN VS <small>v0.2</small></span>
    <button class="bar-btn" id="exportBtn" title="Exportar conversa">📥</button>
    <button class="bar-btn" id="clearBtn" title="Limpar chat">✕</button>
    <button id="trocarBtn">Modelos</button>
</div>

<button id="stopBtn">⏹ Parar</button>

<div id="editIndicator">✏️ Editando mensagem <span id="editPreview"></span><button id="cancelarEdicao">Cancelar</button></div>

<div id="presetBar"></div>

<div id="chat"></div>

<div id="scrollToggle"><span class="indicator"></span> Auto-scroll</div>

<div id="sugestao"></div>

<div id="inputArea">
    <div id="inputRow">
        <textarea id="inp" rows="3" placeholder="Comando para o Lobo..."></textarea>
        <button id="fileBtn" title="Anexar arquivo">📎</button>
    </div>
    <input type="file" id="fileInput" style="display:none">
    <div id="fileTag" class="file-tag" style="display:none"></div>
    <button id="btn">Mandar</button>
</div>
</div>

<div id="permOverlay" style="display:none">
    <div id="permDialog">
        <div id="permIcone">🔧</div>
        <div id="permTitulo"></div>
        <div id="permDescricao"></div>
        <div id="permDetalhe"></div>
        <div id="permBotoes">
            <button id="permNegar">❌ Negar</button>
            <button id="permPermitir">✅ Permitir</button>
            <button id="permSempre">🔁 Sempre permitir</button>
        </div>
    </div>
</div>

<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
