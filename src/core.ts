/*
 * core.ts — lógica pura do OrunVS (sem dependência de vscode), testável via vitest.
 * Extraída de chatprovider.ts. Não importa vscode.
 */
import * as path from 'path';
import * as fs from 'fs';

export type OpenAIProvider = 'local' | 'groq' | 'openrouter' | 'deepseek' | 'github' | 'huggingface' | 'opencodezen';

export interface ProviderConfig {
    baseURL: string;
    apiKeyField: string;
    label: string;
    defaultModel: string;
    deprecated?: boolean;
    models: { name: string; tier: 'free' | 'pago' | 'local' }[];
}

export const OPENAI_PROVIDERS: Record<OpenAIProvider, ProviderConfig> = {
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
    opencodezen: {
        baseURL: 'https://opencode.ai/zen/v1', apiKeyField: 'opencodezenKey', label: 'OpenCodeZen', defaultModel: 'big-pickle',
        models: [
            { name: 'big-pickle', tier: 'free' },
            { name: 'gpt-5.6-sol', tier: 'free' },
            { name: 'gpt-4o-mini', tier: 'free' },
            { name: 'gpt-4o', tier: 'free' },
            { name: 'deepseek-v4-flash', tier: 'free' },
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
        baseURL: 'https://models.inference.ai.azure.com', apiKeyField: 'githubToken', label: 'GitHub Models (aposentado — HTTP 410)', defaultModel: 'gpt-4o-mini', deprecated: true,
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

export const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

export const GEMINI_MODELS = [
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

/* ── FALLBACK AUTOMÁTICO DE PROVIDERS ── */

/**
 * Cadeia de fallback padrão: quando o provider primário esgota os tokens,
 * a extensão tenta automaticamente o próximo da lista (apenas os validados).
 */
export const DEFAULT_FALLBACK_CHAIN: string[] = ['opencodezen', 'openrouter', 'groq', 'gemini'];

/**
 * Modelo usado por cada provider quando ele entra na cadeia de fallback
 * (o provider primário usa o `modelName` configurado pelo usuário).
 */
export const FALLBACK_DEFAULT_MODELS: Record<string, string> = {
    opencodezen: 'big-pickle',
    openrouter: 'openai/gpt-4o-mini',
    groq: 'llama-3.3-70b-versatile',
    gemini: GEMINI_DEFAULT_MODEL,
};

/**
 * Estimativa padrão (em ms) de quanto tempo os tokens levam para voltar,
 * usada quando o provider não informa `Retry-After`/`x-ratelimit-reset-*`.
 */
export const FALLBACK_RETRY_DEFAULT_MS: Record<string, number> = {
    opencodezen: 60_000,
    openrouter: 3_600_000, // tier grátis do OpenRouter reseta por hora
    groq: 60_000,          // tier grátis do Groq reseta a cada 60s
    gemini: 60_000,
};

export type CategoriaErro = 'rate-limit' | 'quota' | 'auth' | 'server' | 'network' | 'timeout' | 'abort' | 'outro';

export interface ErroClassificado {
    categoria: CategoriaErro;
    etaMs: number | null;
    mensagem: string;
}

export interface CadeiaItem {
    provider: string;
    model: string;
    isGemini: boolean;
}

/**
 * Extrai o tempo de reset de tokens (ms) a partir de headers de rate-limit
 * e/ou mensagem de erro. Retorna null quando não há indicação.
 */
export function extrairRetryMs(status: number, headers: any, body: any): number | null {
    if (headers && typeof headers === 'object') {
        const ra = headers['retry-after'] ?? headers['Retry-After'] ?? headers['retry_after'];
        if (ra !== undefined && ra !== null && ra !== '') {
            const n = Number(ra);
            if (Number.isFinite(n) && n >= 0) return n * 1000;
            const d = new Date(String(ra)).getTime();
            if (Number.isFinite(d)) return Math.max(0, d - Date.now());
        }
        for (const h of ['x-ratelimit-reset-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset']) {
            const v = headers[h];
            if (v === undefined || v === null || v === '') continue;
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) continue;
            if (n > 1_000_000_000_000) return Math.max(0, n - Date.now()); // epoch ms
            return n * 1000; // segundos
        }
    }
    const msg = typeof body?.error?.message === 'string' ? body.error.message : '';
    const m = msg.match(/(?:in|try again in|reset in|volt[ae]? em|dentro de|espera)\s+(\d+)\s*(?:s|sec|secs|second|seconds|segundo[s]?)?/i);
    if (m) return Number(m[1]) * 1000;
    return null;
}

/**
 * Classifica um erro lançado por um provider para decidir se o fallback deve
 * ocorrer e qual o tempo estimado até os tokens voltarem.
 */
export function classificarErro(err: any, provider: string): ErroClassificado {
    const status = Number(err?.status ?? err?.statusCode ?? 0);
    const headers = err?.headers || {};
    const body = err?.body || (err?.error && typeof err.error === 'object' ? { error: err.error } : {});
    const rawMsg = String(err?.message || '');
    const lmsg = rawMsg.toLowerCase();
    const lbody = String(body?.error?.message || '').toLowerCase();

    if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED' || /aborted|canceled|cancelado/i.test(rawMsg)) {
        return { categoria: 'abort', etaMs: null, mensagem: 'Requisição cancelada' };
    }
    if (status === 429 || /rate.?limit|too many requests|limite de tokens|quota.*exced|exced.*quota|429/i.test(lmsg + ' ' + lbody)) {
        const etaMs = extrairRetryMs(status, headers, body) ?? FALLBACK_RETRY_DEFAULT_MS[provider] ?? 60_000;
        return { categoria: 'rate-limit', etaMs, mensagem: 'Limite de tokens atingido' };
    }
    if (status === 402 || /insufficient|payment required|sem.*credito|sem.*token|credit balance/i.test(lmsg + ' ' + lbody)) {
        return { categoria: 'quota', etaMs: null, mensagem: 'Sem créditos/tokens' };
    }
    if (status === 401 || status === 403 || /invalid api key|unauthorized|forbidden|api key/i.test(lmsg + ' ' + lbody)) {
        return { categoria: 'auth', etaMs: null, mensagem: 'Chave inválida' };
    }
    if (status >= 500 || /internal server|bad gateway|service unavailable/i.test(lmsg)) {
        return { categoria: 'server', etaMs: FALLBACK_RETRY_DEFAULT_MS[provider] ?? 60_000, mensagem: 'Erro no servidor' };
    }
    if (/timeout|timed out|took too long/i.test(lmsg)) {
        return { categoria: 'timeout', etaMs: 30_000, mensagem: 'Tempo esgotado' };
    }
    if (/fetch failed|socket|network|econnrefused|econnreset|enotfound|eai_again|und_conn|connection/i.test(lmsg)) {
        return { categoria: 'network', etaMs: 30_000, mensagem: 'Falha de rede' };
    }
    return { categoria: 'outro', etaMs: null, mensagem: rawMsg.slice(0, 200) || 'Erro desconhecido' };
}

/**
 * Formata uma duração em ms para texto curto ("1h 5min", "2min 30s", "45s").
 */
export function formatarEta(ms: number | null | undefined): string {
    if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
    const totalS = Math.ceil(ms / 1000);
    const h = Math.floor(totalS / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const s = totalS % 60;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
}

/**
 * Monta a cadeia efetiva de tentativas (primário primeiro), pulando providers
 * sem chave configurada e os marcados como deprecated. O primário usa o
 * `primaryModel`; os demais usam `FALLBACK_DEFAULT_MODELS`.
 */
export function montarCadeiaFallback(
    primary: string,
    primaryModel: string,
    chainConfig: string[] | undefined,
    temChave: (provider: string) => boolean,
    isDeprecated: (provider: string) => boolean,
): CadeiaItem[] {
    const base = chainConfig && chainConfig.length ? chainConfig : DEFAULT_FALLBACK_CHAIN;
    const ordem = [primary, ...base.filter((p) => p !== primary)];
    const out: CadeiaItem[] = [];
    const visto = new Set<string>();
    for (const pid of ordem) {
        if (visto.has(pid)) continue;
        visto.add(pid);
        if (isDeprecated(pid)) continue;
        if (!temChave(pid)) continue;
        const isGemini = pid === 'gemini';
        const model = pid === primary
            ? (primaryModel || FALLBACK_DEFAULT_MODELS[pid] || '')
            : (FALLBACK_DEFAULT_MODELS[pid] || OPENAI_PROVIDERS[pid as OpenAIProvider]?.defaultModel || '');
        if (!model) continue;
        out.push({ provider: pid, model, isGemini });
    }
    return out;
}

export type AcaoTipo = 'EDIT' | 'CREATE' | 'DELETE' | 'RUN_CMD' | 'READ' | 'LIST' | 'OPEN';

export interface Acao {
    tipo: AcaoTipo;
    path?: string;
    conteudo?: string;
    comando?: string;
}

const DEFAULT_SYSTEM_PROMPT = `# ==========================================
# HAMPTON IA — OrunVS
# Grupo Orun ST
# ==========================================

## IDENTITY

You are Hampton IA, the principal software engineer of Grupo Orun ST.

If someone asks "Who are you?" or "Who is Hampton?", answer only:

"I am Hampton IA, from Grupo Orun ST."

Otherwise never introduce yourself. Act as if you are already working on this project.

---

## MISSION

You are a world-class Senior/Principal Software Engineer. Your job is to think, analyze, design, implement, review, test, refactor and ship professional, production-ready software across every stack: frontend, backend, desktop, mobile, AI and infrastructure.

Produce software of professional quality. Be the engineer you would trust to run a system used by millions.

---

## HOW TO THINK

Before answering or implementing:

1. Understand the problem completely. Ask for clarification only when truly ambiguous.
2. Explore first: use [LIST_FILES] and [FILE_READ] to inspect the existing code before writing anything.
3. Find the simplest correct solution, then the most professional one. Compare them. Choose the best balance.
4. Never ship your first idea. Refine.
5. Think carefully and work internally. Do not narrate every step to the user.

---

## TOOL USE (ACTION BLOCKS)

You modify the user's project with action blocks. NEVER paste code in chat without saving it to files.

To READ a file:
[FILE_READ]
path: relative/path/file.ext
[/FILE_READ]

To LIST files:
[LIST_FILES]
path: .
[/LIST_FILES]

To CREATE or EDIT a file:
[FILE_EDIT]
path: relative/path/file.ext
\`\`\`language
complete file content
\`\`\`
[/FILE_EDIT]

To DELETE a file:
[FILE_DELETE]
path: relative/path/file.ext
[/FILE_DELETE]

To run a terminal command:
[RUN_CMD]
plain command here
[/RUN_CMD]

To open a page in the browser:
[OPEN]
relative/path/index.html
[/OPEN]

## ACTION BLOCK RULES

- Shell is PowerShell. Do NOT chain commands with && — use separate [RUN_CMD] blocks or semicolons.
- Write commands PURE. Never prefix them with "command:", "cmd:", "comando:".
- Execute commands automatically. Do NOT ask permission for routine actions.
- Always save code into files with [FILE_EDIT]. NEVER show raw code in chat without saving it.
- Never display the [FILE_EDIT]/[RUN_CMD]/[OPEN] tags in chat — execute them silently.
- Do not announce actions ("Creating file...") — just do them, then summarize.

ALLOWED POWERSHELL:
- mkdir -Force "folder"
- mkdir -Force "folder/subfolder"
- New-Item -ItemType File -Force -Path "file.ext"
- Set-Location -LiteralPath "path"
- git init / git add . / git commit -m "msg" / git push
- Start-Process "path/file.html" (or use [OPEN])

FORBIDDEN (CMD-only, do not use):
- type nul > file, copy nul file, echo. > file, copy con file — all CMD-era commands.

---

## BEHAVIOR

- When asked to create, build, fix, refactor or optimize: DO IT. Complete the whole task end-to-end.
- Do not stop to ask unnecessary confirmation. Small decisions (variable names, folder structure, minor technical choices) are yours.
- Consult the user only when: changing the whole architecture, deleting features, breaking compatibility, altering an existing database, changing public APIs, or contradicting an explicit request.
- If you spot improvements during the work: finish what was asked first, then list "Suggested improvements".
- If the user asks for advice ("how", "tip", "should I"): answer in text only. No code, no actions.

---

## QUALITY STANDARD

Every deliverable must be complete and professional — never stubs, placeholders or "…".

- CODE: SOLID, clean, readable, well-named, defensive (input validation, error handling, logs where useful), performant, secure, extensible.
- HTML: full doctype, meta tags (charset, viewport, description), semantic markup, responsive layout, accessibility, coherent structure.
- CSS: variables for colors/fonts, reset, typography scale, responsive grids, hover states, animations where they add value.
- JS: real logic wired correctly — data handling, event wiring, validation, error paths.
- DATA: include seed/demo data so the project runs out of the box.
- MATCH the requested theme/style — do not impose a template. If the user asks for a restaurant site, build a restaurant, not a barbershop.

NEVER:
- Write code in chat as plain text.
- Ship abbreviated/simplified versions.
- Skip files the project needs.
- Invent information or claim something works without verifying.
- Use CMD-era commands.

---

## FLOW FOR NEW PROJECTS

1. [LIST_FILES] path: . to inspect the current folder.
2. Create the folder structure with [RUN_CMD] + mkdir -Force.
3. Create EVERY file with [FILE_EDIT] — complete content.
4. Verify with [LIST_FILES].
5. If it is a git project, commit and push with [RUN_CMD].
6. Reply briefly: "Project created successfully! Structure: [files]" — then optional "Suggested improvements".

---

## ENGINEERING MINDSET

Act as a Principal Engineer responsible for long-term technical decisions. Before implementing, weigh: scalability, performance, security, maintainability, readability, testability, extensibility, compatibility, UX and infrastructure cost. Prefer the solution with the best balance of simplicity, quality and performance. Avoid overengineering and premature abstraction. Prefer native/platform features over new dependencies unless a library earns its place.

---

## SECURITY

Always consider: SQL injection, XSS, CSRF, auth/authz, validation and sanitization, secrets handling (never hardcode), OWASP Top 10 and data privacy. Never ship an insecure solution.

---

## TESTS

When implementing relevant functionality, add unit/integration tests covering edge cases and error paths. Even without tests, write code that is easy to test.

---

## DOCUMENTATION

Update README and technical docs when meaningful. Document public APIs and configuration.

---

## LIMITS

Never invent facts. Never claim something works without verifying. When there are limitations, explain them clearly and offer viable alternatives.

---

## RESPONSE DISCIPLINE

- NEVER open with a generic greeting like "Hello! How can I assist you today?". Go straight to work: explore, act, then summarize.
- If the user asks you to CREATE, BUILD, FIX, REFACTOR or IMPLEMENT something: a text-only answer is a FAILURE. You MUST emit the action blocks ([FILE_EDIT]/[RUN_CMD]/[LIST_FILES]/[FILE_READ]) and actually do the work.
- If the request is a pure question/advice ("how", "tip", "should I"): answer in text only, no actions.
- Never show raw code in the chat text — code belongs inside [FILE_EDIT] blocks.

---

## FINAL BEHAVIOR

Never be just a code generator. Be an experienced team member: question internally, analyze deeply, design correctly, implement with excellence, review your own work, and ship production-ready solutions. Your goal is software that is robust, scalable, secure and maintainable — not just "working".`;

export function getSystemPrompt(custom?: string): string {
    return custom && custom.trim() ? custom.trim() : DEFAULT_SYSTEM_PROMPT;
}

/**
 * Mensagem injetada no historico quando a IA responde SEM nenhum bloco de acao
 * a um pedido de criacao/edicao/execucao. Forca uma segunda tentativa no formato correto.
 */
export const FORCE_ACTIONS_PROMPT = `A sua resposta anterior NÃO continha nenhum bloco de ação ([FILE_EDIT], [RUN_CMD], [FILE_READ], [LIST_FILES]) e a tarefa pede para criar, editar, corrigir, refatorar ou executar algo.

REGRAS OBRIGATÓRIAS para a nova resposta:
1. Se a tarefa envolve criar, editar, refatorar, corrigir, construir ou rodar algo: responda APENAS com blocos de ação — [FILE_EDIT] com o conteúdo COMPLETO do arquivo, [RUN_CMD] para comandos (PowerShell), [LIST_FILES]/[FILE_READ] para explorar.
2. NUNCA escreva código solto no chat sem salvar nos arquivos.
3. Se a tarefa era apenas uma pergunta/dúvida, responda normalmente em texto.
4. Não repita saudações genéricas. Vá direto ao trabalho.

Reenvie a resposta completa agora.`;

export function parseAcoes(texto: string): { acoes: Acao[]; textoSemAcoes: string } {
    const acoes: Acao[] = [];
    let limpo = texto;

    // Tenta múltiplos formatos de [FILE_EDIT]
    // Formato 1: [FILE_EDIT]\npath: ...\n```lang\n...\n```\n[/FILE_EDIT]
    const editRegex1 = /\[FILE_EDIT\]\s*path:\s*(.+?)\s*```[a-z]*\s*([\s\S]*?)```\s*\[\/FILE_EDIT\]/gi;
    let match;
    while ((match = editRegex1.exec(texto)) !== null) {
        acoes.push({ tipo: 'EDIT', path: match[1].trim(), conteudo: match[2].trim() });
    }
    limpo = limpo.replace(editRegex1, '');

    // Formato 2: [FILE_EDIT]\npath: ...\nconteudo...\n[/FILE_EDIT] (sem crases)
    const editRegex2 = /\[FILE_EDIT\]\s*path:\s*(.+?)\s*\n([\s\S]*?)\s*\[\/FILE_EDIT\]/gi;
    while ((match = editRegex2.exec(limpo)) !== null) {
        acoes.push({ tipo: 'EDIT', path: match[1].trim(), conteudo: match[2].trim() });
    }
    limpo = limpo.replace(editRegex2, '');

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

    const openRegex = /\[OPEN\]\s*(.+?)\s*\[\/OPEN\]/gi;
    while ((match = openRegex.exec(texto)) !== null) {
        acoes.push({ tipo: 'OPEN', path: match[1].trim() });
    }
    limpo = limpo.replace(openRegex, '');

    return { acoes, textoSemAcoes: limpo.trim() };
}

export function listarArquivos(pasta: string, prefixo: string = ''): string[] {
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
