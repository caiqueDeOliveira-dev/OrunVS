import * as assert from 'assert';
import { describe, it } from 'mocha';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
    blocoAvailableSkills,
    carregarSkill,
    lerFrontmatter,
    listarSkills,
} from '../skills';

function criarSkillDir(nome: string, markdown: string): string {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-skills-'));
    const dir = path.join(raiz, nome);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), markdown);
    return raiz;
}

describe('skills', () => {
    it('lerFrontmatter extrai name e description (com e sem frontmatter)', () => {
        const comFront = '---\nname: developer\ndescription: skill de dev\n---\n# Conteúdo';
        assert.deepStrictEqual(lerFrontmatter(comFront), { name: 'developer', description: 'skill de dev' });
        const semFront = '# Developer\nSem metadata.';
        assert.deepStrictEqual(lerFrontmatter(semFront), {});
    });

    it('listarSkills encontra skills em skills/<nome>/SKILL.md', () => {
        const raiz = criarSkillDir('developer', '# Developer');
        fs.mkdirSync(path.join(raiz, 'code-review'));
        fs.writeFileSync(path.join(raiz, 'code-review', 'SKILL.md'), '# Code Review');
        const skills = listarSkills(raiz);
        const nomes = skills.map((s) => s.nome).sort();
        assert.deepStrictEqual(nomes, ['code-review', 'developer']);
        fs.rmSync(raiz, { recursive: true, force: true });
    });

    it('listarSkills ignora pastas sem SKILL.md e diretório inexistente', () => {
        const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'orunvs-skills-'));
        fs.mkdirSync(path.join(raiz, 'sem-arquivo'));
        fs.writeFileSync(path.join(raiz, 'um.txt'), 'x');
        assert.deepStrictEqual(listarSkills(raiz).map((s) => s.nome), []);
        fs.rmSync(raiz, { recursive: true, force: true });
        assert.deepStrictEqual(listarSkills(path.join(os.tmpdir(), 'nao-existe-skills')), []);
    });

    it('carregarSkill retorna o corpo da skill por nome', () => {
        const raiz = criarSkillDir('developer', '---\nname: developer\n---\n# Developer\nCorpo da skill.');
        const conteudo = carregarSkill(raiz, 'developer');
        assert.ok(conteudo, 'deve carregar');
        assert.ok(conteudo!.includes('# Developer'));
        assert.ok(conteudo!.includes('Corpo da skill.'));
        fs.rmSync(raiz, { recursive: true, force: true });
    });

    it('carregarSkill aceita caminho com prefixo skills/ e retorna null p/ inexistente', () => {
        const raiz = criarSkillDir('developer', '# Developer');
        const porCaminho = carregarSkill(raiz, 'skills/developer');
        assert.strictEqual(porCaminho, '# Developer');
        assert.strictEqual(carregarSkill(raiz, 'nao-existe'), null);
        fs.rmSync(raiz, { recursive: true, force: true });
    });

    it('blocoAvailableSkills lista skills com [LOAD_SKILL] e sem quebrar quando vazio', () => {
        const bloco = blocoAvailableSkills([
            { nome: 'developer', descricao: 'dev', caminho: 'developer', arquivo: '' },
            { nome: 'code-review', descricao: 'review', caminho: 'code-review', arquivo: '' },
        ]);
        assert.ok(bloco.includes('SKILLS DISPONÍVEIS'));
        assert.ok(bloco.includes('developer'));
        assert.ok(bloco.includes('code-review'));
        assert.ok(bloco.includes('[LOAD_SKILL]'));
        assert.strictEqual(blocoAvailableSkills([]), '');
    });
});
