import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
    OPENAI_PROVIDERS,
    GEMINI_MODELS,
    GEMINI_DEFAULT_MODEL,
    DEFAULT_FALLBACK_CHAIN,
    FALLBACK_DEFAULT_MODELS,
    getSystemPrompt,
    parseAcoes,
    listarArquivos,
    OpenAIProvider,
    Acao,
    extrairRetryMs,
    classificarErro,
    formatarEta,
    montarCadeiaFallback,
    CadeiaItem,
    enriquecerSystemPrompt,
    ehAcaoExploratoria,
    precisaContinuarLoop,
    limparSobrasAcoes,
} from '../core';
import { blocoMemoriasRelevantes } from '../memory';
import { blocoAvailableSkills } from '../skills';

describe('OPENAI_PROVIDERS', () => {
    it('inclui opencodezen como provider oficial', () => {
        const p = OPENAI_PROVIDERS.opencodezen;
        assert.ok(p, 'opencodezen deve existir');
        assert.strictEqual(p.baseURL, 'https://opencode.ai/zen/v1');
        assert.strictEqual(p.apiKeyField, 'opencodezenKey');
        assert.strictEqual(p.label, 'OpenCodeZen');
        assert.strictEqual(p.defaultModel, 'big-pickle');
        assert.ok(p.models.some((m) => m.name === 'big-pickle'));
        assert.strictEqual(p.deprecated, undefined);
    });

    it('marca github como deprecated (HTTP 410)', () => {
        const p = OPENAI_PROVIDERS.github;
        assert.ok(p, 'github deve existir');
        assert.strictEqual(p.deprecated, true);
    });

    it('todos os providers têm baseURL, label e defaultModel', () => {
        for (const [id, p] of Object.entries(OPENAI_PROVIDERS)) {
            assert.ok(p.baseURL, `provider ${id} sem baseURL`);
            assert.ok(p.label, `provider ${id} sem label`);
            assert.ok(p.defaultModel, `provider ${id} sem defaultModel`);
            assert.ok(p.models.length > 0, `provider ${id} sem modelos`);
        }
    });

    it('chaves do record coincidem com o tipo OpenAIProvider', () => {
        const ids = Object.keys(OPENAI_PROVIDERS) as OpenAIProvider[];
        const esperados: OpenAIProvider[] = ['local', 'groq', 'openrouter', 'deepseek', 'github', 'huggingface', 'opencodezen'];
        assert.deepStrictEqual(ids.sort(), esperados.sort());
    });
});

describe('GEMINI_MODELS / GEMINI_DEFAULT_MODEL', () => {
    it('default é gemini-flash-latest (válido na API atual) e está na lista', () => {
        assert.strictEqual(GEMINI_DEFAULT_MODEL, 'gemini-flash-latest');
        assert.ok(GEMINI_MODELS.some((m) => m.name === GEMINI_DEFAULT_MODEL));
    });
});

describe('DEFAULT_FALLBACK_CHAIN', () => {
    it('cadeia padrão começa com opencodezen e só contém providers válidos (não deprecated)', () => {
        assert.deepStrictEqual(DEFAULT_FALLBACK_CHAIN, ['opencodezen', 'openrouter', 'groq', 'gemini']);
        for (const pid of DEFAULT_FALLBACK_CHAIN) {
            if (pid === 'gemini') continue;
            assert.ok(OPENAI_PROVIDERS[pid as OpenAIProvider], `provider ${pid} deve existir`);
            assert.notStrictEqual(OPENAI_PROVIDERS[pid as OpenAIProvider].deprecated, true, `${pid} não deve ser deprecated`);
        }
    });

    it('FALLBACK_DEFAULT_MODELS cobre todos os providers da cadeia', () => {
        for (const pid of DEFAULT_FALLBACK_CHAIN) {
            assert.ok(FALLBACK_DEFAULT_MODELS[pid], `modelo default de fallback ausente para ${pid}`);
        }
        assert.strictEqual(FALLBACK_DEFAULT_MODELS.opencodezen, 'big-pickle');
        assert.strictEqual(FALLBACK_DEFAULT_MODELS.gemini, 'gemini-flash-latest');
    });
});

