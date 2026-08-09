import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
    OPENAI_PROVIDERS,
    GEMINI_MODELS,
    GEMINI_DEFAULT_MODEL,
    getSystemPrompt,
    parseAcoes,
    listarArquivos,
    OpenAIProvider,
    Acao,
} from '../core';

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
    it('default é gemini-2.0-flash e está na lista', () => {
        assert.strictEqual(GEMINI_DEFAULT_MODEL, 'gemini-2.0-flash');
        assert.ok(GEMINI_MODELS.some((m) => m.name === GEMINI_DEFAULT_MODEL));
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
