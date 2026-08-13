import * as vscode from 'vscode';
import OpenAI from 'openai';
import MarkdownIt from 'markdown-it';
import * as path from 'path';
import * as fs from 'fs';
import { OPENAI_PROVIDERS, GEMINI_MODELS, GEMINI_DEFAULT_MODEL, getSystemPrompt, FORCE_ACTIONS_PROMPT, parseAcoes, listarArquivos, OpenAIProvider, AcaoTipo, Acao, montarCadeiaFallback, classificarErro, formatarEta, enriquecerSystemPrompt, ehAcaoExploratoria } from './core';
import { Memoria, carregarMemorias, salvarMemorias, adicionarMemoria, blocoMemoriasRelevantes } from './memory';
import { SkillInfo, listarSkills, carregarSkill, blocoAvailableSkills } from './skills';
import { caminhoMemoryMd, lerArquivo, extrairResumoAtual, blocoMemoriaGlobal, registrarSessaoGlobal, SessaoGlobal } from './memory-global';
import { MCPManager, MCPTool, MCPCallResult, MCPServerConfig, normalizarConfigsMCP, blocoFerramentasMCP } from './mcp';
import { MCP_CATALOGO, buscarCatalogo, resolverCatalogoConfig, montarBlocoCatalogo } from './mcp-catalog';


interface ModelPick {
    label: string;
    description: string;
    detail: string;
    modelName: string;
    provider: string;
}


/* ── HISTORICO ── */
interface Mensagem {
    role: 'user' | 'model';
    text: string;
    image?: { mimeType: string; data: string };
}

/* ── SISTEMA DE PERMISSOES ── */


class PermissionManager {
    private _allowAll: Map<string, boolean> = new Map();
    private _callback: ((tipo: AcaoTipo, descricao: string, detalhe: string) => Promise<'allow' | 'deny' | 'always'>) | null = null;

    setCallback(cb: (tipo: AcaoTipo, descricao: string, detalhe: string) => Promise<'allow' | 'deny' | 'always'>) {
        this._callback = cb;
    }

    async pedirPermissao(tipo: AcaoTipo, descricao: string, detalhe: string): Promise<'allow' | 'deny' | 'always'> {
        if (this._allowAll.get(tipo)) return 'allow';

        const autoApprove = vscode.workspace.getConfiguration('orunvs').get<boolean>('autoApprove');
        if (autoApprove) return 'allow';

        if (this._callback) {
            const result = await this._callback(tipo, descricao, detalhe);
            if (result === 'always') this._allowAll.set(tipo, true);
            return result;
        }

        // fallback: VS Code modal
        const escolha = await vscode.window.showWarningMessage(
            `🔧 OrunVS quer ${tipo === 'EDIT' ? 'EDITAR' : tipo === 'CREATE' ? 'CRIAR' : tipo === 'DELETE' ? 'DELETAR' : 'EXECUTAR'}`, 
            {
                modal: true,
                detail: `${descricao}\n\n${detalhe}`,
            },
            '✅ Permitir',
            '❌ Negar',
            '🔁 Sempre permitir'
        );

        if (escolha === '🔁 Sempre permitir') { this._allowAll.set(tipo, true); return 'always'; }
        if (escolha === '✅ Permitir') return 'allow';
        return 'deny';
    }

    reset() { this._allowAll.clear(); }
}

/** Extras opcionais passados a executarAcao para as ações de memória/skill/MCP. */
interface ExecAcaoExtras {
    salvarMemoria?: (chave: string, conteudo: string, tags: string[]) => void;
    carregarSkill?: (nome: string) => string | null;
    chamarMCP?: (tool: string, args?: Record<string, unknown>) => Promise<MCPCallResult>;
}


async function executarAcao(acao: Acao, perm: PermissionManager, pasta: string, extras?: ExecAcaoExtras): Promise<string> {
    switch (acao.tipo) {
        case 'EDIT':
        case 'CREATE': {
            if (!acao.path) return 'Erro: caminho nao informado';
            const fullPath = path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path);
            const existe = fs.existsSync(fullPath);
            const tipoLabel = existe ? 'EDITAR' : 'CRIAR';

            let resumo = existe
                ? `Arquivo: ${acao.path}\nTamanho atual: ${fs.statSync(fullPath).size} bytes`
                : `Novo arquivo: ${acao.path}`;

            // diff preview para edicoes
            let detalhe = resumo;
            if (existe && acao.conteudo) {
                const atual = fs.readFileSync(fullPath, 'utf-8');
                const novo = acao.conteudo;
                const diffLines: string[] = [];
                const linhasAtual = atual.split('\n');
                const linhasNovo = novo.split('\n');
                const maxLen = Math.max(linhasAtual.length, linhasNovo.length);
                let diffCount = 0;
                for (let i = 0; i < maxLen && diffCount < 30; i++) {
                    if (linhasAtual[i] !== linhasNovo[i]) {
                        if (i < linhasAtual.length) diffLines.push(`- ${linhasAtual[i]}`);
                        if (i < linhasNovo.length) diffLines.push(`+ ${linhasNovo[i]}`);
                        diffCount++;
                    }
                }
                if (maxLen > 30) diffLines.push(`... (+${maxLen - 30} linhas)`);
                detalhe = `📄 ${acao.path}\nLinhas alteradas: ${diffCount}\n\n` + diffLines.slice(0, 40).join('\n');
            }

            const permissao = await perm.pedirPermissao(acao.tipo, `${tipoLabel} ${acao.path}`, detalhe);
            if (permissao === 'deny') return `[AÇÃO NEGADA] ${tipoLabel} ${acao.path}`;

            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, acao.conteudo!, 'utf-8');
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc, { preview: false });
            return `[${tipoLabel}] ${acao.path} - OK`;
        }

        case 'DELETE': {
            if (!acao.path) return 'Erro: caminho nao informado';
            const fullPath = path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path);
            if (!fs.existsSync(fullPath)) return `Arquivo nao existe: ${acao.path}`;

            const permissao = await perm.pedirPermissao('DELETE', `DELETAR ${acao.path}`, 
                `Isso vai APAGAR permanentemente o arquivo:\n${acao.path}`);
            if (permissao === 'deny') return `[AÇÃO NEGADA] DELETE ${acao.path}`;

            fs.unlinkSync(fullPath);
            return `[DELETADO] ${acao.path}`;
        }

        case 'RUN_CMD': {
            if (!acao.comando) return 'Erro: comando nao informado';
            let cmd = acao.comando.trim();
            cmd = cmd.replace(/^(comando|command|cmd|exec|execute|rode|execute\s+o\s+comando)\s*:\s*/i, '');
            cmd = cmd.replace(/^>\s*/gm, '');

            const permissao = await perm.pedirPermissao('RUN_CMD', `EXECUTAR COMANDO`, 
                `Comando: ${cmd}\n\nDiretório: ${pasta}`);
            if (permissao === 'deny') return `[AÇÃO NEGADA] comando: ${cmd}`;

            const terminal = vscode.window.createTerminal('OrunVS');
            terminal.show();
            terminal.sendText(cmd);
            return `[COMANDO EXECUTADO] ${cmd}`;
        }

        case 'READ': {
            if (!acao.path) return 'Erro: caminho nao informado';
            const fullPath = path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path);
            if (!fs.existsSync(fullPath)) return `[ERRO] Arquivo nao existe: ${acao.path}`;
            try {
                const conteudo = fs.readFileSync(fullPath, 'utf-8');
                return `[ARQUIVO: ${acao.path}]\n\`\`\`\n${conteudo}\n\`\`\``;
            } catch (e: any) {
                return `[ERRO] Nao foi possivel ler ${acao.path}: ${e.message}`;
            }
        }

        case 'LIST': {
            const alvo = acao.path === '.' || !acao.path ? pasta : (path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path));
            if (!fs.existsSync(alvo)) return `[ERRO] Pasta nao existe: ${acao.path}`;
            try {
                const arquivos = listarArquivos(alvo);
                return `[ARQUIVOS EM ${acao.path || '.'}]\n${arquivos.join('\n')}`;
            } catch (e: any) {
                return `[ERRO] Nao foi possivel listar ${acao.path}: ${e.message}`;
            }
        }

        case 'OPEN': {
            if (!acao.path) return 'Erro: caminho nao informado';
            const fullPath = path.isAbsolute(acao.path) ? acao.path : path.join(pasta, acao.path);
            if (!fs.existsSync(fullPath)) return `[ERRO] Arquivo nao existe: ${acao.path}`;
            try {
                const terminal = vscode.window.createTerminal('OrunVS-Open');
                terminal.sendText(`Start-Process "${fullPath}"`);
                return `[ABRIR] ${acao.path} - OK`;
            } catch (e: any) {
                return `[ERRO] Nao foi possivel abrir ${acao.path}: ${e.message}`;
            }
        }

        case 'MEMORY_SAVE': {
            if (!acao.chave || !acao.conteudo) return 'Erro: MEMORY_SAVE precisa de chave e conteudo';
            if (!extras?.salvarMemoria) return '[MEMÓRIA] persistência não disponível';
            extras.salvarMemoria(acao.chave, acao.conteudo, acao.tags || []);
            return `[MEMORIA SALVA] ${acao.chave}`;
        }

        case 'LOAD_SKILL': {
            if (!acao.nome) return 'Erro: LOAD_SKILL precisa de nome';
            if (!extras?.carregarSkill) return '[SKILL] carregamento não disponível';
            const conteudo = extras.carregarSkill(acao.nome);
            if (!conteudo) return `[ERRO] Skill não encontrada: ${acao.nome}`;
            return `[SKILL CARREGADA: ${acao.nome}]\n${conteudo}`;
        }

        case 'MCP_CALL': {
            if (!acao.mcpTool) return 'Erro: MCP_CALL precisa de tool (formato nomeServidor__nomeTool)';
            if (!extras?.chamarMCP) return '[MCP] chamada não disponível (MCP desabilitado ou nenhum servidor configurado)';
            const resultado = await extras.chamarMCP(acao.mcpTool, acao.mcpArgs || {});
            if (resultado.ok) return `[MCP:${acao.mcpTool}]\n${resultado.text || '(sem texto retornado)'}`;
            return `[ERRO MCP:${acao.mcpTool}] ${resultado.error || 'erro desconhecido'}`;
        }
    }
}