describe('extrairRetryMs', () => {
    it('lê Retry-After em segundos', () => {
        assert.strictEqual(extrairRetryMs(429, { 'retry-after': '45' }, null), 45000);
    });

    it('lê x-ratelimit-reset-tokens em epoch ms', () => {
        const agora = Date.now();
        assert.ok(Math.abs((extrairRetryMs(429, { 'x-ratelimit-reset-tokens': String(agora + 30000) }, null) ?? 0) - 30000) < 1000);
    });

    it('lê x-ratelimit-reset em segundos quando valor pequeno', () => {
        assert.strictEqual(extrairRetryMs(429, { 'x-ratelimit-reset': '30' }, null), 30000);
    });

    it('lê mensagem de erro do corpo', () => {
        const body = { error: { message: 'Rate limit exceeded. Please try again in 75 seconds.' } };
        assert.strictEqual(extrairRetryMs(429, null, body), 75000);
    });

    it('retorna null sem indicação', () => {
        assert.strictEqual(extrairRetryMs(500, null, null), null);
    });
});

describe('classificarErro', () => {
    it('429 → rate-limit com ETA (default do provider quando sem header)', () => {
        const e = classificarErro({ status: 429, message: 'Too many requests' }, 'groq');
        assert.strictEqual(e.categoria, 'rate-limit');
        assert.strictEqual(e.etaMs, 60000);
    });

    it('429 com Retry-After → rate-limit com ETA do header', () => {
        const e = classificarErro({ status: 429, headers: { 'retry-after': '30' }, message: 'ratelimit' }, 'opencodezen');
        assert.strictEqual(e.categoria, 'rate-limit');
        assert.strictEqual(e.etaMs, 30000);
    });

    it('402 → quota (sem créditos)', () => {
        const e = classificarErro({ status: 402, message: 'Payment Required' }, 'openrouter');
        assert.strictEqual(e.categoria, 'quota');
    });

    it('401 → auth (chave inválida)', () => {
        const e = classificarErro({ status: 401, body: { error: { message: 'Invalid API key.' } } }, 'opencodezen');
        assert.strictEqual(e.categoria, 'auth');
    });

    it('500 → server com ETA default', () => {
        const e = classificarErro({ status: 500, message: 'Internal Server Error' }, 'openrouter');
        assert.strictEqual(e.categoria, 'server');
        assert.strictEqual(e.etaMs, 3600000);
    });

    it('erro de rede → network com ETA 30s', () => {
        const e = classificarErro({ status: 0, message: 'fetch failed: ECONNREFUSED' }, 'groq');
        assert.strictEqual(e.categoria, 'network');
        assert.strictEqual(e.etaMs, 30000);
    });

    it('timeout → categoria timeout', () => {
        const e = classificarErro({ message: 'Request timed out' }, 'opencodezen');
        assert.strictEqual(e.categoria, 'timeout');
        assert.strictEqual(e.etaMs, 30000);
    });

    it('AbortError → abort (NÃO deve disparar fallback)', () => {
        const e = classificarErro({ name: 'AbortError', message: 'aborted' }, 'groq');
        assert.strictEqual(e.categoria, 'abort');
    });
});

describe('formatarEta', () => {
    it('valores nulos/inválidos retornam vazio', () => {
        assert.strictEqual(formatarEta(null), '');
        assert.strictEqual(formatarEta(undefined), '');
        assert.strictEqual(formatarEta(0), '');
        assert.strictEqual(formatarEta(-5), '');
    });

    it('formata segundos', () => {
        assert.strictEqual(formatarEta(45000), '45s');
    });

    it('formata minutos + segundos', () => {
        assert.strictEqual(formatarEta(90000), '1min 30s');
        assert.strictEqual(formatarEta(6120000), '1h 42min');
    });

    it('arredonda para cima', () => {
        assert.strictEqual(formatarEta(1000), '1s');
        assert.strictEqual(formatarEta(999), '1s');
    });
});

