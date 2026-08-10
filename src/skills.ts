/*
 * skills.ts — sistema de skills do OrunVS (sem dependência de vscode).
 * Skills são pastas `skills/<nome>/SKILL.md` dentro da extensão, com frontmatter
 * opcional (name/description). O sistema lista as disponíveis (bloco no system
 * prompt) e carrega o conteúdo completo sob demanda via [LOAD_SKILL].
 */
import * as fs from 'fs';
import * as path from 'path';

export interface SkillInfo {
    nome: string;
    descricao: string;
    caminho: string;
    arquivo: string;
}

export interface SkillFrontmatter {
    name?: string;
    description?: string;
}

export function lerFrontmatter(texto: string): SkillFrontmatter {
    const m = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(texto || '');
    if (!m) return {};
    const res: SkillFrontmatter = {};
    for (const linha of m[1].split(/\r?\n/)) {
        const kv = /^\s*([a-zA-Z_-]+)\s*:\s*(.*)\s*$/.exec(linha);
        if (!kv) continue;
        const chave = kv[1].toLowerCase();
        const valor = kv[2].trim().replace(/^['"]|['"]$/g, '');
        if (chave === 'name' && valor) res.name = valor;
        else if (chave === 'description' && valor) res.description = valor;
    }
    return res;
}

export function listarSkills(pasta: string): SkillInfo[] {
    const resultados: SkillInfo[] = [];
    try {
        if (!fs.existsSync(pasta)) return resultados;
        for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
            if (!item.isDirectory()) continue;
            const arquivo = path.join(pasta, item.name, 'SKILL.md');
            if (!fs.existsSync(arquivo)) continue;
            let conteudo = '';
            try { conteudo = fs.readFileSync(arquivo, 'utf-8'); } catch { continue; }
            const fm = lerFrontmatter(conteudo);
            const titulo = (/\n#\s+(.+)/.exec(conteudo)?.[1] || '').trim();
            resultados.push({
                nome: fm.name || item.name,
                descricao: fm.description || titulo || '',
                caminho: item.name,
                arquivo,
            });
        }
    } catch { /* pasta indisponível → sem skills */ }
    return resultados.sort((a, b) => a.nome.localeCompare(b.nome));
}

export function carregarSkill(pasta: string, nome: string): string | null {
    const alvo = (nome || '').trim();
    if (!alvo) return null;
    const normalizado = alvo.replace(/^skills[\/\\]/, '').toLowerCase();
    const skill = listarSkills(pasta).find(
        (s) => s.nome.toLowerCase() === alvo.toLowerCase() || s.caminho.toLowerCase() === normalizado
    );
    if (!skill) return null;
    try {
        return fs.readFileSync(skill.arquivo, 'utf-8');
    } catch {
        return null;
    }
}

export function blocoAvailableSkills(skills: SkillInfo[]): string {
    if (!skills || skills.length === 0) return '';
    const linhas = skills.map((s) => `- **${s.nome}** — ${s.descricao}`);
    return `## SKILLS DISPONÍVEIS\nUse [LOAD_SKILL] com o nome para carregar as instruções completas de uma skill antes de executar.\n${linhas.join('\n')}`;
}
