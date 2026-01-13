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
		const tuiEditorCssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'tui-editor.css')
		);
		const tuiEditorJsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'tui-editor-bundle.js')
		);

		// Read font configuration - extension config takes precedence over VS Code editor config
		const typedownConfig = vscode.workspace.getConfiguration('typedown.editor');
		const editorConfig = vscode.workspace.getConfiguration('editor');
		
		const fontSize = typedownConfig.get<number>('fontSize') ?? editorConfig.get<number>('fontSize', 14);
		const fontFamily = typedownConfig.get<string>('fontFamily') ?? editorConfig.get<string>('fontFamily', '');
		const editorWidth = typedownConfig.get<string>('width', '91ch');

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();
		const cspSource = webview.cspSource;

		const html = String.raw;
		return html/* html */ `<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}' ${cspSource}; style-src 'unsafe-inline' ${cspSource};" />

					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>Markdown WYSIWYG Editor</title>
					<link rel="stylesheet" href="${tuiEditorCssUri}" />
					
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
						
						/* Center and constrain editor width */
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
						}
						
						#editor {
							width: 100%;
							max-width: ${editorWidth};
							margin: 0 auto;
							padding: 0;
							box-sizing: border-box;
						}
						
						/* Fixed toolbar wrapper - will be created by JavaScript */
						.typedown-toolbar-wrapper {
							position: fixed !important;
							top: 0 !important;
							left: 50% !important;
							transform: translateX(-50%) !important;
							z-index: 1000 !important;
							display: flex !important;
							justify-content: center !important;
							background-color: var(--vscode-editor-background) !important;
							pointer-events: none !important;
							max-width: ${editorWidth} !important;
							box-sizing: border-box !important;
						}
						
						.typedown-toolbar-wrapper .toastui-editor-defaultUI-toolbar {
							pointer-events: all !important;
						}
						
						/* Add padding to body to account for fixed toolbar */
						body.has-fixed-toolbar {
							padding-top: 45px !important;
						}
						
						/* TUI Editor container styles */
						.toastui-editor-defaultUI {
							max-width: ${editorWidth} !important;
							width: 100% !important;
							margin: 0 auto !important;
							box-sizing: border-box;
							border: none !important;
							position: relative !important;
							display: flex !important;
							flex-direction: column !important;
						}
						
						.toastui-editor-defaultUI-toolbar {
							max-width: ${editorWidth} !important;
							width: 100% !important;
							box-sizing: border-box;
							background-color: var(--vscode-editor-background) !important;
							border-bottom: 1px solid var(--typedown-theme-separator) !important;
							flex-shrink: 0 !important;
						}
						
						/* When toolbar is moved to fixed wrapper */
						.typedown-toolbar-wrapper .toastui-editor-defaultUI-toolbar {
							position: relative !important;
							top: auto !important;
							z-index: auto !important;
						}
						
						.toastui-editor-contents {
							font-family: ${fontFamily ? `"${fontFamily}", ` : ''}monospace !important;
							font-size: ${fontSize}px !important;
							-webkit-font-smoothing: subpixel-antialiased;
							-moz-osx-font-smoothing: auto;
							text-rendering: geometricPrecision;
							max-width: ${editorWidth} !important;
							box-sizing: border-box;
						}
						
						.toastui-editor {
							max-width: ${editorWidth} !important;
							width: 100% !important;
							box-sizing: border-box;
						}
						
						.toastui-editor-defaultUI .toastui-editor-ww-container {
							background-color: var(--vscode-editor-background) !important;
							color: var(--vscode-editor-foreground) !important;
						}
						
						.toastui-editor-contents {
							color: var(--vscode-editor-foreground) !important;
						}
						
						/* Override hardcoded text colors to respect theme */
						.toastui-editor-contents p,
						.toastui-editor-contents h1,
						.toastui-editor-contents h2,
						.toastui-editor-contents h3,
						.toastui-editor-contents h4,
						.toastui-editor-contents h5,
						.toastui-editor-contents h6,
						.toastui-editor-contents li,
						.toastui-editor-contents blockquote,
						.toastui-editor-contents a {
							color: var(--vscode-editor-foreground) !important;
						}
						
						/* Toolbar button styling */
						.toastui-editor-defaultUI-toolbar button {
							background-color: transparent !important;
							border: 1px solid transparent !important;
							color: var(--vscode-button-foreground, var(--vscode-foreground)) !important;
							border-radius: 3px !important;
							transition: background-color 0.2s, border-color 0.2s, color 0.2s !important;
						}
						
						.toastui-editor-defaultUI-toolbar button:not(:disabled):hover {
							background-color: var(--vscode-list-hoverBackground) !important;
							border-color: var(--vscode-list-hoverBackground) !important;
							color: var(--vscode-button-foreground, var(--vscode-foreground)) !important;
						}
						
						.toastui-editor-defaultUI-toolbar button:not(:disabled):active {
							background-color: var(--vscode-list-activeSelectionBackground) !important;
							border-color: var(--vscode-list-activeSelectionBackground) !important;
							color: var(--vscode-button-foreground, var(--vscode-foreground)) !important;
						}
						
						.toastui-editor-defaultUI-toolbar button:not(:disabled).active {
							background-color: var(--vscode-button-background) !important;
							border-color: var(--vscode-button-background) !important;
							color: var(--vscode-button-foreground) !important;
						}
						
						.toastui-editor-toolbar-icons {
							background-color: transparent !important;
							color: inherit !important;
							/* Make icons brighter and more visible on dark backgrounds */
							filter: brightness(1.5) contrast(1.2) !important;
							opacity: 0.9 !important;
						}
						
						.toastui-editor-toolbar-icons:not(:disabled):hover {
							filter: brightness(1.8) contrast(1.3) !important;
							opacity: 1 !important;
						}
						
						.toastui-editor-toolbar-icons:not(:disabled).active {
							filter: brightness(2) contrast(1.4) !important;
							opacity: 1 !important;
						}
						
						.toastui-editor-toolbar-icons:disabled {
							filter: brightness(0.5) contrast(0.8) !important;
							opacity: 0.3 !important;
						}
						
						.toastui-editor-toolbar-divider {
							background-color: var(--typedown-theme-separator) !important;
							opacity: 0.5 !important;
						}
						
						/* Dropdown menu styles */
						.toastui-editor-dropdown-toolbar {
							background-color: var(--typedown-theme-dropdown-bg, var(--vscode-dropdown-background)) !important;
							border-color: var(--typedown-theme-dropdown-border, var(--vscode-dropdown-border)) !important;
						}
						
						.toastui-editor-dropdown-toolbar button {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-dropdown-toolbar .toastui-editor-toolbar-icons {
							filter: brightness(1.5) contrast(1.2) !important;
							opacity: 0.9 !important;
						}
						
						.toastui-editor-dropdown-toolbar .toastui-editor-toolbar-icons:not(:disabled):hover {
							filter: brightness(1.8) contrast(1.3) !important;
							opacity: 1 !important;
						}
						
						.toastui-editor-popup .toastui-editor-toolbar-icons {
							filter: brightness(1.5) contrast(1.2) !important;
							opacity: 0.9 !important;
						}
						
						.toastui-editor-popup .toastui-editor-toolbar-icons:not(:disabled):hover {
							filter: brightness(1.8) contrast(1.3) !important;
							opacity: 1 !important;
						}
						
						/* Popup/dropdown menu items */
						.toastui-editor-popup {
							background-color: var(--typedown-theme-dropdown-bg, var(--vscode-dropdown-background)) !important;
							border-color: var(--typedown-theme-dropdown-border, var(--vscode-dropdown-border)) !important;
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-body {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-body label {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-add-heading ul li {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-add-heading ul li:hover {
							background-color: var(--vscode-list-hoverBackground) !important;
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-add-heading h1,
						.toastui-editor-popup-add-heading h2,
						.toastui-editor-popup-add-heading h3,
						.toastui-editor-popup-add-heading h4,
						.toastui-editor-popup-add-heading h5,
						.toastui-editor-popup-add-heading h6 {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-add-image .toastui-editor-tabs .tab-item {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-add-image .toastui-editor-tabs .tab-item.active {
							color: var(--vscode-button-foreground, var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground))) !important;
							border-bottom-color: var(--vscode-button-background, var(--vscode-foreground)) !important;
						}
						
						.toastui-editor-popup-add-image .toastui-editor-file-name {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-add-image .toastui-editor-file-name.has-file {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-add-table .toastui-editor-table-description {
							color: var(--typedown-theme-dropdown-fg, var(--vscode-dropdown-foreground)) !important;
						}
						
						.toastui-editor-popup-body input[type='text'] {
							background-color: var(--typedown-theme-input-bg, var(--vscode-input-background)) !important;
							color: var(--typedown-theme-input-fg, var(--vscode-input-foreground)) !important;
							border-color: var(--typedown-theme-input-border, var(--vscode-input-border)) !important;
						}
						
						.toastui-editor-popup-body input[type='text']:focus {
							outline-color: var(--vscode-button-background, var(--vscode-foreground)) !important;
						}
						
						/* Hide mode switch footer (Markdown/WYSIWYG tabs) */
						.toastui-editor-mode-switch {
							display: none !important;
						}
						
						/* Table styles */
						.toastui-editor-contents table {
							border-color: var(--typedown-theme-table-border) !important;
						}
						
						.toastui-editor-contents table td,
						.toastui-editor-contents table th {
							border-color: var(--typedown-theme-table-border) !important;
							padding: 8px 12px !important;
						}
						
						.toastui-editor-contents table th {
							background-color: transparent !important;
							color: var(--vscode-editor-foreground) !important;
							font-weight: bold !important;
						}
						
						.toastui-editor-contents table th p {
							color: var(--vscode-editor-foreground) !important;
						}
						
						/* Horizontal rule styles */
						.toastui-editor-contents hr {
							border-color: var(--typedown-theme-hr-border) !important;
							opacity: 0.6 !important;
						}
						
						/* Code block styles */
						.toastui-editor-contents .toastui-editor-ww-code-block {
							background-color: var(--vscode-textBlockQuote-background, var(--vscode-editor-background)) !important;
							border: 1px solid var(--typedown-theme-table-border) !important;
							border-radius: 4px !important;
							padding: 1em !important;
							margin: 0.5em 0 !important;
						}
						
						.toastui-editor-contents .toastui-editor-ww-code-block pre {
							background-color: transparent !important;
							color: var(--vscode-editor-foreground) !important;
							margin: 0 !important;
							padding: 0 !important;
							font-family: ${fontFamily ? `"${fontFamily}", ` : ''}monospace !important;
						}
						
						.toastui-editor-contents .toastui-editor-ww-code-block code {
							background-color: transparent !important;
							color: var(--vscode-editor-foreground) !important;
							font-family: ${fontFamily ? `"${fontFamily}", ` : ''}monospace !important;
						}
						
						.toastui-editor-contents .toastui-editor-ww-code-block:after {
							background-color: var(--vscode-editor-background) !important;
							color: var(--vscode-foreground) !important;
							border: 1px solid var(--typedown-theme-table-border) !important;
						}
					</style>
					<style id="font-size-style"></style>
				</head>
				<body>
					<div id="editor"></div>

					<script nonce="${nonce}" src="${tuiEditorJsUri}"></script>
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