describe('montarCadeiaFallback', () => {
    const temChaveTodos = () => true;
    const nenhumDeprecated = () => false;

    it('primário primeiro, sem duplicatas', () => {
        const cadeia = montarCadeiaFallback('opencodezen', 'big-pickle', undefined, temChaveTodos, nenhumDeprecated);
        assert.strictEqual(cadeia[0].provider, 'opencodezen');
        assert.strictEqual(cadeia[0].model, 'big-pickle');
        const ids = cadeia.map((c) => c.provider);
        assert.strictEqual(new Set(ids).size, ids.length);
    });

    it('usa FALLBACK_DEFAULT_MODELS nos providers de reserva', () => {
        const cadeia = montarCadeiaFallback('opencodezen', 'big-pickle', undefined, temChaveTodos, nenhumDeprecated);
        const or = cadeia.find((c) => c.provider === 'openrouter')!;
        const gem = cadeia.find((c) => c.provider === 'gemini')!;
        assert.strictEqual(or.model, 'openai/gpt-4o-mini');
        assert.strictEqual(gem.model, 'gemini-flash-latest');
        assert.strictEqual(gem.isGemini, true);
        assert.strictEqual(or.isGemini, false);
    });

    it('pula providers sem chave', () => {
        const temChave = (pid: string) => pid === 'opencodezen' || pid === 'groq';
        const cadeia = montarCadeiaFallback('opencodezen', 'big-pickle', undefined, temChave, nenhumDeprecated);
        assert.deepStrictEqual(cadeia.map((c) => c.provider), ['opencodezen', 'groq']);
    });

    it('pula providers deprecated', () => {
        const isDep = (pid: string) => pid === 'github';
        const cadeia = montarCadeiaFallback('opencodezen', 'big-pickle', ['github', 'groq'], temChaveTodos, isDep);
        assert.ok(!cadeia.some((c) => c.provider === 'github'));
        assert.ok(cadeia.some((c) => c.provider === 'groq'));
    });

    it('cadeia customizada respeita a ordem informada', () => {
        const cadeia = montarCadeiaFallback('groq', 'llama-3.3-70b-versatile', ['openrouter', 'opencodezen'], temChaveTodos, nenhumDeprecated);
        assert.deepStrictEqual(cadeia.map((c) => c.provider), ['groq', 'openrouter', 'opencodezen']);
    });

    it('sem chave em nenhum provider → cadeia vazia', () => {
        const cadeia = montarCadeiaFallback('opencodezen', 'big-pickle', undefined, () => false, nenhumDeprecated);
        assert.strictEqual(cadeia.length, 0);
    });
});

describe('getSystemPrompt', () => {
    it('retorna o prompt padrão quando vazio/undefined', () => {
        const base = getSystemPrompt();
        assert.ok(base.includes('HAMPTON IA'));
        assert.ok(base.includes('Orun ST'));
        assert.strictEqual(getSystemPrompt(''), base);
        assert.strictEqual(getSystemPrompt('   '), base);
    });

    it('retorna o custom prompt quando informado', () => {
        assert.strictEqual(getSystemPrompt('meu prompt'), 'meu prompt');
    });
});

