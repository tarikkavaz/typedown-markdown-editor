//@ts-check

// Get a reference to the VS Code webview api.
// We use this API to post messages back to our extension.

// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();
window.vscode = vscode;

// We use this to track whether the document's initial content has been set yet
var initializedFlag = false;
var editor = null;
var pendingContent = null; // Store content that arrives before editor is ready

// Wait for TUI Editor bundle to load and initialize the editor
function initEditor() {
	// Check for toastui in multiple possible locations
	const toastui = (typeof window !== 'undefined' && window.toastui) || 
	                 (typeof self !== 'undefined' && self.toastui) ||
	                 (typeof globalThis !== 'undefined' && globalThis.toastui) ||
	                 undefined;
	
	// If toastui is available, proceed immediately
	if (toastui && toastui.Editor) {
		
		try {
		// Configure plugins
		const plugins = [];
		// Get hljs from window, self, or globalThis
		const hljsInstance = window.hljs || self.hljs || (typeof globalThis !== 'undefined' ? globalThis.hljs : undefined);
		
		// Try to add syntax highlighting plugin with PrismJS
		// The plugin was designed for PrismJS, not highlight.js
		const prismInstance = window.Prism || self.Prism || (typeof globalThis !== 'undefined' ? globalThis.Prism : undefined);
		
		if (toastui.codeSyntaxHighlight && prismInstance) {
			plugins.push([toastui.codeSyntaxHighlight, { highlighter: prismInstance }]);
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
		} catch (error) {
			console.error('Error creating TUI Editor instance:', error);
			throw error;
		}
		
		// Set up event handlers now that editor is ready
		setupEditorHandlers();
		
		// Load pending content immediately if available (sent before editor was ready)
		if (pendingContent !== null) {
			setEditorContent(pendingContent);
			pendingContent = null;
		} else {
			// Load initial content if state exists (for webview reloads)
			const state = vscode.getState();
			if (state && state.text) {
				setEditorContent(state.text);
			}
		}
		
		// Request initial content (but it may have already been sent)
		vscode.postMessage({
			type: 'initialized',
		});
	} else {
		// Retry if toastui is not loaded yet, but limit retries to prevent infinite loop
		if (!window.__typedownInitRetries) {
			window.__typedownInitRetries = 0;
		}
		window.__typedownInitRetries++;
		
		// Stop retrying after 40 attempts (2 seconds max wait)
		if (window.__typedownInitRetries < 40) {
			setTimeout(initEditor, 50);
		} else {
			console.error('Failed to initialize TUI Editor: toastui not found after 40 retries. Bundle may have failed to load.');
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

// Make initEditor available globally so it can be called from inline script
window.initEditor = initEditor;

/**
 * Render the document in the webview.
 */
function setEditorContent(/** @type {string} */ text) {
	if (!editor) {
		return;
	}
	

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
	
	const isDropdownVisible = (dropdown) => {
		const computedStyle = window.getComputedStyle(dropdown);
		return computedStyle.display !== 'none' &&
			computedStyle.visibility !== 'hidden' &&
			computedStyle.opacity !== '0';
	};
	
	const closeHeadingDropdownIfVisible = () => {
		const headingDropdown = document.querySelector('.toastui-editor-popup-add-heading, .toastui-editor-popup');
		if (!headingDropdown || !isDropdownVisible(headingDropdown)) {
			return;
		}
		
		const hasHeadingItems = headingDropdown.querySelector('h1, h2, h3, h4, h5, h6');
		if (!hasHeadingItems) {
			return;
		}
		
		headingDropdown.style.display = 'none';
		headingDropdown.style.visibility = 'hidden';
		headingDropdown.style.opacity = '0';
	};
	
	const isAnyPopupVisible = () => {
		const dropdowns = document.querySelectorAll('.toastui-editor-dropdown-toolbar, .toastui-editor-popup, .toastui-editor-context-menu');
		return Array.from(dropdowns).some((dropdown) => isDropdownVisible(dropdown));
	};
	
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
	
	// Close heading dropdown after applying a heading
	if (typeof closeHeadingDropdownIfVisible === 'function') {
		editor.on('change', () => {
			setTimeout(() => {
				closeHeadingDropdownIfVisible();
			}, 0);
		});
	}
	
	// Close heading popup when a heading item is selected
	const closeHeadingPopupOnSelect = (event) => {
		const popup = event.target.closest('.toastui-editor-popup-add-heading');
		if (!popup || !isDropdownVisible(popup)) {
			return;
		}
		
		const selection = event.target.closest('li, h1, h2, h3, h4, h5, h6, button');
		if (!selection) {
			return;
		}
		
		setTimeout(() => {
			popup.classList.remove('show');
			popup.style.display = 'none';
			popup.style.visibility = 'hidden';
			popup.style.opacity = '0';
		}, 0);
	};
	
	document.addEventListener('click', closeHeadingPopupOnSelect, true);
	
	// Close heading popup immediately after selection
	
		// Move toolbar outside editor container and make it fixed at top
		// Defer this to not block initial content rendering - use double RAF for lower priority
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
		const toolbar = document.querySelector('.toastui-editor-defaultUI-toolbar');
		const editor = document.querySelector('#editor');
		
		if (toolbar && editor && !toolbar.classList.contains('typedown-fixed-toolbar')) {
			toolbar.classList.add('typedown-fixed-toolbar');
			document.body.classList.add('has-fixed-toolbar');
			
			// Update width, max-width, and left position to match editor
			const updateToolbarPosition = () => {
				const editorRect = editor.getBoundingClientRect();
				const editorWidth = editorRect.width;
				const editorComputedStyle = window.getComputedStyle(editor);
				const editorMaxWidth = editorComputedStyle.maxWidth;
				
				toolbar.style.width = editorWidth + 'px';
				if (editorMaxWidth && editorMaxWidth !== 'none') {
					toolbar.style.maxWidth = editorMaxWidth;
				} else {
					toolbar.style.maxWidth = '';
				}
				
				// Align toolbar's left edge with editor's left edge
				toolbar.style.left = editorRect.left + 'px';
			};
			
			// Track the last clicked button to help identify which button triggered a dropdown
			let lastClickedButton = null;
			let customHeadingDropdown = null;
			
			// Track button clicks for dropdown positioning
			toolbar.addEventListener('click', (e) => {
				const button = e.target.closest('button');
				if (button) {
					if (isAnyPopupVisible()) {
						return;
					}
					lastClickedButton = button;
				}
			}, true);
			
			
			// Ensure dropdowns and popups are visible and have proper z-index
			const positionDropdownFromButton = (dropdown, button) => {
				if (!button) return;
				const buttonRect = button.getBoundingClientRect();
				const dropdownRect = dropdown.getBoundingClientRect();
				const spacing = 6;
				
				let top = buttonRect.bottom + spacing;
				let left = buttonRect.left;
				
				const maxLeft = Math.max(8, window.innerWidth - dropdownRect.width - 8);
				left = Math.max(8, Math.min(left, maxLeft));
				
				const maxTop = Math.max(8, window.innerHeight - dropdownRect.height - 8);
				if (top > maxTop) {
					top = Math.max(8, buttonRect.top - dropdownRect.height - spacing);
				}
				
				dropdown.style.position = 'fixed';
				dropdown.style.top = `${Math.round(top)}px`;
				dropdown.style.left = `${Math.round(left)}px`;
			};
			
			const ensureDropdownsVisible = () => {
				// Find all dropdowns, popups, and context menus
				const dropdowns = document.querySelectorAll('.toastui-editor-dropdown-toolbar, .toastui-editor-popup, .toastui-editor-context-menu');
				
				dropdowns.forEach(dropdown => {
					const isVisible = isDropdownVisible(dropdown);
					const wasVisible = dropdown.dataset.typedownWasVisible === 'true';
					
					if (!isVisible && wasVisible) {
						dropdown.dataset.typedownWasVisible = 'false';
					}
					
					// Only adjust visible dropdowns
					if (isVisible) {
						// Auto-close heading dropdown after selection
						if (dropdown.classList.contains('toastui-editor-popup-add-heading')) {
							if (!dropdown.dataset.typedownCloseBound) {
								dropdown.dataset.typedownCloseBound = 'true';
								const closeHeadingDropdown = () => {
									setTimeout(() => {
										dropdown.style.display = 'none';
										dropdown.style.visibility = 'hidden';
										dropdown.style.opacity = '0';
									}, 0);
								};
								dropdown.addEventListener('click', closeHeadingDropdown, true);
							}
						}
						
						// Set high z-index to ensure dropdowns appear above toolbar
						dropdown.style.zIndex = '1001';
						
						// Ensure overflow is visible
						dropdown.style.overflow = 'visible';
						
						// Only position when dropdown just became visible
						if (!wasVisible && lastClickedButton &&
							(dropdown.classList.contains('toastui-editor-dropdown-toolbar') ||
								(dropdown.classList.contains('toastui-editor-popup') && !dropdown.classList.contains('toastui-editor-popup-add-heading')))) {
							positionDropdownFromButton(dropdown, lastClickedButton);
						}
						
						dropdown.dataset.typedownWasVisible = 'true';
						
						// Otherwise, let TUI Editor manage positioning
					}
				});
			};
			
			// Watch for dropdown creation and attribute changes (for show/hide)
			const dropdownObserver = new MutationObserver(() => {
				// When dropdowns are added or changed, ensure they're visible with proper z-index
				requestAnimationFrame(() => {
					ensureDropdownsVisible();
				});
			});
			
			// Observe document body for new dropdowns and attribute changes
			dropdownObserver.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['style', 'class']
			});
			
			// Handle click outside to close dropdowns
			const closeDropdownsOnClickOutside = (e) => {
				// Close custom heading dropdown
				if (customHeadingDropdown && !customHeadingDropdown.contains(e.target)) {
					const isOnToolbarButton = toolbar.contains(e.target);
					if (!isOnToolbarButton) {
						customHeadingDropdown.remove();
						customHeadingDropdown = null;
					}
				}
				
				const dropdowns = document.querySelectorAll('.toastui-editor-dropdown-toolbar, .toastui-editor-popup, .toastui-editor-context-menu');
				dropdowns.forEach(dropdown => {
					// Skip our custom dropdown
					if (dropdown.classList.contains('typedown-custom-heading-dropdown')) {
						return;
					}
					
					const computedStyle = window.getComputedStyle(dropdown);
					const isVisible = computedStyle.display !== 'none' && 
									  computedStyle.visibility !== 'hidden' && 
									  computedStyle.opacity !== '0';
					
					if (isVisible) {
						// Check if click is outside the dropdown
						const rect = dropdown.getBoundingClientRect();
						const clickX = e.clientX;
						const clickY = e.clientY;
						
						const isOutside = clickX < rect.left || 
										 clickX > rect.right || 
										 clickY < rect.top || 
										 clickY > rect.bottom;
						
						// Also check if click is on the button that opened it (don't close in that case)
						const isOnToolbarButton = toolbar.contains(e.target);
						
						if (isOutside && !isOnToolbarButton) {
							dropdown.style.display = 'none';
							dropdown.style.visibility = 'hidden';
							dropdown.style.opacity = '0';
						}
					}
				});
			};
			
			// Add click listener to document to close dropdowns
			document.addEventListener('click', closeDropdownsOnClickOutside, true);
			
			// Initial update
			updateToolbarPosition();
			requestAnimationFrame(ensureDropdownsVisible);
			
			// Also run on every animation frame for a short period after button clicks
			let animationFrameId = null;
			let frameCount = 0;
			const runPositioningLoop = () => {
				ensureDropdownsVisible();
				frameCount++;
				if (frameCount < 10) { // Run for ~10 frames (~160ms at 60fps)
					animationFrameId = requestAnimationFrame(runPositioningLoop);
				} else {
					frameCount = 0;
				}
			};
			
			// Start positioning loop when button is clicked
			toolbar.addEventListener('click', () => {
				frameCount = 0;
				if (animationFrameId) {
					cancelAnimationFrame(animationFrameId);
				}
				runPositioningLoop();
			}, true);
			
			// Also listen for click events on toolbar buttons to immediately position dropdowns
			// This is handled above in the button click tracking
			
			// Update on resize and scroll (in case editor position changes)
			window.addEventListener('resize', () => {
				updateToolbarPosition();
				requestAnimationFrame(ensureDropdownsVisible);
			}, { passive: true });
			window.addEventListener('scroll', () => {
				updateToolbarPosition();
				requestAnimationFrame(ensureDropdownsVisible);
			}, { passive: true });
			
			// Use MutationObserver to watch for editor position changes
			const observer = new MutationObserver(() => {
				updateToolbarPosition();
				requestAnimationFrame(ensureDropdownsVisible);
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
				requestAnimationFrame(ensureDropdownsVisible);
			});
			editorObserver.observe(editor, {
				attributes: true,
				attributeFilter: ['style', 'class'],
				childList: true,
				subtree: false
			});
			
		}
			});
		});
}

// Handle messages sent from the extension to the webview
window.addEventListener('message', (event) => {
	const message = event.data; // The data that the extension sent
	switch (message.type) {
		case 'documentChanged': {
			const text = message.text;
			// Store content if editor isn't ready yet - it will be loaded when editor initializes
			if (!editor) {
				pendingContent = text;
				vscode.setState({ text });
				return;
			}
			editor.suppressNextChangeEvent = true;
			setEditorContent(text);
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
					/* Code blocks use typedown.editor.codeBlockfontFamily (or editor.fontFamily as fallback) - override any inherited fonts */
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
					/* Inline code elements should also use typedown.editor.codeBlockfontFamily (or editor.fontFamily as fallback) */
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

// Start initialization - but only if bundle isn't already loaded
// If bundle is already loaded, it will be called from the inline script
if (window.toastui && window.toastui.Editor) {
	// Bundle already loaded, initialize immediately
	initEditor();
} else {
	// Wait for bundle to load
	initEditor();
}
