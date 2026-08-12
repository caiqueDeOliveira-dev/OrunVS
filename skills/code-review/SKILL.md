---
name: code-review
description: Revisão de código — analisar correção, segurança, edge cases e convenções antes de entregar. Use quando o usuário pedir revisão/bugs/qualidade de código.
---

# Code Review — Skill de Revisão de Código

Quando o usuário pedir revisão de código (próprio, de outra pessoa ou do agente):

## Workflow

1. **Leia** o código alvo: `[FILE_READ]` do arquivo (ou `[LIST_FILES]` para mapear o projeto).
2. **Analise** em 5 dimensões:
   - **Correção**: lógica, condições de borda, loops, tipos, assincronismo.
   - **Segurança**: injeção (SQL/XSS/command), validação de entrada, segredos hardcoded, OWASP.
   - **Manutenibilidade**: nomes, legibilidade, complexidade, acoplamento.
   - **Performance**: N+1, loops desnecessários, alocações em caminho quente.
   - **Testes**: os caminhos importantes estão testados?
   - **Edge cases**: entrada vazia/null, erro de rede/IO, arquivo inexistente, divisão por zero.
   - **Convenções**: estilo, libs já usadas no projeto, padrões da codebase.
   - **Código morto**: imports não usados, funções nunca chamadas, logs de debug esquecidos.
3. **Priorize cada achado** com marcador:
   - `🔴 **Blocker**` (deve corrigir): vulnerabilidade de segurança, perda/corrupção de dados, race condition/deadlock, quebra de contrato de API, erro sem tratamento em caminho crítico.
   - `🟡 **Sugestão**` (deveria corrigir): validação de entrada faltando, nomes/lógica confusos, falta de teste em comportamento importante, performance (N+1), duplicação a extrair.
   - `💭 **Nit**` (nice to have): inconsistência de estilo (se não há linter), nomes menores, gaps de documentação.
4. **Formato de comentário** por achado:
   ```
   🔴 **Segurança: SQL Injection**
   Linha 42: input do usuário interpolado direto na query.

   **Por quê:** um atacante pode injetar `'; DROP TABLE users; --` no parâmetro name.

   **Sugestão:**
   - Use query parametrizada: `db.query('SELECT * FROM users WHERE name = $1', [name])`
   ```
5. **Explique o motivo** de cada mudança ("considere X porque Y"), não só o que mudar. Sugira, não exija.
6. **Elogie código bom**: se algo está bem resolvido, diga o porquê (1 linha) — revisão ensina, não só critica.
7. **Uma review completa** — não faça drip-feed de comentários ao longo de várias rodadas.
8. **Cite linhas concretas** (`arquivo:linha`) em vez de elogios genéricos.
9. **Se a intenção estiver ambígua, pergunte** em vez de assumir que está errado.
10. **Classifique a gravidade** de cada achado: `low | medium | high | critical`.
11. **Sugira a correção** (concreta, não genérica) — se o pedido for "corrija", implemente com `[FILE_EDIT]` e verifique com `[RUN_CMD]`.

## Saída

Finalize SEMPRE com o JSON de revisão:

```json
{"repo": "<nome do projeto>", "file_path": "<arquivo revisado>", "summary": "<resumo em 1 frase>", "issues_found": N, "severity": "low|medium|high|critical"}
```

## Regras

- Nunca invente problemas — só aponte o que leu no código.
- Não elogie de forma genérica; se algo está bom, diga por quê (1 linha).
- Se o usuário pediu só a revisão (não a correção), NÃO edite arquivos — apenas responda em texto com o JSON final.
