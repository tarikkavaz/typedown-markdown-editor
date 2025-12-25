import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditor';

export const extensionState: {
	activeDocument: vscode.TextDocument | undefined;
	activeWebviewPanel: vscode.WebviewPanel | undefined;
} = {
	activeDocument: undefined,
	activeWebviewPanel: undefined,
};

export function activate(context: vscode.ExtensionContext) {
	console.log('Typedown extension activated!');

	// Initialize the context to false
	vscode.commands.executeCommand('setContext', 'typedown.editorIsActive', false);

	// Register our custom editor provider
	context.subscriptions.push(MarkdownEditorProvider.register(context));

	// Helper method to register commands and push subscription
	function registerCommand(command: string, callback: (...args: any[]) => any) {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback));
	}

	registerCommand('typedown.openWysiwygEditor', async (uri?: vscode.Uri) => {
		console.log('[Typedown] openWysiwygEditor command called', { uri: uri?.toString() });
		
		// If URI is provided (from context menu), use it
		if (uri) {
			console.log('[Typedown] Opening with provided URI:', uri.toString());
			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
			return;
		}

		// Otherwise, try to get URI from active editor
		const activeEditor = vscode.window.activeTextEditor;
		console.log('[Typedown] Active editor:', {
			exists: !!activeEditor,
			languageId: activeEditor?.document.languageId,
			uri: activeEditor?.document.uri.toString(),
			fileName: activeEditor?.document.fileName
		});

		if (activeEditor === undefined) {
			console.log('[Typedown] No active text editor');
			vscode.window.showWarningMessage('No active text editor. Please open a markdown file first.');
			return;
		}

		// Check if it's a markdown file by language ID or file extension
		const isMarkdown = activeEditor.document.languageId === 'markdown' ||
			activeEditor.document.fileName.endsWith('.md') ||
			activeEditor.document.fileName.endsWith('.markdown');

		if (!isMarkdown) {
			console.log('[Typedown] Active editor is not markdown', {
				languageId: activeEditor.document.languageId,
				fileName: activeEditor.document.fileName
			});
			vscode.window.showWarningMessage('Active editor is not a markdown file. Please open a .md file first.');
			return;
		}

		const documentUri = activeEditor.document.uri;
		console.log('[Typedown] Opening markdown file in WYSIWYG mode:', documentUri.toString());
		if (documentUri) {
			await vscode.commands.executeCommand('vscode.openWith', documentUri, MarkdownEditorProvider.viewType);
		}
	});

	registerCommand('typedown.openDefaultEditor', async (uri?: vscode.Uri) => {
		console.log('[Typedown] openDefaultEditor command called', { uri: uri?.toString() });
		
		// If URI is provided, use it
		if (uri) {
			console.log('[Typedown] Opening with provided URI:', uri.toString());
			await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
			return;
		}

		// Otherwise, use the active document from extension state
		console.log('[Typedown] Extension state:', {
			activeDocument: extensionState?.activeDocument?.uri?.toString(),
			activeWebviewPanel: !!extensionState?.activeWebviewPanel
		});

		if (extensionState?.activeDocument?.uri === undefined) {
			console.log('[Typedown] No active WYSIWYG editor in extension state');
			vscode.window.showErrorMessage('No active WYSIWYG editor.');
			return;
		}

		const documentUri = extensionState.activeDocument.uri;
		console.log('[Typedown] Opening in default editor:', documentUri.toString());
		await vscode.commands.executeCommand('vscode.openWith', documentUri, 'default');
	});

	// Debug command to check context state
	registerCommand('typedown.debugContext', async () => {
		const contextValue = await vscode.commands.executeCommand('getContext', 'typedown.editorIsActive');
		const activeEditor = vscode.window.activeTextEditor;
		const info = {
			typedownEditorIsActive: contextValue,
			activeEditorLanguage: activeEditor?.document.languageId,
			activeEditorUri: activeEditor?.document.uri.toString()
		};
		console.log('[Typedown] Debug context:', info);
		vscode.window.showInformationMessage(`Typedown Debug: ${JSON.stringify(info)}`);
	});
}

export function deactivate() {}
