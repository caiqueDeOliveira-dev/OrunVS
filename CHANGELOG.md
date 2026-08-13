# Change Log

All notable changes to the "orunvs" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- **Fix: "não responde quando começa a codar" — LOOP DE AGENTE** (novo `orunvs.maxIteracoes`, default 5): o system prompt manda a IA explorar o projeto antes de codar, mas `processarPrompt` fazia UMA única chamada — após `[FILE_READ]`/`[LIST_FILES]`/`[LOAD_SKILL]`/`[MCP_CALL]` o turno morria. Agora os resultados das operações voltam para o modelo (mensagem `[Resultados de operações]` no histórico) e ele continua chamado até entregar o trabalho final (arquivos/comandos) ou uma resposta de texto. O código gerado também aparece de verdade no final: blocos `<pre>` com o conteúdo dos arquivos criados/editados (escapado, dobrável) em vez de sumir ao substituir o streaming
- **Fix: "resposta longa corta e some da tela" — timeout por INATIVIDADE + preservação do conteúdo parcial**: `orunvs.timeoutMs` (default 120s) deixou de ser um prazo TOTAL que abortava streams longos de codegen no meio — agora é o tempo máximo SEM receber dados (resetado a cada chunk; um stream ativo nunca é cortado). Existe um teto de segurança absoluto de 5x o valor (mín. 15 min). Se mesmo assim falhar, o erro NÃO substitui a resposta parcial: o conteúdo já streamado é preservado e o aviso é anexado embaixo (`respostaIAStreamFinalManter`)
- **`orunvs.maxTokens` default 4096 → 8192** (máx. 16384): respostas longas de código não são mais cortadas pelo limite de saída
- **Fix: versão fixa "v0.2" no header do chat** — o título do webview mostrava `v0.2` hardcoded; agora lê a versão real da extensão (`v0.3.7`)
- **Fix: "fica pensando para sempre" — timeout real cobrindo o streaming** (novo `orunvs.timeoutMs`, default 120s): antes, o timeout de 30s só protegia o *fetch inicial* do Gemini — o loop de streaming do OpenAI (provider ativo, OpenCodeZen) e a leitura do SSE do Gemini não tinham limite, então um stream travado (conexão aberta sem primeiro token ou sem `[DONE]`) deixava a UI presa em "Processando..." indefinidamente. Agora o prazo cobre a resposta completa (orçamento total da cadeia de fallback em `_chamarModelo`); ao esgotar, a requisição é abortada de verdade e o erro sobe com mensagem clara. O botão **⏹ Parar** também passou a cancelar o SDK OpenAI (signal no `chat.completions.create`), não só o fetch do Gemini

- **Skill `code-review` aprimorada** (qualidade de revisão, inspirada no The Agency): análise em 5 dimensões (correção/segurança/manutenibilidade/performance/testes) + edge cases, convenções e código morto; prioridade por marcador `🔴 blocker` / `🟡 sugestão` / `💭 nit` com checklist por severidade; formato de comentário por linha (título + Por quê + Sugestão com código); elogiar código bom; uma review completa por rodada; perguntar quando a intenção estiver ambígua. JSON final de revisão mantido

## [0.3.4] — 2026-08-10

- **Catálogo embutido de MCPs, todos DORMENTES por padrão** (`orunvs.mcpAtivos`, default `[]`): 12 servidores curados em `src/mcp-catalog.ts` — `git`, `github` (usa `orunvs.githubToken`), `context7`, `fetch`, `tavily` (usa `orunvs.tavilyKey`), `sequential-thinking`, `postgres` (usa `orunvs.postgresConnectionString`), `supabase` (usa `orunvs.supabaseAccessToken`/`orunvs.supabaseProjectRef`), `docker`, `penpot` (proxy `mcp-remote` → `http://localhost:4401/mcp`), `filesystem` e `playwright`. Nada é iniciado no boot
- **Ativação ON-DEMAND**: a IA vê o catálogo no system prompt (rodando + dormentes permitidos + desativados) e só chama `[MCP_CALL]` para servidores permitidos; o processo sobe na primeira chamada (`resolverCatalogoConfig` substitui `{workspace}` e `{setting:...}`) e fica em cache para as próximas. Servidores fora da allowlist retornam erro orientativo no chat
- **Placeholders de config**: args aceitam `{workspace}` (pasta aberta) e `{setting:orunvs.chave}`; se a setting obrigatória estiver vazia, o MCP avisa exatamente qual config preencher em vez de falhar às cegas
- Testes novos em `src/test/mcp-catalog.test.ts` (9 testes): catálogo íntegro, ids únicos, resolução de placeholders com aviso de config faltante, montagem do bloco do prompt. **87 testes passando** (era 78)

