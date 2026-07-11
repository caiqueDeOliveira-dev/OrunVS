# OrunVS

Extensão para Visual Studio Code — Assistente de IA com suporte a múltiplos providers.

![OrunVS](resources/logo.png)

## Funcionalidades

- Chat lateral integrado na barra de atividades do VS Code
- Streaming de respostas em tempo real
- Suporte a múltiplos providers de IA:
  - **Google Gemini** (gratuito)
  - **Groq Cloud** (gratuito)
  - **OpenRouter** (gratuito e pago)
  - **DeepSeek** (gratuito)
  - **GitHub Models** (gratuito)
  - **Hugging Face** (gratuito)
  - **Ollama** (local)
- Edição, criação e deleção de arquivos com permissão
- Execução de comandos no terminal
- Múltiplas conversas (abas)
- Exportar conversas em Markdown
- Presets personalizáveis
- Anexar arquivos e imagens
- Drag & drop de arquivos
- Catálogo de modelos
- Syntax highlighting com Prism.js
- Copiar blocos de código com um clique
- Regenerar respostas

## Instalação

### Via GitHub

1. Clone o repositório:
   ```bash
   git clone https://github.com/OrunST/OrunVS.git
   ```

2. Abra o projeto no VS Code:
   ```bash
   code OrunVS
   ```

3. Instale as dependências:
   ```bash
   npm install
   ```

4. Compile o projeto:
   ```bash
   npm run compile
   ```

5. Pressione `F5` para iniciar a extensão em modo de depuração.

### Via VSIX (compactado)

1. Baixe o arquivo `.vsix` nas [releases](https://github.com/OrunST/OrunVS/releases)
2. No VS Code, vá em **Extensions** → **...** → **Install from VSIX...**
3. Selecione o arquivo baixado

## Configuração

Após instalar, configure sua API key em **Settings** → **Extensions** → **OrunVS**:

| Provider | Configuração | Gratuito? |
|----------|-------------|-----------|
| Gemini | `orunvs.geminiKey` | Sim |
| Groq | `orunvs.groqKey` | Sim |
| OpenRouter | `orunvs.openrouterKey` | Sim |
| DeepSeek | `orunvs.deepseekKey` | Sim |
| GitHub | `orunvs.githubToken` | Sim |
| Hugging Face | `orunvs.huggingfaceKey` | Sim |
| Ollama | Nenhuma (local) | Sim |

## Comandos

| Comando | Atalho | Descrição |
|---------|--------|-----------|
| `OrunVS: Fazer uma pergunta` | `Ctrl+Shift+P` | Abre input para perguntar |
| `OrunVS: Trocar provider de IA` | `Ctrl+Shift+P` | Troca o provider ativo |
| `OrunVS: Encontrar bugs no código ativo` | `Ctrl+Shift+P` | Analisa bugs no código |
| `OrunVS: Explicar código selecionado` | `Ctrl+Shift+P` | Explica o código selecionado |
| `OrunVS: Refatorar código selecionado` | `Ctrl+Shift+P` | Refatora o código selecionado |

## Uso

1. Clique no ícone **OrunVS** na barra de atividades (lateral esquerda)
2. Configure sua API key nas configurações
3. Clique em **Modelos** para trocar de provider/modelo
4. Digite sua mensagem e pressione **Enter** ou clique em **Mandar**

### Ações especiais

A IA pode criar, editar e deletar arquivos automaticamente. Cada ação requer sua permissão:

- ** Criar/Editar arquivo** — Mostra diff do que será alterado
- ** Deletar arquivo** — Confirma antes de apagar
- ** Executar comando** — Mostra o comando antes de rodar

## Atalhos no chat

- **Enter** — Enviar mensagem
- **Shift+Enter** — Nova linha
- **/model** — Trocar modelo
- **/model nome** — Trocar para modelo específico

## Estrutura do projeto

```
OrunVS/
├── src/
│   ├── extension.ts        # Ativação da extensão
│   └── chatprovider.ts     # Provider do webview e lógica principal
├── resources/
│   ├── main.js             # JavaScript do webview (frontend)
│   ├── logo.svg            # Ícone da extensão
│   ├── logo.png            # Logo para README
│   ├── Fundo.png           # Imagem de fundo
│   └── LoadPerfeito.mp4    # Vídeo de loading
├── out/                    # Arquivos compilados (gitignored)
├── package.json            # Manifesto da extensão
├── tsconfig.json           # Configuração do TypeScript
└── .vscodeignore           # Arquivos excluídos do pacote
```

## Tecnologias

- **TypeScript** — Linguagem principal
- **VS Code Extension API** — API de extensões
- **OpenAI SDK** — Client para providers compatíveis
- **Markdown-It** — Renderização de Markdown
- **Prism.js** — Syntax highlighting

## Licença

MIT

## Autor

**Grupo Orum ST**
