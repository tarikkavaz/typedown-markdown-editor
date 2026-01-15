//@ts-check

// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();
window.vscode = vscode;

let editor = null;
let initializedFlag = false;
let pendingContent = null;
let suppressNextChangeEvent = false;
let lastMarkdown = '';
let imageBaseUri = typeof window !== 'undefined' && window.__typedownBaseUri ? window.__typedownBaseUri : '';
let linkDialog = null;
let tableDialog = null;

function getTiptapBundle() {
	return (typeof window !== 'undefined' && window.tiptap) ||
		(typeof self !== 'undefined' && self.tiptap) ||
		(typeof globalThis !== 'undefined' && globalThis.tiptap) ||
		null;
}

function resolveImageSrc(src) {
	if (!src) {
		return src;
	}

	const lower = src.toLowerCase();
	if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:') || lower.startsWith('vscode-resource:') || lower.startsWith('vscode-file:')) {
		return src;
	}

	if (!imageBaseUri) {
		return src;
	}

	try {
		return new URL(src, imageBaseUri).toString();
	} catch (error) {
		return src;
	}
}

function updateImageSources() {
	if (!editor) {
		return;
	}

	const root = editor.view?.dom;
	if (!root) {
		return;
	}

	root.querySelectorAll('img').forEach((img) => {
		const current = img.getAttribute('src') || '';
		const resolved = resolveImageSrc(current);
		if (resolved && resolved !== img.src) {
			img.src = resolved;
		}
	});
}

function setupImageObserver() {
	if (!editor) {
		return;
	}

	const root = editor.view?.dom;
	if (!root) {
		return;
	}

	const observer = new MutationObserver(() => {
		updateImageSources();
	});

	observer.observe(root, {
		childList: true,
		subtree: true,
	});

}

function forceImageRerender() {
	if (!editor) {
		return;
	}

	const root = editor.view?.dom;
	if (!root) {
		return;
	}

	root.querySelectorAll('img').forEach((img) => {
		const current = img.getAttribute('src') || '';
		const resolved = resolveImageSrc(current);
		if (resolved) {
			img.src = '';
			requestAnimationFrame(() => {
				img.src = resolved;
			});
		}
	});
}

function normalizeMarkdownImages(markdown) {
	if (!markdown) {
		return markdown;
	}
	// Ensure images are on their own line with a blank line after.
	let normalized = markdown;
	normalized = normalized.replace(/(!\[[^\]]*\]\([^)]+\))(?!\r?\n)/g, '$1\n\n');
	normalized = normalized.replace(/(!\[[^\]]*\]\([^)]+\))\r?\n(?!\r?\n)/g, '$1\n\n');
	return normalized;
}

function createPrismDecorations(doc, prismInstance) {
	const { Decoration, DecorationSet } = window.tiptap;
	const decorations = [];

	const tokenize = (tokens, startPos, offset, types) => {
		tokens.forEach((token) => {
			if (typeof token === 'string') {
				offset.value += token.length;
				return;
			}

			const alias = token.alias
				? Array.isArray(token.alias)
					? token.alias
					: [token.alias]
				: [];
			const nextTypes = [...types, token.type, ...alias];

			if (typeof token.content === 'string') {
				const from = startPos + offset.value;
				const to = from + token.content.length;
				const className = `token ${nextTypes.join(' ')}`;
				if (from < to) {
					decorations.push(Decoration.inline(from, to, { class: className }));
				}
				offset.value += token.content.length;
				return;
			}

			const nested = Array.isArray(token.content) ? token.content : [token.content];
			tokenize(nested.filter(Boolean), startPos, offset, nextTypes);
		});
	};

	doc.descendants((node, pos) => {
		if (node.type.name !== 'codeBlock') {
			return;
		}

		const language = node.attrs.language || '';
		const grammar = prismInstance.languages[language] || prismInstance.languages.markup;
		if (!grammar) {
			return;
		}

		const text = node.textContent;
		if (!text) {
			return;
		}

		const tokens = prismInstance.tokenize(text, grammar);
		const offset = { value: 0 };
		tokenize(tokens, pos + 1, offset, []);
	});

	return DecorationSet.create(doc, decorations);
}

