import * as vscode from 'vscode';
import { extensionState } from './extension';

const prettier = require('prettier');

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new MarkdownEditorProvider(context);
		const providerRegistration = vscode.window.registerCustomEditorProvider(
			MarkdownEditorProvider.viewType,
			provider,
			{
				webviewOptions: { retainContextWhenHidden: true },
			}
		);
		return providerRegistration;
	}

	static readonly viewType = 'typedown.markdownEditor';

	constructor(private readonly context: vscode.ExtensionContext) {}

	// Get sideBar.foreground color from VS Code theme
	private getSideBarForegroundColor(): string {
		// Try to get from colorCustomizations first
		const colorCustomizations = vscode.workspace.getConfiguration('workbench').get('colorCustomizations') as Record<string, any> | undefined;
		if (colorCustomizations && colorCustomizations['sideBar.foreground']) {
			return colorCustomizations['sideBar.foreground'] as string;
		}
		
		// VS Code doesn't expose theme colors directly via API
		// We'll use a fallback that matches common themes
		// The actual color will be read from the webview's computed styles if available
		// For now, return a CSS variable reference that the webview can resolve
		return 'var(--vscode-sideBar-foreground, var(--vscode-foreground))';
	}


	// Called when our custom editor is opened.
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Setup initial webview HTML and settings
		webviewPanel.webview.options = { enableScripts: true };
		const sidebarForegroundColor = this.getSideBarForegroundColor();
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, sidebarForegroundColor);
		
		// Send theme color to webview
		webviewPanel.webview.postMessage({
			type: 'themeColorChanged',
			sidebarForeground: sidebarForegroundColor,
		});

		// Update global state when a webview is focused.
		function handleFocusChange(panel: vscode.WebviewPanel, initialLoadFlag = false) {
			console.log('handleFocusChange', panel.active);
			if (panel.active) {
				extensionState.activeDocument = document;
				extensionState.activeWebviewPanel = panel;
				// This is used in the contribution point "when" clauses indicating which icons and hotkeys to activate
				vscode.commands
					.executeCommand('setContext', 'typedown.editorIsActive', true)
					.then(() => {
						console.log('typedown.editorIsActive', true);
					});
			} else if (!panel.active && panel === extensionState.activeWebviewPanel) {
				vscode.commands
					.executeCommand('setContext', 'typedown.editorIsActive', false)
					.then(() => {
						console.log('typedown.editorIsActive', false);
					});
			}

			console.log(
				`${initialLoadFlag ? '(Initial Load)' : '(onDidChangeViewState)'} Active: ${
					panel.active
				} - ${document?.uri.toString()}`
			);
		}

		// We need to manually trigger this once inside of resolveCustomTextEditor since onDidChangeViewState does not run on initial load.
		handleFocusChange(webviewPanel, true);

		webviewPanel.onDidChangeViewState((e) => {
			handleFocusChange(e.webviewPanel);
		});

		// Initial scroll sync
		webviewPanel.webview.postMessage({
			type: 'scrollChanged',
			scrollTop: document.lineAt(0).range.start.line,
		});

		////////////////////////////////////////////////////////////////////////////////////////
		// Hook up event handlers so that we can synchronize the webview with the text document.
		//
		// The text document acts as our model, so we have to sync changes in the document to our
		// editor and sync changes in the editor back to the document.
		//
		// Remember that a single text document can also be shared between multiple custom
		// editors (this happens for example when you split a custom editor)

		let isUpdatingFromWebview = { value: false };
		let lastWebviewContent = '';

		function updateWebview() {
			let text = document.getText();

			// Change EOL to \n because that's what CKEditor5 uses internally
			const normalizedText = text.replace(/(?:\r\n|\r|\n)/g, '\n');

			// Don't update if we just updated from webview and content hasn't changed externally
			if (isUpdatingFromWebview.value && normalizedText === lastWebviewContent.replace(/(?:\r\n|\r|\n)/g, '\n')) {
				console.log('Skipping updateWebview - document matches webview content');
				isUpdatingFromWebview.value = false;
				return;
			}

			console.log('updateWebview', [JSON.stringify(text)]);
			webviewPanel.webview.postMessage({ type: 'documentChanged', text: normalizedText });
			isUpdatingFromWebview.value = false;
		}

		const saveDocumentSubscription = vscode.workspace.onDidSaveTextDocument((e) => {
			console.log('Saved Document');
			if (e.uri.toString() === document.uri.toString()) {
				// Don't update webview on save if changes came from webview
				if (!isUpdatingFromWebview.value) {
					updateWebview();
				} else {
					isUpdatingFromWebview.value = false;
				}
			}
		});

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			console.log('Changed Document: ', [JSON.stringify(e.document.getText()).substring(0, 100) + '...']);
			// Don't update webview on document change - only on save
			// This prevents overwriting webview changes when we apply edits
		});

		const onDidChangeTextEditorVisibleRanges = vscode.window.onDidChangeTextEditorVisibleRanges(
			(e) => {
				console.log('onDidChangeTextEditorVisibleRanges: ', [JSON.stringify(e)]);
				if (e.textEditor.document === document) {
					//  Sync scroll from editor to webview
					webviewPanel.webview.postMessage({
						type: 'scrollChanged',
						scrollTop: e.textEditor.visibleRanges[0].start.line,
					});
				}
			}
		);

		// Listen for font configuration changes and theme changes
		const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('typedown.editor.fontFamily') || 
				e.affectsConfiguration('typedown.editor.fontSize') ||
				e.affectsConfiguration('editor.fontFamily') ||
				e.affectsConfiguration('editor.fontSize')) {
				const typedownConfig = vscode.workspace.getConfiguration('typedown.editor');
				const editorConfig = vscode.workspace.getConfiguration('editor');
				
				const fontSize = typedownConfig.get<number>('fontSize') ?? editorConfig.get<number>('fontSize', 14);
				const fontFamily = typedownConfig.get<string>('fontFamily') ?? editorConfig.get<string>('fontFamily', '');
				
				console.log('Font configuration changed:', { fontSize, fontFamily });
				webviewPanel.webview.postMessage({
					type: 'fontChanged',
					fontSize: fontSize,
					fontFamily: fontFamily,
				});
			}
			
			// Update theme colors when theme changes
			if (e.affectsConfiguration('workbench.colorTheme') || 
				e.affectsConfiguration('workbench.colorCustomizations')) {
				const sidebarForegroundColor = this.getSideBarForegroundColor();
				webviewPanel.webview.postMessage({
					type: 'themeColorChanged',
					sidebarForeground: sidebarForegroundColor,
				});
			}
		});
		
		// Listen for theme changes
		const onDidChangeActiveColorTheme = vscode.window.onDidChangeActiveColorTheme(() => {
			const sidebarForegroundColor = this.getSideBarForegroundColor();
			webviewPanel.webview.postMessage({
				type: 'themeColorChanged',
				sidebarForeground: sidebarForegroundColor,
			});
		});

		// Make sure we get rid of the listener when our editor is closed.
		webviewPanel.onDidDispose(() => {
			console.log('Disposed1');
			if (extensionState.activeWebviewPanel === webviewPanel) {
				vscode.commands
					.executeCommand('setContext', 'typedown.editorIsActive', false)
					.then(() => {
						console.log('typedown.editorIsActive', false);
					});
			}
			console.log('Disposed2');
			changeDocumentSubscription.dispose();
			saveDocumentSubscription.dispose();
			onDidChangeTextEditorVisibleRanges.dispose();
			onDidChangeConfiguration.dispose();
			onDidChangeActiveColorTheme.dispose();
		});

		// Receive message from the webview.
		webviewPanel.webview.onDidReceiveMessage((e) => {
			console.log('onDidReceiveMessage: ', [JSON.stringify(e)]);
			switch (e.type) {
				case 'webviewChanged':
					isUpdatingFromWebview.value = true;
					lastWebviewContent = e.text;
					this.updateTextDocument(document, e.text, isUpdatingFromWebview);
					return;
				case 'initialized':
					updateWebview();
					return;
				case 'plainPaste':
					vscode.commands.executeCommand('editor.action.clipboardPasteAction');
			}
		});
	}

	// Get the static html used for the editor webviews.
	private getHtmlForWebview(webview: vscode.Webview, sidebarForegroundColor: string = ''): string {
		// Local path to script and css for the webview
		const initScriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'src', 'markdownEditorInitScript.js')
		);
		const ckeditorUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				...'ckeditor5-build-markdown/build/ckeditor.js'.split('/')
			)
		);

		// Read font configuration - extension config takes precedence over VS Code editor config
		const typedownConfig = vscode.workspace.getConfiguration('typedown.editor');
		const editorConfig = vscode.workspace.getConfiguration('editor');
		
		const fontSize = typedownConfig.get<number>('fontSize') ?? editorConfig.get<number>('fontSize', 14);
		const fontFamily = typedownConfig.get<string>('fontFamily') ?? editorConfig.get<string>('fontFamily', '');

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();
		const cspSource = webview.cspSource;

		const html = String.raw;
		return html/* html */ `<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />

					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>Markdown WYSIWYG Editor</title>
					
					<style>
						:root {
							/* Use VS Code theme CSS variables directly - these are automatically available in webviews */
							/* Standard VS Code CSS variables that are reliably available in webviews */
							--typedown-theme-foreground: var(--vscode-foreground);
							--typedown-theme-active-border: var(--vscode-editor-foreground, var(--vscode-foreground));
							--typedown-theme-separator: var(--vscode-editorGroup-border, var(--vscode-foreground));
							--typedown-theme-hr-border: var(--vscode-editor-foreground, var(--vscode-foreground));
							--typedown-theme-table-border: var(--vscode-editorWidget-border, var(--vscode-editorGroup-border, var(--vscode-foreground)));
							--typedown-theme-button-bg: var(--vscode-button-background);
							--typedown-theme-button-hover-bg: var(--vscode-button-hoverBackground);
							--typedown-theme-dropdown-bg: var(--vscode-dropdown-background);
							--typedown-theme-dropdown-fg: var(--vscode-dropdown-foreground);
							--typedown-theme-dropdown-border: var(--vscode-dropdown-border);
						}
						
						/* Center and constrain editor width */
						body {
							display: flex;
							flex-direction: column;
							align-items: center;
						}
						
						#editor {
							width: 100%;
							max-width: 91ch;
							margin: 0 auto;
							padding: 0;
							box-sizing: border-box;
						}
						
						/* Constrain CKEditor root container */
						.ck.ck-editor {
							max-width: 91ch !important;
							width: 100% !important;
							margin: 0 auto !important;
							box-sizing: border-box;
						}
						
						/* Constrain toolbar and all its wrappers */
						.ck.ck-editor__top,
						.ck.ck-editor__toolbar-container,
						.ck.ck-toolbar,
						.ck.ck-toolbar__items {
							max-width: 91ch !important;
							width: 100% !important;
							box-sizing: border-box;
						}
						
						/* Constrain main content area */
						.ck.ck-editor__main,
						.ck.ck-editor__editable-container {
							max-width: 91ch !important;
							width: 100% !important;
							box-sizing: border-box;
						}
						
						/* Center toolbar content */
						.ck.ck-toolbar {
							display: flex;
							justify-content: center;
						}
						
						/* Ensure toolbar groups don't overflow */
						.ck.ck-toolbar .ck-toolbar__items {
							max-width: 100% !important;
							overflow: visible !important;
						}
						
						/* Ensure dropdowns are visible and properly positioned */
						.ck.ck-dropdown__panel {
							z-index: 10000 !important;
							position: absolute !important;
							overflow: visible !important;
							max-height: 400px !important;
							overflow-y: auto !important;
							overflow-x: hidden !important;
							border-color: var(--typedown-theme-active-border) !important;
							outline-color: var(--typedown-theme-active-border) !important;
						}
						
						/* Style dropdown panel border/outline */
						.ck.ck-dropdown__panel.ck-dropdown__panel {
							border: 1px solid var(--typedown-theme-active-border) !important;
							box-shadow: 0 2px 8px var(--typedown-theme-active-border)33 !important;
						}
						
						/* Make dropdown list scrollable */
						.ck.ck-dropdown__panel .ck-list {
							max-height: 400px !important;
							overflow-y: auto !important;
							overflow-x: hidden !important;
						}
						
						/* Style dropdown button when open */
						.ck.ck-dropdown.ck-on .ck-button {
							border-color: var(--typedown-theme-active-border) !important;
						}
						
						/* Style dropdown button hover/focus */
						.ck.ck-dropdown .ck-button:hover,
						.ck.ck-dropdown .ck-button:focus {
							border-color: var(--typedown-theme-active-border) !important;
							outline-color: var(--typedown-theme-active-border) !important;
						}
						
						/* Style toolbar separators */
						.ck.ck-toolbar .ck-toolbar__separator {
							background-color: var(--typedown-theme-separator) !important;
							opacity: 0.5 !important;
						}
						
						/* Style horizontal rules (HR) in content */
						.ck.ck-content hr {
							border-color: var(--typedown-theme-hr-border) !important;
							background-color: var(--typedown-theme-hr-border) !important;
							opacity: 0.6 !important;
						}
						
						.ck.ck-content hr::before {
							border-color: var(--typedown-theme-hr-border) !important;
						}
						
						.ck.ck-content hr::after {
							border-color: var(--typedown-theme-hr-border) !important;
						}
						
						.ck.ck-content table,
						.ck-editor__editable table {
							border-color: var(--typedown-theme-table-border) !important;
						
						}
						
						/* Add padding to table cells to prevent content from touching edges */
						.ck.ck-content table td,
						.ck.ck-content table th,
						.ck-editor__editable table td,
						.ck-editor__editable table th {
							padding: 8px 12px !important;
							border-color: var(--typedown-theme-table-border) !important;
						}
						
						.ck.ck-content table td,
						.ck.ck-content table th,
						.ck-editor__editable table td,
						.ck-editor__editable table th {
							border-color: var(--typedown-theme-table-border) !important;
						}
						
						.ck.ck-content table thead th,
						.ck.ck-content table tbody th,
						.ck-editor__editable table thead th,
						.ck-editor__editable table tbody th {
							border-color: var(--typedown-theme-table-border) !important;
						}
						
						.ck.ck-content table tbody td,
						.ck-editor__editable table tbody td {
							border-color: var(--typedown-theme-table-border) !important;
						}
						
						/* Ensure table containers allow horizontal overflow */
						.ck.ck-content,
						.ck-editor__editable {
							overflow-x: visible !important;
						}
						
						/* Allow parent containers to overflow so tables can break out */
						.ck.ck-editor__editable-container {
							overflow-x: visible !important;
						}
						
						.ck.ck-editor__main {
							overflow-x: visible !important;
						}
						
						/* Ensure body and editor container allow overflow */
						body {
							overflow-x: visible !important;
						}
						
						#editor {
							overflow-x: visible !important;
						}
						
						.ck.ck-toolbar .ck-dropdown {
							overflow: visible !important;
						}
						
						.ck.ck-editor__top {
							overflow: visible !important;
						}
						
						.ck.ck-editor__toolbar-container {
							overflow: visible !important;
						}
						
						/* Make toolbar icons smaller */
						.ck-toolbar .ck-button .ck-icon {
							width: 14px !important;
							height: 14px !important;
						}
						
						.ck-toolbar .ck-dropdown .ck-button .ck-icon {
							width: 14px !important;
							height: 14px !important;
						}
						
						.ck-toolbar .ck-button .ck-icon svg {
							width: 14px !important;
							height: 14px !important;
						}
						
						/* Apply font family and size to content area only */
						.ck.ck-content {
							font-family: ${fontFamily ? `"${fontFamily}", ` : ''}monospace !important;
							font-size: ${fontSize}px !important;
							-webkit-font-smoothing: subpixel-antialiased;
							-moz-osx-font-smoothing: auto;
							text-rendering: geometricPrecision;
							width: 100% !important;
							max-width: 91ch !important;
							box-sizing: border-box;
						}
						
						.ck-editor__editable {
							font-family: ${fontFamily ? `"${fontFamily}", ` : ''}monospace !important;
							font-size: ${fontSize}px !important;
							-webkit-font-smoothing: subpixel-antialiased;
							-moz-osx-font-smoothing: auto;
							text-rendering: geometricPrecision;
							width: 100% !important;
							max-width: 91ch !important;
							box-sizing: border-box;
						}
						
						/* Match toolbar and content padding for alignment */
						.ck.ck-toolbar {
							padding-left: var(--ck-spacing-large, 0.5em) !important;
							padding-right: var(--ck-spacing-large, 0.5em) !important;
						}
						
						.ck.ck-content {
							padding-left: var(--ck-spacing-large, 0.5em) !important;
							padding-right: var(--ck-spacing-large, 0.5em) !important;
						}
					</style>
					<style id="font-size-style"></style>
				</head>
				<body>
					<div id="editor"></div>

					<script nonce="${nonce}" src="${ckeditorUri}"></script>
					<script nonce="${nonce}">
						// Try to read VS Code theme CSS variables if available
						// VS Code webviews may have access to some CSS variables
						(function() {
							const root = document.documentElement;
							const computedStyle = getComputedStyle(root);
							
							// Try to read VS Code CSS variables - use standard ones that are more likely to be available
							const vscodeVars = {
								'--vscode-foreground': computedStyle.getPropertyValue('--vscode-foreground'),
								'--vscode-editor-foreground': computedStyle.getPropertyValue('--vscode-editor-foreground'),
								'--vscode-editorGroup-border': computedStyle.getPropertyValue('--vscode-editorGroup-border'),
								'--vscode-editorWidget-border': computedStyle.getPropertyValue('--vscode-editorWidget-border'),
								'--vscode-button-background': computedStyle.getPropertyValue('--vscode-button-background'),
								'--vscode-button-hoverBackground': computedStyle.getPropertyValue('--vscode-button-hoverBackground'),
								'--vscode-dropdown-background': computedStyle.getPropertyValue('--vscode-dropdown-background'),
								'--vscode-dropdown-foreground': computedStyle.getPropertyValue('--vscode-dropdown-foreground'),
								'--vscode-dropdown-border': computedStyle.getPropertyValue('--vscode-dropdown-border'),
							};
							
							// Update our CSS variables with VS Code theme variables if available
							// Use fallbacks if variables aren't available
							const foreground = vscodeVars['--vscode-foreground'] || root.style.getPropertyValue('--typedown-theme-foreground');
							if (foreground) root.style.setProperty('--typedown-theme-foreground', foreground);
							
							const editorForeground = vscodeVars['--vscode-editor-foreground'] || vscodeVars['--vscode-foreground'] || root.style.getPropertyValue('--typedown-theme-active-border');
							if (editorForeground) root.style.setProperty('--typedown-theme-active-border', editorForeground);
							
							const separator = vscodeVars['--vscode-editorGroup-border'] || vscodeVars['--vscode-foreground'] || root.style.getPropertyValue('--typedown-theme-separator');
							if (separator) root.style.setProperty('--typedown-theme-separator', separator);
							
							const hrBorder = vscodeVars['--vscode-editor-foreground'] || vscodeVars['--vscode-foreground'] || root.style.getPropertyValue('--typedown-theme-hr-border');
							if (hrBorder) root.style.setProperty('--typedown-theme-hr-border', hrBorder);
							
							const tableBorder = vscodeVars['--vscode-editorWidget-border'] || vscodeVars['--vscode-editorGroup-border'] || vscodeVars['--vscode-foreground'] || root.style.getPropertyValue('--typedown-theme-table-border');
							if (tableBorder) root.style.setProperty('--typedown-theme-table-border', tableBorder);
							
							if (vscodeVars['--vscode-button-background']) {
								root.style.setProperty('--typedown-theme-button-bg', vscodeVars['--vscode-button-background']);
							}
							if (vscodeVars['--vscode-button-hoverBackground']) {
								root.style.setProperty('--typedown-theme-button-hover-bg', vscodeVars['--vscode-button-hoverBackground']);
							}
							if (vscodeVars['--vscode-dropdown-background']) {
								root.style.setProperty('--typedown-theme-dropdown-bg', vscodeVars['--vscode-dropdown-background']);
							}
							if (vscodeVars['--vscode-dropdown-foreground']) {
								root.style.setProperty('--typedown-theme-dropdown-fg', vscodeVars['--vscode-dropdown-foreground']);
							}
							if (vscodeVars['--vscode-dropdown-border']) {
								root.style.setProperty('--typedown-theme-dropdown-border', vscodeVars['--vscode-dropdown-border']);
							}
						})();
						
						MarkdownEditor.create(document.querySelector('#editor'))
							.then((editor) => {
								window.editor = editor;
								editor.timeLastModified = new Date();
								console.log('CKEditor instance:', editor);
							})
							.catch((error) => {
								console.error('CKEditor Initialization Error:', error);
							});
					</script>
					<script nonce="${nonce}" src="${initScriptUri}"></script>
				</body>
			</html> `;
	}

	// Save new content to the text document
	private updateTextDocument(document: vscode.TextDocument, text: any, isFromWebview?: { value: boolean }) {
		console.log('VS Code started updateTextDocument', [JSON.stringify(text).substring(0, 100) + '...']);

		if (!document) {
			console.error('Document is null or undefined');
			return;
		}

		let rawText = text;
		console.log('Before prettier, text length:', text?.length || 0);

		// Temporarily disable prettier formatting as it's returning empty strings
		// TODO: Fix prettier configuration or find alternative formatting
		/*
		try {
			// Autoformat the markdown text using Prettier
			const formatted = prettier.format(text, {
				parser: 'markdown',
				proseWrap: 'preserve',
			});
			console.log('Prettier formatted, length:', formatted?.length || 0);
			if (formatted && formatted.trim().length > 0) {
				text = formatted;
			} else {
				console.warn('Prettier returned empty string, using original text');
			}
		} catch (error) {
			console.error('Prettier formatting error:', error);
			// Continue with unformatted text if prettier fails
		}
		*/

		if (!text) {
			console.error('Text is empty or undefined after processing');
			if (isFromWebview) {
				isFromWebview.value = false;
			}
			return;
		}

		// Standardize text EOL character to match document
		// https://code.visualstudio.com/api/references/vscode-api#EndOfLine
		const eol_chars = document?.eol === 2 ? '\r\n' : '\n';
		text = text.replace(/(?:\r\n|\r|\n)/g, eol_chars);
		console.log('After EOL normalization, text length:', text.length);

		const fileText = document?.getText();
		console.log('File text length:', fileText?.length || 0);

		console.log('Comparing texts - new length:', text.length, 'old length:', fileText?.length || 0);
		console.log('Texts are different:', text !== fileText);

		if (text !== fileText) {
			// Apply edits to the document
			const edit = new vscode.WorkspaceEdit();
			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(document.getText().length)
			);
			edit.replace(document.uri, fullRange, text);
			
			vscode.workspace.applyEdit(edit).then((success) => {
				if (success) {
					console.log('Document updated successfully');
				} else {
					console.error('Failed to apply edit to document');
				}
				// After applying edit, reset the flag after a short delay to allow save event to process
				if (isFromWebview) {
					setTimeout(() => {
						isFromWebview.value = false;
					}, 100);
				}
			}, (error) => {
				console.error('Error applying edit:', error);
				if (isFromWebview) {
					isFromWebview.value = false;
				}
			});
		} else {
			console.log('Texts are identical, skipping update');
			// Content is the same, reset flag immediately
			if (isFromWebview) {
				isFromWebview.value = false;
			}
		}
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
