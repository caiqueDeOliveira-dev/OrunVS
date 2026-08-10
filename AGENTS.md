# AGENTS.md - Instruções para IA

## MEMÓRIA GLOBAL DO ECOSSISTEMA ORUN

O OrunVS sincroniza com a **MEMORY.md global** do ecossistema (`~/.config/opencode/MEMORY.md`, compartilhada com opencode e o desktop Orun OS):

- O **Resumo atual** da memória global é injetado no system prompt de cada conversa (pequeno, ~1 KB — não injetar o arquivo inteiro).
- Ao trocar/iniciar conversa, a sessão anterior é **registrada automaticamente** (bloco `### Sessão ...` em `## Histórico de sessões` + atualização do `## Resumo atual`), com **escrita atômica + lock** para nunca sobrescrever o opencode.
- Comandos: **OrunVS: Registrar sessão na memória global** (manual) e **OrunVS: Mostrar memória global**.
- Settings: `orunvs.memoriaGlobalAuto` (default true). Lógica em `src/memory-global.ts`.
- Sempre responder em português (pt-BR). Nunca apagar o histórico do MEMORY.md.

## REGRA PRINCIPAL - CRIAÇÃO DE PROJETOS

Quando o usuário pedir para criar um site, sistema, projeto ou qualquer coisa que envolva código:

### OBRIGATÓRIO: SEMPRE CRIAR OS ARQUIVOS FISICAMENTE

- **NUNCA** mostre o código apenas no chat
- **SEMPRE** use a ferramenta `write` para criar cada arquivo
- **SEMPRE** crie a estrutura de pastas completa antes dos arquivos
- **SEMPRE** teste se os arquivos foram criados corretamente

### FLUXO OBRIGATÓRIO:

1. **Planejar** a estrutura de pastas e arquivos
2. **Criar pastas** usando `bash` com `mkdir -Force`
3. **Criar cada arquivo** usando a ferramenta `write`
4. **Verificar** que todos os arquivos existem com `read` ou `ls`
5. **Instalar dependências** se necessário (npm install, etc)
6. **Testar** o projeto se possível
7. **Commit e Push** para GitHub quando solicitado

### EXEMPLO DE COMANDOS PARA CRIAR PASTAS:

```powershell
mkdir -Force "nome-do-projeto/css"
mkdir -Force "nome-do-projeto/js"
mkdir -Force "nome-do-projeto/assets"
mkdir -Force "nome-do-projeto/img"
```

### PARA GITHUB:

```powershell
git init
git add .
git commit -m "feat: descricao do projeto"
gh repo create nome-do-projeto --public --source=. --push
```

### NUNCA FAÇA:

- ❌ Mostre o código formatado no chat sem criar arquivo
- ❌ Diga "aqui está o código" sem usar a ferramenta write
- ❌ Pule a criação de algum arquivo da estrutura
- ❌ Crie apenas parte dos arquivos

### SEMPRE FAÇA:

- ✅ Crie TODOS os arquivos usando write
- ✅ Crie TODAS as pastas usando mkdir
- ✅ Verifique se tudo foi criado
- ✅ Informe o caminho de cada arquivo criado
- ✅ Ao final, confirme a estrutura completa criada

## FORMATO DE RESPOSTA AO CRIAR PROJETO:

Ao criar um projeto, formate assim:

```
📂 Criando estrutura do projeto...
✅ Pasta: css/ criada
✅ Pasta: js/ criada
✅ Arquivo: index.html criado
✅ Arquivo: css/style.css criado
✅ Arquivo: js/main.js criado
...
✅ Todos os arquivos criados com sucesso!

📁 Estrutura final:
projeto/
├── index.html
├── css/
│   └── style.css
└── js/
    └── main.js
```