function setEditorContent(text) {
	if (!editor) {
		return;
	}

	suppressNextChangeEvent = true;
	editor.commands.setContent(text, { contentType: 'markdown', emitUpdate: false });
	suppressNextChangeEvent = false;
	lastMarkdown = text;
	initializedFlag = true;
	requestAnimationFrame(() => updateImageSources());
}

function updateToolbarPosition(toolbar) {
	const editorContainer = document.querySelector('#editor');
	if (!toolbar || !editorContainer) {
		return;
	}

	const editorRect = editorContainer.getBoundingClientRect();
	toolbar.style.width = `${editorRect.width}px`;
	toolbar.style.left = `${editorRect.left}px`;
}

function buildToolbar() {
	const toolbar = document.querySelector('#toolbar');
	if (!toolbar || !editor) {
		return;
	}

	toolbar.innerHTML = '';

	const headingSelect = document.createElement('select');
	headingSelect.dataset.action = 'heading';
	[
		{ label: 'P', level: 0 },
		{ label: 'H1', level: 1 },
		{ label: 'H2', level: 2 },
		{ label: 'H3', level: 3 },
		{ label: 'H4', level: 4 },
		{ label: 'H5', level: 5 },
		{ label: 'H6', level: 6 },
	].forEach((option) => {
		const element = document.createElement('option');
		element.value = String(option.level);
		element.textContent = option.label;
		headingSelect.appendChild(element);
	});

	headingSelect.addEventListener('change', () => {
		const level = Number(headingSelect.value);
		if (level === 0) {
			editor.chain().focus().setParagraph().run();
		} else {
			editor.chain().focus().toggleHeading({ level }).run();
		}
	});

	toolbar.appendChild(headingSelect);

	const iconMap = {
		hr: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		ul: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="1.5" fill="currentColor"/><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="6" cy="17" r="1.5" fill="currentColor"/><line x1="10" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="17" x2="20" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		ol: '<svg viewBox="0 0 24 24" aria-hidden="true"><text x="4" y="9" font-size="7" fill="currentColor" font-family="monospace">1</text><text x="4" y="14" font-size="7" fill="currentColor" font-family="monospace">2</text><text x="4" y="19" font-size="7" fill="currentColor" font-family="monospace">3</text><line x1="10" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="17" x2="20" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		task: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="6" height="6" rx="1" ry="1" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="5,16 7.5,18.5 11,14.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="14" y1="8" x2="20" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="16" x2="20" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		indent: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6,8 10,12 6,16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="8" x2="20" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="20" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		outdent: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="10,8 6,12 10,16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="8" x2="20" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="20" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		table: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1" ry="1" stroke="currentColor" stroke-width="2" fill="none"/><line x1="4" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="2"/><line x1="10" y1="5" x2="10" y2="19" stroke="currentColor" stroke-width="2"/><line x1="16" y1="5" x2="16" y2="19" stroke="currentColor" stroke-width="2"/></svg>',
		image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="9" cy="10" r="2" fill="currentColor"/><polyline points="4,17 10,12 14,15 20,11 20,19 4,19" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>',
		link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12a4 4 0 0 1 4-4h3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M15 12a4 4 0 0 1-4 4H8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M7 12a5 5 0 0 1 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M17 12a5 5 0 0 1-5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
	};

	const buttons = [
		{ action: 'bold', label: 'B', title: 'Bold' },
		{ action: 'italic', label: 'I', title: 'Italic' },
		{ action: 'strike', label: 'S', title: 'Strike' },
		{ action: 'hr', label: 'HR', title: 'Horizontal Rule', icon: iconMap.hr },
		{ action: 'quote', label: '""', title: 'Blockquote' },
		{ action: 'ul', label: 'UL', title: 'Bullet List', icon: iconMap.ul },
		{ action: 'ol', label: 'OL', title: 'Ordered List', icon: iconMap.ol },
		{ action: 'task', label: 'Task', title: 'Task List', icon: iconMap.task },
		{ action: 'indent', label: '>>', title: 'Indent', icon: iconMap.indent },
		{ action: 'outdent', label: '<<', title: 'Outdent', icon: iconMap.outdent },
		{ action: 'table', label: 'Table', title: 'Insert Table', icon: iconMap.table },
		{ action: 'image', label: 'Image', title: 'Insert Image', icon: iconMap.image },
		{ action: 'link', label: 'Link', title: 'Insert Link', icon: iconMap.link },
		{ action: 'code', label: '{}', title: 'Inline Code' },
		{ action: 'codeblock', label: '</>', title: 'Code Block' },
	];

	buttons.forEach((item) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.action = item.action;
		if (item.icon) {
			button.innerHTML = item.icon;
			button.setAttribute('aria-label', item.title);
		} else {
			button.textContent = item.label;
		}
		button.title = item.title;
		button.setAttribute('data-tooltip', item.title);
		button.addEventListener('click', () => handleToolbarAction(item.action, button));
		toolbar.appendChild(button);
	});

	updateToolbarPosition(toolbar);
	document.body.classList.add('has-fixed-toolbar');

	window.addEventListener('resize', () => updateToolbarPosition(toolbar), { passive: true });
	window.addEventListener('scroll', () => updateToolbarPosition(toolbar), { passive: true });

	updateToolbarActiveStates();
}

