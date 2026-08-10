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
   - **Edge cases**: entrada vazia/null, erro de rede/IO, arquivo inexistente, divisão por zero.
   - **Convenções**: estilo, libs já usadas no projeto, padrões da codebase.
   - **Código morto**: imports não usados, funções nunca chamadas, logs de debug esquecidos.
3. **Cite linhas concretas** (`arquivo:linha`) em vez de elogios genéricos.
4. **Classifique a gravidade** de cada achado: `low | medium | high | critical`.
5. **Sugira a correção** (concreta, não genérica) — se o pedido for "corrija", implemente com `[FILE_EDIT]` e verifique com `[RUN_CMD]`.

## Saída

Finalize SEMPRE com o JSON de revisão:

```json
{"repo": "<nome do projeto>", "file_path": "<arquivo revisado>", "summary": "<resumo em 1 frase>", "issues_found": N, "severity": "low|medium|high|critical"}
```

## Regras

- Nunca invente problemas — só aponte o que leu no código.
- Não elogie de forma genérica; se algo está bom, diga por quê (1 linha).
- Se o usuário pediu só a revisão (não a correção), NÃO edite arquivos — apenas responda em texto com o JSON final.