export class ChatProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'orunvs.chatView';
    private _view?: vscode.WebviewView;
    private _md: MarkdownIt;
    private _perm: PermissionManager;
    private _historico: Mensagem[] = [];
    private _conversas: { historico: Mensagem[]; titulo: string }[] = [];
    private _conversaAtual: number = 0;
    private _abortController: AbortController | null = null;
    private _streamBase: string = '';
    private _editandoMensagem: { texto: string; indice: number } | null = null;
    private _permissoesPendentes: Map<string, (escolha: 'allow' | 'deny' | 'always') => void> = new Map();
    private _memorias: Memoria[] = [];
    private _memoriaCaminho: string;
    private _memoriaGlobalCaminho: string;
    private _resumoGlobal: string = '';
    private _skills: SkillInfo[] = [];
    private _skillCaminho: string;
    private _mcp: MCPManager = new MCPManager();
    private _mcpTools: MCPTool[] = [];

    constructor(private readonly _ctx: vscode.ExtensionContext) {
        this._perm = new PermissionManager();
        this._md = new MarkdownIt();
        this._conversas.push({ historico: [], titulo: 'Conversa 1' });

        this._memoriaCaminho = path.join(this._ctx.globalStorageUri.fsPath, 'memorias.json');
        this._skillCaminho = path.join(this._ctx.extensionUri.fsPath, 'skills');
        try { fs.mkdirSync(this._ctx.globalStorageUri.fsPath, { recursive: true }); } catch { /* ok */ }
        this._memorias = carregarMemorias(this._memoriaCaminho);
        this._skills = listarSkills(this._skillCaminho);

        this._memoriaGlobalCaminho = caminhoMemoryMd();
        this._carregarResumoGlobal();

        this._ctx.subscriptions.push(
            vscode.commands.registerCommand('orunvs.encontrarBugs', () => {
                const editor = vscode.window.activeTextEditor;
                const selected = editor?.document.getText(editor.selection) || editor?.document.getText().slice(0, 2000) || '';
                this.processarPrompt(`Analise este código em busca de bugs:\n\`\`\`\n${selected}\n\`\`\``);
            }),
            vscode.commands.registerCommand('orunvs.explicarCodigo', () => {
                const editor = vscode.window.activeTextEditor;
                const selected = editor?.document.getText(editor.selection) || editor?.document.getText().slice(0, 2000) || '';
                this.processarPrompt(`Explique este código:\n\`\`\`\n${selected}\n\`\`\``);
            }),
            vscode.commands.registerCommand('orunvs.refatorarCodigo', () => {
                const editor = vscode.window.activeTextEditor;
                const selected = editor?.document.getText(editor.selection) || editor?.document.getText().slice(0, 2000) || '';
                this.processarPrompt(`Refatore este código:\n\`\`\`\n${selected}\n\`\`\``);
            }),
            vscode.commands.registerCommand('orunvs.registrarSessao', () => this._registrarSessaoManual()),
            vscode.commands.registerCommand('orunvs.mostrarMemoriaGlobal', () => this._mostrarMemoriaGlobal())
        );
    }

    /** Carrega o Resumo atual do MEMORY.md global na abertura. */
    private _carregarResumoGlobal(): void {
        try {
            const conteudo = lerArquivo(this._memoriaGlobalCaminho);
            this._resumoGlobal = extrairResumoAtual(conteudo);
        } catch {
            this._resumoGlobal = '';
        }
    }

    /** Recarrega o resumo global (após escrita de sessão). */
    private _recarregarResumoGlobal(): void {
        this._carregarResumoGlobal();
        if (this._view) {
            const ok = this._resumoGlobal ? 'sincronizada' : 'vazia';
            this._view.webview.postMessage({
                type: 'notificacao',
                value: `🧠 Memória global ${ok} (${this._memoriaGlobalCaminho})`,
            });
        }
    }

    /** Registra a conversa atual como sessão no MEMORY.md global. */
    private _montarSessaoDaConversa(titulo?: string): SessaoGlobal {
        const usuarios = this._historico.filter((m) => m.role === 'user' && !m.text.startsWith('[Resultados de operações]')).slice(0, 5);
        const objetivo = usuarios.map((u) => u.text.split('\n')[0].slice(0, 120)).join(' | ') || '-';
        const fezAcoes = this._historico.some((m) => m.role === 'model' && /\[(FILE_EDIT|FILE_CREATE|RUN_CMD|MCP_CALL)\]/i.test(m.text));
        const pasta = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
        const projeto = pasta ? pasta.split(/[\\/]/).pop() || '' : '';
        const feito = fezAcoes
            ? ['realizou ações de arquivo/comando no workspace']
            : this._historico.length >= 2
                ? ['conversa concluída no chat']
                : ['conversa iniciada'];
        return {
            titulo: titulo || (objetivo.slice(0, 60) || 'Conversa no OrunVS'),
            ferramenta: 'OrunVS',
            projeto,
            objetivo,
            feito,
            decisoes: [],
            emAndamento: fezAcoes ? ['verificar resultado das ações no workspace'] : [],
            proximos: fezAcoes ? ['revisar/validar as mudanças feitas'] : [],
        };
    }

    private async _registrarSessaoManual(): Promise<void> {
        const titulo = await vscode.window.showInputBox({
            prompt: 'Título da sessão para o MEMORY.md global',
            placeHolder: 'Ex.: Corrigi o bug do scroll no chat',
            value: this._historico.length ? this._historico[0]?.text?.split('\n')[0]?.slice(0, 50) || '' : '',
        });
        if (titulo === undefined) return; // cancelado
        const res = await registrarSessaoGlobal(this._montarSessaoDaConversa(titulo || undefined));
        this._recarregarResumoGlobal();
        vscode.window.showInformationMessage(res.ok ? '✅ ' + res.mensagem : '⚠ ' + res.mensagem);
    }

    /** Registro automático (fire-and-forget) da conversa que está terminando. */
    private _registrarSessaoAutomatica(): void {
        const habilitado = vscode.workspace.getConfiguration('orunvs').get<boolean>('memoriaGlobalAuto') ?? true;
        if (!habilitado) return;
        if (this._historico.length < 2) return; // conversa vazia/insuficiente
        const sessao = this._montarSessaoDaConversa();
        registrarSessaoGlobal(sessao).then((res) => {
            if (res.ok) this._carregarResumoGlobal();
        }).catch(() => { /* silencioso no automático */ });
    }

    private async _mostrarMemoriaGlobal(): Promise<void> {
        const conteudo = lerArquivo(this._memoriaGlobalCaminho);
        if (!conteudo.trim()) {
            vscode.window.showInformationMessage('MEMORY.md global ainda não existe.');
            return;
        }
        const doc = await this._criarDocMarkdown('MEMORY.md global (Orun)', conteudo);
        vscode.window.showTextDocument(doc);
    }

    private async _criarDocMarkdown(nome: string, conteudo: string): Promise<vscode.TextDocument> {
        const tmp = path.join(this._ctx.globalStorageUri.fsPath, 'memory-global-preview.md');
        try { fs.mkdirSync(path.dirname(tmp), { recursive: true }); } catch { /* ok */ }
        fs.writeFileSync(tmp, conteudo, 'utf-8');
        return vscode.workspace.openTextDocument(tmp);
    }

    private _pedirPermissaoWebview(tipo: AcaoTipo, descricao: string, detalhe: string): Promise<'allow' | 'deny' | 'always'> {
        return new Promise((resolve) => {
            if (!this._view) {
                this._pedirPermissaoFallback(tipo, descricao, detalhe).then(resolve);
                return;
            }
            const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
            this._permissoesPendentes.set(id, resolve);

            // timeout de 60s
            setTimeout(() => {
                if (this._permissoesPendentes.has(id)) {
                    this._permissoesPendentes.delete(id);
                    resolve('deny');
                }
            }, 60000);

            this._view.webview.postMessage({
                type: 'pedirPermissao',
                id, tipo, descricao, detalhe,
            });
        });
    }

    private async _pedirPermissaoFallback(tipo: AcaoTipo, descricao: string, detalhe: string): Promise<'allow' | 'deny' | 'always'> {
        const escolha = await vscode.window.showWarningMessage(
            `🔧 OrunVS quer ${tipo === 'EDIT' ? 'EDITAR' : tipo === 'CREATE' ? 'CRIAR' : tipo === 'DELETE' ? 'DELETAR' : 'EXECUTAR'}`,
            { modal: true, detail: `${descricao}\n\n${detalhe}` },
            '✅ Permitir', '❌ Negar', '🔁 Sempre permitir'
        );
        if (escolha === '🔁 Sempre permitir') return 'always';
        if (escolha === '✅ Permitir') return 'allow';
        return 'deny';
    }

    resolveWebviewView(view: vscode.WebviewView) {
        this._view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._ctx.extensionUri],
        };
        view.webview.html = this._html(view.webview);
        this._atualizarBadge();
        this._perm.setCallback((tipo, descricao, detalhe) => this._pedirPermissaoWebview(tipo, descricao, detalhe));

        // envia presets para o webview
        setTimeout(() => {
            const presets = vscode.workspace.getConfiguration('orunvs').get<any[]>('presets') || [];
            view.webview.postMessage({ type: 'presetsCarregados', presets });
        }, 500);

        view.webview.onDidReceiveMessage(async (data: any) => {
            try {
                if (data.type === 'promptEnviado') {
                    await this.processarPrompt(data.value, data.arquivo);
                } else if (data.type === 'trocarProvider') {
                    await this.mostrarCatalogoModelos();
                } else if (data.type === 'selecionarModelo') {
                    await this._selecionarModeloPorNome(data.modelName);
                } else if (data.type === 'limparChat') {
                    this._historico = [];
                    this._perm.reset();
                    this._editandoMensagem = null;
                    this._view?.webview.postMessage({ type: 'limparChat' });
                } else if (data.type === 'exportarChat') {
                    await this._exportarChat();
                } else if (data.type === 'sugerirModelo') {
                    await this._sugerirModelo(data.texto);
                } else if (data.type === 'respostaPermissao') {
                    const resolve = this._permissoesPendentes.get(data.id);
                    if (resolve) {
                        this._permissoesPendentes.delete(data.id);
                        resolve(data.escolha);
                    }
                } else if (data.type === 'pararRequisicao') {
                    if (this._abortController) {
                        this._abortController.abort();
                        this._abortController = null;
                    }
                } else if (data.type === 'reenviarMensagem') {
                    this._editandoMensagem = { texto: data.texto, indice: data.indice };
                    if (this._view) {
                        this._view.webview.postMessage({ type: 'editandoMensagem', texto: data.texto });
                    }
                } else if (data.type === 'cancelarEdicao') {
                    this._editandoMensagem = null;
                } else if (data.type === 'trocarConversa') {
                    if (this._conversaAtual !== data.indice) this._registrarSessaoAutomatica();
                    this._conversas[this._conversaAtual] = { historico: this._historico, titulo: this._conversas[this._conversaAtual].titulo };
                    this._conversaAtual = data.indice;
                    this._historico = this._conversas[this._conversaAtual].historico;
                    this._perm.reset();
                    this._editandoMensagem = null;
                    if (this._view) {
                        this._view.webview.postMessage({ type: 'recarregarHistorico', historico: this._historico.map(m => ({
                            role: m.role,
                            text: this._md.render(m.text),
                            textoOriginal: m.role === 'user' ? m.text : undefined,
                        })) });
                    }
                } else if (data.type === 'novaConversa') {
                    if (this._conversas.length > 0) this._registrarSessaoAutomatica();
                    const titulo = `Conversa ${this._conversas.length + 1}`;
                    this._conversas.push({ historico: [], titulo });
                    this._conversaAtual = this._conversas.length - 1;
                    this._historico = [];
                    this._perm.reset();
                    this._editandoMensagem = null;
                    if (this._view) {
                        this._view.webview.postMessage({ type: 'conversaAdicionada', titulo, indice: this._conversaAtual });
                        this._view.webview.postMessage({ type: 'limparChat' });
                    }
                } else if (data.type === 'regenerarUltimaResposta') {
                    // remove a ultima resposta do modelo do historico
                    let idx = this._historico.length - 1;
                    while (idx >= 0 && this._historico[idx].role === 'model') {
                        idx--;
                    }
                    if (idx >= 0 && this._historico[idx].role === 'user') {
                        const ultimaUser = this._historico[idx];
                        // remove tudo a partir da ultima mensagem do usuario
                        this._historico.splice(idx);
                        await this.processarPrompt(ultimaUser.text);
                    }
                } else if (data.type === 'inlineEdit') {
                    // abre o arquivo no editor com o conteudo do code block
                    const editor = vscode.window.activeTextEditor;
                    if (editor && data.conteudo) {
                        const fullRange = new vscode.Range(
                            editor.document.positionAt(0),
                            editor.document.positionAt(editor.document.getText().length)
                        );
                        editor.edit(editBuilder => {
                            editBuilder.replace(fullRange, data.conteudo);
                        });
                    }
                } else if (data.type === 'rodarVerificacao') {
                    const pasta = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
                    if (!pasta) return;
                    const terminal = vscode.window.createTerminal('OrunVS-Verificação');
                    terminal.show();
                    terminal.sendText(data.comando || '');
                    this._mostrar(`<span style="color:#66ff88">▶ Verificação solicitada: ${data.comando}</span>`);
                }
            } catch (e: any) {
                console.error('[OrunVS] onDidReceiveMessage error:', e);
                vscode.window.showErrorMessage(`OrunVS erro: ${e.message}`);
            }
        });
    }

    private _sugerirModelo(texto: string) {
        const palavra = texto.toLowerCase().trim();
        let modelo = '';
        if (/^(explique|o que é|como funciona|qual|oque|defina)/.test(palavra)) {
            modelo = 'modelo-rápido';
        } else if (/^(refatore|otimize|crie|gere|implemente|construa|faça|desenvolva)/.test(palavra)) {
            modelo = 'modelo-potente';
        }
        if (modelo && this._view) {
            this._view.webview.postMessage({ type: 'sugestaoModelo', value: modelo });
        }
    }

    /**
     * Proatividade segura: depois que a IA edita/cria arquivos, detecta os scripts de
     * verificação do projeto (test/lint/typecheck/check/build) e oferece botões para
     * rodá-los. A execução é sempre iniciada pelo usuário (clique no botão).
     */
    private _sugerirVerificacoes(acoes: Acao[], pasta: string) {
        if (!this._view) return;
        const config = vscode.workspace.getConfiguration('orunvs');
        if (config.get<boolean>('sugestoesVerificacao') === false) return;
        const editou = acoes.some((a) => a.tipo === 'EDIT' || a.tipo === 'CREATE' || a.tipo === 'DELETE');
        if (!editou || !pasta) return;

        const sugestoes: { label: string; comando: string }[] = [];
        try {
            const pkgPath = path.join(pasta, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))?.scripts || {};
                for (const alvo of ['test', 'lint', 'typecheck', 'check', 'build']) {
                    if (scripts[alvo] && sugestoes.length < 3) {
                        sugestoes.push({ label: `🧪 ${alvo}`, comando: `npm run ${alvo}` });
                    }
                }
            }
        } catch { /* package.json inválido ou sem scripts */ }
        if (sugestoes.length === 0) return;
        this._view.webview.postMessage({ type: 'sugestoesVerificacao', sugestoes });
    }

    async processarPrompt(texto: string, arquivo?: any) {
        if (!this._view) {
            try { await vscode.commands.executeCommand('workbench.view.extension.orunvs-sidebar'); } catch { /* ok */ }
        }

        this._abortController = new AbortController();

        const config = vscode.workspace.getConfiguration('orunvs');
        let provider = config.get<string>('provider') || 'gemini';
        let modelName = config.get<string>('modelName') || this._defaultModel(provider);
        const temperature = config.get<number>('temperature') ?? 0.7;
        const maxTokens = config.get<number>('maxTokens') ?? 4096;

        // sugestao automatica de modelo
        this._sugerirModelo(texto);

        // se estiver editando mensagem anterior, remove do historico
        if (this._editandoMensagem) {
            const idx = this._editandoMensagem.indice;
            this._historico.splice(idx);
            this._editandoMensagem = null;
        }

        // migra modelos antigos removidos
        if ((modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-8b' || modelName === 'gemini-2.0-flash-exp'
            || modelName === 'gemini-2.0-flash' || modelName === 'gemini-2.0-flash-lite'
            || modelName === 'gemini-2.5-flash' || modelName === 'gemini-2.5-flash-lite') && provider === 'gemini') {
            modelName = 'gemini-flash-latest';
            await config.update('modelName', modelName, vscode.ConfigurationTarget.Global);
        }

        const editor = vscode.window.activeTextEditor;
        let contexto = editor ? '\n\n[ARQUIVO ATIVO]:\n' + editor.document.getText().slice(0, 2000) : '';

        if (arquivo) {
            if (arquivo.tipo === 'imagem') {
                contexto += `\n\n[IMAGEM: ${arquivo.nome} (${arquivo.mime})]`;
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'respostaIA',
                        value: `<div style="font-size:11px;color:#ff6666;margin-bottom:4px">📷 Imagem anexada: ${arquivo.nome}</div>`,
                    });
                }
            } else {
                contexto += `\n\n[ARQUIVO: ${arquivo.nome}]\n${arquivo.conteudo}`;
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'respostaIA',
                        value: `<div style="font-size:11px;color:#ff6666;margin-bottom:4px">📎 Arquivo anexado: ${arquivo.nome} (${arquivo.conteudo.length} caracteres)</div>`,
                    });
                }
            }
        }

        this._mostrar('<em>Processando...</em>');
        if (this._view) this._view.webview.postMessage({ type: 'streamingIniciou' });

        // mostra mensagem do usuario no chat
        if (this._view) {
            const userHtml = `<div style="font-size:11px;color:#888;margin-bottom:2px">Você:</div><div>${this._md.render(texto)}${arquivo ? `<div style="font-size:11px;color:#ff6666;margin-top:4px">📎 ${arquivo.nome}</div>` : ''}</div>`;
            this._view.webview.postMessage({ type: 'respostaIAUser', value: userHtml, textoOriginal: texto });
        }

        try {
            if (texto === '/model' || texto.startsWith('/model ')) {
                if (texto.startsWith('/model ') && texto.slice(7).trim()) {
                    const nome = texto.slice(7).trim();
                    await this._selecionarModeloPorNome(nome);
                    return;
                }
                this.mostrarCatalogoModelos();
                return;
            }

            // adiciona mensagem do usuario ao historico
            this._historico.push({
                role: 'user',
                text: texto + contexto,
                image: arquivo?.tipo === 'imagem' ? { mimeType: arquivo.mime, data: arquivo.conteudo.split(',')[1] || arquivo.conteudo } : undefined,
            });
            // limita historico a 10 turnos
            if (this._historico.length > 20) this._historico.splice(0, 2);

            const pedidoImplementacao = /(crie|cria|criar|gere|gera|gerar|implemente|implementa|implementar|construa|construir|desenvolva|desenvolver|faça|fazer|monto|monte|refatore|refatora|refatorar|corrija|corrigir|arrume|arrumar|resolva|resolver|edite|editar|substitua|criar um|crie um|site|pagina|página|app|projeto|arquivo|script|código|codigo)/i.test(texto);
            const maxIteracoes = Math.max(1, config.get<number>('maxIteracoes') ?? 5);
            const pasta = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';

            const todasAcoes: Acao[] = [];
            const logLinhas: string[] = [];
            const narracoes: string[] = [];
            const respostasRaw: string[] = [];
            let iter = 0;

            // LOOP DE AGENTE: se a IA explorar ([FILE_READ]/[LIST_FILES]/[LOAD_SKILL]/[MCP_CALL]),
            // os resultados voltam para o modelo e ele continua até entregar o trabalho final
            // (arquivos/comandos) ou uma resposta de texto. Antes o turno PARAVA após a primeira
            // leitura — a IA "começava a codar" (explorava o projeto) e nada mais acontecia.
            for (; iter < maxIteracoes; iter++) {
                this._streamBase = respostasRaw.join('\n\n');
                let resposta = await this._chamarModelo(provider, modelName, config, temperature, maxTokens);
                respostasRaw.push(resposta);

                let { acoes, textoSemAcoes } = parseAcoes(resposta);
                todasAcoes.push(...acoes);
                if (textoSemAcoes) narracoes.push(textoSemAcoes);

                // Auto-retry: pedido de implementacao com resposta SEM nenhum bloco de acao
                // (codigo solto no chat, saudacao generica, etc.) — injeta uma mensagem forçando
                // o formato de acoes e tenta uma segunda vez.
                if (iter === 0 && acoes.length === 0 && pedidoImplementacao) {
                    this._historico.push({ role: 'model', text: resposta });
                    this._historico.push({ role: 'user', text: FORCE_ACTIONS_PROMPT });
                    resposta = await this._chamarModelo(provider, modelName, config, temperature, maxTokens);
                    this._historico.pop();
                    this._historico.pop();
                    respostasRaw.push(resposta);
                    ({ acoes, textoSemAcoes } = parseAcoes(resposta));
                    todasAcoes.push(...acoes);
                    if (textoSemAcoes) narracoes.push(textoSemAcoes);
                }

                // registra a resposta do modelo no historico (ordem correta com as leituras)
                this._historico.push({ role: 'model', text: resposta });

                // executa as acoes desta iteracao
                let leituras = '';
                if (acoes.length > 0) {
                    if (!pasta) {
                        logLinhas.push('<div style="color:#ffaa00;font-size:11px">⚠ Abra uma pasta/workspace para executar ações</div>');
                    } else {
                        if (iter === 0) logLinhas.push(`<div style="font-size:11px;color:#888;margin-bottom:4px">📁 Pasta: ${pasta}</div>`);
                        const edits = acoes.filter((a) => a.tipo === 'EDIT' || a.tipo === 'CREATE').length;
                        const cmds = acoes.filter((a) => a.tipo === 'RUN_CMD').length;
                        logLinhas.push(`<div style="font-size:11px;color:#888;margin-bottom:4px">📋 ${edits} arquivo(s) | ${cmds} comando(s)</div>`);
                        for (const acao of acoes) {
                            const resultado = await executarAcao(acao, this._perm, pasta, {
                                salvarMemoria: (chave, conteudo, tags) => {
                                    this._memorias = adicionarMemoria(this._memorias, chave, conteudo, tags);
                                    try { salvarMemorias(this._memoriaCaminho, this._memorias); } catch (e: any) {
                                        console.error('[OrunVS] erro ao salvar memória:', e);
                                    }
                                },
                                carregarSkill: (nome) => carregarSkill(this._skillCaminho, nome),
                                chamarMCP: async (tool, args) => this._chamarMCP(tool, args || {}),
                            });
                            if (ehAcaoExploratoria(acao)) {
                                leituras += resultado + '\n\n';
                            } else {
                                const cor = resultado.includes('NEGADA') ? '#ff4444' : '#66ff66';
                                logLinhas.push(`<div style="font-size:11px;color:${cor}">${resultado}</div>`);
                            }
                        }
                    }
                } else if (iter === 0 && pedidoImplementacao) {
                    logLinhas.push('<div style="color:#ff8844;font-size:11px">⚠ Nenhuma ação encontrada (pedido de implementação)</div>');
                    if (!(/\[(FILE_EDIT|RUN_CMD)\]/i.test(resposta))) {
                        logLinhas.push('<div style="color:#ff4444;font-size:11px">A IA não usou blocos [FILE_EDIT] ou [RUN_CMD]. Ela gerou código no chat.</div>');
                    }
                }

                // tem leitura a devolver ao modelo → continua o loop de agente
                if (leituras) {
                    this._historico.push({ role: 'user', text: `[Resultados de operações]\n${leituras}` });
                    continue;
                }

                break; // turno final: texto e/ou acoes de trabalho concluidas
            }

            const debugTags = respostasRaw.join('\n');

            // conteudo final: narracao limpa + blocos de arquivos gerados/editados (nao somem
            // da tela) + log de acoes
            let html = narracoes.length ? this._md.render(narracoes.join('\n\n')) : '';
            html += this._montarBlocosConteudo(todasAcoes);
            if (logLinhas.length) {
                html += `<div style="margin-top:10px;border-top:1px solid #333;padding-top:6px">${logLinhas.join('')}</div>`;
            }
            if (iter >= maxIteracoes && debugTags && /\[(FILE_READ|LIST_FILES|MCP_CALL)\]/i.test(debugTags)) {
                html += `<div style="margin-top:8px;font-size:11px;color:#ff8844">⚠ Número máximo de passos de exploração atingido (${maxIteracoes}). Ajuste orunvs.maxIteracoes se necessário.</div>`;
            }
            this._mostrarStreamFinal(html);

            // sugestoes proativas de verificacao se houve edicao/criacao de arquivos
            if (todasAcoes.some((a) => a.tipo === 'EDIT' || a.tipo === 'CREATE' || a.tipo === 'DELETE')) {
                this._sugerirVerificacoes(todasAcoes, pasta);
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                this._finalizarStreamParcial('<span style="color:#ff8844">Requisição cancelada.</span>');
            } else {
                this._finalizarStreamParcial(`<span style="color:#ff4444">Erro: ${err.message}</span>`);
            }
        } finally {
            this._abortController = null;
            this._streamBase = '';
            if (this._view) this._view.webview.postMessage({ type: 'streamingTerminou' });
            this._editandoMensagem = null;
        }
    }

    /**
     * Executa UMA chamada ao provider com fallback automático: quando o provider
     * primário esgota tokens (429/quota/5xx/erro de rede), tenta automaticamente
     * o próximo da cadeia (opencodezen → openrouter → groq → gemini, pulando
     * providers sem chave). Notifica o webview do provider ativo + tempo estimado
     * para os tokens voltarem.
     */
    private async _chamarModelo(provider: string, modelName: string, config: vscode.WorkspaceConfiguration, temperature: number, maxTokens: number): Promise<string> {
        const temChave = (pid: string): boolean => {
            if (pid === 'gemini') return !!(config.get<string>('geminiKey') || '');
            const p = OPENAI_PROVIDERS[pid as OpenAIProvider];
            if (!p) return false;
            return p.apiKeyField ? !!(config.get<string>(p.apiKeyField) || '') : true;
        };
        const isDeprecated = (pid: string): boolean => !!OPENAI_PROVIDERS[pid as OpenAIProvider]?.deprecated;

        const cadeia = montarCadeiaFallback(provider, modelName, config.get<string[]>('fallbackChain'), temChave, isDeprecated);
        if (cadeia.length === 0) {
            throw new Error('Nenhum provider disponível na cadeia de fallback. Verifique as chaves de API nas settings.');
        }

        // Timeout por INATIVIDADE (stall): `orunvs.timeoutMs` é o tempo máximo SEM receber
        // tokens do provider. Um stream ativo que continua recebendo dados NUNCA é cortado
        // (antes o prazo era TOTAL e derrubava respostas longas de geração de código no meio).
        // Existe ainda um teto absoluto de segurança bem maior para casos degenerados.
        const stallMs = Math.max(10_000, config.get<number>('timeoutMs') ?? 120_000);
        const tetoTotalMs = Math.max(stallMs * 5, 15 * 60_000);
        const deadline = Date.now() + tetoTotalMs;

        const eventos: { de: string; para: string; motivo: string; etaMs: number | null }[] = [];
        for (let i = 0; i < cadeia.length; i++) {
            const restante = deadline - Date.now();
            if (restante <= 0) break; // orçamento esgotado — não tenta mais providers
            const item = cadeia[i];
            try {
                const texto = await this._chamarModeloUnico(item.provider, item.model, config, temperature, maxTokens, stallMs, tetoTotalMs);
                this._view?.webview.postMessage({
                    type: 'providerInfo',
                    value: { ativo: item.provider, modelo: item.model, eventos },
                });
                return texto;
            } catch (err: any) {
                const cls = classificarErro(err, item.provider);
                if (cls.categoria === 'abort') throw err;
                const proximo = cadeia[i + 1];
                eventos.push({ de: item.provider, para: proximo?.provider || '', motivo: cls.mensagem, etaMs: cls.etaMs });
                if (proximo && deadline - Date.now() > 0) {
                    this._view?.webview.postMessage({
                        type: 'providerFallback',
                        value: { de: item.provider, para: proximo.provider, motivo: cls.mensagem, etaMs: cls.etaMs },
                    });
                }
            }
        }

        const resumo = eventos
            .map((e) => `${this._rotuloProvider(e.de)} (${e.motivo}${e.etaMs ? ` — volta em ~${formatarEta(e.etaMs)}` : ''})`)
            .join(' → ');
        throw new Error(`Todos os providers falharam. ${resumo || `Nenhum provider respondeu dentro do prazo (teto de segurança de ${Math.round(tetoTotalMs / 60_000)}min).`}`);
    }

    private _rotuloProvider(provider: string): string {
        if (provider === 'gemini') return 'Gemini';
        return OPENAI_PROVIDERS[provider as OpenAIProvider]?.label || provider;
    }

    /**
     * System prompt final = base (padrão ou custom) + instruções de memória/skills +
     * memórias relevantes ao último pedido do usuário + lista de skills disponíveis.
     */
    private _systemPromptEnriquecido(config: vscode.WorkspaceConfiguration): string {
        const base = getSystemPrompt(config.get<string>('systemPrompt') || '');
        let query = '';
        for (let i = this._historico.length - 1; i >= 0; i--) {
            if (this._historico[i].role === 'user') { query = this._historico[i].text; break; }
        }
        const habilitada = config.get<boolean>('memoriaHabilitada') ?? true;
        const memorias = habilitada ? blocoMemoriasRelevantes(this._memorias, query, 5) : '';
        const global = habilitada && this._resumoGlobal ? `## MEMÓRIA GLOBAL DO ECOSSISTEMA (Orun)\nEstado atual compartilhado com opencode/desktop:\n${this._resumoGlobal}` : '';
        const skills = blocoAvailableSkills(this._skills);
        const mcpHabilitado = config.get<boolean>('mcpHabilitado') ?? true;
        const mcp = mcpHabilitado ? this._blocoMCP(config) : '';
        return enriquecerSystemPrompt(base, { memorias, global, skills, mcp });
    }

    /**
     * Bloco MCP do system prompt: ferramentas dos servidores JÁ iniciados +
     * catálogo dormente (permitidos vs desativados). Servidores do catálogo NUNCA
     * são iniciados no boot — só sob demanda no primeiro [MCP_CALL].
     */
    private _blocoMCP(config: vscode.WorkspaceConfiguration): string {
        const ativos = this._mcpAtivos(config);
        const rodando = blocoFerramentasMCP(this._mcpTools);
        return montarBlocoCatalogo(rodando, ativos);
    }

    /** Ids de servidores permitidos: custom (orunvs.mcpServers) + catálogo (orunvs.mcpAtivos). */
    private _mcpAtivos(config: vscode.WorkspaceConfiguration): string[] {
        const custom = normalizarConfigsMCP(config.get<MCPServerConfig[]>('mcpServers')).map((s) => s.name);
        const catalogo = config.get<string[]>('mcpAtivos') || [];
        return Array.from(new Set([...custom, ...catalogo]));
    }

    /**
     * Chama uma ferramenta MCP com ativação ON-DEMAND: se o servidor ainda não
     * estiver rodando, resolve a config (catálogo ou custom) e inicia na hora.
     * Servidores do catálogo só iniciam se estiverem na allowlist (orunvs.mcpAtivos).
     */
    private async _chamarMCP(tool: string, args?: Record<string, unknown>): Promise<MCPCallResult> {
        const idx = tool.indexOf('__');
        if (idx === -1) {
            return { ok: false, text: '', error: `Nome de ferramenta MCP inválido: ${tool} (use nomeServidor__nomeTool)` };
        }
        const serverName = tool.substring(0, idx);
        const toolName = tool.substring(idx + 2);
        const config = vscode.workspace.getConfiguration('orunvs');
        if ((config.get<boolean>('mcpHabilitado') ?? true) === false) {
            return { ok: false, text: '', error: 'MCP está desabilitado (orunvs.mcpHabilitado = false)' };
        }

        const jaRodando = this._mcp.listServers().find((s) => s.name === serverName);
        if (jaRodando && jaRodando.ready) {
            return this._mcp.callTool(tool, args || {});
        }

        const pasta = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
        const getSetting = (chave: string): string => config.get<string>(chave) || '';
        const custom = normalizarConfigsMCP(config.get<MCPServerConfig[]>('mcpServers')).find((s) => s.name === serverName);

        let serverConfig: MCPServerConfig | null = null;
        if (custom) {
            serverConfig = custom;
        } else {
            const entrada = buscarCatalogo(serverName);
            if (!entrada) {
                return { ok: false, text: '', error: `Servidor MCP não encontrado no catálogo nem em orunvs.mcpServers: ${serverName}` };
            }
            if (!this._mcpAtivos(config).includes(serverName)) {
                return { ok: false, text: '', error: `Servidor MCP "${serverName}" está desativado. Ative-o em Configurações → orunvs.mcpAtivos (ex.: "${serverName}").` };
            }
            const resolvido = resolverCatalogoConfig(entrada, getSetting, pasta);
            if (!resolvido.ok) {
                return { ok: false, text: '', error: `Para usar o MCP "${serverName}" configure ${resolvido.falta} nas settings.` };
            }
            serverConfig = resolvido.config;
        }

        this._view?.webview.postMessage({ type: 'mcpStatus', value: { servidor: serverName, ok: true, iniciando: true } });
        try {
            await this._mcp.addServer(serverConfig);
            this._mcpTools = this._mcp.getAllTools();
            return await this._mcp.callTool(tool, args || {});
        } catch (e: any) {
            return { ok: false, text: '', error: `Falha ao iniciar MCP "${serverName}": ${e.message || String(e)}` };
        }
    }

    stopMCP() {
        this._mcp.stopAll();
        this._mcpTools = [];
    }

    /**
     * Executa UMA tentativa real de chamada ao provider (Gemini ou OpenAI-compatível)
     * com streaming e devolve o texto completo acumulado.
     *
     * `tempoRestanteMs` é o orçamento de tempo desta tentativa (fatia do timeout total da
     * cadeia de fallback). Se o provider não completar a resposta dentro do prazo, a
     * requisição é abortada DE VERDADE e sobe um erro de timeout — assim a UI nunca fica
     * presa em "Processando..." por causa de um stream travado (conexão aberta sem tokens
     * ou sem [DONE]). O abort do usuário (⏹ Parar) também cancela o fetch/SDK real via
     * signal, não só a animação.
     */
    private async _chamarModeloUnico(provider: string, modelName: string, config: vscode.WorkspaceConfiguration, temperature: number, maxTokens: number, tempoStallMs: number, tetoTotalMs: number): Promise<string> {
        const localController = new AbortController();
        let estourouTimeout = false;
        let motivoTempo: 'stall' | 'teto' | null = null;
        let venceu = false;
        const gatilhoState: { resolver: ((motivo: 'timeout' | 'abort') => void) | null; limpar: (() => void) | null } = { resolver: null, limpar: null };

        let stallTimer: NodeJS.Timeout | null = null;
        let totalTimer: NodeJS.Timeout | null = null;
        const sinalUsuario = this._abortController?.signal;

        const onAbort = () => disparar('abort');

        const limparTimers = () => {
            if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
            if (totalTimer) { clearTimeout(totalTimer); totalTimer = null; }
            sinalUsuario?.removeEventListener('abort', onAbort);
        };

        // Gatilho que encerra a tentativa cedo: timeout de INATIVIDADE (stream sem tokens),
        // teto de segurança ou cancelamento do usuário. Resolve (nunca rejeita) para não gerar
        // unhandled rejection quando o stream vence.
        const disparar = (motivo: 'timeout' | 'abort', origem?: 'stall' | 'teto') => {
            if (venceu) return;
            venceu = true;
            if (motivo === 'timeout') {
                estourouTimeout = true;
                motivoTempo = origem ?? 'stall';
            }
            limparTimers();
            localController.abort();
            gatilhoState.resolver?.(motivo);
        };

        const gatilho = new Promise<'timeout' | 'abort'>((resolve) => { gatilhoState.resolver = resolve; });

        // timeout por inatividade: reseta a cada chunk recebido — um stream ativo (mesmo que
        // demore minutos) NUNCA é cortado; só um stream travado (sem tokens) dispara.
        const resetarStall = () => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => disparar('timeout', 'stall'), Math.max(1, tempoStallMs));
        };

        if (sinalUsuario?.aborted) {
            disparar('abort');
        } else if (sinalUsuario) {
            sinalUsuario.addEventListener('abort', onAbort, { once: true });
        }
        totalTimer = setTimeout(() => disparar('timeout', 'teto'), Math.max(1, tetoTotalMs));
        resetarStall();

        const mensagemTimeout = () => {
            if (motivoTempo === 'teto') {
                return `Tempo total excedido no provider ${provider} (teto de segurança de ${Math.max(1, Math.round(tetoTotalMs / 60_000))}min)`;
            }
            return `Timeout do provider ${provider} (sem receber dados em ${Math.max(1, Math.round(tempoStallMs / 1000))}s)`;
        };

        const executarStream = async (): Promise<string> => {
            if (provider === 'gemini') {
                const key = config.get<string>('geminiKey') || '';
                if (!key) throw new Error('Configure orunvs.geminiKey nas settings');

                // monta contents com historico
                const contents: any[] = [];
                for (const msg of this._historico) {
                    const parts: any[] = [{ text: msg.text }];
                    if (msg.image) {
                        parts.push({ inlineData: { mimeType: msg.image.mimeType, data: msg.image.data } });
                    }
                    contents.push({ role: msg.role, parts });
                }

                // streaming Gemini
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': key,
                    },
                    body: JSON.stringify({
                        contents,
                        systemInstruction: { parts: [{ text: this._systemPromptEnriquecido(config) }] },
                        generationConfig: { temperature, maxOutputTokens: maxTokens },
                    }),
                    signal: localController.signal,
                });

                if (!response.ok) {
                    const errBody = await response.text().catch(() => '');
                    throw new Error(`Gemini ${response.status}: ${errBody.slice(0, 200)}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('Response body sem reader');

                const decoder = new TextDecoder();
                let buffer = '';
                let textoAcumulado = '';

                while (true) {
                    if (localController.signal.aborted) throw new Error('Requisição cancelada');
                    const { done, value } = await reader.read();
                    if (done) break;
                    resetarStall(); // chegou dado → stream ativo, renova o prazo de inatividade
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;
                        if (jsonStr === '[DONE]') break;
                        try {
                            const chunk = JSON.parse(jsonStr);
                            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            if (text) {
                                textoAcumulado += text;
                                this._mostrarStream(textoAcumulado);
                            }
                        } catch { /* ignora chunks malformados */ }
                    }
                }
                return textoAcumulado || '...';
            }

            const p = OPENAI_PROVIDERS[provider as OpenAIProvider];
            if (!p) { throw new Error(`Provider desconhecido: ${provider}`); }
            if (p.deprecated) {
                throw new Error('GitHub Models foi aposentado pela Microsoft (HTTP 410). Use outro provider: opencodezen, groq, openrouter ou gemini. Comando: OrunVS: Trocar provider de IA.');
            }
            const apiKey = config.get<string>(p.apiKeyField) || '';
            if (p.apiKeyField && !apiKey) { throw new Error(`Configure ${p.apiKeyField} nas settings`); }
            // timeout do SDK = teto absoluto (o prazo de inatividade é controlado pelo stallTimer;
            // antes o timeout do SDK era o prazo total e cortava streams longos e ativos)
            const clientOpts: any = { baseURL: p.baseURL, dangerouslyAllowBrowser: true, timeout: Math.max(1, tetoTotalMs) };
            if (apiKey) clientOpts.apiKey = apiKey;
            const client = new OpenAI(clientOpts);

            // monta messages com historico (converte 'model' → 'assistant' para OpenAI)
            const messages: any[] = [{ role: 'system', content: this._systemPromptEnriquecido(config) }];
            for (const msg of this._historico) {
                messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.text });
            }

            // streaming OpenAI — o signal liga o abort do usuário/timeout ao fetch interno do SDK
            const stream = await client.chat.completions.create({
                model: modelName,
                messages,
                stream: true,
                temperature,
                max_tokens: maxTokens,
            }, { signal: localController.signal }) as any;

            let textoAcumulado = '';
            for await (const chunk of stream) {
                if (localController.signal.aborted) throw new Error('Requisição cancelada');
                resetarStall(); // chegou chunk → stream ativo, renova o prazo de inatividade
                const text = chunk.choices?.[0]?.delta?.content || '';
                if (text) {
                    textoAcumulado += text;
                    this._mostrarStream(textoAcumulado);
                }
            }
            return textoAcumulado || '...';
        };

        // evita unhandled rejection do "perdedor" da corrida (o stream continua sendo
        // abortado em background; o erro real é tratado pelo race abaixo)
        const streamPromise = executarStream();
        void streamPromise.catch(() => { /* tratado pelo Promise.race */ });

        gatilhoState.limpar = limparTimers;

        try {
            const vencedor = await Promise.race([
                streamPromise.then((texto) => ({ ok: true as const, texto })),
                gatilho.then((motivo) => ({ ok: false as const, motivo })),
            ]);
            if (vencedor.ok) return vencedor.texto;
            if (vencedor.motivo === 'abort') {
                const e = new Error('Requisição cancelada');
                e.name = 'AbortError';
                throw e;
            }
            throw new Error(mensagemTimeout());
        } catch (err: any) {
            if (estourouTimeout) {
                throw new Error(mensagemTimeout());
            }
            throw err;
        } finally {
            gatilhoState.limpar?.();
        }
    }

    private _mostrarStream(markdownText: string) {
        if (!this._view) return;
        // renderiza a base acumulada (iterações anteriores do loop de agente) + o que está
        // chegando agora — o conteúdo não "pisca"/"some" entre passos de exploração
        const html = this._md.render(this._streamBase ? `${this._streamBase}\n\n${markdownText}` : markdownText);
        this._view.webview.postMessage({ type: 'respostaIAStream', value: html });
    }

    private _mostrarStreamFinal(html: string) {
        if (!this._view) return;
        this._view.webview.postMessage({ type: 'respostaIAStreamFinal', value: html });
    }

    /**
     * Encerra a mensagem preservando o que já foi streamado (não "some da tela"): finaliza o
     * bubble de streaming e anexa um aviso HTML (erro/cancelamento) embaixo do conteúdo parcial.
     */
    private _finalizarStreamParcial(avisoHtml: string) {
        if (!this._view) return;
        this._view.webview.postMessage({ type: 'respostaIAStreamFinalManter', value: avisoHtml });
    }

    /**
     * Monta blocos de código dos arquivos criados/editados pela IA. O conteúdo vai escapado
     * em <pre class="pre"> (dobrável no webview) com o caminho do arquivo — assim o código
     * gerado aparece de verdade no chat em vez de sumir ao substituir o streaming.
     */
    private _montarBlocosConteudo(acoes: Acao[]): string {
        const blocos = acoes.filter((a) => a.tipo === 'EDIT' || a.tipo === 'CREATE');
        if (blocos.length === 0) return '';
        let html = '<div style="margin-top:10px">';
        for (const acao of blocos) {
            const path = acao.path || acao.nome || 'arquivo';
            html += `<div style="font-size:11px;color:#66ccff;margin:6px 0 2px">📄 ${this._escapeHtml(path)}</div>`;
            html += `<pre class="pre">${this._escapeHtml(acao.conteudo ?? '')}</pre>`;
        }
        html += '</div>';
        return html;
    }

    private _escapeHtml(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private async _exportarChat() {
        if (!this._view) return;
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'] },
            defaultUri: vscode.Uri.file(`conversa-orunvs-${Date.now()}.md`),
        });
        if (!uri) return;

        let md = `# Conversa OrunVS\n\n`;
        for (const msg of this._historico) {
            const prefixo = msg.role === 'user' ? '**Você:**' : '**Hampton IA:**';
            md += `${prefixo}\n\n${msg.text}\n\n---\n\n`;
        }
        fs.writeFileSync(uri.fsPath, md, 'utf-8');
        vscode.window.showInformationMessage(`Conversa exportada: ${uri.fsPath}`);
    }

    async selecionarProvider() {
        const curProvider = vscode.workspace.getConfiguration('orunvs').get<string>('provider') || 'gemini';
        const picks = Object.entries(OPENAI_PROVIDERS)
            .filter(([, p]) => !p.deprecated || curProvider === 'github')
            .map(([id, p]) => ({
                label: p.label,
                description: p.defaultModel,
                detail: p.baseURL,
                id,
            }));
        picks.unshift({ label: 'Google Gemini', description: GEMINI_DEFAULT_MODEL, detail: 'API Google AI', id: 'gemini' });

        const escolha = await vscode.window.showQuickPick(picks, { placeHolder: 'Selecione o provider' });
        if (escolha) {
            const config = vscode.workspace.getConfiguration('orunvs');
            await config.update('provider', escolha.id, vscode.ConfigurationTarget.Global);
            const model = escolha.id === 'gemini' ? GEMINI_DEFAULT_MODEL
                : OPENAI_PROVIDERS[escolha.id as OpenAIProvider]?.defaultModel || GEMINI_DEFAULT_MODEL;
            await config.update('modelName', model, vscode.ConfigurationTarget.Global);
            this._mostrar(`Provider: ${escolha.label} | Modelo: ${model}`);
            this._atualizarBadge();
            vscode.window.showInformationMessage(`OrunVS: ${escolha.label} → ${model}`);
        }
    }

    private _defaultModel(provider: string): string {
        if (provider === 'gemini') return GEMINI_DEFAULT_MODEL;
        return OPENAI_PROVIDERS[provider as OpenAIProvider]?.defaultModel || GEMINI_DEFAULT_MODEL;
    }

    private _mostrar(html: string) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'respostaIA', value: html });
        } else {
            vscode.window.showInformationMessage('OrunVS: ' + html.replace(/<[^>]*>/g, '').slice(0, 200));
        }
    }

    private _atualizarBadge() {
        const provider = vscode.workspace.getConfiguration('orunvs').get<string>('provider') || 'gemini';
        const label = provider === 'gemini' ? 'Google Gemini'
            : OPENAI_PROVIDERS[provider as OpenAIProvider]?.label || provider;
        this._view?.webview.postMessage({ type: 'providerAtual', value: label });
    }

    private async _selecionarModeloPorNome(nome: string) {
        const config = vscode.workspace.getConfiguration('orunvs');
        for (const m of GEMINI_MODELS) {
            if (m.name === nome) {
                await config.update('modelName', nome, vscode.ConfigurationTarget.Global);
                await config.update('provider', 'gemini', vscode.ConfigurationTarget.Global);
                this._mostrar(`Modelo: <strong>${nome}</strong> (Google Gemini, ${m.tier})`);
                this._atualizarBadge();
                return;
            }
        }
        for (const [pid, p] of Object.entries(OPENAI_PROVIDERS)) {
            for (const m of p.models) {
                if (m.name === nome) {
                    await config.update('modelName', nome, vscode.ConfigurationTarget.Global);
                    await config.update('provider', pid, vscode.ConfigurationTarget.Global);
                    this._mostrar(`Modelo: <strong>${nome}</strong> (${p.label}, ${m.tier})`);
                    this._atualizarBadge();
                    return;
                }
            }
        }
        this._mostrar(`<span style="color:#ff8844">Modelo "${nome}" não encontrado na lista.</span>`);
    }

    private async mostrarCatalogoModelos() {
        const config = vscode.workspace.getConfiguration('orunvs');
        const curProvider = config.get<string>('provider') || 'gemini';
        const curModel = config.get<string>('modelName') || this._defaultModel(curProvider);

        const tierIcon = (t: string) =>
            t === 'local' ? '🖥' : t === 'free' ? '✅' : '💳';

        const providerIcon: Record<string, string> = {
            gemini: '🔮', local: '🖥', groq: '⚡', opencodezen: '🧠',
            openrouter: '🌐', deepseek: '🐋', github: '🐙', huggingface: '🤗',
        };

        let html = '<div style="margin-bottom:12px"><strong style="color:#ff1a1a;font-size:15px;letter-spacing:1px">📋 CATÁLOGO DE MODELOS</strong>';
        html += '<p style="color:#666;font-size:11px;margin:4px 0 8px">Clique em um modelo para ativá-lo</p></div>';

        const addProvider = (label: string, icon: string, models: { name: string; tier: string }[], providerId: string, isActive: boolean) => {
            if (models.length === 0) return;
            html += `<div style="margin-bottom:16px;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;background:#0a0a0a">`;
            html += `<div style="padding:8px 12px;background:#0d0d0d;border-bottom:1px solid #1a0000;font-weight:700;font-size:12px;color:#ff1a1a;letter-spacing:0.5px">${icon} ${label}</div>`;
            html += `<div style="padding:4px 6px">`;
            for (const m of models) {
                const active = isActive && curModel === m.name;
                html += `<div class="model-item" data-model="${m.name}" data-provider="${providerId}" style="padding:7px 10px;margin:3px 0;cursor:pointer;border-radius:5px;border:1px solid ${active ? '#ff1a1a44' : '#141414'};background:${active ? '#1a0000' : '#0d0d0d'};display:flex;align-items:center;gap:8px;transition:all 0.15s" onmouseover="this.style.borderColor='#ff1a1a66';this.style.background='#120000'" onmouseout="this.style.borderColor=this.dataset.active==='1'?'#ff1a1a44':'#141414';this.style.background=this.dataset.active==='1'?'#1a0000':'#0d0d0d'">`;
                html += `<span style="font-size:11px;opacity:0.5">${tierIcon(m.tier)}</span>`;
                html += `<span style="flex:1;font-size:12px;color:${active ? '#ff4444' : '#ccc'};font-weight:${active ? '700' : '400'}">${m.name}</span>`;
                html += `<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:${m.tier === 'local' ? '#222' : m.tier === 'free' ? '#003300' : '#330000'};color:${m.tier === 'local' ? '#888' : m.tier === 'free' ? '#00cc44' : '#ff4444'}">${m.tier}</span>`;
                if (active) html += `<span style="font-size:11px;color:#ff1a1a">✓</span>`;
                html += `</div>`;
            }
            html += `</div></div>`;
        };

        addProvider('Google Gemini', providerIcon.gemini, GEMINI_MODELS, 'gemini', curProvider === 'gemini');

        for (const [pid, p] of Object.entries(OPENAI_PROVIDERS)) {
            const icon = providerIcon[pid] || '🔌';
            addProvider(p.label, icon, p.models, pid, pid === curProvider);
        }

        html += `<div class="model-hint" style="text-align:center;padding:10px;color:#444;font-size:10px">💡 Você também pode digitar <strong style="color:#666">/model nome-do-modelo</strong> direto</div>`;

        if (this._view) {
            this._view.webview.postMessage({ type: 'respostaIA', value: html });
        }
    }

    private _html(webview?: vscode.Webview): string {
        const mediaUri = (file: string) => {
            if (!webview) return file;
            return webview.asWebviewUri(vscode.Uri.joinPath(this._ctx.extensionUri, 'resources', file)).toString();
        };

        const logoSrc = mediaUri('logo.svg');
        const scriptUri = mediaUri('main.js');
        const fundoSrc = mediaUri('Fundo.png');
        const videoSrc = mediaUri('LoadPerfeito.mp4');
        const versao = (this._ctx.extension.packageJSON as any)?.version || 'dev';

        const nonce = getNonce();
        const cspSource = webview ? webview.cspSource : 'https:';
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource} data:; media-src ${cspSource};">
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin { to{transform:rotate(360deg)} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

    body {
        font:13px/1.5 Segoe UI,sans-serif; color:#ccc;
        background:#0a0a0a url('${fundoSrc}') center/cover no-repeat fixed;
        padding:0; overflow:hidden;
        height:100vh; display:flex; flex-direction:column;
    }

    #main { display:flex; flex-direction:column; height:100vh; }

    #bar {
        display:flex; align-items:center; gap:5px;
        padding:7px 10px; background:#080808;
        border-bottom:1px solid #1a0000;
        flex-shrink:0; position:relative; z-index:2;
    }
    #bar::after {
        content:''; position:absolute; bottom:-1px; left:0; right:0;
        height:1px; background:linear-gradient(90deg,transparent,#ff1a1a44,transparent);
    }
    #bar .title {
        display:flex; align-items:center; gap:6px;
        font-size:15px; font-weight:900; letter-spacing:2px;
        color:#ff1a1a; text-shadow:0 0 20px #ff1a1a44;
        flex:1; overflow:hidden;
    }
    #bar .title img { width:18px; height:18px; flex-shrink:0; }
    #bar .title small { font-size:9px; font-weight:400; color:#555; letter-spacing:0; margin-left:6px; }
    .bar-btn {
        background:none; border:1px solid #333; cursor:pointer;
        font-size:12px; padding:4px 8px; border-radius:4px;
        transition:all 0.2s; color:#888; line-height:1;
    }
    .bar-btn:hover { color:#ff1a1a; border-color:#ff1a1a; background:#1a0000; }
    #trocarBtn {
        font-size:10px; padding:4px 10px;
        background:linear-gradient(135deg,#cc0000,#ff1a1a);
        color:#fff; border:none; border-radius:4px; cursor:pointer;
        font-weight:600; transition:all 0.2s;
        box-shadow:0 2px 8px #ff1a1a33;
    }
    #trocarBtn:hover {
        background:linear-gradient(135deg,#ff1a1a,#ff3333);
        box-shadow:0 2px 12px #ff1a1a66; transform:translateY(-1px);
    }
    #trocarBtn:active { transform:translateY(0); }

    /* ── BARRA DE PROVIDER / FALLBACK ── */
    #providerBar {
        display:none; align-items:center; gap:6px;
        padding:4px 10px; font-size:10px; color:#66ff88;
        background:#040f06; border-bottom:1px solid #003311;
        flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    #providerBar.fallback {
        color:#ffcc66; background:#100c02; border-bottom:1px solid #332200;
    }
    #providerBar.err {
        color:#ff7777; background:#120404; border-bottom:1px solid #330000;
    }
    #providerBar .pb-label {
        font-weight:700; letter-spacing:0.5px; flex-shrink:0;
    }
    #providerBar .pb-dot {
        width:7px; height:7px; border-radius:50%; flex-shrink:0;
        background:#00cc44; box-shadow:0 0 6px #00cc44;
    }
    #providerBar.fallback .pb-dot { background:#ffaa00; box-shadow:0 0 6px #ffaa00; }
    #providerBar.err .pb-dot { background:#ff4444; box-shadow:0 0 6px #ff4444; }
    #providerBar .pb-detail {
        color:#888; overflow:hidden; text-overflow:ellipsis; flex:1;
    }

    #chat {
        position:relative; z-index:1;
        flex:1; overflow-y:auto; padding:12px;
        scrollbar-width:thin; scrollbar-color:#1a0000 transparent;
    }
    #chat::-webkit-scrollbar { width:5px; }
    #chat::-webkit-scrollbar-track { background:transparent; }
    #chat::-webkit-scrollbar-thumb { background:#1a0000; border-radius:3px; }
    #chat::-webkit-scrollbar-thumb:hover { background:#330000; }
    #chat:empty::after {
        content:'Digite uma mensagem para começar...';
        display:flex; align-items:center; justify-content:center; height:100%;
        color:#222; font-size:13px; font-style:italic;
    }

    .msg {
        animation:slideUp 0.35s ease-out;
        margin-bottom:14px; padding:10px 12px;
        background:linear-gradient(135deg,#0d0d0d,#0a0a0a);
        border:1px solid #1a1a1a; border-radius:8px;
        border-left:3px solid #ff1a1a;
        position:relative; z-index:1;
        transition:border-color 0.2s;
    }
    .msg:hover { border-color:#333; }
    .msg:last-child { margin-bottom:0; }
    .msg pre {
        background:#050505; padding:10px; border-radius:6px;
        overflow-x:auto; font-size:12px; border:1px solid #1a1a1a;
        margin:6px 0; font-family:Cascadia Code,Consolas,monospace;
        position:relative;
    }
    .msg pre:hover .copy-btn { opacity:1; }
    .msg code { font-family:Cascadia Code,Consolas,monospace; background:#0a0a0a; padding:1px 5px; border-radius:3px; font-size:12px; border:1px solid #1a1a1a; }
    .msg p { margin:4px 0; }
    .msg a { color:#ff4444; }
    .msg strong { color:#eee; }

    .msg.streaming::after {
        content:'▊';
        display:inline-block;
        animation:blink 0.8s infinite;
        color:#ff1a1a;
        font-size:14px;
        margin-left:4px;
        vertical-align:middle;
    }

    .copy-btn {
        position:absolute; top:6px; right:6px;
        background:#1a1a1a; color:#888; border:1px solid #333;
        border-radius:4px; padding:3px 8px; font-size:10px; cursor:pointer;
        opacity:0; transition:opacity 0.2s;
        z-index:2;
    }
    .copy-btn:hover { background:#330000; color:#ff6666; border-color:#ff1a1a; }
    .copy-btn.copied { background:#003300; color:#00cc44; border-color:#00cc44; }

    .model-item:hover { border-color:#ff1a1a66 !important; background:#120000 !important; }

    #sugestao {
        display:none; padding:6px 10px; margin:0 10px;
        background:#0a0a0a; border:1px solid #1a1a1a; border-radius:6px;
        font-size:10px; color:#888;
        flex-shrink:0; gap:6px; align-items:center;
    }
    #sugestao.rapido { border-color:#003300; }
    #sugestao.potente { border-color:#330000; }

    #inputArea {
        padding:8px 10px 10px; background:#080808;
        border-top:1px solid #1a0000;
        flex-shrink:0; position:relative; z-index:2;
    }
    #inputArea::before {
        content:''; position:absolute; top:-1px; left:0; right:0;
        height:1px; background:linear-gradient(90deg,transparent,#ff1a1a44,transparent);
    }
    #inputRow {
        display:flex; gap:6px; align-items:flex-end;
    }
    #inputRow textarea {
        flex:1; background:#0d0d0d; color:#ddd;
        border:1px solid #1a1a1a; padding:9px 10px; border-radius:6px;
        resize:vertical; font:inherit; font-size:12px;
        transition:border-color 0.2s; outline:none;
    }
    #inputRow textarea:focus { border-color:#ff1a1a; box-shadow:0 0 0 2px #ff1a1a22; }
    #inputRow textarea::placeholder { color:#333; }
    #fileBtn {
        background:#0d0d0d; border:1px solid #1a1a1a; cursor:pointer;
        font-size:16px; padding:8px 10px; border-radius:6px;
        transition:all 0.2s; color:#666; line-height:1; flex-shrink:0;
    }
    #fileBtn:hover { border-color:#ff1a1a; color:#ff1a1a; background:#1a0000; }
    #fileBtn.has-file { color:#ff4444; border-color:#ff4444; }
    #btn {
        background:linear-gradient(135deg,#cc0000,#ff1a1a);
        color:#fff; border:none; padding:9px; width:100%;
        border-radius:6px; cursor:pointer; font-weight:700;
        font-size:12px; letter-spacing:1px; text-transform:uppercase;
        margin-top:7px; transition:all 0.2s;
        box-shadow:0 2px 8px #ff1a1a33;
    }
    #btn:hover {
        background:linear-gradient(135deg,#ff1a1a,#ff3333);
        box-shadow:0 2px 12px #ff1a1a66; transform:translateY(-1px);
    }
    #btn:active { transform:translateY(0); }
    .file-tag {
        display:inline-flex; align-items:center; gap:4px;
        font-size:11px; padding:2px 8px; border-radius:4px;
        background:#1a0000; color:#ff6666; margin-bottom:6px;
        border:1px solid #330000;
    }

    /* ── BOTÃO PARAR ── */
    #stopBtn {
        display:none; position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
        z-index:100; background:#cc0000; color:#fff; border:none;
        border-radius:20px; padding:8px 18px; font-size:12px; font-weight:700;
        cursor:pointer; box-shadow:0 4px 16px rgba(204,0,0,0.5);
        transition:all 0.2s; letter-spacing:0.5px;
    }
    #stopBtn:hover { background:#ff1a1a; transform:translateX(-50%) scale(1.05); }

    /* ── ABAS DE CONVERSA ── */
    #tabBar {
        display:flex; align-items:center; gap:3px;
        padding:4px 8px 0; background:#060606;
        border-bottom:1px solid #1a0000; flex-shrink:0;
        overflow-x:auto; scrollbar-width:thin;
    }
    #tabBar::-webkit-scrollbar { height:3px; }
    #tabBar::-webkit-scrollbar-thumb { background:#1a0000; border-radius:2px; }
    .tab {
        display:flex; align-items:center; gap:4px;
        padding:5px 10px; font-size:10px; color:#555;
        background:#0a0a0a; border:1px solid #1a1a1a; border-bottom:none;
        border-radius:6px 6px 0 0; cursor:pointer;
        transition:all 0.2s; white-space:nowrap;
        flex-shrink:0;
    }
    .tab:hover { color:#888; border-color:#333; }
    .tab.active { color:#ff1a1a; background:#0d0d0d; border-color:#330000; font-weight:600; }
    .tab .close-tab {
        font-size:10px; color:#444; cursor:pointer; padding:0 2px; border-radius:3px;
        line-height:1; transition:all 0.15s;
    }
    .tab .close-tab:hover { color:#ff4444; background:#1a0000; }
    #novaTabBtn {
        background:none; border:1px dashed #333; color:#555;
        border-radius:6px 6px 0 0; padding:5px 10px; font-size:14px;
        cursor:pointer; transition:all 0.15s; flex-shrink:0;
    }
    #novaTabBtn:hover { border-color:#ff1a1a; color:#ff1a1a; }

    /* ── MENSAGEM DO USUÁRIO ── */
    .msg.user {
        border-left-color:#555; cursor:pointer;
        background:linear-gradient(135deg,#0a0a0a,#080808);
    }
    .msg.user:hover { border-left-color:#ff1a1a; background:linear-gradient(135deg,#120000,#0a0a0a); }
    .msg.user .edit-hint {
        display:none; font-size:9px; color:#444; margin-top:4px;
    }
    .msg.user:hover .edit-hint { display:block; }

    /* ── INDICADOR DE EDIÇÃO ── */
    #editIndicator {
        display:none; align-items:center; gap:6px;
        padding:4px 10px; background:#1a0000; border-bottom:1px solid #330000;
        font-size:10px; color:#ff6666; flex-shrink:0;
    }
    #editIndicator button {
        background:none; border:none; color:#ff4444; cursor:pointer;
        font-size:10px; text-decoration:underline; padding:2px 4px;
    }
    #editIndicator button:hover { color:#ff6666; }

    /* ── PRESETS ── */
    #presetBar {
        display:flex; gap:4px; padding:4px 10px; flex-shrink:0;
        overflow-x:auto; scrollbar-width:none;
    }
    .preset-btn {
        background:#0a0a0a; border:1px solid #1a1a1a; color:#888;
        border-radius:12px; padding:3px 10px; font-size:10px; cursor:pointer;
        transition:all 0.15s; white-space:nowrap; flex-shrink:0;
    }
    .preset-btn:hover { border-color:#ff1a1a; color:#ff1a1a; background:#1a0000; }

    /* ── SUGESTÕES PROATIVAS (VERIFICAÇÃO) ── */
    #sugestoesBar {
        display:none; align-items:center; gap:4px;
        padding:4px 10px; flex-shrink:0; overflow-x:auto; scrollbar-width:none;
        background:#040f06; border-bottom:1px solid #003311;
    }
    #sugestoesBar::before {
        content:'Verificação'; font-size:9px; color:#3a8f5a;
        text-transform:uppercase; letter-spacing:1px; flex-shrink:0; margin-right:2px;
    }
    .verif-btn {
        background:#0a3d1a; border:1px solid #005522; color:#7dffa8;
        border-radius:12px; padding:3px 10px; font-size:10px; cursor:pointer;
        transition:all 0.15s; white-space:nowrap; flex-shrink:0;
    }
    .verif-btn:hover { border-color:#00cc44; color:#b3ffcc; background:#0a5a26; }
    .verif-btn.done { opacity:0.5; pointer-events:none; }

    /* ── AUTO-SCROLL ── */
    #scrollToggle {
        display:flex; align-items:center; gap:4px;
        position:sticky; bottom:0; z-index:5;
        font-size:9px; color:#555; cursor:pointer; padding:4px 10px;
        background:rgba(8,8,8,0.8); backdrop-filter:blur(2px);
        border-top:1px solid #1a1a1a; flex-shrink:0;
    }
    #scrollToggle.off { color:#444; }
    #scrollToggle .indicator { width:6px; height:6px; border-radius:50%; background:#00cc44; }
    #scrollToggle.off .indicator { background:#444; }

    /* ── FOLD ── */
    .fold-btn {
        position:absolute; top:6px; left:6px;
        background:#1a1a1a; color:#555; border:1px solid #333;
        border-radius:3px; width:18px; height:18px; font-size:10px;
        cursor:pointer; transition:all 0.15s; z-index:2;
        display:flex; align-items:center; justify-content:center;
        line-height:1;
    }
    .fold-btn:hover { background:#330000; color:#ff6666; border-color:#ff1a1a; }
    .pre.folded { max-height:40px; overflow:hidden; cursor:pointer; }
    .pre.folded::after {
        content:'... (clique para expandir)'; display:block;
        text-align:center; font-size:10px; color:#555; padding:4px;
    }

    /* ── BOTÃO INLINE EDIT ── */
    .inline-edit-btn {
        position:absolute; top:6px; right:30px;
        background:#1a1a1a; color:#888; border:1px solid #333;
        border-radius:4px; padding:3px 7px; font-size:9px; cursor:pointer;
        opacity:0; transition:opacity 0.2s; z-index:2;
    }
    .msg pre:hover .inline-edit-btn { opacity:1; }
    .inline-edit-btn:hover { background:#003300; color:#00cc44; border-color:#00cc44; }

    /* ── REGENERAR ── */
    .regenerar-btn {
        display:block; width:100%; text-align:center;
        background:none; border:1px dashed #333; color:#555;
        border-radius:6px; padding:5px; font-size:10px; cursor:pointer;
        margin-top:6px; transition:all 0.15s;
    }
    .regenerar-btn:hover { border-color:#ff1a1a; color:#ff1a1a; background:#1a0000; }

    /* ── OVERLAY DE PERMISSÃO ── */
    #permOverlay {
        position:fixed; inset:0; z-index:9999;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.75);
        backdrop-filter:blur(4px);
        animation:fadeIn 0.2s ease-out;
    }
    #permDialog {
        background:#0d0d0d; border:1px solid #1a0000;
        border-radius:12px; padding:24px; max-width:400px; width:90%;
        box-shadow:0 8px 40px rgba(255,26,26,0.15);
        animation:slideUp 0.3s ease-out;
    }
    #permIcone { font-size:32px; text-align:center; margin-bottom:8px; }
    #permTitulo {
        font-size:16px; font-weight:700; color:#ff1a1a;
        text-align:center; margin-bottom:12px;
        letter-spacing:0.5px;
    }
    #permDescricao {
        font-size:12px; color:#ccc; margin-bottom:6px;
        word-break:break-all;
    }
    #permDetalhe {
        font-size:11px; color:#666; margin-bottom:16px;
        background:#080808; padding:8px 10px; border-radius:6px;
        border:1px solid #1a1a1a; max-height:120px; overflow-y:auto;
        font-family:Cascadia Code,Consolas,monospace;
        white-space:pre-wrap; word-break:break-all;
    }
    #permBotoes {
        display:flex; gap:8px; flex-wrap:wrap; justify-content:center;
    }
    #permBotoes button {
        flex:1; min-width:80px; padding:8px 12px; border-radius:6px;
        border:1px solid #333; background:#0a0a0a; color:#ccc;
        font-size:11px; font-weight:600; cursor:pointer;
        transition:all 0.2s; line-height:1;
    }
    #permBotoes button:hover { transform:translateY(-1px); }
    #permPermitir { border-color:#003300 !important; color:#00cc44 !important; }
    #permPermitir:hover { background:#003300 !important; }
    #permNegar { border-color:#330000 !important; color:#ff4444 !important; }
    #permNegar:hover { background:#330000 !important; }
    #permSempre { border-color:#333300 !important; color:#cccc00 !important; }
    #permSempre:hover { background:#333300 !important; }

    #loadingScreen {
        position:fixed; inset:0; z-index:99999;
        display:flex; align-items:center; justify-content:center;
        background:#0a0a0a; transition:opacity 0.6s ease-out;
    }
    #loadingScreen.fade-out { opacity:0; pointer-events:none; }
    #loadingScreen video {
        max-width:80%; max-height:80%; border-radius:12px;
        box-shadow:0 0 60px rgba(255,26,26,0.3);
    }
