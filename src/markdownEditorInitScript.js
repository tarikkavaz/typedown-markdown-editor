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
	// Check if bundle has loaded
	if (typeof window !== 'undefined' && window.__bundleLoaded === false && window.__bundleLoadError === false) {
		// Bundle script tag exists but hasn't fired onload yet - wait a bit more
		if (!window.__typedownInitRetries) {
			window.__typedownInitRetries = 0;
		}
		window.__typedownInitRetries++;
		if (window.__typedownInitRetries < 100) {
			setTimeout(initEditor, 50);
			return;
		}
	}
	
	// Check for toastui in multiple possible locations
	const toastui = (typeof window !== 'undefined' && window.toastui) || 
	                 (typeof self !== 'undefined' && self.toastui) ||
	                 (typeof globalThis !== 'undefined' && globalThis.toastui) ||
	                 undefined;
	
	console.log('initEditor called, checking toastui...', {
		bundleLoaded: typeof window !== 'undefined' ? window.__bundleLoaded : 'N/A',
		bundleLoadError: typeof window !== 'undefined' ? window.__bundleLoadError : 'N/A',
		bundleError: typeof window !== 'undefined' ? window.__bundleError : 'N/A',
		toastuiType: typeof toastui,
		toastuiExists: typeof toastui !== 'undefined',
		toastuiEditor: typeof toastui !== 'undefined' ? typeof toastui.Editor : 'N/A',
		windowToastui: typeof window !== 'undefined' && typeof window.toastui !== 'undefined',
		selfToastui: typeof self !== 'undefined' && typeof self.toastui !== 'undefined',
		globalThisToastui: typeof globalThis !== 'undefined' && typeof globalThis.toastui !== 'undefined',
		prismAvailable: typeof window !== 'undefined' && typeof window.Prism !== 'undefined',
	});
	
	if (toastui && toastui.Editor) {
		console.log('Creating TUI Editor instance...');
		console.log('hljs available:', typeof window.hljs !== 'undefined', typeof window.hljs);
		console.log('codeSyntaxHighlight available:', typeof toastui.codeSyntaxHighlight !== 'undefined');
		
		try {
		// Configure plugins
		const plugins = [];
		// Get hljs from window, self, or globalThis
		const hljsInstance = window.hljs || self.hljs || (typeof globalThis !== 'undefined' ? globalThis.hljs : undefined);
		
		// Try to add syntax highlighting plugin with PrismJS
		// The plugin was designed for PrismJS, not highlight.js
		const prismInstance = window.Prism || self.Prism || (typeof globalThis !== 'undefined' ? globalThis.Prism : undefined);
		
		if (toastui.codeSyntaxHighlight && prismInstance) {
			console.log('Adding code syntax highlight plugin with PrismJS');
			plugins.push([toastui.codeSyntaxHighlight, { highlighter: prismInstance }]);
		} else {
			console.warn('Skipping code syntax highlight plugin:', {
				hasPlugin: !!toastui.codeSyntaxHighlight,
				hasPrism: !!prismInstance
			});
		}
		
		editor = new toastui.Editor({
			el: document.querySelector('#editor'),
			initialEditType: 'wysiwyg',
			previewStyle: 'vertical',
			height: 'auto',
			minHeight: '400px',
			usageStatistics: false,
			plugins: plugins,
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
		// Retry if toastui is not loaded yet, but limit retries to prevent infinite loop
		if (!window.__typedownInitRetries) {
			window.__typedownInitRetries = 0;
		}
		window.__typedownInitRetries++;
		
		// Stop retrying after 200 attempts (10 seconds)
		if (window.__typedownInitRetries < 200) {
			setTimeout(initEditor, 50);
		} else {
			console.error('Failed to initialize TUI Editor: toastui not found after 200 retries. Bundle may have failed to load.');
			// Try to check if bundle script loaded
			const scripts = document.querySelectorAll('script[src*="tui-editor-bundle"]');
			console.error('Bundle scripts found:', scripts.length);
			if (scripts.length === 0) {
				console.error('ERROR: tui-editor-bundle.js script tag not found in DOM!');
			} else {
				console.error('Bundle script tag found, but toastui is not available.');
				if (window.__bundleLoadError) {
					console.error('Bundle failed to load (onerror event fired)');
				}
				if (window.__bundleError) {
					console.error('Bundle runtime error:', window.__bundleError);
				}
				// Check if Prism is available (it should be set before toastui)
				console.error('Prism available:', typeof window.Prism !== 'undefined', typeof window.Prism);
			}
		}
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
	
	// Move toolbar outside editor container and make it fixed at top
	setTimeout(() => {
		const toolbar = document.querySelector('.toastui-editor-defaultUI-toolbar');
		const editor = document.querySelector('#editor');
		
		if (toolbar && editor && !document.querySelector('.typedown-toolbar-wrapper')) {
			// Create wrapper for fixed toolbar
			const toolbarWrapper = document.createElement('div');
			toolbarWrapper.className = 'typedown-toolbar-wrapper';
			
			// Move the actual toolbar element (not clone) to preserve event handlers
			toolbarWrapper.appendChild(toolbar);
			
			// Insert wrapper at the beginning of body
			document.body.insertBefore(toolbarWrapper, document.body.firstChild);
			
			// Add padding class to body
			document.body.classList.add('has-fixed-toolbar');
			
			// Update width and max-width to match editor (centering is handled by CSS)
			const updateToolbarPosition = () => {
				const editorRect = editor.getBoundingClientRect();
				const editorWidth = editorRect.width;
				const editorComputedStyle = window.getComputedStyle(editor);
				const editorMaxWidth = editorComputedStyle.maxWidth;
				
				// Set wrapper width and max-width to match editor
				toolbarWrapper.style.width = editorWidth + 'px';
				if (editorMaxWidth && editorMaxWidth !== 'none') {
					toolbarWrapper.style.maxWidth = editorMaxWidth;
				}
			};
			
			// Ensure dropdowns and popups are positioned correctly relative to fixed toolbar
			const ensureDropdownsVisible = () => {
				// Find all dropdowns and popups that are currently visible
				const dropdowns = document.querySelectorAll('.toastui-editor-dropdown-toolbar, .toastui-editor-popup');
				dropdowns.forEach(dropdown => {
					// Check if dropdown is actually visible (not hidden)
					const computedStyle = window.getComputedStyle(dropdown);
					const isVisible = computedStyle.display !== 'none' && 
									  computedStyle.visibility !== 'hidden' && 
									  computedStyle.opacity !== '0';
					
					if (!isVisible) {
						return; // Skip hidden dropdowns
					}
					
					// Only set z-index for visible dropdowns
					dropdown.style.zIndex = '1001';
					
					// If dropdown is not inside toolbar wrapper, try to position it correctly
					if (!toolbarWrapper.contains(dropdown)) {
						// Try to find the active/clicked button that triggered this dropdown
						// Check for buttons with active class or recent click
						const toolbarButtons = toolbar.querySelectorAll('button');
						let targetButton = null;
						
						// First, try to find an active button
						const activeButton = toolbar.querySelector('button.active, button:focus');
						if (activeButton) {
							targetButton = activeButton;
						} else {
							// Find the closest toolbar button based on position
							let closestButton = null;
							let minDistance = Infinity;
							
							toolbarButtons.forEach(button => {
								const buttonRect = button.getBoundingClientRect();
								const dropdownRect = dropdown.getBoundingClientRect();
								
								// Calculate distance (both horizontal and vertical)
								const horizontalDist = Math.abs(buttonRect.left - dropdownRect.left);
								const verticalDist = dropdownRect.top - buttonRect.bottom;
								
								// If dropdown is near this button horizontally and below it
								if (horizontalDist < 150 && verticalDist > -50 && verticalDist < 200) {
									const totalDist = Math.sqrt(horizontalDist * horizontalDist + verticalDist * verticalDist);
									if (totalDist < minDistance) {
										minDistance = totalDist;
										closestButton = button;
									}
								}
							});
							
							if (closestButton) {
								targetButton = closestButton;
							}
						}
						
						// Position dropdown relative to the target button
						if (targetButton) {
							const buttonRect = targetButton.getBoundingClientRect();
							dropdown.style.position = 'fixed';
							dropdown.style.top = (buttonRect.bottom + window.scrollY) + 'px';
							dropdown.style.left = (buttonRect.left + window.scrollX) + 'px';
						}
					}
				});
			};
			
			// Watch for dropdown creation and attribute changes (for show/hide)
			const dropdownObserver = new MutationObserver((mutations) => {
				let shouldUpdate = false;
				mutations.forEach((mutation) => {
					// Check for new dropdowns
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === 1) { // Element node
							if (node.classList && (
								node.classList.contains('toastui-editor-dropdown-toolbar') ||
								node.classList.contains('toastui-editor-popup')
							)) {
								shouldUpdate = true;
							}
							// Also check children
							const dropdowns = node.querySelectorAll?.('.toastui-editor-dropdown-toolbar, .toastui-editor-popup');
							if (dropdowns && dropdowns.length > 0) {
								shouldUpdate = true;
							}
						}
					});
					// Check for style/display changes (show/hide)
					if (mutation.type === 'attributes' && 
						(mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
						const target = mutation.target;
						if (target.classList && (
							target.classList.contains('toastui-editor-dropdown-toolbar') ||
							target.classList.contains('toastui-editor-popup')
						)) {
							shouldUpdate = true;
						}
					}
				});
				if (shouldUpdate) {
					setTimeout(ensureDropdownsVisible, 10);
				}
			});
			
			// Observe document body for new dropdowns and attribute changes
			dropdownObserver.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['style', 'class']
			});
			
			// Initial update
			updateToolbarPosition();
			setTimeout(ensureDropdownsVisible, 100);
			
			// Update on resize and scroll (in case editor position changes)
			window.addEventListener('resize', () => {
				updateToolbarPosition();
				setTimeout(ensureDropdownsVisible, 10);
			}, { passive: true });
			window.addEventListener('scroll', () => {
				updateToolbarPosition();
				setTimeout(ensureDropdownsVisible, 10);
			}, { passive: true });
			
			// Use MutationObserver to watch for editor position changes
			const observer = new MutationObserver(() => {
				updateToolbarPosition();
				setTimeout(ensureDropdownsVisible, 10);
			});
			observer.observe(document.body, {
				attributes: true,
				attributeFilter: ['style', 'class'],
				childList: false,
				subtree: false
			});
			
			// Also observe the editor container for changes
			const editorObserver = new MutationObserver(() => {
				updateToolbarPosition();
				setTimeout(ensureDropdownsVisible, 10);
			});
			editorObserver.observe(editor, {
				attributes: true,
				attributeFilter: ['style', 'class'],
				childList: true,
				subtree: false
			});
			
			console.log('Toolbar moved to fixed position at top');
		}
	}, 500);
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
			// Ensure fontFamily is always valid, default to monospace if empty
			let fontFamily = message.fontFamily;
			if (!fontFamily || fontFamily.trim() === '') {
				fontFamily = 'monospace';
			}
			// Code blocks ALWAYS use editor.fontFamily, not typedown.editor.fontFamily
			let codeBlockFontFamily = message.codeBlockFontFamily || message.fontFamily;
			if (!codeBlockFontFamily || codeBlockFontFamily.trim() === '') {
				codeBlockFontFamily = 'monospace';
			}
			console.log('Updating font to:', { fontSize, fontFamily, codeBlockFontFamily });
			// Update the font-size-style element with new CSS
			const styleElement = document.getElementById('font-size-style');
			if (styleElement) {
				// Use fontFamily as-is since VS Code settings already format it correctly (e.g., "'Fira Code', monospace")
				styleElement.textContent = `
					.toastui-editor-contents {
						/* Use typedown.editor.fontFamily or editor.fontFamily for regular text */
						font-family: ${fontFamily} !important;
						font-size: ${fontSize}px !important;
						-webkit-font-smoothing: subpixel-antialiased;
						-moz-osx-font-smoothing: auto;
						text-rendering: geometricPrecision;
					}
					.toastui-editor-defaultUI .toastui-editor-ww-container {
						font-size: ${fontSize}px !important;
						-webkit-font-smoothing: subpixel-antialiased;
						-moz-osx-font-smoothing: auto;
						text-rendering: geometricPrecision;
					}
					/* Code blocks MUST use editor.fontFamily (not typedown.editor.fontFamily) - override any inherited fonts */
					.toastui-editor-contents .toastui-editor-ww-code-block,
					.toastui-editor-contents .toastui-editor-ww-code-block-highlighting,
					.toastui-editor-contents .toastui-editor-ww-code-block *,
					.toastui-editor-contents .toastui-editor-ww-code-block-highlighting *,
					.toastui-editor-contents .toastui-editor-ww-code-block pre,
					.toastui-editor-contents .toastui-editor-ww-code-block-highlighting pre,
					.toastui-editor-contents .toastui-editor-ww-code-block pre[class*="language-"],
					.toastui-editor-contents .toastui-editor-ww-code-block-highlighting pre[class*="language-"],
					.toastui-editor-contents .toastui-editor-ww-code-block code,
					.toastui-editor-contents .toastui-editor-ww-code-block-highlighting code,
					.toastui-editor-contents .toastui-editor-ww-code-block pre code:not([class*="language-"]),
					.toastui-editor-contents .toastui-editor-ww-code-block pre:not([class*="language-"]) code,
					.toastui-editor-contents .toastui-editor-ww-code-block code:not([class*="language-"]),
					.toastui-editor-contents .toastui-editor-ww-code-block pre:not([class*="language-"]) {
						font-family: ${codeBlockFontFamily} !important;
						font-size: ${fontSize}px !important;
					}
					/* Inline code elements should also use editor.fontFamily (not typedown.editor.fontFamily) */
					.toastui-editor-contents :not(pre) > code,
					.toastui-editor-contents p code,
					.toastui-editor-contents li code,
					.toastui-editor-contents td code,
					.toastui-editor-contents th code {
						font-family: ${codeBlockFontFamily} !important;
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
