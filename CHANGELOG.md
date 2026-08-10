# Change Log

All notable changes to the "orunvs" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release

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