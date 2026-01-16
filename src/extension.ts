import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditor';

export const extensionState: {
	activeDocument: vscode.TextDocument | undefined;
	activeWebviewPanel: vscode.WebviewPanel | undefined;
} = {
	activeDocument: undefined,
	activeWebviewPanel: undefined,
};

/**
 * Syncs the workbench.editorAssociations setting based on typedown.openByDefault.
 * When openByDefault is true, markdown files open in WYSIWYG mode by default.
 */
async function syncEditorAssociations() {
	const config = vscode.workspace.getConfiguration('typedown');
	const openByDefault = config.get<boolean>('openByDefault', false);
	
	const workbenchConfig = vscode.workspace.getConfiguration('workbench');
	const currentAssociations = workbenchConfig.get<Record<string, string>>('editorAssociations') || {};
	
	// Create a copy to modify
	const newAssociations = { ...currentAssociations };
	
	if (openByDefault) {
		// Set Typedown as the default editor for .md files
		newAssociations['*.md'] = MarkdownEditorProvider.viewType;
	} else {
		// Remove or set to default
		if (newAssociations['*.md'] === MarkdownEditorProvider.viewType) {
			newAssociations['*.md'] = 'default';
		}
	}
	
	// Only update if there's a change
	if (JSON.stringify(currentAssociations) !== JSON.stringify(newAssociations)) {
		await workbenchConfig.update('editorAssociations', newAssociations, vscode.ConfigurationTarget.Global);
		console.log('[Typedown] Updated editorAssociations:', newAssociations);
	}
}

export function activate(context: vscode.ExtensionContext) {

	// Initialize the context to false
	vscode.commands.executeCommand('setContext', 'typedown.editorIsActive', false);

	// Sync editor associations on activation
	syncEditorAssociations();

	// Listen for changes to typedown.openByDefault setting
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('typedown.openByDefault')) {
				syncEditorAssociations();
			}
		})
	);

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

	registerCommand('typedown.openDefaultEditor', async (uri?: vscode.Uri, ...args: any[]) => {
		console.log('[Typedown] openDefaultEditor command called', { uri: uri?.toString(), args });
		
		// Handle different ways the command might be called
		// From context menu, VS Code might pass the resource as the first argument
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
			await vscode.commands.executeCommand('vscode.openWith', resourceUri, 'default');
			return;
		}

		// Otherwise, try to get from active text editor (when called from editor context menu)
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor && (activeEditor.document.languageId === 'markdown' || 
			activeEditor.document.fileName.endsWith('.md') ||
			activeEditor.document.fileName.endsWith('.markdown'))) {
			console.log('[Typedown] Opening active text editor in default mode:', activeEditor.document.uri.toString());
			await vscode.commands.executeCommand('vscode.openWith', activeEditor.document.uri, 'default');
			return;
		}

		// Otherwise, use the active document from extension state (when in WYSIWYG mode)
		console.log('[Typedown] Extension state:', {
			activeDocument: extensionState?.activeDocument?.uri?.toString(),
			activeWebviewPanel: !!extensionState?.activeWebviewPanel
		});

		if (extensionState?.activeDocument?.uri === undefined) {
			console.log('[Typedown] No active WYSIWYG editor in extension state');
			vscode.window.showErrorMessage('No active markdown file found.');
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