function ensureLinkDialog() {
	if (linkDialog) {
		return linkDialog;
	}

	const overlay = document.createElement('div');
	overlay.className = 'typedown-dialog-overlay';

	const dialog = document.createElement('div');
	dialog.className = 'typedown-dialog';
	dialog.innerHTML = `
		<div class="typedown-dialog-title">Edit link</div>
		<label class="typedown-dialog-field">
			<span>Text</span>
			<input type="text" data-link-text />
		</label>
		<label class="typedown-dialog-field">
			<span>URL</span>
			<input type="text" data-link-url />
		</label>
		<div class="typedown-dialog-actions">
			<button type="button" data-dialog-cancel>Cancel</button>
			<button type="button" data-dialog-confirm>Save</button>
		</div>
	`;

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);

	linkDialog = {
		overlay,
		dialog,
		textInput: dialog.querySelector('input[data-link-text]'),
		urlInput: dialog.querySelector('input[data-link-url]'),
		confirmButton: dialog.querySelector('button[data-dialog-confirm]'),
		cancelButton: dialog.querySelector('button[data-dialog-cancel]'),
	};

	linkDialog.cancelButton.addEventListener('click', () => {
		overlay.classList.remove('is-visible');
	});

	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) {
			overlay.classList.remove('is-visible');
		}
	});

	return linkDialog;
}

function promptForImage() {
	vscode.postMessage({
		type: 'requestImageInsert',
	});
}

function ensureTableDialog() {
	if (tableDialog) {
		return tableDialog;
	}

	const overlay = document.createElement('div');
	overlay.className = 'typedown-dialog-overlay';

	const dialog = document.createElement('div');
	dialog.className = 'typedown-dialog';
	dialog.innerHTML = `
		<div class="typedown-dialog-title">Insert Table</div>
		<label class="typedown-dialog-field">
			<span>Rows (excluding header)</span>
			<input type="number" data-table-rows min="1" max="100" value="2" />
		</label>
		<label class="typedown-dialog-field">
			<span>Columns</span>
			<input type="number" data-table-cols min="1" max="20" value="3" />
		</label>
		<div class="typedown-dialog-actions">
			<button type="button" data-dialog-cancel>Cancel</button>
			<button type="button" data-dialog-confirm>Insert</button>
		</div>
	`;

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);

	tableDialog = {
		overlay,
		dialog,
		rowsInput: dialog.querySelector('input[data-table-rows]'),
		colsInput: dialog.querySelector('input[data-table-cols]'),
		confirmButton: dialog.querySelector('button[data-dialog-confirm]'),
		cancelButton: dialog.querySelector('button[data-dialog-cancel]'),
	};

	tableDialog.cancelButton.addEventListener('click', () => {
		overlay.classList.remove('is-visible');
	});

	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) {
			overlay.classList.remove('is-visible');
		}
	});

	return tableDialog;
}

function openTableDialog({ onConfirm }) {
	const dialog = ensureTableDialog();
	dialog.rowsInput.value = '2';
	dialog.colsInput.value = '3';
	dialog.overlay.classList.add('is-visible');

	requestAnimationFrame(() => {
		dialog.rowsInput.focus();
		dialog.rowsInput.select();
	});

	const handleConfirm = () => {
		// +1 for the header row (markdown tables require a header)
		const rows = Math.max(1, Math.min(100, parseInt(dialog.rowsInput.value, 10) || 2)) + 1;
		const cols = Math.max(1, Math.min(20, parseInt(dialog.colsInput.value, 10) || 3));
		dialog.overlay.classList.remove('is-visible');
		onConfirm(rows, cols);
	};

	const handleKeydown = (event) => {
		if (event.key === 'Escape') {
			dialog.overlay.classList.remove('is-visible');
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleConfirm();
		}
	};

	dialog.confirmButton.onclick = handleConfirm;
	dialog.rowsInput.onkeydown = handleKeydown;
	dialog.colsInput.onkeydown = handleKeydown;
}