describe('parseAcoes', () => {
    it('extrai [FILE_EDIT] com crases (formato 1)', () => {
        const texto = `Antes\n[FILE_EDIT]\npath: src/app.ts\n\`\`\`typescript\nconsole.log('oi');\n\`\`\`\n[/FILE_EDIT]\nDepois`;
        const { acoes, textoSemAcoes } = parseAcoes(texto);
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'EDIT');
        assert.strictEqual(acoes[0].path, 'src/app.ts');
        assert.ok(acoes[0].conteudo!.includes('console.log'));
        assert.ok(textoSemAcoes.includes('Antes'));
        assert.ok(textoSemAcoes.includes('Depois'));
        assert.ok(!textoSemAcoes.includes('[FILE_EDIT]'));
    });

    it('extrai [FILE_EDIT] sem crases (formato 2)', () => {
        const texto = `[FILE_EDIT]\npath: a.txt\nconteúdo simples\n[/FILE_EDIT]`;
        const { acoes } = parseAcoes(texto);
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'EDIT');
        assert.strictEqual(acoes[0].conteudo, 'conteúdo simples');
    });

    it('extrai [FILE_DELETE]', () => {
        const { acoes } = parseAcoes('[FILE_DELETE]\npath: lixo.txt\n[/FILE_DELETE]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'DELETE');
        assert.strictEqual(acoes[0].path, 'lixo.txt');
    });

    it('extrai [RUN_CMD]', () => {
        const { acoes } = parseAcoes('[RUN_CMD]\nmkdir -p src\n[/RUN_CMD]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'RUN_CMD');
        assert.strictEqual(acoes[0].comando, 'mkdir -p src');
    });

    it('extrai [FILE_READ] e [LIST_FILES]', () => {
        const { acoes } = parseAcoes('[FILE_READ]\npath: a.txt\n[/FILE_READ]\n[LIST_FILES]\npath: src\n[/LIST_FILES]');
        assert.deepStrictEqual(
            acoes.map((a) => ({ tipo: a.tipo, path: a.path })),
            [
                { tipo: 'READ', path: 'a.txt' },
                { tipo: 'LIST', path: 'src' },
            ] as { tipo: Acao['tipo']; path?: string }[],
        );
    });

    it('extrai [OPEN]', () => {
        const { acoes } = parseAcoes('[OPEN]\nsrc/index.html\n[/OPEN]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'OPEN');
        assert.strictEqual(acoes[0].path, 'src/index.html');
    });

    it('combina múltiplas ações na ordem', () => {
        const texto = '[RUN_CMD]\nmkdir src\n[/RUN_CMD]\n[FILE_EDIT]\npath: b.txt\nconteúdo\n[/FILE_EDIT]';
        const { acoes } = parseAcoes(texto);
        assert.strictEqual(acoes.length, 2);
        const tipos = acoes.map((a) => a.tipo).sort();
        assert.deepStrictEqual(tipos, ['EDIT', 'RUN_CMD']);
        const edit = acoes.find((a) => a.tipo === 'EDIT');
        const cmd = acoes.find((a) => a.tipo === 'RUN_CMD');
        assert.strictEqual(edit!.path, 'b.txt');
        assert.strictEqual(cmd!.comando, 'mkdir src');
    });

    it('sem ações retorna vazio e texto preservado', () => {
        const { acoes, textoSemAcoes } = parseAcoes('apenas texto normal');
        assert.strictEqual(acoes.length, 0);
        assert.strictEqual(textoSemAcoes, 'apenas texto normal');
    });

    it('extrai [MEMORY_SAVE] com chave e tags', () => {
        const texto = `[MEMORY_SAVE]
chave: projeto/x-verbos
tags: arquitetura, decisao
Preferimos destruturar direto nos params das funções.
[/MEMORY_SAVE]`;
        const { acoes, textoSemAcoes } = parseAcoes(texto);
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'MEMORY_SAVE');
        assert.strictEqual(acoes[0].chave, 'projeto/x-verbos');
        assert.deepStrictEqual(acoes[0].tags, ['arquitetura', 'decisao']);
        assert.ok(acoes[0].conteudo!.includes('destruturar'));
        assert.ok(!textoSemAcoes.includes('[MEMORY_SAVE]'));
    });

    it('descarta [MEMORY_SAVE] sem chave (chave é obrigatória) e remove o bloco do texto', () => {
        const { acoes, textoSemAcoes } = parseAcoes('[MEMORY_SAVE]\nPrecisamos de testes.\n[/MEMORY_SAVE]');
        assert.strictEqual(acoes.length, 0);
        assert.ok(!textoSemAcoes.includes('[MEMORY_SAVE]'));
    });

    it('extrai [LOAD_SKILL] com nome (aceita nome: ou name:)', () => {
        const { acoes } = parseAcoes('[LOAD_SKILL]\nnome: developer\n[/LOAD_SKILL]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'LOAD_SKILL');
        assert.strictEqual(acoes[0].nome, 'developer');
        const comName = parseAcoes('[LOAD_SKILL]\nname: code-review\n[/LOAD_SKILL]');
        assert.strictEqual(comName.acoes[0].nome, 'code-review');
    });

    it('descarta [LOAD_SKILL] sem nome e mantém outros blocos intactos', () => {
        const { acoes, textoSemAcoes } = parseAcoes('[LOAD_SKILL]\n[/LOAD_SKILL]\n[RUN_CMD]\nmkdir -p src\n[/RUN_CMD]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'RUN_CMD');
        assert.ok(!textoSemAcoes.includes('[LOAD_SKILL]'));
        assert.ok(!textoSemAcoes.includes('[RUN_CMD]'));
    });

    it('extrai [MCP_CALL] com tool e args JSON', () => {
        const texto = `[MCP_CALL]
tool: penpot__list_shapes
args: {"pageId": "abc"}
[/MCP_CALL]`;
        const { acoes, textoSemAcoes } = parseAcoes(texto);
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'MCP_CALL');
        assert.strictEqual(acoes[0].mcpTool, 'penpot__list_shapes');
        assert.deepStrictEqual(acoes[0].mcpArgs, { pageId: 'abc' });
        assert.ok(!textoSemAcoes.includes('[MCP_CALL]'));
    });

    it('extrai [MCP_CALL] sem args (opcional)', () => {
        const { acoes } = parseAcoes('[MCP_CALL]\ntool: github__list_issues\n[/MCP_CALL]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'MCP_CALL');
        assert.strictEqual(acoes[0].mcpTool, 'github__list_issues');
        assert.strictEqual(acoes[0].mcpArgs, undefined);
    });

    it('descarta [MCP_CALL] sem tool (obrigatória) e mantém outros blocos intactos', () => {
        const { acoes, textoSemAcoes } = parseAcoes('[MCP_CALL]\n[/MCP_CALL]\n[RUN_CMD]\nmkdir -p src\n[/RUN_CMD]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'RUN_CMD');
        assert.ok(!textoSemAcoes.includes('[MCP_CALL]'));
    });

    it('descarta args JSON inválidos mas mantém a tool', () => {
        const { acoes } = parseAcoes('[MCP_CALL]\ntool: server__tool\nargs: {invalido\n[/MCP_CALL]');
        assert.strictEqual(acoes.length, 1);
        assert.strictEqual(acoes[0].tipo, 'MCP_CALL');
        assert.strictEqual(acoes[0].mcpTool, 'server__tool');
        assert.strictEqual(acoes[0].mcpArgs, undefined);
    });
});

describe('enriquecerSystemPrompt', () => {
    it('injeta memorias e skills no prompt base', () => {
        const resultado = enriquecerSystemPrompt('prompt base', {
            memorias: '## MEMÓRIAS RELEVANTES\n- x',
            skills: '## SKILLS DISPONÍVEIS\n- [developer]',
        });
        assert.ok(resultado.includes('prompt base'));
        assert.ok(resultado.includes('MEMÓRIAS RELEVANTES'));
        assert.ok(resultado.includes('SKILLS DISPONÍVEIS'));
    });

    it('omite blocos dinâmicos vazios sem quebrar o prompt base', () => {
        const resultado = enriquecerSystemPrompt('prompt base', { memorias: '', skills: '', mcp: '' });
        assert.ok(resultado.includes('prompt base'));
        assert.ok(!resultado.includes('## MEMÓRIAS RELEVANTES'));
        assert.ok(!resultado.includes('## SKILLS DISPONÍVEIS'));
        assert.ok(!resultado.includes('FERRAMENTAS MCP'));
    });

    it('injeta ferramentas MCP quando presentes', () => {
        const resultado = enriquecerSystemPrompt('prompt base', {
            memorias: '',
            skills: '',
            mcp: '## FERRAMENTAS MCP DISPONÍVEIS\n- **penpot__list_shapes**',
        });
        assert.ok(resultado.includes('prompt base'));
        assert.ok(resultado.includes('FERRAMENTAS MCP'));
        assert.ok(resultado.includes('penpot__list_shapes'));
        assert.ok(resultado.includes('[MCP_CALL]'));
    });

    it('blocoMemoriasRelevantes cria bloco markdown com instruções', () => {
        const bloco = blocoMemoriasRelevantes(
            [{ chave: 'k1', conteudo: 'c1', tags: [], criadaEm: '1', atualizadaEm: '1' }],
            'k1',
        );
        assert.ok(bloco.includes('MEMÓRIAS RELEVANTES'));
        assert.ok(bloco.includes('k1'));
        assert.ok(bloco.includes('c1'));
    });

    it('blocoAvailableSkills lista skills com dica de [LOAD_SKILL]', () => {
        const bloco = blocoAvailableSkills([
            { nome: 'developer', descricao: 'dev', caminho: 'developer', arquivo: '' },
            { nome: 'code-review', descricao: 'review', caminho: 'code-review', arquivo: '' },
        ]);
        assert.ok(bloco.includes('SKILLS DISPONÍVEIS'));
        assert.ok(bloco.includes('developer'));
        assert.ok(bloco.includes('code-review'));
        assert.ok(bloco.includes('[LOAD_SKILL]'));
    });
});

describe('listarArquivos', () => {
    it('ignora node_modules/.git/out/.vscode', () => {
        const fs = require('fs') as typeof import('fs');
        const path = require('path') as typeof import('path');
        const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'orunvs-'));
        fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'src', 'a.txt'), 'x');
        fs.writeFileSync(path.join(tmp, 'raiz.txt'), 'x');
        const lista = listarArquivos(tmp);
        assert.ok(lista.includes('src/'));
        assert.ok(lista.includes('src/a.txt'));
        assert.ok(lista.includes('raiz.txt'));
        assert.ok(!lista.some((x) => x.includes('node_modules')));
        assert.ok(!lista.some((x) => x.includes('.git')));
        assert.ok(!lista.some((x) => x.includes('out/')));
        assert.ok(!lista.some((x) => x.includes('.vscode')));
        fs.rmSync(tmp, { recursive: true, force: true });
    });
});