</style>
</head>
<body>

<div id="loadingScreen">
    <video autoplay muted playsinline id="loadVideo">
        <source src="${videoSrc}" type="video/mp4">
    </video>
</div>

<div id="main">
<div id="tabBar">
    <div class="tab active" data-tab="0">Conversa 1</div>
    <button id="novaTabBtn">+</button>
</div>
<div id="bar">
    <span class="title"><img src="${logoSrc}" alt=""> ORUN VS <small>v${versao}</small></span>
    <button class="bar-btn" id="exportBtn" title="Exportar conversa">📥</button>
    <button class="bar-btn" id="clearBtn" title="Limpar chat">✕</button>
    <button id="trocarBtn">Modelos</button>
</div>

<button id="stopBtn">⏹ Parar</button>

<div id="providerBar"><span class="pb-dot"></span><span class="pb-label"></span><span class="pb-detail"></span></div>

<div id="editIndicator">✏️ Editando mensagem <span id="editPreview"></span><button id="cancelarEdicao">Cancelar</button></div>

<div id="presetBar"></div>

<div id="sugestoesBar"></div>

<div id="chat"></div>

<div id="scrollToggle"><span class="indicator"></span> Auto-scroll</div>

<div id="sugestao"></div>

<div id="inputArea">
    <div id="inputRow">
        <textarea id="inp" rows="3" placeholder="Comando para o Lobo..."></textarea>
        <button id="fileBtn" title="Anexar arquivo">📎</button>
    </div>
    <input type="file" id="fileInput" style="display:none">
    <div id="fileTag" class="file-tag" style="display:none"></div>
    <button id="btn">Mandar</button>
</div>
</div>

<div id="permOverlay" style="display:none">
    <div id="permDialog">
        <div id="permIcone">🔧</div>
        <div id="permTitulo"></div>
        <div id="permDescricao"></div>
        <div id="permDetalhe"></div>
        <div id="permBotoes">
            <button id="permNegar">❌ Negar</button>
            <button id="permPermitir">✅ Permitir</button>
            <button id="permSempre">🔁 Sempre permitir</button>
        </div>
    </div>
</div>

<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
