import * as vscode from 'vscode';
import { ChatProvider } from './chatprovider';

let provider: ChatProvider;

export function activate(context: vscode.ExtensionContext) {
    provider = new ChatProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('orunvs.perguntar', async () => {
            const input = await vscode.window.showInputBox({ placeHolder: 'Pergunta para o OrunVS...' });
            if (input) {
                await provider.processarPrompt(input);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('orunvs.selecionarProvider', () => provider.selecionarProvider())
    );
}

export function deactivate() { }
