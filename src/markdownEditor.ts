import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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

	private getPrismCustomThemeCss(): string {
		const config = vscode.workspace.getConfiguration('typedown.editor');
		const configuredPath = (config.get<string>('prismThemePath') || '').trim();
		if (!configuredPath) {
			return '';
		}

		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
		const resolvedPath = path.isAbsolute(configuredPath)
			? configuredPath
			: workspaceRoot
				? path.join(workspaceRoot, configuredPath)
				: configuredPath;

		try {
			return fs.readFileSync(resolvedPath, 'utf8');
		} catch (error) {
			console.warn('[Typedown] Failed to read Prism theme CSS:', error);
			return '';
		}
	}


	// Called when our custom editor is opened.
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Setup initial webview HTML and settings
		const documentFolderUri = vscode.Uri.file(path.dirname(document.uri.fsPath));
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri, documentFolderUri],
		};
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

		// Send initial content immediately - webview will store it and use when editor is ready
		const initialText = document.getText();
		const normalizedInitialText = initialText.replace(/(?:\r\n|\r|\n)/g, '\n');
		webviewPanel.webview.postMessage({ 
			type: 'documentChanged', 
			text: normalizedInitialText 
		});

		const baseFolderUri = vscode.Uri.file(path.dirname(document.uri.fsPath) + path.sep);
		const baseWebviewUri = webviewPanel.webview.asWebviewUri(baseFolderUri).toString();
		webviewPanel.webview.postMessage({
			type: 'baseUriChanged',
			baseUri: baseWebviewUri,
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

			// Change EOL to \n for consistency
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
				e.affectsConfiguration('typedown.editor.codeBlockfontFamily') ||
				e.affectsConfiguration('editor.fontFamily') ||
				e.affectsConfiguration('editor.fontSize')) {
				const typedownConfig = vscode.workspace.getConfiguration('typedown.editor');
				const editorConfig = vscode.workspace.getConfiguration('editor');
				
				const fontSize = typedownConfig.get<number>('fontSize') ?? editorConfig.get<number>('fontSize', 14);
				// Get fontFamily for regular text - typedown config takes precedence, otherwise use editor config
				let fontFamily = typedownConfig.get<string>('fontFamily') ?? editorConfig.get<string>('fontFamily', '');
				if (!fontFamily || fontFamily.trim() === '') {
					fontFamily = 'monospace';
				}
				// Code blocks use typedown.editor.codeBlockfontFamily if set, otherwise fall back to editor.fontFamily
				let codeBlockFontFamily = typedownConfig.get<string>('codeBlockfontFamily') ?? editorConfig.get<string>('fontFamily', '');
				if (!codeBlockFontFamily || codeBlockFontFamily.trim() === '') {
					codeBlockFontFamily = 'monospace';
				}
				
				console.log('Font configuration changed:', { fontSize, fontFamily, codeBlockFontFamily });
				webviewPanel.webview.postMessage({
					type: 'fontChanged',
					fontSize: fontSize,
					fontFamily: fontFamily,
					codeBlockFontFamily: codeBlockFontFamily,
				});
			}

			if (e.affectsConfiguration('typedown.editor.prismThemePath')) {
				const customPrismCss = this.getPrismCustomThemeCss();
				webviewPanel.webview.postMessage({
					type: 'prismThemeChanged',
					css: customPrismCss,
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
		webviewPanel.webview.onDidReceiveMessage(async (e) => {
			console.log('onDidReceiveMessage: ', [JSON.stringify(e)]);
			switch (e.type) {
				case 'webviewChanged':
					isUpdatingFromWebview.value = true;
					lastWebviewContent = e.text;
					this.updateTextDocument(document, e.text, isUpdatingFromWebview);
					return;
				case 'initialized':
					webviewPanel.webview.postMessage({
						type: 'baseUriChanged',
						baseUri: baseWebviewUri,
					});
					return;
				case 'plainPaste':
					vscode.commands.executeCommand('editor.action.clipboardPasteAction');
					return;
				case 'requestImageInsert': {
					const altText = await vscode.window.showInputBox({
						prompt: 'Image alt text',
						value: 'Image',
					});
					if (altText === undefined) {
						return;
					}
					const docDir = path.dirname(document.uri.fsPath);
					const selection = await vscode.window.showOpenDialog({
						canSelectFiles: true,
						canSelectFolders: false,
						canSelectMany: false,
						filters: {
							Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
						},
					});

					if (!selection || selection.length === 0) {
						return;
					}

					const sourcePath = selection[0].fsPath;
					const baseName = path.basename(sourcePath);
					let targetPath = path.join(docDir, baseName);

					if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
						if (fs.existsSync(targetPath)) {
							const ext = path.extname(baseName);
							const name = path.basename(baseName, ext);
							let counter = 1;
							while (fs.existsSync(targetPath)) {
								targetPath = path.join(docDir, `${name}-${counter}${ext}`);
								counter += 1;
							}
						}
						fs.copyFileSync(sourcePath, targetPath);
					}

					const relativePath = path.relative(docDir, targetPath).replace(/\\/g, '/');
					webviewPanel.webview.postMessage({
						type: 'insertImageMarkdown',
						text: `![${altText || 'Image'}](${relativePath})`,
					});
					return;
				}
			}
		});
	}

	// Get the static html used for the editor webviews.
	private getHtmlForWebview(webview: vscode.Webview, sidebarForegroundColor: string = ''): string {
		// Local path to script and css for the webview
		const initScriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'src', 'markdownEditorInitScript.js')
		);
		const tiptapEditorJsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'tiptap-bundle.js')
		);

		// Read font configuration - extension config takes precedence over VS Code editor config
		const typedownConfig = vscode.workspace.getConfiguration('typedown.editor');
		const editorConfig = vscode.workspace.getConfiguration('editor');
		
		const fontSize = typedownConfig.get<number>('fontSize') ?? editorConfig.get<number>('fontSize', 14);
		// Get fontFamily for regular text - typedown config takes precedence, otherwise use editor config
		let fontFamily = typedownConfig.get<string>('fontFamily') ?? editorConfig.get<string>('fontFamily', '');
		if (!fontFamily || fontFamily.trim() === '') {
			fontFamily = 'monospace';
		}
		// Code blocks use typedown.editor.codeBlockfontFamily if set, otherwise fall back to editor.fontFamily
		let codeBlockFontFamily = typedownConfig.get<string>('codeBlockfontFamily') ?? editorConfig.get<string>('fontFamily', '');
		if (!codeBlockFontFamily || codeBlockFontFamily.trim() === '') {
			codeBlockFontFamily = 'monospace';
		}
		const editorWidth = typedownConfig.get<string>('width', '91ch');
		const customPrismCss = this.getPrismCustomThemeCss();
		const sanitizedCustomPrismCss = customPrismCss.replace(/<\/style>/gi, '<\\/style>');

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();
		const cspSource = webview.cspSource;

		const html = String.raw;
		return html/* html */ `<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}' ${cspSource}; style-src 'unsafe-inline' ${cspSource}; img-src ${cspSource} data: file: vscode-file: vscode-resource:;" />

					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>Markdown WYSIWYG Editor</title>
					<style id="prism-user-theme">${sanitizedCustomPrismCss}</style>
					<style id="prism-vscode-theme">
						/* VS Code theme-driven Prism tokens */
						.token.comment,
						.token.prolog,
						.token.doctype,
						.token.cdata {
							color: var(--vscode-descriptionForeground, var(--vscode-editor-foreground));
						}
						.token.punctuation {
							color: var(--vscode-editor-foreground);
						}
						.token.property,
						.token.tag,
						.token.boolean,
						.token.number,
						.token.constant,
						.token.symbol,
						.token.deleted {
							color: var(--vscode-symbolIcon-numberForeground, var(--vscode-editor-foreground));
						}
						.token.selector,
						.token.attr-name,
						.token.string,
						.token.char,
						.token.builtin,
						.token.inserted {
							color: var(--vscode-symbolIcon-stringForeground, var(--vscode-editor-foreground));
						}
						.token.operator,
						.token.entity,
						.token.url,
						.token.variable {
							color: var(--vscode-symbolIcon-variableForeground, var(--vscode-editor-foreground));
						}
						.token.atrule,
						.token.function,
						.token.class-name {
							color: var(--vscode-symbolIcon-functionForeground, var(--vscode-editor-foreground));
						}
						.token.keyword {
							color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-editor-foreground));
						}
						.token.regex,
						.token.important {
							color: var(--vscode-editorWarning-foreground, var(--vscode-editor-foreground));
						}
					</style>
					
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
							--typedown-theme-input-bg: var(--vscode-input-background);
							--typedown-theme-input-fg: var(--vscode-input-foreground);
							--typedown-theme-input-border: var(--vscode-input-border);
						}
						
						html, body {
							height: 100%;
							overflow-x: hidden;
						}
						
						body {
							display: flex;
							flex-direction: column;
							align-items: center;
							margin: 0;
							padding: 0;
							background-color: var(--vscode-editor-background);
							color: var(--vscode-editor-foreground);
						}
						
						#toolbar {
							position: fixed;
							top: 0;
							left: 0;
							z-index: 1000;
							display: flex;
							flex-wrap: wrap;
							gap: 6px;
							padding: 6px 8px;
							box-sizing: border-box;
							background-color: var(--vscode-editor-background);
							border-bottom: 1px solid var(--typedown-theme-separator);
						}
						
						body.has-fixed-toolbar {
							padding-top: 46px;
						}
						
						#editor {
							width: 100%;
							max-width: ${editorWidth};
							margin: 0;
							padding: 0;
							box-sizing: border-box;
						}
						
						.ProseMirror {
							padding: 12px 0 40px;
							outline: none;
							font-family: ${fontFamily};
							font-size: ${fontSize}px;
							-webkit-font-smoothing: subpixel-antialiased;
							-moz-osx-font-smoothing: auto;
							text-rendering: geometricPrecision;
							color: var(--vscode-editor-foreground);
							min-height: 60vh;
						}
						
						.ProseMirror code {
							font-family: ${codeBlockFontFamily};
						}
						
						.ProseMirror pre {
							background-color: var(--vscode-editor-background);
							border: 1px solid var(--typedown-theme-table-border);
							border-radius: 4px;
							padding: 1em;
							overflow: auto;
							position: relative;
						}
						
						.ProseMirror pre[data-language]::before {
							content: attr(data-language);
							position: absolute;
							top: 6px;
							right: 8px;
							font-size: 11px;
							padding: 2px 6px;
							border-radius: 3px;
							background-color: var(--vscode-editor-background);
							color: var(--vscode-descriptionForeground, var(--vscode-editor-foreground));
							border: 1px solid var(--typedown-theme-table-border);
							text-transform: none;
						}
						
						.ProseMirror pre code {
							background: transparent !important;
						}
						
						.ProseMirror img {
							max-width: 100%;
							height: auto;
							display: block;
							margin: 8px 0;
							border-radius: 4px;
						}
						
						.ProseMirror blockquote {
							border-left: 3px solid var(--typedown-theme-separator);
							padding-left: 12px;
							margin-left: 0;
						}
						
						.ProseMirror hr {
							border-color: var(--typedown-theme-hr-border);
							opacity: 0.6;
						}
						
						.ProseMirror table {
							border-collapse: collapse;
						}
						
						.ProseMirror table td,
						.ProseMirror table th {
							border: 1px solid var(--typedown-theme-table-border);
							padding: 6px 10px;
						}
						
						.ProseMirror ul[data-type="taskList"] {
							list-style: none;
							padding-left: 0;
						}
						
						.ProseMirror li[data-type="taskItem"] {
							display: flex;
							align-items: center;
							flex-direction: row;
							gap: 8px;
						}
						
						.ProseMirror li[data-type="taskItem"] > label {
							display: inline-flex;
							align-items: center;
							margin: 0;
							flex: 0 0 auto;
						}

						.ProseMirror li[data-checked] {
							display: flex !important;
							align-items: center !important;
							flex-direction: row !important;
							gap: 8px !important;
						}
						
						.ProseMirror li[data-checked] > label {
							display: inline-flex !important;
							align-items: center !important;
							margin: 0 !important;
							flex: 0 0 auto !important;
						}
						
						.ProseMirror li[data-checked] > div {
							flex: 1 !important;
							margin: 0 !important;
							display: inline-block !important;
						}
						
						.ProseMirror li[data-checked] > div > p {
							display: inline !important;
							margin: 0 !important;
						}
						
						.ProseMirror li[data-checked] > label input {
							margin: 0 6px 0 0 !important;
							vertical-align: middle !important;
						}
						
						.ProseMirror li[data-type="taskItem"] > div {
							flex: 1;
							margin: 0;
							display: inline-block;
						}
						
						.ProseMirror li[data-type="taskItem"] > label input {
							margin: 0 6px 0 0;
							vertical-align: middle;
						}
						
						.typedown-toolbar button,
						.typedown-toolbar select {
							background-color: transparent;
							border: 1px solid transparent;
							color: var(--vscode-button-foreground, var(--vscode-foreground));
							border-radius: 3px;
							padding: 4px 6px;
							transition: background-color 0.2s, border-color 0.2s, color 0.2s;
							font-size: 12px;
						}
						
						.typedown-toolbar button svg {
							width: 16px;
							height: 16px;
							display: block;
						}
						
						.typedown-toolbar button[data-tooltip] {
							position: relative;
						}
						
						.typedown-toolbar button[data-tooltip]::after {
							content: attr(data-tooltip);
							position: absolute;
							bottom: -28px;
							left: 50%;
							transform: translateX(-50%);
							background-color: var(--typedown-theme-dropdown-bg, var(--vscode-dropdown-background));
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground));
							border: 1px solid var(--typedown-theme-dropdown-border, var(--vscode-dropdown-border));
							border-radius: 4px;
							padding: 2px 6px;
							font-size: 11px;
							white-space: nowrap;
							opacity: 0;
							pointer-events: none;
							transition: opacity 0.15s ease-in-out;
							z-index: 1002;
						}
						
						.typedown-toolbar button[data-tooltip]:hover::after,
						.typedown-toolbar button[data-tooltip]:focus::after {
							opacity: 1;
						}
						
						.typedown-dialog-overlay {
							position: fixed;
							inset: 0;
							background-color: rgba(0, 0, 0, 0.35);
							display: flex;
							align-items: center;
							justify-content: center;
							opacity: 0;
							pointer-events: none;
							transition: opacity 0.2s ease-in-out;
							z-index: 1100;
						}
						
						.typedown-dialog-overlay.is-visible {
							opacity: 1;
							pointer-events: auto;
						}
						
						.typedown-dialog {
							min-width: 320px;
							max-width: 420px;
							background-color: var(--vscode-editor-background);
							border: 1px solid var(--typedown-theme-table-border);
							border-radius: 6px;
							padding: 16px;
							box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
							color: var(--vscode-editor-foreground);
						}
						
						.typedown-dialog-title {
							font-size: 14px;
							font-weight: 600;
							margin-bottom: 12px;
						}
						
						.typedown-dialog-field {
							display: flex;
							flex-direction: column;
							gap: 6px;
							margin-bottom: 12px;
							font-size: 12px;
							color: var(--vscode-descriptionForeground, var(--vscode-editor-foreground));
						}
						
						.typedown-dialog-field input {
							background-color: var(--typedown-theme-input-bg, var(--vscode-input-background));
							color: var(--typedown-theme-input-fg, var(--vscode-input-foreground));
							border: 1px solid var(--typedown-theme-input-border, var(--vscode-input-border));
							border-radius: 4px;
							padding: 6px 8px;
						}
						
						.typedown-dialog-actions {
							display: flex;
							justify-content: flex-end;
							gap: 8px;
						}
						
						.typedown-dialog-actions button {
							padding: 4px 10px;
							border-radius: 4px;
							border: 1px solid var(--typedown-theme-input-border, var(--vscode-input-border));
							background-color: var(--vscode-button-background);
							color: var(--vscode-button-foreground);
							cursor: pointer;
						}
						
						.typedown-dialog-actions button[data-dialog-cancel] {
							background-color: transparent;
							color: var(--vscode-editor-foreground);
						}
						
						.typedown-toolbar button:hover,
						.typedown-toolbar select:hover {
							background-color: var(--vscode-list-hoverBackground);
							border-color: var(--vscode-list-hoverBackground);
						}
						
						.typedown-toolbar button.active {
							background-color: var(--vscode-button-background);
							border-color: var(--vscode-button-background);
							color: var(--vscode-button-foreground);
						}
						
						.typedown-toolbar select {
							background-color: var(--typedown-theme-dropdown-bg, var(--vscode-dropdown-background));
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground));
							border-color: var(--typedown-theme-dropdown-border, var(--vscode-dropdown-border));
						}
						
						/* Prism background overrides */
						:not(pre) > code[class*="language-"],
						pre[class*="language-"],
						.ProseMirror pre[class*="language-"],
						.ProseMirror code[class*="language-"] {
							background: transparent !important;
							background-color: transparent !important;
						}
					</style>
					<style id="font-size-style"></style>
					<style id="prism-theme-override">
						/* Final override for PrismJS - ensure transparent backgrounds and remove inner borders */
						.ProseMirror pre[class*="language-"],
						.ProseMirror code[class*="language-"] {
							background: transparent !important;
							background-color: transparent !important;
							text-shadow: none !important;
							border: none !important;
							padding: 0 !important;
							margin: 0 !important;
						}
						
						/* Remove PrismJS default padding from pre elements inside code blocks */
						.ProseMirror pre[class*="language-"] {
							padding: 0 !important;
							margin: 0 !important;
						}
						
						/* Ensure unhighlighted code is visible and matches highlighted blocks */
						.ProseMirror pre:not([class*="language-"]) code,
						.ProseMirror pre code:not([class*="language-"]),
						.ProseMirror code:not([class*="language-"]) {
							color: var(--vscode-editor-foreground) !important;
							background: transparent !important;
							border: none !important;
						}
					</style>
					<style id="prism-vscode-theme"></style>
				</head>
				<body>
					<div id="toolbar" class="typedown-toolbar"></div>
					<div id="editor"></div>

					<script nonce="${nonce}">
						// Track bundle loading state
						window.__bundleLoaded = false;
						window.__bundleLoadError = false;
						window.__bundleError = null;
						
						// Add error handler for uncaught errors in the bundle
						window.addEventListener('error', function(event) {
							if (event.filename && event.filename.includes('tiptap-bundle')) {
								console.error('Error in tiptap-bundle.js:', event.message, event.filename, event.lineno, event.colno);
								window.__bundleError = {
									message: event.message,
									filename: event.filename,
									lineno: event.lineno,
									colno: event.colno
								};
								window.__bundleLoadError = true;
							}
						}, true);
						
						// Also catch unhandled promise rejections
						window.addEventListener('unhandledrejection', function(event) {
							console.error('Unhandled promise rejection (possibly from bundle):', event.reason);
						});
						
						// Set up bundle load tracking BEFORE script is added
						function setupBundleTracking() {
							const bundleScript = document.querySelector('script[src*="tiptap-bundle"]');
							if (bundleScript) {
								// Check if script is already loaded (complete property)
								if (bundleScript.complete || bundleScript.readyState === 'complete' || bundleScript.readyState === 'loaded') {
									console.log('tiptap-bundle.js already loaded');
									window.__bundleLoaded = true;
									// Trigger init immediately if bundle is ready
									if (window.tiptap && window.tiptap.Editor) {
										setTimeout(function() {
											if (window.initEditor) window.initEditor();
										}, 0);
									}
								} else {
									bundleScript.addEventListener('load', function() {
										console.log('tiptap-bundle.js loaded successfully');
										window.__bundleLoaded = true;
										// Trigger init immediately when bundle loads
										if (window.tiptap && window.tiptap.Editor) {
											setTimeout(function() {
												if (window.initEditor) window.initEditor();
											}, 0);
										}
									});
									bundleScript.addEventListener('error', function() {
										console.error('Failed to load tiptap-bundle.js:', bundleScript.src);
										window.__bundleLoadError = true;
									});
								}
							}
						}
					</script>
					<script nonce="${nonce}" src="${tiptapEditorJsUri}"></script>
					<script nonce="${nonce}">
						// Setup bundle tracking after script tag is added
						setupBundleTracking();
						// Also check immediately if bundle is already available
						if (window.tiptap && window.tiptap.Editor) {
							setTimeout(function() {
								if (window.initEditor) window.initEditor();
							}, 0);
						}
					</script>
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
								'--vscode-editor-background': computedStyle.getPropertyValue('--vscode-editor-background'),
								'--vscode-editorGroup-border': computedStyle.getPropertyValue('--vscode-editorGroup-border'),
								'--vscode-editorWidget-border': computedStyle.getPropertyValue('--vscode-editorWidget-border'),
								'--vscode-button-background': computedStyle.getPropertyValue('--vscode-button-background'),
								'--vscode-button-hoverBackground': computedStyle.getPropertyValue('--vscode-button-hoverBackground'),
								'--vscode-dropdown-background': computedStyle.getPropertyValue('--vscode-dropdown-background'),
								'--vscode-dropdown-foreground': computedStyle.getPropertyValue('--vscode-dropdown-foreground'),
								'--vscode-dropdown-border': computedStyle.getPropertyValue('--vscode-dropdown-border'),
								'--vscode-input-background': computedStyle.getPropertyValue('--vscode-input-background'),
								'--vscode-input-foreground': computedStyle.getPropertyValue('--vscode-input-foreground'),
								'--vscode-input-border': computedStyle.getPropertyValue('--vscode-input-border'),
								'--vscode-list-hoverBackground': computedStyle.getPropertyValue('--vscode-list-hoverBackground'),
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
							if (vscodeVars['--vscode-input-background']) {
								root.style.setProperty('--typedown-theme-input-bg', vscodeVars['--vscode-input-background']);
							}
							if (vscodeVars['--vscode-input-foreground']) {
								root.style.setProperty('--typedown-theme-input-fg', vscodeVars['--vscode-input-foreground']);
							}
							if (vscodeVars['--vscode-input-border']) {
								root.style.setProperty('--typedown-theme-input-border', vscodeVars['--vscode-input-border']);
							}
							
							// Detect theme (dark/light) by checking background color brightness
							function detectAndSetTheme() {
								const bgColor = vscodeVars['--vscode-editor-background'] || computedStyle.getPropertyValue('--vscode-editor-background');
								if (bgColor) {
									// Convert hex/rgb to brightness
									let r, g, b;
									const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
									const hexMatch = bgColor.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
									
									if (rgbMatch) {
										r = parseInt(rgbMatch[1], 10);
										g = parseInt(rgbMatch[2], 10);
										b = parseInt(rgbMatch[3], 10);
									} else if (hexMatch) {
										r = parseInt(hexMatch[1], 16);
										g = parseInt(hexMatch[2], 16);
										b = parseInt(hexMatch[3], 16);
									}
									
									if (r !== undefined && g !== undefined && b !== undefined) {
										const brightness = (r * 299 + g * 587 + b * 114) / 1000;
										const isDark = brightness < 128;
										const theme = isDark ? 'dark' : 'light';
										
										// Set theme attribute on body and editor container
										document.body.setAttribute('data-theme', theme);
										const editorContainer = document.querySelector('.ProseMirror');
										if (editorContainer) {
											editorContainer.setAttribute('data-theme', theme);
										}
									}
								}
							}
							
							// Detect theme immediately
							detectAndSetTheme();
						})();
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
