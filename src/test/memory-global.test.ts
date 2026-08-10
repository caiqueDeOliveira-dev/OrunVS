import * as assert from 'assert';
import { describe, it } from 'mocha';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
    caminhoMemoryMd,
    lerArquivo,
    extrairResumoAtual,
    blocoMemoriaGlobal,
    registrarSessaoGlobal,
    registrarSessaoGlobalSync,
    SessaoGlobal,
} from '../memory-global';

const sessaoTeste: SessaoGlobal = {
    titulo: 'Teste de integração',
    ferramenta: 'OrunVS',
    projeto: 'orunvs',
    objetivo: 'validar o fluxo de escrita no MEMORY.md',
    feito: ['registrou a sessão de teste'],
    decisoes: ['escrita atômica com lock'],
    emAndamento: [],
    proximos: ['rodar testes'],
};

describe('memória global (MEMORY.md do ecossistema)', () => {
    it('caminhoMemoryMd aponta para ~/.config/opencode/MEMORY.md', () => {
        const esperado = path.join(os.homedir(), '.config', 'opencode', 'MEMORY.md');
        assert.strictEqual(caminhoMemoryMd(), esperado);
    });

    it('lerArquivo inexistente retorna vazio', () => {
        assert.strictEqual(lerArquivo(path.join(os.tmpdir(), 'nao-existe-memory.md')), '');
    });

    it('extrairResumoAtual pega só o parágrafo do Resumo atual', () => {
        const conteudo = [
            '# MEMORY.md',
            '## Resumo atual',
            '> Atualização longa que deve ser filtrada...',
            'Orun é um ecossistema de apps com IA multi-agente.',
            '## Histórico de sessões',
            '### Sessão antiga',
        ].join('\n');
        const resumo = extrairResumoAtual(conteudo);
        assert.ok(resumo.includes('Orun é um ecossistema'));
        assert.ok(!resumo.includes('Atualização longa'));
        assert.ok(!resumo.includes('Histórico de sessões'));
    });

    it('extrairResumoAtual respeita maxChars', () => {
        const conteudo = ['## Resumo atual', 'x'.repeat(5000), '## Histórico'].join('\n');
        const resumo = extrairResumoAtual(conteudo, 1200);
        assert.ok(resumo.length <= 1201);
    });

    it('blocoMemoriaGlobal monta bloco apenas quando há resumo', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-gmem-'));
        const arq = path.join(dir, 'MEMORY.md');
        fs.writeFileSync(arq, ['## Resumo atual', 'estado atual', '## Histórico'].join('\n'), 'utf-8');
        const bloco = blocoMemoriaGlobal(arq);
        assert.ok(bloco.includes('MEMÓRIA GLOBAL'));
        assert.ok(bloco.includes('estado atual'));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('registrarSessaoGlobal anexa sessão e atualiza resumo (round-trip em arquivo temp)', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-gwrite-'));
        const arq = path.join(dir, 'MEMORY.md');
        fs.writeFileSync(arq, '# MEMORY.md\n\n## Resumo atual\n(estado atual)\n\n## Histórico de sessões\n', 'utf-8');

        const res = await registrarSessaoGlobal(sessaoTeste, arq);
        assert.strictEqual(res.ok, true);

        const conteudo = lerArquivo(arq);
        assert.ok(conteudo.includes('### Sessão'));
        assert.ok(conteudo.includes('(OrunVS) (orunvs)'));
        assert.ok(conteudo.includes('**Objetivo**: validar o fluxo de escrita no MEMORY.md'));
        assert.ok(conteudo.includes('**Decisões**: escrita atômica com lock'));
        // resumo atual atualizado
        assert.ok(conteudo.includes('OrunVS: Teste de integração. registrou a sessão de teste'));
        // lock liberado
        assert.ok(!fs.existsSync(arq + '.lock'), 'lock deve ser liberado');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('registrarSessaoGlobal cria o arquivo do zero quando não existe', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-gnew-'));
        const arq = path.join(dir, 'MEMORY.md');
        const res = await registrarSessaoGlobal(sessaoTeste, arq);
        assert.strictEqual(res.ok, true);
        const conteudo = lerArquivo(arq);
        assert.ok(conteudo.includes('# MEMORY.md'));
        assert.ok(conteudo.includes('## Histórico de sessões'));
        assert.ok(conteudo.includes('### Sessão'));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('registrarSessaoGlobalSync funciona sem conflito de lock', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-gsync-'));
        const arq = path.join(dir, 'MEMORY.md');
        fs.writeFileSync(arq, '## Histórico de sessões\n', 'utf-8');
        const res = registrarSessaoGlobalSync(sessaoTeste, arq);
        assert.strictEqual(res.ok, true);
        assert.ok(lerArquivo(arq).includes('### Sessão'));
        assert.ok(!fs.existsSync(arq + '.lock'));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('registrarSessaoGlobal respeita lock ativo de outra ferramenta', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-glock-'));
        const arq = path.join(dir, 'MEMORY.md');
        fs.writeFileSync(arq, '## Histórico de sessões\n', 'utf-8');
        fs.writeFileSync(arq + '.lock', '9999', 'utf-8');
        const res = await registrarSessaoGlobal(sessaoTeste, arq, 200);
        assert.strictEqual(res.ok, false);
        assert.ok(res.mensagem.includes('lock'));
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
