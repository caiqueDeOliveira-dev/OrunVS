<div align="center">
  <h1>🧩 OrunVS</h1>
  <p><strong>Assistente de IA para Visual Studio Code — múltiplos providers no seu editor</strong></p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="VS Code" />
    <img src="https://img.shields.io/badge/version-0.3.4-9C27B0?style=for-the-badge" alt="Versão" />
  </p>
  <p><em>Chat de IA integrado · arquivos · terminal · multi-provider</em></p>
  <img src="resources/logo.png" width="120" alt="OrunVS" />
</div>

---

## ✨ Sobre o Projeto

Assistente de IA integrado na barra de atividades do VS Code, com suporte a **múltiplos providers** — escolha entre modelos gratuitos e pagos, direto do editor.

---

## 🎯 Funcionalidades

- 💬 **Chat lateral** na barra de atividades do VS Code
- ⚡ **Streaming** de respostas em tempo real
- 🧠 **Múltiplos providers de IA**:
  - **OpenCodeZen** (gratuito — provider recomendado do ecossistema Orun)
  - **Google Gemini** (gratuito)
  - **Groq Cloud** (gratuito)
  - **OpenRouter** (gratuito e pago)
  - **DeepSeek** (gratuito)
  - **Hugging Face** (gratuito)
  - **Ollama** (local)
- 📝 **Edição, criação e deleção** de arquivos com permissão
- 🖥️ **Execução de comandos** no terminal
- 🗂️ **Múltiplas conversas** (abas)
- 📄 **Exportar conversas** em Markdown
- 🎨 **Presets personalizáveis**
- 🖼️ **Anexar arquivos e imagens**
- 📥 **Drag & drop** de arquivos
- 🔍 **Catálogo de modelos**
- ✨ **Syntax highlighting** com Prism.js
- 📋 **Copiar blocos** com um clique
- 🔄 **Regenerar respostas**

---

## 📦 Instalação

### Via GitHub
```bash
git clone https://github.com/caiqueDeOliveira-dev/OrunVS.git
cd OrunVS
npm install
npm run compile
```
Depois pressione `F5` para iniciar a extensão em modo de depuração.

### Via VSIX (compactado)
1. Baixe o arquivo `.vsix` nas [releases](https://github.com/caiqueDeOliveira-dev/OrunVS/releases)
2. No VS Code, vá em **Extensions** → **...** → **Install from VSIX...**
3. Selecione o arquivo baixado

---

## ⚙️ Configuração

**Cada usuário deve configurar suas próprias API keys.** A extensão não inclui chaves — nem gratuitas nem pagas. Você precisa criar sua conta no provider e gerar sua chave.

> **Importante:** Mesmo os providers gratuitos exigem que você crie uma conta e gere uma API key no site deles. Ninguém usa suas chaves e você não usa as dos outros.

> **Nota (v0.2.0):** O **GitHub Models** foi aposentado pela Microsoft (HTTP 410 brownout) e não é mais listado. Se seu provider estiver marcado como GitHub, troque para OpenCodeZen, Groq, OpenRouter ou Gemini.

Após instalar, configure sua API key em **Settings** → **Extensions** → **OrunVS**:

| Provider | Configuração | Gratuito? | Como obter |
|----------|-------------|-----------|------------|
| OpenCodeZen | `orunvs.opencodezenKey` | Sim | [opencode.ai](https://opencode.ai) — provider recomendado do ecossistema Orun |
| Gemini | `orunvs.geminiKey` | Sim | [Google AI Studio](https://aistudio.google.com/apikey) |
| Groq | `orunvs.groqKey` | Sim | [Groq Cloud](https://console.groq.com) |
| OpenRouter | `orunvs.openrouterKey` | Sim/Pago | [OpenRouter](https://openrouter.ai/keys) |
| DeepSeek | `orunvs.deepseekKey` | Sim/Pago | [DeepSeek](https://platform.deepseek.com) |
| Hugging Face | `orunvs.huggingfaceKey` | Sim | [Hugging Face](https://huggingface.co/settings/tokens) |
| Ollama | Nenhuma (local) | Sim | [Ollama](https://ollama.com) — roda no seu PC |

---

## ⌨️ Comandos

| Comando | Atalho | Descrição |
|---------|--------|-----------|
| `OrunVS: Fazer uma pergunta` | `Ctrl+Shift+P` | Abre input para perguntar |
| `OrunVS: Trocar provider de IA` | `Ctrl+Shift+P` | Troca o provider ativo |
| `OrunVS: Encontrar bugs no código ativo` | `Ctrl+Shift+P` | Analisa bugs no código |
| `OrunVS: Explicar código selecionado` | `Ctrl+Shift+P` | Explica o código selecionado |
| `OrunVS: Refatorar código selecionado` | `Ctrl+Shift+P` | Refatora o código selecionado |

---

## 🚀 Uso

1. Clique no ícone **OrunVS** na barra de atividades (lateral esquerda)
2. Configure sua API key nas configurações
3. Clique em **Modelos** para trocar de provider/modelo
4. Digite sua mensagem e pressione **Enter** ou clique em **Mandar**

### Ações especiais

A IA pode criar, editar e deletar arquivos automaticamente. Cada ação requer sua permissão:

- **Criar/Editar arquivo** — Mostra diff do que será alterado
- **Deletar arquivo** — Confirma antes de apagar
- **Executar comando** — Mostra o comando antes de rodar

### Atalhos no chat

- **Enter** — Enviar mensagem
- **Shift+Enter** — Nova linha
- **/model** — Trocar modelo
- **/model nome** — Trocar para modelo específico

---

## 🗂️ Estrutura do projeto

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

---

## 🧪 Tecnologias

- **TypeScript** — Linguagem principal
- **VS Code Extension API** — API de extensões
- **OpenAI SDK** — Client para providers compatíveis
- **Markdown-It** — Renderização de Markdown
- **Prism.js** — Syntax highlighting

---

## 📦 Ecossistema Orun

- 🖥️ **[Orun OS](https://github.com/caiqueDeOliveira-dev/OrunOS)** — o projeto principal (desktop)
- 📱 **[Orun OS Mobile](https://github.com/caiqueDeOliveira-dev/OrunOs-Mobile)** — versão mobile
- 🛡️ **[OrunShield](https://github.com/caiqueDeOliveira-dev/OrunShield)** — suite de segurança e otimização
- ⚙️ **[Orun-Core](https://github.com/caiqueDeOliveira-dev/Orun-Core)** — núcleo compartilhado do ecossistema
- 🎵 **[Orun Música](https://github.com/caiqueDeOliveira-dev/orun-music-player)** — player de música desktop

---

## 📄 Licença

MIT — © **Grupo Orum ST**
