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

	registerCommand('typedown.openWysiwygEditor', async (uri?: vscode.Uri, ...args: any[]) => {
		console.log('[Typedown] openWysiwygEditor command called', { uri: uri?.toString(), args });
		
		// Handle different ways the command might be called
		// From tab context menu, VS Code might pass the resource as the first argument
		let resourceUri = uri;
		if (!resourceUri && args && args.length > 0) {
			if (args[0] instanceof vscode.Uri) {
				resourceUri = args[0];
			} else if (typeof args[0] === 'object' && args[0].resourceUri) {
				resourceUri = args[0].resourceUri;
			}
		}
		
		// If URI is provided (from context menu), use it
		if (resourceUri) {
			console.log('[Typedown] Opening with provided URI:', resourceUri.toString());
			await vscode.commands.executeCommand('vscode.openWith', resourceUri, MarkdownEditorProvider.viewType);
			return;
		}

		// Otherwise, try to get URI from active editor or visible editors
		// When called from tab context menu, the tab might not be the active editor
		const activeEditor = vscode.window.activeTextEditor;
		// Also check visible editors in case the tab is visible but not active
		const visibleEditors = vscode.window.visibleTextEditors;
		console.log('[Typedown] Active editor:', {
			exists: !!activeEditor,
			languageId: activeEditor?.document.languageId,
			uri: activeEditor?.document.uri.toString(),
			fileName: activeEditor?.document.fileName
		});

		// Try to find a markdown file from active or visible editors
		let markdownEditor = activeEditor;
		if (!markdownEditor || 
			!(markdownEditor.document.languageId === 'markdown' ||
			  markdownEditor.document.fileName.endsWith('.md') ||
			  markdownEditor.document.fileName.endsWith('.markdown'))) {
			// Look through visible editors for a markdown file
			markdownEditor = visibleEditors.find(editor => 
				editor.document.languageId === 'markdown' ||
				editor.document.fileName.endsWith('.md') ||
				editor.document.fileName.endsWith('.markdown')
			);
		}

		if (!markdownEditor) {
			console.log('[Typedown] No markdown editor found');
			vscode.window.showWarningMessage('No markdown file found. Please open a .md file first.');
			return;
		}

		const documentUri = markdownEditor.document.uri;
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