function openLinkDialog({ text, url, onConfirm }) {
	const dialog = ensureLinkDialog();
	dialog.textInput.value = text || '';
	dialog.urlInput.value = url || '';
	dialog.overlay.classList.add('is-visible');

	requestAnimationFrame(() => {
		if (dialog.urlInput.value) {
			dialog.urlInput.focus();
			dialog.urlInput.select();
		} else {
			dialog.textInput.focus();
		}
	});

	const handleConfirm = () => {
		const nextText = dialog.textInput.value.trim();
		const nextUrl = dialog.urlInput.value.trim();
		dialog.overlay.classList.remove('is-visible');
		onConfirm(nextText, nextUrl);
	};

	const handleKeydown = (event) => {
		if (event.key === 'Escape') {
			dialog.overlay.classList.remove('is-visible');
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleConfirm();
		}
	};

	dialog.confirmButton.onclick = handleConfirm;
	dialog.textInput.onkeydown = handleKeydown;
	dialog.urlInput.onkeydown = handleKeydown;
}

function handleToolbarAction(action, button) {
	if (!editor) {
		return;
	}

	switch (action) {
		case 'bold':
			editor.chain().focus().toggleBold().run();
			break;
		case 'italic':
			editor.chain().focus().toggleItalic().run();
			break;
		case 'strike':
			editor.chain().focus().toggleStrike().run();
			break;
		case 'hr':
			editor.chain().focus().setHorizontalRule().run();
			break;
		case 'quote':
			editor.chain().focus().toggleBlockquote().run();
			break;
		case 'ul':
			editor.chain().focus().toggleBulletList().run();
			break;
		case 'ol':
			editor.chain().focus().toggleOrderedList().run();
			break;
		case 'task':
			editor.chain().focus().toggleTaskList().run();
			break;
		case 'indent': {
			const sunkTask = editor.chain().focus().sinkListItem('taskItem').run();
			if (!sunkTask) {
				editor.chain().focus().sinkListItem('listItem').run();
			}
			break;
		}
		case 'outdent': {
			const liftedTask = editor.chain().focus().liftListItem('taskItem').run();
			if (!liftedTask) {
				editor.chain().focus().liftListItem('listItem').run();
			}
			break;
		}
		case 'table':
			openTableDialog({
				onConfirm: (rows, cols) => {
					editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
				},
			});
			break;
		case 'image': {
			promptForImage();
			break;
		}
		case 'link': {
			const { from, to, empty } = editor.state.selection;
			const existingUrl = editor.getAttributes('link').href || '';
			let linkText = '';

			if (!empty) {
				linkText = editor.state.doc.textBetween(from, to, ' ');
			}

			const initialText = linkText || existingUrl || '';
			const initialUrl = existingUrl || linkText || '';

			openLinkDialog({
				text: initialText,
				url: initialUrl,
				onConfirm: (nextText, nextUrl) => {
					if (!nextUrl) {
						editor.chain().focus().unsetLink().run();
						return;
					}

					if (empty || !linkText) {
						const insertText = nextText || nextUrl;
						editor.chain().focus().insertContent({
							type: 'text',
							text: insertText,
							marks: [{ type: 'link', attrs: { href: nextUrl } }],
						}).run();
					} else {
						editor.chain().focus().extendMarkRange('link').setLink({ href: nextUrl }).run();
					}
				},
			});
			break;
		}
		case 'code':
			editor.chain().focus().toggleCode().run();
			break;
		case 'codeblock':
			editor.chain().focus().toggleCodeBlock().run();
			break;
	}

	updateToolbarActiveStates();
}

