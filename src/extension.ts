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
 * Syncs workbench.editorAssociations based on typedown.openByDefault setting.
 * With priority: "option" in package.json, we need to set this to make WYSIWYG the default.
 */
async function syncEditorAssociations() {
	try {
		const config = vscode.workspace.getConfiguration('typedown');
		const openByDefault = config.get<boolean>('openByDefault', false);
		
		const workbenchConfig = vscode.workspace.getConfiguration('workbench');
		const currentAssociations = workbenchConfig.get<Record<string, string>>('editorAssociations') || {};
		const newAssociations = { ...currentAssociations };
		
		if (openByDefault) {
			// Set Typedown as the default editor for .md files
			if (newAssociations['*.md'] !== MarkdownEditorProvider.viewType) {
				newAssociations['*.md'] = MarkdownEditorProvider.viewType;
			}
		} else {
			// Remove our association - let VS Code use default text editor
			if (newAssociations['*.md'] === MarkdownEditorProvider.viewType) {
				delete newAssociations['*.md'];
			}
		}
		
		// Only update if there's a change
		if (JSON.stringify(currentAssociations) !== JSON.stringify(newAssociations)) {
			await workbenchConfig.update('editorAssociations', newAssociations, vscode.ConfigurationTarget.Global);
			console.log('[Typedown] Updated editorAssociations:', newAssociations);
		}
	} catch (error) {
		console.error('[Typedown] Error syncing editorAssociations:', error);
	}
}

export function activate(context: vscode.ExtensionContext) {

	// Initialize the context to false
	vscode.commands.executeCommand('setContext', 'typedown.editorIsActive', false);

	// Register our custom editor provider
	context.subscriptions.push(MarkdownEditorProvider.register(context));

	// Sync editor associations based on openByDefault setting
	syncEditorAssociations();

	// Listen for changes to typedown.openByDefault setting
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('typedown.openByDefault')) {
				syncEditorAssociations();
			}
		})
	);

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
