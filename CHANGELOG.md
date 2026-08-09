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