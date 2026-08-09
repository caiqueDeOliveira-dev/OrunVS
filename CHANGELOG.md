# Change Log

All notable changes to the "orunvs" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release

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