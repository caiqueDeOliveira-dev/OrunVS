import * as assert from 'assert';
import { describe, it } from 'mocha';
import { MCP_CATALOGO, buscarCatalogo, resolverCatalogoConfig, montarBlocoCatalogo } from '../mcp-catalog';

describe('mcp-catalog: catálogo embutido', () => {
    it('todo servidor tem id, nome, categoria, comando, args e hints de ferramentas', () => {
        for (const e of MCP_CATALOGO) {
            assert.ok(e.id, `servidor sem id: ${e.nome}`);
            assert.ok(e.nome, `servidor sem nome: ${e.id}`);
            assert.ok(e.categoria, `servidor sem categoria: ${e.id}`);
            assert.ok(e.comando, `servidor sem comando: ${e.id}`);
            assert.ok(Array.isArray(e.args) && e.args.length > 0, `servidor sem args: ${e.id}`);
            assert.ok(Array.isArray(e.tools) && e.tools.length > 0, `servidor sem tools: ${e.id}`);
        }
    });

    it('ids são únicos', () => {
        const ids = MCP_CATALOGO.map((e) => e.id);
        assert.strictEqual(new Set(ids).size, ids.length);
    });

    it('cobre os principais casos de uso (git, github, web, db, design, docker, browser)', () => {
        const ids = new Set(MCP_CATALOGO.map((e) => e.id));
        for (const esperado of ['git', 'github', 'context7', 'fetch', 'tavily', 'postgres', 'supabase', 'docker', 'penpot', 'playwright']) {
            assert.ok(ids.has(esperado), `catálogo não tem ${esperado}`);
        }
    });

    it('buscarCatalogo encontra por id e retorna undefined para desconhecido', () => {
        const git = buscarCatalogo('git');
        assert.ok(git);
        assert.strictEqual(git!.nome, 'Git MCP');
        assert.strictEqual(buscarCatalogo('nao-existe'), undefined);
    });
});

describe('mcp-catalog: resolverCatalogoConfig', () => {
    it('substitui {workspace} nos args', () => {
        const git = buscarCatalogo('git')!;
        const r = resolverCatalogoConfig(git, () => '', 'C:/meu/repo');
        assert.ok(r.ok);
        if (r.ok) {
            assert.ok((r.config.args || []).includes('C:/meu/repo'));
            assert.strictEqual(r.config.name, 'git');
        }
    });

    it('substitui {setting:...} no env e avisa quando a setting está vazia', () => {
        const github = buscarCatalogo('github')!;
        const preenchido = resolverCatalogoConfig(github, (k) => (k === 'githubToken' ? 'ghp_x' : ''), '');
        assert.ok(preenchido.ok);
        if (preenchido.ok) {
            assert.strictEqual(preenchido.config.env!.GITHUB_PERSONAL_ACCESS_TOKEN, 'ghp_x');
        }

        const semChave = resolverCatalogoConfig(github, () => '', '');
        assert.ok(!semChave.ok);
        if (!semChave.ok) assert.strictEqual(semChave.falta, 'orunvs.githubToken');
    });

    it('servidores sem env obrigatório resolvem sem pedir config', () => {
        const fetch = buscarCatalogo('fetch')!;
        const r = resolverCatalogoConfig(fetch, () => '', '');
        assert.ok(r.ok);
        if (r.ok) assert.deepStrictEqual(r.config.env, {});
    });
});

describe('mcp-catalog: montarBlocoCatalogo', () => {
    it('monta bloco com servidores rodando, permitidos-dormentes e desativados', () => {
        const bloco = montarBlocoCatalogo('## FERRAMENTAS MCP DISPONÍVEIS\n- **git__status**', ['git', 'context7']);
        assert.ok(bloco.includes('git__status'));               // rodando
        assert.ok(bloco.includes('inicia ao usar'));            // dormentes permitidos
        assert.ok(bloco.includes('context7__resolve-library-id'));
        assert.ok(bloco.includes('desativados'));               // fora da allowlist
        assert.ok(bloco.includes('github'));
    });

    it('sem bloco rodando e sem ativos só lista desativados (sem quebrar)', () => {
        const bloco = montarBlocoCatalogo('', []);
        assert.ok(bloco.includes('desativados'));
        assert.ok(!bloco.includes('inicia ao usar'));
    });
});