function updateToolbarActiveStates() {
	if (!editor) {
		return;
	}

	const toolbar = document.querySelector('#toolbar');
	if (!toolbar) {
		return;
	}

	toolbar.querySelectorAll('button[data-action]').forEach((button) => {
		const action = button.dataset.action;
		let isActive = false;

		switch (action) {
			case 'bold':
				isActive = editor.isActive('bold');
				break;
			case 'italic':
				isActive = editor.isActive('italic');
				break;
			case 'strike':
				isActive = editor.isActive('strike');
				break;
			case 'quote':
				isActive = editor.isActive('blockquote');
				break;
			case 'ul':
				isActive = editor.isActive('bulletList');
				break;
			case 'ol':
				isActive = editor.isActive('orderedList');
				break;
			case 'task':
				isActive = editor.isActive('taskList');
				break;
			case 'code':
				isActive = editor.isActive('code');
				break;
			case 'codeblock':
				isActive = editor.isActive('codeBlock');
				break;
		}

		button.classList.toggle('active', isActive);
	});

	const headingSelect = toolbar.querySelector('select[data-action="heading"]');
	if (headingSelect) {
		const heading = [1, 2, 3, 4, 5, 6].find((level) => editor.isActive('heading', { level }));
		headingSelect.value = heading ? String(heading) : '0';
	}
}

function setupEditorHandlers() {
	if (!editor) {
		return;
	}

	editor.on('update', () => {
		if (suppressNextChangeEvent) {
			suppressNextChangeEvent = false;
			return;
		}

		const rawMarkdown = editor.storage?.markdown?.getMarkdown
			? editor.storage.markdown.getMarkdown()
			: editor.getText();
		const markdown = normalizeMarkdownImages(rawMarkdown.replace(/\\\n/g, '\n'));

		lastMarkdown = markdown;
		vscode.postMessage({ type: 'webviewChanged', text: markdown });
		updateToolbarActiveStates();
		requestAnimationFrame(() => updateImageSources());
	});

	editor.on('selectionUpdate', () => {
		updateToolbarActiveStates();
	});
}

function initEditor() {
	if (window.__typedownEditorInitialized) {
		return;
	}

	const tiptap = getTiptapBundle();
	if (!tiptap || !tiptap.Editor) {
		console.error('Failed to initialize Tiptap editor: bundle not available.');
		return;
	}

	window.__typedownEditorInitialized = true;

	const {
		Editor,
		StarterKit,
		CodeBlock,
		mergeAttributes,
		Markdown,
		TaskList,
		TaskItem,
		Link,
		Image,
		Table,
		TableRow,
		TableHeader,
		TableCell,
		Extension,
		Plugin,
		PluginKey,
	} = tiptap;

	const editorElement = document.querySelector('#editor');
	if (editorElement) {
		editorElement.innerHTML = '';
	}

	const CodeBlockWithLanguage = CodeBlock.extend({
		renderHTML({ node, HTMLAttributes }) {
			const language = node.attrs.language || null;
			const className = language ? `${this.options.languageClassPrefix}${language}` : null;
			const preAttrs = mergeAttributes(
				this.options.HTMLAttributes,
				HTMLAttributes,
				language ? { 'data-language': language } : {}
			);
			const codeAttrs = mergeAttributes(
				className ? { class: className } : {},
				language ? { 'data-language': language } : {}
			);
			return ['pre', preAttrs, ['code', codeAttrs, 0]];
		},
	});

	const ImageWithBase = Image.extend({
		addNodeView() {
			return ({ node }) => {
				const img = document.createElement('img');
				const update = (nextNode) => {
					if (nextNode.type.name !== 'image') {
						return false;
					}
					const src = resolveImageSrc(nextNode.attrs.src);
					if (src) {
						img.src = src;
					}
					if (nextNode.attrs.alt) {
						img.alt = nextNode.attrs.alt;
					} else {
						img.removeAttribute('alt');
					}
					return true;
				};
				update(node);
				return { dom: img, update };
			};
		},
		renderHTML({ node, HTMLAttributes }) {
			const src = resolveImageSrc(node.attrs.src);
			return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src })];
		},
	});

	const PrismHighlight = Extension.create({
		name: 'prismHighlight',
		addProseMirrorPlugins() {
			const prismInstance = window.Prism || (typeof globalThis !== 'undefined' ? globalThis.Prism : null);
			if (!prismInstance) {
				console.warn('[Typedown] Prism not available for highlighting.');
				return [];
			}

			return [
				new Plugin({
					key: new PluginKey('prismHighlight'),
					state: {
						init: (_, { doc }) => createPrismDecorations(doc, prismInstance),
						apply: (tr, oldState, oldEditorState, newEditorState) => {
							if (!tr.docChanged) {
								return oldState;
							}
							return createPrismDecorations(newEditorState.doc, prismInstance);
						},
					},
					props: {
						decorations(state) {
							return this.getState(state);
						},
					},
				}),
			];
		},
	});

	editor = new Editor({
		element: document.querySelector('#editor'),
		extensions: [
			StarterKit.configure({
				codeBlock: false,
				link: false,
			}),
			CodeBlockWithLanguage,
			PrismHighlight,
			TaskList,
			TaskItem.configure({ nested: true }),
			Link.configure({ openOnClick: false }),
			ImageWithBase,
			Table.configure({ resizable: true }),
			TableRow,
			TableHeader,
			TableCell,
			Markdown.configure({
				html: false,
				tightLists: true,
				bulletListMarker: '-',
				breaks: true,
			}),
		],
		content: '',
		autofocus: false,
	});

	setupEditorHandlers();
	buildToolbar();
	setupImageObserver();

	if (pendingContent !== null) {
		setEditorContent(pendingContent);
		pendingContent = null;
	} else {
		const state = vscode.getState();
		if (state && state.text) {
			setEditorContent(state.text);
		}
	}

	vscode.postMessage({ type: 'initialized' });
}

