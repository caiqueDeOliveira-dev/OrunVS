/*
 * memory-global.ts — sincronização com a MEMORY.md GLOBAL do ecossistema Orun
 * (`~/.config/opencode/MEMORY.md`), compartilhada com opencode e com o desktop.
 * Leitura na abertura (resumo atual injetado no system prompt) e escrita de
 * sessão no fim da conversa, com escrita atômica + lock para evitar conflito
 * quando opencode estiver escrevendo ao mesmo tempo.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessaoGlobal {
    titulo: string;
    ferramenta: string;
    projeto: string;
    objetivo: string;
    feito: string[];
    decisoes: string[];
    emAndamento: string[];
    proximos: string[];
}

export function caminhoMemoryMd(): string {
    return path.join(os.homedir(), '.config', 'opencode', 'MEMORY.md');
}

/* ── leitura ── */

export function lerArquivo(caminho: string): string {
    try {
        if (!fs.existsSync(caminho)) return '';
        return fs.readFileSync(caminho, 'utf-8');
    } catch {
        return '';
    }
}

/**
 * Extrai o parágrafo da seção "## Resumo atual" (tudo até a próxima seção `##`).
 * Retorna até `maxChars` caracteres (o bloco injetado no prompt deve ser pequeno).
 */
export function extrairResumoAtual(conteudo: string, maxChars = 1200): string {
    const m = /^##\s+Resumo\s+atual\s*$/mi.exec(conteudo || '');
    if (!m) return '';
    const inicio = m.index + m[0].length;
    const fim = conteudo.indexOf('\n## ', inicio);
    let bloco = (fim === -1 ? conteudo.slice(inicio) : conteudo.slice(inicio, fim)).trim();
    // remove as linhas "> Atualização" longas (condensam o histórico) — mantém só o parágrafo
    const linhas = bloco.split(/\r?\n/).filter((l) => !/^\s*>/.test(l));
    bloco = linhas.join('\n').trim();
    if (bloco.length > maxChars) bloco = bloco.slice(0, maxChars) + '…';
    return bloco;
}

export function blocoMemoriaGlobal(caminho: string): string {
    const conteudo = lerArquivo(caminho);
    const resumo = extrairResumoAtual(conteudo);
    if (!resumo) return '';
    return `## MEMÓRIA GLOBAL DO ECOSSISTEMA (Orun)\nEstado atual compartilhado com opencode/desktop. Use [MEMORY_SAVE]/[LEITURA_MEMORIA] para detalhes, e registre sessões relevantes no fim.\n${resumo}`;
}

/* ── escrita com lock ── */

