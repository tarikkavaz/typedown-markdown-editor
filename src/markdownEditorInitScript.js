//@ts-check

// Get a reference to the VS Code webview api.
// We use this API to post messages back to our extension.

// This was defined in markdownEditor.ts in the HTML snippet initializing CKEditor5. This line just stops IDE complaining.
const editor = window.editor;

// This will store the latest saved data from VS Code
editor.savedData = null;

editor.suppressNextDataChangeEvent = false;

// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();
window.vscode = vscode;

// We use this to track whether the document's initial content has been set yet
var initializedFlag = false;

/**
 * Render the document in the webview.
 */
function setEditorContent(/** @type {string} */ text) {
	console.log('setEditorContent', { initializedFlag, text: JSON.stringify(text) });

	// We use setData instead of editor.model.change for initial content otherwise undo history starts with empty content
	if (!initializedFlag) {
		editor.setData(text);
		initializedFlag = true;
		return;
	}

	// If the new text doesn't match the editor's current text, we need to update it but preserve the selection.
	if (editor.getData() != text) {
		// Save selection so we can restore it after replacing the content
		const userSelection = editor.model.document.selection.getFirstRange();

		// Use setData to replace content - this will properly parse markdown tables
		// setData automatically handles markdown parsing and conversion to HTML for display
		editor.setData(text);

		editor.model.change((writer) => {
			try {
				writer.setSelection(userSelection);
			} catch {
				// Backup selection to use if userSelection became invalid after replacing content
				// Usually userSelection should only become invalid if the document got shorter (its now out of bounds)
				// so in that case we should put the cursor at the end of the last line in the document
				let lastElement = editor.model.document
					.getRoot()
					.getChild(editor.model.document.getRoot().childCount - 1);
				editor.model.change((writer) => {
					writer.setSelection(lastElement, 'after');
				});
			}
		});
	}

	// Keep track of this to check if document is really dirty in change:data event
	editor.savedData = editor.getData();
}

// Helper function to convert HTML table to markdown table
function htmlTableToMarkdown(html) {
	// Check if the HTML contains a table
	if (!html || !html.includes('<table')) {
		return html;
	}
	
	// Use regex to find and replace HTML tables with markdown
	// This approach works better than DOM parsing for mixed HTML/markdown content
	const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
	
	return html.replace(tableRegex, (match, tableContent) => {
		// Create a temporary DOM element to parse just the table
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = match;
		
		const table = tempDiv.querySelector('table');
		if (!table) {
			return match; // Return original if parsing fails
		}
		
		return convertTableToMarkdown(table);
	});
}

// Convert a single HTML table element to markdown
function convertTableToMarkdown(table) {
	const rows = [];
	const tbody = table.querySelector('tbody') || table;
	const trElements = tbody.querySelectorAll('tr');
	
	if (trElements.length === 0) {
		return '';
	}
	
	// First pass: determine the maximum number of columns
	let maxColumns = 0;
	trElements.forEach((tr) => {
		const cellCount = tr.querySelectorAll('td, th').length;
		if (cellCount > maxColumns) {
			maxColumns = cellCount;
		}
	});
	
	// If no columns found, return empty
	if (maxColumns === 0) {
		return '';
	}
	
	let separatorAdded = false;
	
	trElements.forEach((tr, rowIndex) => {
		const cells = [];
		const tdElements = tr.querySelectorAll('td, th');
		
		// Check if this is a header row (has th elements or is the first row in a table with thead)
		const isHeaderRow = tr.querySelector('th') !== null || 
		                    (rowIndex === 0 && table.querySelector('thead') !== null) ||
		                    (rowIndex === 0 && tr.parentElement.tagName === 'THEAD');
		
		// Process all cells, ensuring we have maxColumns cells
		for (let i = 0; i < maxColumns; i++) {
			const cell = tdElements[i];
			let cellText = '';
			
			if (cell) {
				// Get cell text content, handling &nbsp; and other HTML entities
				cellText = cell.textContent || cell.innerText || '';
				// Decode HTML entities by creating a temporary element
				const tempDiv2 = document.createElement('div');
				tempDiv2.innerHTML = cellText;
				cellText = tempDiv2.textContent || tempDiv2.innerText || '';
				cellText = cellText.trim();
				// Replace multiple spaces with single space
				cellText = cellText.replace(/\s+/g, ' ');
				// Escape pipe characters in cell content
				cellText = cellText.replace(/\|/g, '\\|');
			}
			// If cell is empty or doesn't exist, use empty string (not space)
			cells.push(cellText || '');
		}
		
		if (cells.length > 0) {
			// Build the markdown row with proper spacing
			rows.push('| ' + cells.join(' | ') + ' |');
			
			// Always add separator row after the first row (treat first row as header)
			// This ensures valid markdown table syntax
			if (rowIndex === 0 && !separatorAdded) {
				const separator = cells.map(() => '---').join(' | ');
				rows.push('| ' + separator + ' |');
				separatorAdded = true;
			}
		}
	});
	
	return '\n' + rows.join('\n') + '\n';
}

