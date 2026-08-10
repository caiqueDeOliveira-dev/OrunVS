/*
 * mcp-catalog.ts — catálogo curado de servidores MCP do OrunVS.
 * Todos os servidores do catálogo nascem DESATIVADOS (dormentes): nada é iniciado
 * no boot. A IA vê os hints no system prompt e o servidor é iniciado sob demanda
 * no primeiro [MCP_CALL] (via resolverCatalogoConfig + MCPManager.addServer), mas
 * apenas se o id estiver na allowlist `orunvs.mcpAtivos`.
 *
 * Módulo puro (sem vscode), mesmo padrão de memory.ts/skills.ts.
 */

import { MCPServerConfig } from './mcp';

export interface MCPCatalogoEntry {
    /** Id único — usado no `orunvs.mcpAtivos` e como prefixo `id__tool` no [MCP_CALL]. */
    id: string;
    /** Nome de exibição. */
    nome: string;
    categoria: string;
    descricao: string;
    comando: string;
    args: string[];
    env?: Record<string, string>;
    /** Hints de ferramentas conhecidas (sem o prefixo do servidor) para o prompt. */
    tools: string[];
    /** Nota humana sobre o que configurar para usar (chaves/serviços). */
    config?: string;
}

/**
 * Placeholders resolvidos em tempo de spawn:
 * - `{workspace}`   → pasta do workspace aberto
 * - `{setting:key}` → valor da setting `orunvs.<key>` (ex.: `{setting:githubToken}`)
 */
export const MCP_CATALOGO: MCPCatalogoEntry[] = [
    {
        id: 'git',
        nome: 'Git MCP',
        categoria: 'Desenvolvimento',
        descricao: 'status, log, diff, commit, branches e stash do repositório aberto',
        comando: 'npx',
        args: ['-y', '@modelcontextprotocol/server-git', '--repository', '{workspace}'],
        tools: ['status', 'log', 'diff', 'commit', 'branch'],
    },
    {
        id: 'github',
        nome: 'GitHub MCP',
        categoria: 'Desenvolvimento',
        descricao: 'repos, issues, PRs, Actions e busca no GitHub',
        comando: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '{setting:githubToken}' },
        tools: ['search_repositories', 'list_issues', 'create_issue', 'get_pull_request', 'create_pull_request'],
        config: 'Exige `orunvs.githubToken` (token clássico com escopos repo/read:org).',
    },
    {
        id: 'context7',
        nome: 'Context7',
        categoria: 'Documentação',
        descricao: 'documentação atualizada de bibliotecas (resolve lib + snippets)',
        comando: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        tools: ['resolve-library-id', 'get-library-docs'],
    },
    {
        id: 'fetch',
        nome: 'Fetch MCP',
        categoria: 'Web',
        descricao: 'buscar páginas web e APIs (HTTP GET)',
        comando: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch'],
        tools: ['fetch'],
    },
    {
        id: 'tavily',
        nome: 'Tavily Search',
        categoria: 'Web',
        descricao: 'pesquisa web otimizada para agentes (mesmo provider do desktop Orun)',
        comando: 'npx',
        args: ['-y', '@tavily/mcp-server'],
        env: { TAVILY_API_KEY: '{setting:tavilyKey}' },
        tools: ['tavily-search'],
        config: 'Exige `orunvs.tavilyKey` (chave da API do Tavily).',
    },
    {
        id: 'sequential-thinking',
        nome: 'Sequential Thinking',
        categoria: 'Desenvolvimento',
        descricao: 'raciocínio estruturado em passos encadeados',
        comando: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        tools: ['sequentialthinking'],
    },
    {
        id: 'postgres',
        nome: 'PostgreSQL MCP',
        categoria: 'Bancos de dados',
        descricao: 'inspecionar e consultar um PostgreSQL (schemas, tabelas, SQL)',
        comando: 'npx',
        args: ['-y', '@crystaldba/postgres-mcp', '--connection-string', '{setting:postgresConnectionString}'],
        tools: ['list_databases', 'list_schemas', 'list_tables', 'describe_table', 'execute_sql', 'run_sql'],
        config: 'Exige `orunvs.postgresConnectionString` (ex.: postgresql://user:pass@host:5432/db).',
    },
    {
        id: 'supabase',
        nome: 'Supabase MCP',
        categoria: 'Bancos de dados',
        descricao: 'gerenciar o projeto Supabase compartilhado (tabelas, RLS, SQL)',
        comando: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase', '--access-token', '{setting:supabaseAccessToken}', '--project-ref', '{setting:supabaseProjectRef}'],
        tools: ['list_tables', 'query_table', 'describe_table', 'execute_sql'],
        config: 'Exige `orunvs.supabaseAccessToken` e `orunvs.supabaseProjectRef` (project-ref do ecossistema: kmfmeewibravdsxemzuj).',
    },
    {
        id: 'docker',
        nome: 'Docker MCP',
        categoria: 'DevOps',
        descricao: 'containers, imagens, logs e execução em containers Docker',
        comando: 'npx',
        args: ['-y', 'docker-mcp'],
        tools: ['list_containers', 'list_images', 'container_logs', 'docker_exec'],
    },
    {
        id: 'penpot',
        nome: 'Penpot MCP',
        categoria: 'Design',
        descricao: 'ler/editar shapes no Penpot (server HTTP :4401 via proxy mcp-remote)',
        comando: 'npx',
        args: ['-y', 'mcp-remote', 'http://localhost:4401/mcp', '--allow-http'],
        tools: ['list_shapes', 'get_shape', 'query_shapes', 'create_rectangle', 'update_shape', 'delete_shape'],
        config: 'Exige o servidor Penpot MCP rodando em http://localhost:4401/mcp + plugin instalado no Penpot.',
    },
    {
        id: 'filesystem',
        nome: 'Filesystem MCP',
        categoria: 'Desenvolvimento',
        descricao: 'acesso a arquivos do workspace (redundante com os blocos nativos; útil p/ explorar)',
        comando: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '{workspace}'],
        tools: ['read_file', 'write_file', 'list_directory', 'search_files'],
    },
    {
        id: 'playwright',
        nome: 'Playwright MCP',
        categoria: 'Testes',
        descricao: 'automação de navegador (navegar, clicar, digitar, snapshots)',
        comando: 'npx',
        args: ['-y', '@playwright/mcp'],
        tools: ['browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot'],
        config: 'Baixa o Chromium no primeiro uso (pode demorar).',
    },
];

