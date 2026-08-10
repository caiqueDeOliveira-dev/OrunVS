/*
 * mcp.ts — cliente MCP (Model Context Protocol) do OrunVS (sem dependência de vscode).
 * Conecta a servidores MCP via stdio (JSON-RPC 2.0), lista as ferramentas e executa
 * chamadas. Espelho do mcp-client.cjs do desktop Orun OS.
 */

import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';

export interface MCPServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

export interface MCPTool {
    /** Nome completo: `${serverName}__${toolName}` */
    name: string;
    serverName: string;
    toolName: string;
    description: string;
    inputSchema: any;
}

export interface MCPCallResult {
    ok: boolean;
    text: string;
    content?: any[];
    error?: string;
}

/**
 * Normaliza a config de servidores vinda das settings do VS Code.
 * Ignora itens sem name/command e filtra args/env inválidos.
 */
export function normalizarConfigsMCP(raw: any): MCPServerConfig[] {
    if (!Array.isArray(raw)) return [];
    const out: MCPServerConfig[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const command = typeof item.command === 'string' ? item.command.trim() : '';
        if (!name || !command) continue;
        const args = Array.isArray(item.args) ? item.args.filter((a: unknown) => typeof a === 'string') : [];
        const env: Record<string, string> = {};
        if (item.env && typeof item.env === 'object') {
            for (const [k, v] of Object.entries(item.env)) {
                if (typeof v === 'string') env[k] = v;
            }
        }
        out.push({ name, command, args, env });
    }
    return out;
}

/** Bloco injetado no system prompt listando as ferramentas MCP disponíveis. */
export function blocoFerramentasMCP(tools: MCPTool[]): string {
    if (!tools || tools.length === 0) return '';
    const linhas = tools.map((t) => `- **${t.name}** — ${t.description || 'sem descrição'}`);
    return `## FERRAMENTAS MCP DISPONÍVEIS\n${linhas.join('\n')}`;
}

/**
 * Spawn do processo do servidor. No Windows, comandos sem extensão (ex.: `npx`)
 * são shims `.cmd` — usa shell quando aplicável para que `npx`/`npm` funcionem.
 */