window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.type) {
		case 'documentChanged': {
			const text = message.text;
			if (!editor) {
				pendingContent = text;
				vscode.setState({ text });
				return;
			}
			setEditorContent(text);
			lastMarkdown = text;
			vscode.setState({ text });
			break;
		}
		case 'scrollChanged': {
			break;
		}
		case 'fontChanged': {
			const fontSize = message.fontSize;
			let fontFamily = message.fontFamily;
			if (!fontFamily || fontFamily.trim() === '') {
				fontFamily = 'monospace';
			}
			let codeBlockFontFamily = message.codeBlockFontFamily || message.fontFamily;
			if (!codeBlockFontFamily || codeBlockFontFamily.trim() === '') {
				codeBlockFontFamily = 'monospace';
			}

			const styleElement = document.getElementById('font-size-style');
			if (styleElement) {
				styleElement.textContent = `
					.ProseMirror {
						font-family: ${fontFamily} !important;
						font-size: ${fontSize}px !important;
						-webkit-font-smoothing: subpixel-antialiased;
						-moz-osx-font-smoothing: auto;
						text-rendering: geometricPrecision;
					}
					.ProseMirror code {
						font-family: ${codeBlockFontFamily} !important;
					}
					.ProseMirror :not(pre) > code {
						font-size: 0.9em !important;
					}
					.ProseMirror pre,
					.ProseMirror pre code {
						font-family: ${codeBlockFontFamily} !important;
						font-size: ${fontSize}px !important;
					}
				`;
			}
			break;
		}
		case 'themeColorChanged': {
			const sidebarForeground = message.sidebarForeground;
			if (sidebarForeground) {
				const root = document.documentElement;
				root.style.setProperty('--typedown-theme-separator', sidebarForeground);
				root.style.setProperty('--typedown-theme-hr-border', sidebarForeground);
				root.style.setProperty('--typedown-theme-table-border', sidebarForeground);
				root.style.setProperty('--typedown-theme-active-border', sidebarForeground);
			}
			break;
		}
		case 'baseUriChanged': {
			if (typeof message.baseUri === 'string') {
				imageBaseUri = message.baseUri;
				updateImageSources();
			}
			break;
		}
		case 'insertImage': {
			if (!editor || !message.src) {
				return;
			}
			if (typeof message.baseUri === 'string') {
				imageBaseUri = message.baseUri;
			}
			// Insert image and paragraph in a single transaction
			editor.chain()
				.focus()
				.insertContent([
					{ type: 'image', attrs: { src: message.src, alt: message.altText || 'Image' } },
					{ type: 'paragraph' },
				])
				.run();
			
			// Update image sources after DOM is settled
			setTimeout(() => {
				updateImageSources();
			}, 50);
			break;
		}
		case 'prismThemeChanged': {
			const styleElement = document.getElementById('prism-user-theme');
			if (styleElement) {
				styleElement.textContent = message.css || '';
			}
			break;
		}
	}
});

// Initialize immediately - bundle is loaded synchronously before this script
initEditor();