describe('ehAcaoExploratoria / precisaContinuarLoop', () => {
    it('reconhece leitura/lista/skill/mcp como exploratórias', () => {
        assert.ok(ehAcaoExploratoria({ tipo: 'READ', path: 'a.ts' }));
        assert.ok(ehAcaoExploratoria({ tipo: 'LIST', path: 'src' }));
        assert.ok(ehAcaoExploratoria({ tipo: 'LOAD_SKILL', nome: 'developer' }));
        assert.ok(ehAcaoExploratoria({ tipo: 'MCP_CALL', mcpTool: 'git__status' }));
    });

    it('trata edição/criação/delete/comando como trabalho final (não exploratório)', () => {
        assert.ok(!ehAcaoExploratoria({ tipo: 'EDIT', path: 'a.ts', conteudo: 'x' }));
        assert.ok(!ehAcaoExploratoria({ tipo: 'CREATE', path: 'b.ts', conteudo: 'x' }));
        assert.ok(!ehAcaoExploratoria({ tipo: 'DELETE', path: 'lixo.txt' }));
        assert.ok(!ehAcaoExploratoria({ tipo: 'RUN_CMD', comando: 'npm test' }));
        assert.ok(!ehAcaoExploratoria({ tipo: 'OPEN', path: 'a.ts' }));
        assert.ok(!ehAcaoExploratoria({ tipo: 'MEMORY_SAVE', chave: 'k', conteudo: 'v' }));
    });

    it('precisaContinuarLoop só continua quando há ação exploratória', () => {
        assert.ok(precisaContinuarLoop([{ tipo: 'READ', path: 'a.ts' }]));
        assert.ok(precisaContinuarLoop([
            { tipo: 'LIST', path: 'src' },
            { tipo: 'READ', path: 'src/a.ts' },
        ]));
        // mistura com trabalho final também continua (a leitura ainda precisa voltar ao modelo)
        assert.ok(precisaContinuarLoop([
            { tipo: 'READ', path: 'a.ts' },
            { tipo: 'EDIT', path: 'b.ts', conteudo: 'x' },
        ]));
        assert.ok(!precisaContinuarLoop([]));
        assert.ok(!precisaContinuarLoop([{ tipo: 'EDIT', path: 'a.ts', conteudo: 'x' }]));
        assert.ok(!precisaContinuarLoop([{ tipo: 'RUN_CMD', comando: 'npm test' }]));
        assert.ok(!precisaContinuarLoop([{ tipo: 'CREATE', path: 'b.ts', conteudo: 'x' }]));
    });
});

