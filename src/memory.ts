/*
 * memory.ts — memória de longo prazo local-first do OrunVS (sem dependência de vscode).
 * Persistência em JSON local (globalStorage), busca por relevância de tokens,
 * e injeção de um bloco <memorias_relevantes> no system prompt.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface Memoria {
    chave: string;
    conteudo: string;
    tags: string[];
    criadaEm: string;
    atualizadaEm: string;
}

export function carregarMemorias(caminho: string): Memoria[] {
    try {
        if (!fs.existsSync(caminho)) return [];
        const raw = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
        if (!Array.isArray(raw)) return [];
        return raw.filter((m) => m && typeof m.chave === 'string' && typeof m.conteudo === 'string');
    } catch {
        return [];
    }
}

export function salvarMemorias(caminho: string, memorias: Memoria[]): void {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, JSON.stringify(memorias, null, 2), 'utf-8');
}

export function adicionarMemoria(memorias: Memoria[], chave: string, conteudo: string, tags: string[] = []): Memoria[] {
    if (!chave || !conteudo || !conteudo.trim()) return memorias;
    const agora = new Date().toISOString();
    const idx = memorias.findIndex((m) => m.chave === chave);
    if (idx >= 0) {
        const copia = [...memorias];
        copia[idx] = { ...copia[idx], conteudo, tags: tags || [], atualizadaEm: agora };
        return copia;
    }
    return [...memorias, { chave, conteudo, tags: tags || [], criadaEm: agora, atualizadaEm: agora }];
}

function tokens(texto: string): string[] {
    const limpo = (texto || '').toLowerCase().replace(/[^a-zà-ú0-9]+/gi, ' ');
    return limpo.split(' ').filter((t) => t.length >= 2);
}

export function pontuarMemoria(memoria: Memoria, query: string): number {
    const qTokens = tokens(query);
    if (qTokens.length === 0) return 0;
    const chaveTokens = tokens(memoria.chave);
    const corpoTokens = tokens(memoria.conteudo);
    const tagsTexto = (memoria.tags || []).join(' ').toLowerCase();
    let score = 0;
    for (const q of qTokens) {
        if (chaveTokens.some((t) => t === q)) score += 5;
        else if (chaveTokens.some((t) => t.includes(q) || q.includes(t))) score += 2;
        if (tagsTexto.includes(q)) score += 3;
        if (corpoTokens.some((t) => t === q)) score += 1;
    }
    return score;
}

export function buscarMemorias(memorias: Memoria[], query: string, limite = 5): Memoria[] {
    const comScore = memorias
        .map((m) => ({ m, score: pontuarMemoria(m, query) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
    return comScore.slice(0, limite).map((x) => x.m);
}

export function blocoMemoriasRelevantes(memorias: Memoria[], query: string, limite = 5): string {
    const achadas = buscarMemorias(memorias, query, limite);
    if (achadas.length === 0) return '';
    const linhas = achadas.map((m) => {
        const tags = m.tags && m.tags.length ? ` (tags: ${m.tags.join(', ')})` : '';
        return `- **${m.chave}**: ${m.conteudo}${tags}`;
    });
    return `## MEMÓRIAS RELEVANTES\n${linhas.join('\n')}`;
}
