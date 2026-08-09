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

export const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

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

## FINAL BEHAVIOR

Never be just a code generator. Be an experienced team member: question internally, analyze deeply, design correctly, implement with excellence, review your own work, and ship production-ready solutions. Your goal is software that is robust, scalable, secure and maintainable — not just "working".`;

export function getSystemPrompt(custom?: string): string {
    return custom && custom.trim() ? custom.trim() : DEFAULT_SYSTEM_PROMPT;
}

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