describe('limparSobrasAcoes', () => {
    it('remove tag de abertura sem fechamento (resto de [FILE_READ])', () => {
        const limpo = limparSobrasAcoes('Analisei o arquivo.\n[FILE_READ]\npath: src/core.ts\n');
        assert.ok(!limpo.includes('[FILE_READ]'));
        assert.ok(!limpo.includes('path: src/core.ts'));
        assert.ok(limpo.includes('Analisei o arquivo.'));
    });

    it('remove blocos completos malformados e tags soltas', () => {
        const limpo = limparSobrasAcoes('[FILE_EDIT]\npath: a.ts\nconteudo\n[/FILE_EDIT]\nResumo final.\n[LIST_FILES]');
        assert.ok(!limpo.includes('FILE_EDIT'));
        assert.ok(!limpo.includes('LIST_FILES'));
        assert.ok(!limpo.includes('[/FILE_EDIT]'));
        assert.ok(limpo.includes('Resumo final.'));
    });

    it('preserva texto normal e colapsa linhas vazias em excesso', () => {
        const limpo = limparSobrasAcoes('O projeto usa TypeScript.\n\n\n\n\nE Supabase.');
        assert.ok(limpo.includes('TypeScript'));
        assert.ok(!limpo.includes('\n\n\n\n\n'));
        assert.strictEqual(limparSobrasAcoes(''), '');
    });
});
