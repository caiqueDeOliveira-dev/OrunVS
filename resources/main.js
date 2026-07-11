(function(){
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const inp = document.getElementById('inp');
    const fileInput = document.getElementById('fileInput');
    const fileBtn = document.getElementById('fileBtn');
    const fileTag = document.getElementById('fileTag');
    const sugestao = document.getElementById('sugestao');
    const stopBtn = document.getElementById('stopBtn');
    const editIndicator = document.getElementById('editIndicator');
    const editPreview = document.getElementById('editPreview');
    const tabBar = document.getElementById('tabBar');
    const presetBar = document.getElementById('presetBar');
    const scrollToggle = document.getElementById('scrollToggle');
    let arquivoAtual = null;
    let contadorMsg = 0;
    let autoScroll = true;

    // ── LOADING SCREEN ──
    const loadingScreen = document.getElementById('loadingScreen');
    const loadVideo = document.getElementById('loadVideo');
    function esconderLoading() {
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => { loadingScreen.style.display = 'none'; }, 700);
        }
    }
    if (loadVideo) {
        loadVideo.addEventListener('ended', esconderLoading);
        loadVideo.addEventListener('error', esconderLoading);
        setTimeout(esconderLoading, 5000);
    } else {
        esconderLoading();
    }


    // ── PRESETS ──
    function carregarPresets(presets) {
        presetBar.innerHTML = '';
        for (const p of presets || []) {
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.textContent = p.label;
            btn.dataset.prompt = p.prompt;
            btn.onclick = () => {
                inp.value = p.prompt + ' ';
                inp.focus();
            };
            presetBar.appendChild(btn);
        }
    }

    // ── AUTO-SCROLL ──
    scrollToggle.onclick = () => {
        autoScroll = !autoScroll;
        scrollToggle.classList.toggle('off', !autoScroll);
    };

    chat.addEventListener('scroll', () => {
        const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
        if (nearBottom && !autoScroll) {
            autoScroll = true;
            scrollToggle.classList.remove('off');
        } else if (!nearBottom && autoScroll) {
            autoScroll = false;
            scrollToggle.classList.add('off');
        }
    });

    function scrollAbaixo() {
        if (autoScroll) chat.scrollTop = chat.scrollHeight;
    }

    function enviar(texto, arquivo) {
        let msg = { type: 'promptEnviado', value: texto };
        if (arquivo) msg.arquivo = arquivo;
        vscode.postMessage(msg);
        inp.value = '';
        sugestao.style.display = 'none';
        if (arquivoAtual) {
            arquivoAtual = null;
            fileTag.style.display = 'none';
            fileBtn.classList.remove('has-file');
        }
        editIndicator.style.display = 'none';
    }

    document.getElementById('btn').onclick = () => {
        const t = inp.value.trim();
        if (!t && !arquivoAtual) return;
        enviar(t, arquivoAtual);
    };

    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('btn').click(); }
    });

    document.getElementById('trocarBtn').onclick = () => vscode.postMessage({ type: 'trocarProvider' });
    document.getElementById('clearBtn').onclick = () => vscode.postMessage({ type: 'limparChat' });
    document.getElementById('exportBtn').onclick = () => vscode.postMessage({ type: 'exportarChat' });
    document.getElementById('cancelarEdicao').onclick = () => {
        editIndicator.style.display = 'none';
        vscode.postMessage({ type: 'cancelarEdicao' });
    };

    stopBtn.onclick = () => vscode.postMessage({ type: 'pararRequisicao' });

    fileBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const isImg = file.type.startsWith('image/');
            arquivoAtual = {
                nome: file.name,
                tipo: isImg ? 'imagem' : 'arquivo',
                conteudo: e.target.result,
                mime: file.type,
            };
            fileTag.textContent = '[!] ' + file.name;
            fileTag.style.display = 'flex';
            fileBtn.classList.add('has-file');
        };
        if (file.type.startsWith('image/')) reader.readAsDataURL(file);
        else reader.readAsText(file);
        fileInput.value = '';
    };

    // ── DRAG & DROP ──
    chat.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); chat.style.outline = '2px dashed #ff1a1a'; });
    chat.addEventListener('dragleave', () => { chat.style.outline = ''; });
    chat.addEventListener('drop', e => {
        e.preventDefault(); chat.style.outline = '';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = function(ev) {
                const isImg = file.type.startsWith('image/');
                arquivoAtual = {
                    nome: file.name,
                    tipo: isImg ? 'imagem' : 'arquivo',
                    conteudo: ev.target.result,
                    mime: file.type,
                };
                fileTag.textContent = '[!] ' + file.name;
                fileTag.style.display = 'flex';
                fileBtn.classList.add('has-file');
            };
            if (file.type.startsWith('image/')) reader.readAsDataURL(file);
            else reader.readAsText(file);
        }
    });

    // ── NOVA CONVERSA ──
    document.getElementById('novaTabBtn').onclick = () => vscode.postMessage({ type: 'novaConversa' });

    // ── DELEGAÇÃO DE EVENTOS ──
    chat.addEventListener('click', e => {
        const item = e.target.closest('.model-item');
        if (item) {
            vscode.postMessage({ type: 'selecionarModelo', modelName: item.dataset.model, provider: item.dataset.provider });
            return;
        }
        const btn = e.target.closest('.copy-btn');
        if (btn) {
            const pre = btn.parentElement;
            const code = pre.querySelector('code');
            const text = code ? code.textContent : pre.textContent;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = 'Copiado!';
                btn.classList.add('copied');
                setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
            }).catch(() => { btn.textContent = 'Erro'; });
            return;
        }
        // Reenviar mensagem do usuario
        const msgEl = e.target.closest('.msg.user');
        if (msgEl && msgEl.dataset.indice !== undefined && msgEl.dataset.texto) {
            vscode.postMessage({ type: 'reenviarMensagem', texto: msgEl.dataset.texto, indice: parseInt(msgEl.dataset.indice) });
            return;
        }
        // Regenerar
        const regBtn = e.target.closest('.regenerar-btn');
        if (regBtn) {
            vscode.postMessage({ type: 'regenerarUltimaResposta' });
            return;
        }
        // Fold toggle
        const foldBtn = e.target.closest('.fold-btn');
        if (foldBtn) {
            const pre = foldBtn.parentElement;
            pre.classList.toggle('folded');
            foldBtn.textContent = pre.classList.contains('folded') ? '+' : '\u2212';
            return;
        }
        // Inline edit
        const editBtn = e.target.closest('.inline-edit-btn');
        if (editBtn) {
            const pre = editBtn.parentElement;
            const code = pre.querySelector('code');
            const text = code ? code.textContent : pre.textContent;
            vscode.postMessage({ type: 'inlineEdit', conteudo: text });
            return;
        }
    });

    chat.addEventListener('dblclick', e => {
        const pre = e.target.closest('.msg pre');
        if (pre) {
            const code = pre.querySelector('code');
            const text = code ? code.textContent : pre.textContent;
            vscode.postMessage({ type: 'inlineEdit', conteudo: text });
        }
    });

    window.addEventListener('message', event => {
        try {
            const data = event.data || {};
            if (data.type === 'respostaIA') {
                chat.innerHTML += '<div class="msg">' + (data.value || '') + '</div>';
                scrollAbaixo();
            } else if (data.type === 'respostaIAUser') {
                chat.innerHTML += '<div class="msg user" data-indice="' + (contadorMsg++) + '" data-texto="' + escaparHtml(data.textoOriginal || '') + '">' + (data.value || '') + '<div class="edit-hint">\u270F\uFE0F Clique para editar ou reenviar</div></div>';
                scrollAbaixo();
            } else if (data.type === 'respostaIAStream') {
                let last = chat.lastElementChild;
                if (!last || !last.classList.contains('streaming')) {
                    last = document.createElement('div');
                    last.className = 'msg streaming';
                    chat.appendChild(last);
                }
                last.innerHTML = data.value || '';
                scrollAbaixo();
            } else if (data.type === 'respostaIAStreamFinal') {
                let last = chat.lastElementChild;
                if (last && last.classList.contains('streaming')) {
                    last.className = 'msg';
                } else {
                    last = document.createElement('div');
                    last.className = 'msg';
                    chat.appendChild(last);
                }
                last.innerHTML = data.value || '';
                scrollAbaixo();
                adicionarBotoesCopiar();
                adicionarFolding();
                adicionarInlineEdit();
                adicionarRegenerar();
                aplicarHighlight();
            } else if (data.type === 'limparChat') {
                chat.innerHTML = '';
                sugestao.style.display = 'none';
                contadorMsg = 0;
            } else if (data.type === 'sugestaoModelo') {
                sugestao.textContent = data.value === 'modelo-r\u00e1pido'
                    ? '\uD83D\uDCA1 Parece uma pergunta conceitual \u2014 ative um modelo r\u00e1pido como gemini-2.0-flash ou gpt-4o-mini'
                    : '\uD83D\uDCA1 Parece um pedido de c\u00f3digo \u2014 ative um modelo potente como gemini-2.5-pro ou gpt-4o';
                sugestao.className = data.value === 'modelo-r\u00e1pido' ? 'rapido' : 'potente';
                sugestao.style.display = 'flex';
            } else if (data.type === 'pedirPermissao') {
                const overlay = document.getElementById('permOverlay');
                document.getElementById('permTitulo').textContent = data.tipo === 'EDIT' ? 'EDITAR ARQUIVO'
                    : data.tipo === 'CREATE' ? 'CRIAR ARQUIVO'
                    : data.tipo === 'DELETE' ? 'DELETAR ARQUIVO'
                    : 'EXECUTAR COMANDO';
                document.getElementById('permDescricao').textContent = data.descricao;
                document.getElementById('permDetalhe').textContent = data.detalhe;
                overlay.style.display = 'flex';
                overlay._permId = data.id;
            } else if (data.type === 'streamingIniciou') {
                stopBtn.style.display = 'block';
            } else if (data.type === 'streamingTerminou') {
                stopBtn.style.display = 'none';
            } else if (data.type === 'editandoMensagem') {
                inp.value = data.texto || '';
                editPreview.textContent = (data.texto || '').slice(0, 60) + ((data.texto || '').length > 60 ? '...' : '');
                editIndicator.style.display = 'flex';
                inp.focus();
            } else if (data.type === 'conversaAdicionada') {
                const tab = document.createElement('div');
                tab.className = 'tab active';
                tab.dataset.tab = data.indice;
                tab.innerHTML = data.titulo + ' <span class="close-tab">\u2715</span>';
                const novaBtn = document.getElementById('novaTabBtn');
                tabBar.insertBefore(tab, novaBtn);
                document.querySelectorAll('.tab').forEach(t => {
                    if (t !== tab) t.classList.remove('active');
                });
            } else if (data.type === 'recarregarHistorico') {
                chat.innerHTML = '';
                contadorMsg = 0;
                if (data.historico) {
                    for (const msg of data.historico) {
                        const cls = msg.role === 'user' ? 'msg user' : 'msg';
                        const original = msg.textoOriginal || msg.texto || '';
                        const attrs = msg.role === 'user' ? ' data-indice="' + (contadorMsg++) + '" data-texto="' + escaparHtml(original) + '"' : '';
                        chat.innerHTML += '<div class="' + cls + '"' + attrs + '>' + (msg.text || '') + '</div>';
                    }
                }
                adicionarBotoesCopiar();
                adicionarFolding();
                adicionarInlineEdit();
                adicionarRegenerar();
                aplicarHighlight();
            } else if (data.type === 'presetsCarregados') {
                carregarPresets(data.presets || []);
            }
        } catch (e) {
            console.error('OrunVS msg error:', e);
        }
    });

    // ── FUNÇÕES AUXILIARES ──
    function adicionarBotoesCopiar() {
        document.querySelectorAll('.msg pre:not(.has-copy)').forEach(pre => {
            pre.classList.add('has-copy');
            const btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.textContent = 'Copiar';
            pre.appendChild(btn);
        });
    }

    function adicionarFolding() {
        document.querySelectorAll('.msg pre:not(.has-fold)').forEach(pre => {
            const lines = pre.textContent.split('\n').length;
            if (lines > 15) {
                pre.classList.add('has-fold');
                const btn = document.createElement('button');
                btn.className = 'fold-btn';
                btn.textContent = '\u2212';
                btn.title = 'Colapsar';
                pre.appendChild(btn);
            }
        });
    }

    function adicionarInlineEdit() {
        document.querySelectorAll('.msg pre:not(.has-iedit)').forEach(pre => {
            pre.classList.add('has-iedit');
            const btn = document.createElement('button');
            btn.className = 'inline-edit-btn';
            btn.textContent = '\u270E';
            btn.title = 'Editar no VS Code (duplo clique)';
            pre.appendChild(btn);
        });
    }

    function adicionarRegenerar() {
        if (document.querySelector('.regenerar-btn')) return;
        const msgs = document.querySelectorAll('.msg');
        if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            if (!last.classList.contains('user') && !last.classList.contains('streaming')) {
                const btn = document.createElement('button');
                btn.className = 'regenerar-btn';
                btn.textContent = '\uD83D\uDD04 Regenerar resposta';
                last.after(btn);
            }
        }
    }

    function aplicarHighlight() {
        if (typeof Prism !== 'undefined') {
            document.querySelectorAll('.msg pre code:not(.language-none)').forEach(block => {
                Prism.highlightElement(block);
            });
        }
    }

    function escaparHtml(s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    adicionarBotoesCopiar();

    // ── TAB CLICK DELEGATION ──
    tabBar.addEventListener('click', e => {
        const tab = e.target.closest('.tab');
        if (tab && !e.target.classList.contains('close-tab')) {
            vscode.postMessage({ type: 'trocarConversa', indice: parseInt(tab.dataset.tab) });
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        }
    });

    // ── PERMISSÃO OVERLAY ──
    document.getElementById('permPermitir').onclick = () => {
        const overlay = document.getElementById('permOverlay');
        vscode.postMessage({ type: 'respostaPermissao', id: overlay._permId, escolha: 'allow' });
        overlay.style.display = 'none';
    };
    document.getElementById('permNegar').onclick = () => {
        const overlay = document.getElementById('permOverlay');
        vscode.postMessage({ type: 'respostaPermissao', id: overlay._permId, escolha: 'deny' });
        overlay.style.display = 'none';
    };
    document.getElementById('permSempre').onclick = () => {
        const overlay = document.getElementById('permOverlay');
        vscode.postMessage({ type: 'respostaPermissao', id: overlay._permId, escolha: 'always' });
        overlay.style.display = 'none';
    };

    // ── INICIALIZA PRESETS ──
    // (presets sao carregados via mensagem)
})();
