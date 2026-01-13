//@ts-check

// Get a reference to the VS Code webview api.
// We use this API to post messages back to our extension.

// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();
window.vscode = vscode;

// We use this to track whether the document's initial content has been set yet
var initializedFlag = false;
var editor = null;

// Wait for TUI Editor bundle to load and initialize the editor
function initEditor() {
	console.log('initEditor called, checking toastui...', {
		toastuiType: typeof toastui,
		toastuiExists: typeof toastui !== 'undefined',
		toastuiEditor: typeof toastui !== 'undefined' ? typeof toastui.Editor : 'N/A',
		windowToastui: typeof window !== 'undefined' && typeof window.toastui !== 'undefined',
		selfToastui: typeof self !== 'undefined' && typeof self.toastui !== 'undefined',
	});
	
	if (typeof toastui !== 'undefined' && toastui.Editor) {
		console.log('Creating TUI Editor instance...');
		try {
		editor = new toastui.Editor({
			el: document.querySelector('#editor'),
			initialEditType: 'wysiwyg',
			previewStyle: 'vertical',
			height: 'auto',
			minHeight: '400px',
			usageStatistics: false,
			toolbarItems: [
				['heading', 'bold', 'italic', 'strike'],
				['hr', 'quote'],
				['ul', 'ol', 'task', 'indent', 'outdent'],
				['table', 'image', 'link'],
				['code', 'codeblock'],
				['scrollSync'],
			]
		});
		
		window.editor = editor;
		editor.savedData = null;
		editor.suppressNextChangeEvent = false;
		
		console.log('TUI Editor instance created successfully:', editor);
		} catch (error) {
			console.error('Error creating TUI Editor instance:', error);
			throw error;
		}
		
		// Set up event handlers now that editor is ready
		setupEditorHandlers();
		
		// Notify that editor is initialized
		vscode.postMessage({
			type: 'initialized',
		});
		
		// Load initial content if state exists
		const state = vscode.getState();
		if (state && state.text) {
			setEditorContent(state.text);
		}
	} else {
		// Retry if toastui is not loaded yet
		setTimeout(initEditor, 50);
	}
}

/**
 * Render the document in the webview.
 */
function setEditorContent(/** @type {string} */ text) {
	if (!editor) {
		console.warn('Editor not initialized yet, cannot set content');
		return;
	}
	
	console.log('setEditorContent', { initializedFlag, text: JSON.stringify(text) });

	// TUI Editor uses setMarkdown to set content
	if (!initializedFlag) {
		editor.setMarkdown(text);
		initializedFlag = true;
		editor.savedData = editor.getMarkdown();
		return;
	}

	// If the new text doesn't match the editor's current text, we need to update it.
	if (editor.getMarkdown() !== text) {
		editor.suppressNextChangeEvent = true;
		editor.setMarkdown(text);
		editor.savedData = editor.getMarkdown();
	}
}

function setupEditorHandlers() {
	if (!editor) return;
	
	// Add listener for user modifying text in the editor
	editor.on('change', () => {
		// This happens when the event was triggered by documentChanged event rather than user input
		if (editor.suppressNextChangeEvent) {
			editor.suppressNextChangeEvent = false;
			return;
		}

		let data = editor.getMarkdown();
		
		vscode.postMessage({
			type: 'webviewChanged',
			text: data,
		});

		editor.dirty = true;
	});
}

// Handle messages sent from the extension to the webview
window.addEventListener('message', (event) => {
	console.log('Received Message', { 'event.data': JSON.stringify(event.data) });
	const message = event.data; // The data that the extension sent
	switch (message.type) {
		case 'documentChanged': {
			if (!editor) {
				console.warn('Editor not initialized yet, cannot set content');
				return;
			}
			const text = message.text;
			editor.suppressNextChangeEvent = true;
			setEditorContent(text);

			// This state is returned in the call to `vscode.getState` below when a webview is reloaded.
			vscode.setState({ text });
			break;
		}
		case 'scrollChanged': {
			// TODO: Implement scroll sync if needed
			break;
		}
		case 'fontSizeChanged':
		case 'fontChanged': {
			const fontSize = message.fontSize;
			const fontFamily = message.fontFamily || '';
			console.log('Updating font to:', { fontSize, fontFamily });
			// Update the font-size-style element with new CSS
			const styleElement = document.getElementById('font-size-style');
			if (styleElement) {
				const fontFamilyCss = fontFamily ? `"${fontFamily}", ` : '';
				styleElement.textContent = `
					.toastui-editor-contents {
						font-family: ${fontFamilyCss}monospace !important;
						font-size: ${fontSize}px !important;
						-webkit-font-smoothing: subpixel-antialiased;
						-moz-osx-font-smoothing: auto;
						text-rendering: geometricPrecision;
					}
					.toastui-editor-defaultUI .toastui-editor-ww-container {
						font-family: ${fontFamilyCss}monospace !important;
						font-size: ${fontSize}px !important;
						-webkit-font-smoothing: subpixel-antialiased;
						-moz-osx-font-smoothing: auto;
						text-rendering: geometricPrecision;
					}
				`;
			}
			break;
		}
		case 'themeChanged': {
			const colors = message.colors;
			console.log('Updating theme colors:', colors);
			// Update CSS variables
			if (colors) {
				const root = document.documentElement;
				if (colors.foreground) root.style.setProperty('--typedown-theme-foreground', colors.foreground);
				if (colors.activeBorder) root.style.setProperty('--typedown-theme-active-border', colors.activeBorder);
				if (colors.buttonBackground) root.style.setProperty('--typedown-theme-button-bg', colors.buttonBackground);
				if (colors.buttonHoverBackground) root.style.setProperty('--typedown-theme-button-hover-bg', colors.buttonHoverBackground);
				if (colors.dropdownBackground) root.style.setProperty('--typedown-theme-dropdown-bg', colors.dropdownBackground);
				if (colors.dropdownForeground) root.style.setProperty('--typedown-theme-dropdown-fg', colors.dropdownForeground);
				if (colors.dropdownBorder) root.style.setProperty('--typedown-theme-dropdown-border', colors.dropdownBorder);
			}
			break;
		}
		case 'themeColorChanged': {
			const sidebarForeground = message.sidebarForeground;
			console.log('Updating sidebar foreground color:', sidebarForeground);
			if (sidebarForeground) {
				const root = document.documentElement;
				// Use sideBar.foreground for separators, HR lines, and table borders
				root.style.setProperty('--typedown-theme-separator', sidebarForeground);
				root.style.setProperty('--typedown-theme-hr-border', sidebarForeground);
				root.style.setProperty('--typedown-theme-table-border', sidebarForeground);
				root.style.setProperty('--typedown-theme-active-border', sidebarForeground);
			}
			break;
		}
	}
});

// Start initialization
initEditor();