// Add listener for user modifying text in the editor
editor.model.document.on('change:data', (e) => {
	// This happens when the even was triggered by documentChanged event rather than user input
	if (editor.suppressNextDataChangeEvent) {
		editor.suppressNextDataChangeEvent = false;
		return;
	}

	let data = editor.getData();
	
	// CKEditor markdown build should automatically convert HTML tables to markdown
	// But if it doesn't, we'll convert them manually
	// Check if data contains HTML tables that weren't converted
	if (data.includes('<table')) {
		data = htmlTableToMarkdown(data);
	}
	
	vscode.postMessage({
		type: 'webviewChanged',
		text: data,
	});

	editor.dirty = true;
});

// Handle messages sent from the extension to the webview
window.addEventListener('message', (event) => {
	console.log('Recieved Message', { 'event.data': JSON.stringify(event.data) });
	const message = event.data; // The data that the extension sent
	switch (message.type) {
		case 'documentChanged': {
			const text = message.text;
			editor.suppressNextDataChangeEvent = true;
			setEditorContent(text);

			// This state is returned in the call to `vscode.getState` below when a webview is reloaded.
			vscode.setState({ text });
			break;
		}
		case 'scrollChanged': {
			// TODO
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
					.ck.ck-content {
						font-family: ${fontFamilyCss}monospace !important;
						font-size: ${fontSize}px !important;
						-webkit-font-smoothing: subpixel-antialiased;
						-moz-osx-font-smoothing: auto;
						text-rendering: geometricPrecision;
					}
					.ck-editor__editable {
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

// Webviews are normally torn down when not visible and re-created when they become visible again.
// State lets us save information across these re-loads
const state = vscode.getState();
if (state) {
	setEditorContent(state.text);
}


// Add keyboard handlers to allow exiting code blocks
function setupCodeBlockExitHandlers() {
	const model = editor.model;
	
	// Helper function to find the code block containing the selection
	function findCodeBlock() {
		const selection = model.document.selection;
		const position = selection.getFirstPosition();
		
		// Check selected element first
		const selectedElement = selection.getSelectedElement();
		if (selectedElement && (selectedElement.name === 'codeBlock' || selectedElement.name === 'code')) {
			console.log('Found code block in selected element:', selectedElement.name);
			return selectedElement;
		}
		
		// Walk up the tree to find a code block
		let parent = position.parent;
		let depth = 0;
		while (parent && depth < 10) {
			// Check for various possible code block names
			if (parent.name === 'codeBlock' || parent.name === 'code' || parent.name === 'fencedCode') {
				console.log('Found code block at depth', depth, 'name:', parent.name);
				return parent;
			}
			// Stop if we've reached the root
			if (parent === model.document.getRoot()) {
				break;
			}
			parent = parent.parent;
			depth++;
		}
		return null;
	}
	
	// Helper function to check if position is at the end of a code block
	function isAtEndOfCodeBlock(codeBlock, position) {
		if (!codeBlock) return false;
		
		// Check if position is within the code block
		const codeBlockRange = model.createRangeIn(codeBlock);
		if (!codeBlockRange.containsPosition(position)) {
			return false;
		}
		
		// Check if we're at or near the end of the code block
		const codeBlockEnd = codeBlockRange.end;
		
		// Check if position is at the end or very close to it (within last few characters)
		// This handles cases where cursor might be slightly before the absolute end
		const distanceFromEnd = codeBlockEnd.offset - position.offset;
		
		// Consider "at end" if we're at the end position or very close (within 5 characters)
		// This makes it easier to exit the code block
		return position.isEqual(codeBlockEnd) || (distanceFromEnd >= 0 && distanceFromEnd <= 5);
	}
	
	// Helper function to check if position is at the beginning of a code block
	function isAtStartOfCodeBlock(codeBlock, position) {
		if (!codeBlock) return false;
		
		// Check if position is within the code block
		const codeBlockRange = model.createRangeIn(codeBlock);
		if (!codeBlockRange.containsPosition(position)) {
			return false;
		}
		
		// Check if we're at the very start of the code block
		const codeBlockStart = codeBlockRange.start;
		return position.isEqual(codeBlockStart);
	}
	
	// Handle ArrowDown at the end of code block - move cursor outside
	editor.keystrokes.set('ArrowDown', (data, cancel) => {
		console.log('ArrowDown key pressed');
		const codeBlock = findCodeBlock();
		console.log('Code block found:', !!codeBlock);
		if (codeBlock) {
			const selection = model.document.selection;
			const position = selection.getFirstPosition();
			const codeBlockRange = model.createRangeIn(codeBlock);
			
			const codeBlockStart = codeBlockRange.start.offset;
			const codeBlockEnd = codeBlockRange.end.offset;
			const isInside = codeBlockRange.containsPosition(position);
			const isAtEnd = position.offset >= codeBlockEnd; // End is exclusive, so >= means at or past end
			
			console.log('Position check:', {
				positionOffset: position.offset,
				codeBlockRangeStart: codeBlockStart,
				codeBlockRangeEnd: codeBlockEnd,
				containsPosition: isInside,
				isAtEnd: isAtEnd
			});
			
			// Check if we're in the code block OR at the end (end is exclusive in ranges)
			if (isInside || isAtEnd) {
				const codeBlockEndPos = codeBlockRange.end;
				const codeBlockStartPos = codeBlockRange.start;
				const codeBlockSize = codeBlockEndPos.offset - codeBlockStartPos.offset;
				const positionFromStart = position.offset - codeBlockStartPos.offset;
				const positionFromEnd = codeBlockEndPos.offset - position.offset;
				
				// Calculate what percentage through the code block we are
				const percentThrough = codeBlockSize > 0 ? (positionFromStart / codeBlockSize) * 100 : 0;
				
				// Debug logging
				console.log('ArrowDown in code block', {
					codeBlockSize,
					positionFromStart,
					positionFromEnd,
					percentThrough: percentThrough.toFixed(1),
					isAtEnd: isAtEnd,
					positionOffset: position.offset,
					codeBlockEndOffset: codeBlockEndPos.offset,
					codeBlockStartOffset: codeBlockStartPos.offset
				});
				
				let shouldExit = false;
				let isAtEndOfLastLine = false;
				
				// If we're at or past the end, always exit
				if (isAtEnd || positionFromEnd <= 0) {
					console.log('At end of code block, exiting');
					shouldExit = true;
				} else {
					// Try to get the actual text content to check if we're at the end of the last line
					try {
						// Get text from current position to end of code block
						const rangeToEnd = model.createRange(position, codeBlockEndPos);
						let textAfter = '';
						for (const item of rangeToEnd.getItems()) {
							if (item && item.data) {
								textAfter += item.data;
							}
						}
						// Check if we're at the end: either no text after, or we're very close to the end
						// AND there's no newline after us (meaning we're at the end of the last line)
						const noNewlineAfter = !textAfter.includes('\n');
						const veryCloseToEnd = positionFromEnd <= 3; // Within last 3 characters
						isAtEndOfLastLine = noNewlineAfter && (veryCloseToEnd || !textAfter.trim());
						console.log('Text after cursor:', JSON.stringify(textAfter), 'isAtEndOfLastLine:', isAtEndOfLastLine, 'positionFromEnd:', positionFromEnd);
					} catch (e) {
						console.log('Error checking text after cursor:', e);
					}
					
					// Exit if we're at the end of the last line
					shouldExit = isAtEndOfLastLine;
				}
				
				console.log('Should exit?', shouldExit, {
					isAtEnd: isAtEnd,
					isAtEndOfLastLine: isAtEndOfLastLine,
					percentThrough: percentThrough,
					positionFromEnd: positionFromEnd,
					codeBlockSize: codeBlockSize
				});
				
				if (shouldExit) {
					console.log('Exiting code block via ArrowDown', {
						percentThrough: percentThrough.toFixed(1),
						positionFromEnd,
						isAtEnd: position.isEqual(codeBlockEnd)
					});
					
					model.change((writer) => {
						// Try to find the next sibling element
						const root = model.document.getRoot();
						const children = Array.from(root.getChildren());
						const codeBlockIndex = children.indexOf(codeBlock);
						
						console.log('Code block index:', codeBlockIndex, 'Total children:', children.length, 'Children:', children.map(c => c.name));
						
						if (codeBlockIndex >= 0 && codeBlockIndex < children.length - 1) {
							// There's a next element, move selection there
							const nextElement = children[codeBlockIndex + 1];
							console.log('Moving to next element:', nextElement.name);
							writer.setSelection(nextElement, 0);
						} else {
							// No next element, create a new paragraph
							console.log('Creating new paragraph after code block');
							const paragraph = writer.createElement('paragraph');
							writer.insert(paragraph, model.createPositionAfter(codeBlock));
							writer.setSelection(paragraph, 0);
						}
					});
					cancel();
					return;
				}
			}
		}
	}, { priority: 'highest' });
	
	// Handle ArrowUp at the beginning of code block - move cursor outside
	editor.keystrokes.set('ArrowUp', (data, cancel) => {
		const codeBlock = findCodeBlock();
		if (codeBlock) {
			const selection = model.document.selection;
			const position = selection.getFirstPosition();
			
			if (isAtStartOfCodeBlock(codeBlock, position)) {
				model.change((writer) => {
					// Try to find the previous sibling element
					const root = model.document.getRoot();
					const children = Array.from(root.getChildren());
					const codeBlockIndex = children.indexOf(codeBlock);
					
					if (codeBlockIndex > 0) {
						// There's a previous element, move selection there
						const prevElement = children[codeBlockIndex - 1];
						writer.setSelection(prevElement, 'end');
					} else {
						// No previous element, create a new paragraph
						const paragraph = writer.createElement('paragraph');
						writer.insert(paragraph, model.createPositionBefore(codeBlock));
						writer.setSelection(paragraph, 'end');
					}
				});
				cancel();
			}
		}
	}, { priority: 'high' });
	
	// Handle Enter at the end of code block - create new paragraph and exit
	editor.keystrokes.set('Enter', (data, cancel) => {
		const codeBlock = findCodeBlock();
		if (codeBlock) {
			const selection = model.document.selection;
			const position = selection.getFirstPosition();
			
			if (isAtEndOfCodeBlock(codeBlock, position)) {
				model.change((writer) => {
					// Create a new paragraph after the code block
					const paragraph = writer.createElement('paragraph');
					writer.insert(paragraph, model.createPositionAfter(codeBlock));
					writer.setSelection(paragraph, 0);
				});
				cancel();
			}
		}
	}, { priority: 'high' });
	
	// Handle Escape key to exit code block - move cursor to next element or create paragraph
	editor.keystrokes.set('Esc', (data, cancel) => {
		const codeBlock = findCodeBlock();
		if (codeBlock) {
			model.change((writer) => {
				// Try to find the next sibling element
				const root = model.document.getRoot();
				const children = Array.from(root.getChildren());
				const codeBlockIndex = children.indexOf(codeBlock);
				
				if (codeBlockIndex >= 0 && codeBlockIndex < children.length - 1) {
					// There's a next element, move selection there
					const nextElement = children[codeBlockIndex + 1];
					writer.setSelection(nextElement, 0);
				} else if (codeBlockIndex > 0) {
					// No next element, but there's a previous one
					const prevElement = children[codeBlockIndex - 1];
					writer.setSelection(prevElement, 'end');
				} else {
					// No siblings, create a new paragraph after
					const paragraph = writer.createElement('paragraph');
					writer.insert(paragraph, model.createPositionAfter(codeBlock));
					writer.setSelection(paragraph, 0);
				}
			});
			cancel();
		}
	}, { priority: 'high' });
}

// Setup code block exit handlers after editor is ready
function initializeHandlers() {
	console.log('Setting up code block exit handlers...');
	try {
		setupCodeBlockExitHandlers();
		console.log('Code block exit handlers registered successfully');
	} catch (error) {
		console.error('Error setting up code block exit handlers:', error);
	}
}

// Wait for editor to be fully ready
if (editor.state === 'ready' || editor.isReady) {
	// Use setTimeout to ensure everything is initialized
	setTimeout(initializeHandlers, 100);
} else {
	editor.on('ready', () => {
		setTimeout(initializeHandlers, 100);
	});
}

vscode.postMessage({
	type: 'initialized',
});