export function buscarCatalogo(id: string): MCPCatalogoEntry | undefined {
    return MCP_CATALOGO.find((e) => e.id === id);
}

/**
 * Resolve a config real de um servidor do catálogo substituindo placeholders.
 * Retorna { ok:false, falta } quando uma setting obrigatória (placeholder) está vazia.
 */
export function resolverCatalogoConfig(
    entry: MCPCatalogoEntry,
    get: (chave: string) => string,
    pasta: string,
): { ok: true; config: MCPServerConfig } | { ok: false; falta: string } {
    const subst = (v: string): string => {
        if (v === '{workspace}') return pasta;
        const m = /^\{setting:(.+)\}$/.exec(v.trim());
        if (m) return get(m[1]);
        return v;
    };

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry.env || {})) env[k] = subst(v);
    for (const [k, v] of Object.entries(entry.env || {})) {
        const m = /^\{setting:(.+)\}$/.exec(v.trim());
        if (m && !env[k]) return { ok: false, falta: `orunvs.${m[1]}` };
    }

    return {
        ok: true,
        config: {
            name: entry.id,
            command: entry.comando,
            args: entry.args.map(subst),
            env,
        },
    };
}

export interface MCPServerInfoResumo {
    name: string;
    ready: boolean;
    tools: number;
}

/**
 * Monta o bloco MCP do system prompt a partir das ferramentas de servidores JÁ
 * iniciados + o catálogo dormente (permitidos vs desativados). Usado no prompt.
 */
export function montarBlocoCatalogo(
    blocoRodando: string,
    ativos: string[],
    catalogo: MCPCatalogoEntry[] = MCP_CATALOGO,
): string {
    const partes: string[] = [];
    if (blocoRodando && blocoRodando.trim()) partes.push(blocoRodando);

    const dormindo = catalogo.filter((e) => ativos.includes(e.id));
    if (dormindo.length > 0) {
        const linhas = dormindo.map((e) => {
            const hints = e.tools.slice(0, 6).map((t) => `\`${e.id}__${t}\``).join(', ');
            return `- **${e.id}__…** (${e.nome}) — ${e.descricao}. Ferramentas: ${hints}.`;
        });
        partes.push(`## MCP CATÁLOGO (inicia ao usar)

Servidores abaixo estão DESATIVADOS, mas podem ser iniciados sob demanda no primeiro [MCP_CALL] (configuração permitida em \`orunvs.mcpAtivos\`). Se o pedido do usuário exigir um deles, chame \`${dormindo[0].id}__ferramenta\` — o servidor sobe na hora e o resultado é injetado.
${linhas.join('\n')}`);
    }

    const desativados = catalogo.filter((e) => !ativos.includes(e.id));
    if (desativados.length > 0) {
        const linhas = desativados.map((e) => `- **${e.nome}** (\`${e.id}\`) — ${e.descricao}`);
        partes.push(`## MCP CATÁLOGO (desativados)

NÃO chame ferramentas destes servidores. Se o pedido do usuário exigir um deles, responda em texto avisando que é preciso ativá-lo em Configurações → \`orunvs.mcpAtivos\` (ex.: "${desativados[0].id}").
${linhas.join('\n')}`);
    }

    return partes.join('\n\n');
}