## [0.3.3] — 2026-08-10

- **Suporte a MCP (Model Context Protocol)** (`orunvs.mcpHabilitado`, default `true`; `orunvs.mcpServers`, lista de `{name, command, args, env}`): o OrunVS conecta a servidores MCP via stdio (JSON-RPC 2.0, handshake `initialize` protocol `2024-11-05`) e funde as ferramentas no system prompt como `nomeServidor__nomeTool` (bloco "FERRAMENTAS MCP DISPONÍVEIS"). A IA chama uma ferramenta com o bloco `[MCP_CALL]` (campo `tool:` obrigatório + `args:` opcional em JSON) e o resultado é injetado de volta no chat. Servidores HTTP (como Penpot) usam o proxy stdio: `{ name: "penpot", command: "npx", args: ["-y", "mcp-remote", "http://localhost:4401/mcp", "--allow-http"] }`
- **Conexão lazy + reconexão por fingerprint**: os servidores só são iniciados no primeiro prompt e são reconectados apenas quando a config `orunvs.mcpServers` muda; servidores são encerrados no `deactivate` da extensão
- Lógica pura em `src/mcp.ts` (client stdio + manager, sem dependência de vscode — mesmo padrão de `memory.ts`/`skills.ts`)
- Testes novos em `src/test/mcp.test.ts` (fake server stdio) + casos de `[MCP_CALL]` em `core.test.ts`: **78 testes passando** (era 62); `npm run test:core` cobre os 4 arquivos

## [0.3.2] — 2026-08-10

- **Memória de longo prazo local** (`orunvs.memoriaHabilitada`, default `true`): a IA pode salvar decisões/preferências com `[MEMORY_SAVE]` (bloco com `chave:` e `tags:`); memorias relevantes ao pedido são injetadas automaticamente no system prompt via escore de tokens (bloco "MEMÓRIAS RELEVANTES"). Persistência em `memorias.json` no globalStorage. Lógica pura em `src/memory.ts`
- **Skills embutidas** (`skills/<nome>/SKILL.md`): o system prompt lista as skills disponíveis (bloco "SKILLS DISPONÍVEIS") e a IA carrega as instruções completas com `[LOAD_SKILL]` — a extensão injeta o conteúdo no contexto e chama o modelo de novo antes do trabalho real. Inclui `developer` (workflow de engenharia) e `code-review` (revisão com JSON final). Lógica pura em `src/skills.ts`
- **Sugestões proativas de verificação** (`orunvs.sugestoesVerificacao`, default `true`): depois que a IA edita/cria/deleta arquivos, a barra de sugestões oferece botões para rodar `test`/`lint`/`typecheck`/`check`/`build` do projeto (lidos do `package.json`). A execução é sempre iniciada por você, num terminal `OrunVS-Verificação`
- **Enriquecimento aditivo do prompt**: os blocos de memória/skills são concatenados ao system prompt (padrão ou custom) sem alterar seções existentes — `enriquecerSystemPrompt` em `src/core.ts`
- Testes novos em `src/test/` (`memory.test.ts`, `skills.test.ts`, e casos de `parseAcoes`/`enriquecerSystemPrompt` em `core.test.ts`): **62 testes passando** (era 41); `npm run test:core` cobre os 3 arquivos

## [0.3.1] — 2026-08-10

- **Aviso "Nenhuma ação encontrada" só aparece em pedidos de implementação**: respostas normais de conversa (pergunta, saudação, explicação) não mostram mais o alerta de `[FILE_EDIT]`/`[RUN_CMD]` no chat

## [0.3.0] — 2026-08-10

