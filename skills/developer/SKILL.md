---
name: developer
description: Workflow de engenharia de software — entender, planejar, implementar, verificar, revisar e versionar. Use ao criar, refatorar ou corrigir código.
---

# Developer — Skill de Engenharia de Software (Elite)

Workflow de engenharia de elite para o OrunVS: entender → planejar → implementar → verificar → revisar → versionar. Ferramentas disponíveis no contrato OrunVS: `[LIST_FILES]`, `[FILE_READ]`, `[FILE_EDIT]`, `[FILE_DELETE]`, `[RUN_CMD]`, `[OPEN]`, `[MEMORY_SAVE]`.

## Workflow

1. **Entenda**: leia o arquivo/contexto antes de editar — `[LIST_FILES]` + `[FILE_READ]`. Para projeto desconhecido, explore a estrutura primeiro.
2. **Planeje**: 1-2 frases do que vai mudar e quais arquivos. Para tarefas > 1 arquivo, liste os passos.
3. **Implemente**: `[FILE_EDIT]` com o conteúdo COMPLETO do arquivo (o bloco sobrescreve tudo). Código mínimo, seguindo as convenções do projeto.
4. **Verifique**: `[RUN_CMD]` com o comando de checagem correto do projeto (typecheck/lint/teste) e corrija até passar. Se o usuário não configurou nada, use checagens sintáticas leves (`node --check <file>`, `python -m py_compile <file>`).
5. **Revise**: releia criticamente o que escreveu — procure edge cases, segurança e código morto.
6. **Feche**: resposta curta (1-3 linhas): o que criou, onde, resultado. Nada de colar código no chat.

## Regras de ouro

- **Nunca** escreva código só no chat — tudo em `[FILE_EDIT]`.
- **Não** adicione comentários óbvios; código deve se auto-explicar.
- **Nunca** deixe segredos/keys no código. Use env vars.
- Se um comando falhar, leia o erro e tente de novo — não desista na primeira tentativa.
- PowerShell apenas: `mkdir -Force`, `New-Item -ItemType File -Force`, `git ...`. Nunca comandos CMD (`type nul`, `copy con`).

## Verificação

Quando a tarefa envolve lógica nova ou mudança de comportamento:

1. Identifique o framework do projeto (`package.json` — vitest/jest/pytest) e como os testes rodam (`npm test`, `npm run test`).
2. Se relevante, crie o arquivo de teste ao lado do código (padrão do projeto, ex.: `__tests__/*.test.ts`).
3. Cubra: caminho feliz, edge cases (entrada vazia, erro de rede, arquivo inexistente) e os casos que o código trata.
4. Rode a verificação via `[RUN_CMD]` e **repita até passar** — nunca entregue teste vermelho.
5. Se o projeto tem `npm run typecheck`/`lint`, rode também.

## Refactor (incremental)

1. Se houver trabalho em andamento, não misture — avise o usuário.
2. Faça mudanças **pequenas e incrementais**, preservando comportamento.
3. Após cada passo, rode a verificação — não acumule quebras.
4. Se o refactor mudar assinaturas públicas, atualize os callers (use `[FILE_READ]`/`[LIST_FILES]` para achar).
5. Salve memórias úteis com `[MEMORY_SAVE]` (ex.: `chave: projeto/x-arquitetura`).

## Checklist de qualidade

- [ ] Typecheck/lint passou (comando do projeto)
- [ ] Testes relevantes passaram (`npm test` / comando do projeto)
- [ ] Sem código morto, imports não usados ou logs de debug
- [ ] Tratou edge cases (entrada vazia, erro de rede, arquivo inexistente)
- [ ] Segue o padrão do restante do código (estilo, libs já usadas)
- [ ] Revisou o que escreveu antes de fechar
- [ ] Sem segredos/keys no código
- [ ] Resposta curta com caminhos, sem colar código no chat

## Referência rápida

- JS/TS: `node --check <file>` para sintaxe; `npm run typecheck` para tipos.
- Python: `python -m py_compile <file>` para sintaxe.
- Git: `git status` / `git diff` via `[RUN_CMD]` para entender o estado; só commita se o usuário pedir.