function esperar(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function adquirirLock(caminho: string, timeoutMs: number): Promise<boolean> {
    const lock = caminho + '.lock';
    const fim = Date.now() + timeoutMs;
    while (Date.now() < fim) {
        try {
            const fd = fs.openSync(lock, 'wx');
            fs.writeFileSync(fd, `${process.pid} ${new Date().toISOString()}`);
            fs.closeSync(fd);
            return true;
        } catch {
            await esperar(100);
        }
    }
    return false;
}

function liberarLock(caminho: string): void {
    try { fs.unlinkSync(caminho + '.lock'); } catch { /* ok */ }
}

/**
 * Registra uma sessão no MEMORY.md global: re-lê o arquivo (para não sobrescrever
 * escrita concorrente), anexa o bloco `### Sessão ...` no "Histórico de sessões"
 * e atualiza o parágrafo "Resumo atual" — tudo com escrita atômica + lock.
 * Retorna `{ ok, mensagem }`.
 */
export async function registrarSessaoGlobal(opts: SessaoGlobal, caminho = caminhoMemoryMd(), timeoutMs = 8000): Promise<{ ok: boolean; mensagem: string }> {
    const lock = await adquirirLock(caminho, timeoutMs);
    if (!lock) return { ok: false, mensagem: 'Não foi possível adquirir o lock do MEMORY.md (outra ferramenta está escrevendo).' };
    try {
        const conteudo = lerArquivo(caminho);
        const agora = new Date();
        const data = agora.toISOString().replace('T', ' ').slice(0, 16);
        const titulo = opts.titulo || 'Conversa no OrunVS';
        const rotuloProjeto = opts.projeto ? ` (${opts.projeto})` : '';

        const bloco = [
            `### Sessão ${data} — ${titulo} (${opts.ferramenta || 'OrunVS'})${rotuloProjeto}`,
            `- **Objetivo**: ${opts.objetivo || '-'}`,
            `- **O que foi feito**: ${opts.feito.length ? opts.feito.join('; ') : '-'}`,
            opts.decisoes.length ? `- **Decisões**: ${opts.decisoes.join('; ')}` : '- **Decisões**: -',
            opts.emAndamento.length ? `- **Em andamento/bloqueios**: ${opts.emAndamento.join('; ')}` : '- **Em andamento/bloqueios**: -',
            opts.proximos.length ? `- **Próximos passos**: ${opts.proximos.join('; ')}` : '- **Próximos passos**: -',
            '',
        ].join('\n');

        let novo = conteudo;
        if (!novo.trim()) {
            novo = `# MEMORY.md — Memória global do ecossistema Orun\n\n> Atualizado por: opencode (skill orun-memory). Nunca apague o histórico sem permissão.\n\n## Como usar\n\n## Resumo atual\n(estado atual)\n\n## Histórico de sessões\n`;
        }
        // garante a seção de histórico
        if (!/^##\s+Histórico de sessões\s*$/mi.test(novo)) {
            novo = novo.replace(/\s*$/, '\n\n## Histórico de sessões\n');
        }
        // anexa o bloco logo após a linha da seção "## Histórico de sessões"
        novo = novo.replace(/^(##\s+Histórico de sessões\s*)$/mi, `$1\n${bloco}`);

        // atualiza o Resumo atual: se existir seção, substitui o parágrafo; senão adiciona.
        const resumoCurto = (opts.feito[0] ? `OrunVS: ${opts.titulo}. ${opts.feito[0]}` : `OrunVS: ${opts.titulo}`).slice(0, 400);
        if (/^##\s+Resumo\s+atual\s*$/mi.test(novo)) {
            novo = novo.replace(/(^##\s+Resumo\s+atual\s*$)([\s\S]*?)(?=^##\s)/mi, `$1\n${resumoCurto}\n\n`);
        } else {
            novo = novo.replace(/^##\s+Como\s+usar\s*$/mi, `## Como usar\n\n## Resumo atual\n${resumoCurto}\n`);
        }

        // escrita atômica
        const tmp = caminho + '.tmp';
        fs.writeFileSync(tmp, novo, 'utf-8');
        fs.renameSync(tmp, caminho);
        return { ok: true, mensagem: `Sessão registrada em ${caminho}` };
    } catch (e: any) {
        return { ok: false, mensagem: `Erro ao registrar sessão: ${e.message}` };
    } finally {
        liberarLock(caminho);
    }
}

export function registrarSessaoGlobalSync(opts: SessaoGlobal, caminho = caminhoMemoryMd()): { ok: boolean; mensagem: string } {
    // versão síncrona com lock best-effort (sem espera longa)
    const lock = caminho + '.lock';
    try {
        const fd = fs.openSync(lock, 'wx');
        fs.writeFileSync(fd, `${process.pid} ${new Date().toISOString()}`);
        fs.closeSync(fd);
    } catch {
        return { ok: false, mensagem: 'MEMORY.md está em uso por outra ferramenta (lock ativo). Tente de novo em instantes.' };
    }
    try {
        const conteudo = lerArquivo(caminho);
        const agora = new Date();
        const data = agora.toISOString().replace('T', ' ').slice(0, 16);
        const titulo = opts.titulo || 'Conversa no OrunVS';
        const rotuloProjeto = opts.projeto ? ` (${opts.projeto})` : '';
        const bloco = [
            `### Sessão ${data} — ${titulo} (${opts.ferramenta || 'OrunVS'})${rotuloProjeto}`,
            `- **Objetivo**: ${opts.objetivo || '-'}`,
            `- **O que foi feito**: ${opts.feito.length ? opts.feito.join('; ') : '-'}`,
            opts.decisoes.length ? `- **Decisões**: ${opts.decisoes.join('; ')}` : '- **Decisões**: -',
            opts.emAndamento.length ? `- **Em andamento/bloqueios**: ${opts.emAndamento.join('; ')}` : '- **Em andamento/bloqueios**: -',
            opts.proximos.length ? `- **Próximos passos**: ${opts.proximos.join('; ')}` : '- **Próximos passos**: -',
            '',
        ].join('\n');
        let novo = conteudo;
        if (!novo.trim()) {
            novo = `# MEMORY.md — Memória global do ecossistema Orun\n\n> Atualizado por: opencode (skill orun-memory). Nunca apague o histórico sem permissão.\n\n## Como usar\n\n## Resumo atual\n(estado atual)\n\n## Histórico de sessões\n`;
        }
        if (!/^##\s+Histórico de sessões\s*$/mi.test(novo)) {
            novo = novo.replace(/\s*$/, '\n\n## Histórico de sessões\n');
        }
        novo = novo.replace(/^(##\s+Histórico de sessões\s*)$/mi, `$1\n${bloco}`);
        const resumoCurto = (opts.feito[0] ? `OrunVS: ${opts.titulo}. ${opts.feito[0]}` : `OrunVS: ${opts.titulo}`).slice(0, 400);
        if (/^##\s+Resumo\s+atual\s*$/mi.test(novo)) {
            novo = novo.replace(/(^##\s+Resumo\s+atual\s*$)([\s\S]*?)(?=^##\s)/mi, `$1\n${resumoCurto}\n\n`);
        } else {
            novo = novo.replace(/^##\s+Como\s+usar\s*$/mi, `## Como usar\n\n## Resumo atual\n${resumoCurto}\n`);
        }
        const tmp = caminho + '.tmp';
        fs.writeFileSync(tmp, novo, 'utf-8');
        fs.renameSync(tmp, caminho);
        return { ok: true, mensagem: `Sessão registrada em ${caminho}` };
    } catch (e: any) {
        return { ok: false, mensagem: `Erro ao registrar sessão: ${e.message}` };
    } finally {
        try { fs.unlinkSync(caminho + '.lock'); } catch { /* ok */ }
    }
}