- **Fallback automático de provider**: quando o provider ativo esgota os tokens (429/402/5xx/timeout/falha de rede), a extensão troca automaticamente para o próximo da cadeia configurável `orunvs.fallbackChain` (default `opencodezen → openrouter → groq → gemini`), pulando providers sem chave ou descontinuados
- **Barra de status do provider no chat**: mostra o provider ativo + modelo; em fallback exibe "tokens de X esgotados → usando Y" com **contagem regressiva** do tempo estimado até os tokens voltarem (lê `Retry-After`/`x-ratelimit-reset-*` ou usa estimativa por provider — OpenRouter tier grátis reseta por hora)
- **Erros de autenticação/cancelamento não disparam fallback** (chave inválida 401/403 e abort ficam como estão)
- **Gemini**: modelo padrão atualizado para `gemini-flash-latest` (modelos 2.x/1.5 responderam 404 na API atual); config antiga é migrada automaticamente
- **Chave do OpenCodeZen corrigida** (estava inválida no `settings.json`; extraída a chave válida do secret store do desktop Orun OS)
- **Provider default agora é `opencodezen`** (recomendado do ecossistema Orun)

## [0.2.2] — 2026-08-10

- **Botão do Orun na barra de título do editor** (`editor/title`, grupo `navigation`): o ícone vermelho do OrunVS aparece ao lado do botão do OpenCode, com variantes light/dark (`resources/orun-editor-light.svg` / `orun-editor-dark.svg`). Um clique abre "OrunVS: Fazer uma pergunta".

## [0.2.1] — 2026-08-10

- **Auto-retry de ações**: se a IA responder a um pedido de criação/edição/refatoração SEM nenhum bloco `[FILE_EDIT]`/`[RUN_CMD]` (ex.: só código solto no chat ou saudação genérica), a extensão injeta uma mensagem forçando o formato e faz uma segunda tentativa automaticamente
- **System prompt reforçado**: seção "RESPONSE DISCIPLINE" proíbe saudações genéricas ("Hello! How can I assist you today?") e resposta só em texto para pedidos de implementação
- **Ícone da activity bar corrigido**: `resources/icon.svg` com dimensões explícitas (24x24) e `currentColor` (adapta ao tema claro/escuro) — o container agora aparece junto dos demais na barra de atividades
- **Refactor**: chamada ao provider extraída para `_chamarModelo()` (reutilizada pelo auto-retry)

## [0.2.0] — 2026-08-09

- **Novo provider OpenCodeZen** (provider recomendado do ecossistema Orun) — `orunvs.opencodezenKey`, base `https://opencode.ai/zen/v1`, modelo padrão `big-pickle`
- **GitHub Models aposentado** — removido do catálogo (Microsoft desligou com HTTP 410); mensagem de erro orientativa se ainda estiver selecionado
- **Colar código com collapse** no campo de input (paste de texto longo vira resumo "[Colado: N linhas]")
- **Auto-approve** opcional (`orunvs.autoApprove`) para aprovar ações da IA automaticamente
- Ícone novo (LogoIA Orun) e bundle via esbuild (`npm run bundle`, ativação `onStartupFinished`)
- **System prompt reescrito em inglês** (melhor aderência dos modelos) — mantém a identidade Hampton/Orun ST e o sistema de blocos `[FILE_EDIT]`/`[RUN_CMD]`/`[OPEN]`/etc., com foco em explorar o projeto antes de agir, autonomia com limites claros e qualidade de produção; template fixo de "barbearia" removido (o agente agora respeita o tema pedido pelo usuário)
- **Lógica pura extraída para `src/core.ts`** (sem dependência de `vscode`) com 16 testes mocha (`npm run test:core`)
- **Publicado no VS Code Marketplace** — publisher `orunst`, página: https://marketplace.visualstudio.com/items?itemName=orunst.orunvs

## [0.1.1] — 2026-08-08

- Ativação da extensão no startup (`onStartupFinished`) para responder imediatamente
- Ícone da sidebar atualizado para `resources/icon.svg`
- Build com esbuild (bundle único em `out/extension.js`)
- `orunvs.autoApprove` (aprovar ações sem confirmação)

## [0.1.0] — 2026-08-01

- Chat lateral integrado na barra de atividades
- Providers: Gemini, Groq, OpenRouter, DeepSeek, GitHub Models, Hugging Face, Ollama
- Streaming de respostas, edição de arquivos com permissão, execução de comandos
- Múltiplas conversas, exportar Markdown, presets, catálogo de modelos