function spawnComando(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
    const win32 = process.platform === 'win32';
    const semExtensao = !/\.[a-zA-Z0-9]+$/.test(command);
    const shell = win32 && semExtensao;
    const finalArgs = shell
        ? args.map((a) => (/\s/.test(a) && !/^["']/.test(a) ? `"${a}"` : a))
        : args;
    return spawn(command, finalArgs, { env, stdio: ['pipe', 'pipe', 'pipe'], shell });
}

export class MCPServer {
    readonly name: string;
    private _command: string;
    private _args: string[];
    private _env: NodeJS.ProcessEnv;
    private _process: ChildProcess | null = null;
    private _pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    private _buffer = '';
    private _stderrHandler: ((line: string) => void) | null = null;
    ready = false;
    tools: MCPTool[] = [];

    constructor(config: MCPServerConfig) {
        this.name = config.name;
        this._command = config.command;
        this._args = config.args || [];
        this._env = { ...process.env, ...(config.env || {}) };
    }

    setStderrHandler(cb: (line: string) => void) {
        this._stderrHandler = cb;
    }

    async start(): Promise<MCPTool[]> {
        return new Promise((resolve, reject) => {
            try {
                this._process = spawnComando(this._command, this._args, this._env);
                const proc = this._process;
                proc.stdout!.on('data', (data: Buffer) => {
                    this._buffer += data.toString();
                    this._processBuffer();
                });
                proc.stderr!.on('data', (data: Buffer) => {
                    const line = data.toString().trim();
                    if (line) this._stderrHandler?.(line);
                });
                proc.on('error', (err) => {
                    this.ready = false;
                    reject(err);
                });
                proc.on('close', () => {
                    this.ready = false;
                });

                this._send('initialize', {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'orunvs', version: '0.3.3' },
                }).then((result) => {
                    this.ready = true;
                    return this._listTools();
                }).then((tools) => {
                    this.tools = tools;
                    resolve(tools);
                }).catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    private _processBuffer() {
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim()) continue;
            let msg: any;
            try {
                msg = JSON.parse(line);
            } catch {
                continue;
            }
            if (msg.id != null && this._pending.has(msg.id)) {
                const { resolve, reject } = this._pending.get(msg.id)!;
                this._pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        }
    }

    private _send(method: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = randomUUID();
            const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
            this._pending.set(id, { resolve, reject });
            if (!this._process) {
                this._pending.delete(id);
                reject(new Error(`MCP server ${this.name} não iniciado`));
                return;
            }
            this._process.stdin!.write(msg);
            setTimeout(() => {
                if (this._pending.has(id)) {
                    this._pending.delete(id);
                    reject(new Error(`MCP timeout for ${method}`));
                }
            }, 15000);
        });
    }

    private async _listTools(): Promise<MCPTool[]> {
        const result = await this._send('tools/list', {});
        const tools = result?.tools || [];
        return tools.map((t: any) => ({
            name: `${this.name}__${t.name}`,
            serverName: this.name,
            toolName: t.name,
            description: `[MCP:${this.name}] ${t.description || ''}`,
            inputSchema: t.inputSchema || { type: 'object', properties: {} },
        }));
    }

    async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPCallResult> {
        if (!this.ready || !this._process) {
            return { ok: false, text: '', error: `Servidor MCP ${this.name} não está pronto` };
        }
        try {
            const result = await this._send('tools/call', { name: toolName, arguments: args });
            const content: any[] = result?.content || [];
            const text = content.filter((c: any) => c && c.type === 'text').map((c: any) => String(c.text)).join('\n');
            return { ok: true, text, content };
        } catch (e: any) {
            return { ok: false, text: '', error: e.message || String(e) };
        }
    }

    stop() {
        if (this._process) {
            try {
                this._process.kill();
            } catch {
                /* ignora */
            }
            this._process = null;
            this.ready = false;
        }
    }
}

export class MCPManager {
    private _servers = new Map<string, MCPServer>();
    onStderr: ((server: string, line: string) => void) | null = null;

    async addServer(config: MCPServerConfig): Promise<MCPTool[]> {
        const existing = this._servers.get(config.name);
        if (existing) existing.stop();
        const server = new MCPServer(config);
        if (this.onStderr) {
            server.setStderrHandler((line) => this.onStderr!(config.name, line));
        }
        this._servers.set(config.name, server);
        const tools = await server.start();
        return tools;
    }

    removeServer(name: string) {
        const server = this._servers.get(name);
        if (server) {
            server.stop();
            this._servers.delete(name);
        }
    }

    getAllTools(): MCPTool[] {
        const out: MCPTool[] = [];
        for (const [, server] of this._servers) out.push(...server.tools);
        return out;
    }

    async callTool(fullToolName: string, args: Record<string, unknown>): Promise<MCPCallResult> {
        const idx = fullToolName.indexOf('__');
        if (idx === -1) {
            return { ok: false, text: '', error: `Nome de ferramenta MCP inválido: ${fullToolName}` };
        }
        const serverName = fullToolName.substring(0, idx);
        const toolName = fullToolName.substring(idx + 2);
        const server = this._servers.get(serverName);
        if (!server) {
            return { ok: false, text: '', error: `Servidor MCP não encontrado: ${serverName}` };
        }
        return server.callTool(toolName, args);
    }

    listServers(): { name: string; ready: boolean; tools: number }[] {
        const out: { name: string; ready: boolean; tools: number }[] = [];
        for (const [name, server] of this._servers) {
            out.push({ name, ready: server.ready, tools: server.tools.length });
        }
        return out;
    }

    stopAll() {
        for (const [, server] of this._servers) server.stop();
        this._servers.clear();
    }
}
