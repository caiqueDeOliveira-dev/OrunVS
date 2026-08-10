---
name: orun-memory
description: Memória persistente de longo prazo do ecossistema Orun (global, compartilhada com opencode e desktop). Ao iniciar sessão, leia o Resumo atual em ~/.config/opencode/MEMORY.md para recuperar decisões/histórico; ao finalizar trabalho significativo, anexe um resumo no Histórico de sessões. Use quando o usuário perguntar "o que fizemos?", "onde paramos?" ou pedir para lembrar algo entre conversas.
---

# Orun Memory (global, compartilhada)

Skill de memória persistente do ecossistema Orun. A memória canônica vive em **`~/.config/opencode/MEMORY.md`** (equivale a `C:\Users\Caiqu\.config\opencode\MEMORY.md`). É GLOBAL e COMPARTILHADA: aberta por opencode (CLI/desktop) e pelo OrunVS (extensão VS Code) — as duas ferramentas leem e escrevem no MESMO arquivo. Este SKILL.md existe tanto em `~/.config/opencode/skills/orun-memory/SKILL.md` (opencode) quanto em `skills/orun-memory/SKILL.md` (OrunVS). Mantenha os dois em sincronia se editar.

## Quando usar

- **Início de sessão**: SEMPRE que uma sessão começar (ou quando não houver contexto óbvio de conversa anterior), leia `~/.config/opencode/MEMORY.md` para recuperar o estado do ecossistema: decisões, itens em andamento, bloqueios, próximos passos.
- **Fim de sessão**: ao encerrar uma sessão/tarefa significativa, anexe um resumo estruturado ao final de `~/.config/opencode/MEMORY.md`.
- **Perguntas do usuário**: "o que fizemos?", "onde paramos?", "lembra daquele...", "continuar de onde paramos" → leia `~/.config/opencode/MEMORY.md` e responda.
- **Contexto histórico**: decisões de design, arquitetura, migrações, commits importantes devem ser registradas para consulta futura.

## Caminhos

- **Global (canônico)**: `C:\Users\Caiqu\.config\opencode\MEMORY.md` — histórico de TODAS as sessões do ecossistema (opencode + OrunVS).
- **AGENTS.md global**: `C:\Users\Caiqu\.config\opencode\AGENTS.md` — fatos estáveis do ecossistema (repos, Supabase, regras), carregado em todo projeto.
- **AGENTS.md local do projeto**: `C:\Users\Caiqu\OneDrive\Desktop\orun-os\AGENTS.md` (desktop) — mergeado sobre o global. Sessões específicas de um projeto podem registrar detalhes adicionais no MEMORY.md global indicando o projeto.

## Formato do MEMORY.md

```
# MEMORY.md — Memória global do ecossistema Orun

> Atualizado por: opencode (skill orun-memory). Nunca apague o histórico sem permissão.

## Como usar
(instruções rápidas)

## Resumo atual
(parágrafo curto do estado atual — atualize a cada sessão)

## Histórico de sessões
### Sessão <YYYY-MM-DD HH:MM> — <título curto> (<ferramenta: opencode/OrunVS>) (<projeto: orun-os/mobile/core/etc.>)
- **Objetivo**: ...
- **O que foi feito**: ...
- **Decisões**: ...
- **Em andamento/bloqueios**: ...
- **Próximos passos**: ...
```

## Regras

1. **SEMPRE ler MEMORY.md global** ao recuperar contexto ("o que fizemos antes?", "onde paramos?", início de tarefa).
2. **Anexar resumo** ao final de cada sessão significativa com data/hora, ferramenta (opencode ou OrunVS), projeto, objetivo, o que foi feito, decisões, em andamento/bloqueios e próximos passos.
3. **Manter "Resumo atual" atualizado** — sobrescreva com o estado mais recente (o histórico de sessões permanece como log).
4. **Nunca apagar histórico** de sessões anteriores sem permissão explícita do usuário.
5. **Não imprimir segredos** no MEMORY.md (chaves, tokens, URLs com credenciais). Referencie por localização (ex.: "chaves no `.env` do `orun_project`").
6. **pt-BR** — escreva resumos em português (usuário fala pt-BR).
7. Se `~/.config/opencode/MEMORY.md` não existir ainda, crie com a estrutura do template acima.
8. Para fatos estáveis do ecossistema (repos, Supabase, comandos, regras) prefira atualizar `AGENTS.md` — o `MEMORY.md` é para histórico/dinâmica de trabalho.

## Fluxo típico de fim de sessão

1. Releia o resumo anterior de `~/.config/opencode/MEMORY.md` para saber o que já estava registrado.
2. Escreva um novo bloco `### Sessão <data> — <título> (OrunVS) (<projeto>)` com: objetivo, o que foi feito, decisões, em andamento/bloqueios, próximos passos.
3. Atualize a seção "Resumo atual" (parágrafo curto).
4. Mantenha o histórico acumulado abaixo (não apague blocos antigos).
5. **Concorrência**: se outra ferramenta (opencode) estiver escrevendo ao mesmo tempo, releia o arquivo antes de gravar e re-aplique o bloco novo sobre a versão mais recente (last-write-wins por seção). Não sobrescreva o arquivo inteiro às cegas.
