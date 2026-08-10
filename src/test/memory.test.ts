import * as assert from 'assert';
import { describe, it } from 'mocha';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
    adicionarMemoria,
    buscarMemorias,
    blocoMemoriasRelevantes,
    carregarMemorias,
    pontuarMemoria,
    salvarMemorias,
    Memoria,
} from '../memory';

describe('memória (local-first JSON)', () => {
    it('adicionarMemoria faz upsert por chave e atualiza data', () => {
        let mems = adicionarMemoria([], 'k1', 'conteúdo 1', ['tag']);
        assert.strictEqual(mems.length, 1);
        assert.strictEqual(mems[0].chave, 'k1');
        const antes = new Date().toISOString();
        mems = adicionarMemoria(mems, 'k1', 'conteúdo 2', ['tag']);
        assert.strictEqual(mems.length, 1);
        assert.strictEqual(mems[0].conteudo, 'conteúdo 2');
        assert.ok(mems[0].atualizadaEm >= antes);
    });

    it('adicionarMemoria com conteúdo vazio não adiciona', () => {
        const mems = adicionarMemoria([], 'k1', '', []);
        assert.strictEqual(mems.length, 0);
    });

    it('carregarMemorias/salvarMemorias fazem round-trip em disco', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-mem-'));
        const arq = path.join(dir, 'memorias.json');
        const mems: Memoria[] = [
            { chave: 'k1', conteudo: 'c1', tags: ['a'], criadaEm: '1', atualizadaEm: '1' },
        ];
        salvarMemorias(arq, mems);
        const lidas = carregarMemorias(arq);
        assert.deepStrictEqual(lidas, mems);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('carregarMemorias sem arquivo retorna []', () => {
        assert.deepStrictEqual(carregarMemorias(path.join(os.tmpdir(), 'nao-existe.json')), []);
    });

    it('pontuarMemoria pondera chave, corpo e tags', () => {
        const mem: Memoria = { chave: 'x/auth-tokens', conteudo: 'Usamos refresh tokens.', tags: ['auth'], criadaEm: '1', atualizadaEm: '1' };
        const alta = pontuarMemoria(mem, 'auth tokens');
        const baixa = pontuarMemoria(mem, 'receitas financeiras');
        assert.ok(alta > baixa, 'relevância tem que diferenciar');
    });

    it('buscarMemorias retorna as N mais relevantes', () => {
        const mems: Memoria[] = [
            { chave: 'a/auth', conteudo: 'sobre auth tokens', tags: ['auth'], criadaEm: '1', atualizadaEm: '1' },
            { chave: 'b/foo', conteudo: 'qualquer coisa', tags: [], criadaEm: '1', atualizadaEm: '1' },
        ];
        const top = buscarMemorias(mems, 'auth', 1);
        assert.strictEqual(top.length, 1);
        assert.strictEqual(top[0].chave, 'a/auth');
    });

    it('blocoMemoriasRelevantes gera bloco markdown', () => {
        const bloco = blocoMemoriasRelevantes([
            { chave: 'k1', conteudo: 'c1', tags: ['t'], criadaEm: '1', atualizadaEm: '1' },
        ], 'k1');
        assert.ok(bloco.includes('MEMÓRIAS RELEVANTES'));
        assert.ok(bloco.includes('k1'));
        assert.ok(bloco.includes('c1'));
    });
});
