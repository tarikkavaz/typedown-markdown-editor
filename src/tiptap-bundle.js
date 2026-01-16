// Entry point for bundling Tiptap editor with dependencies
// Exposes Tiptap and Shiki globally for the webview init script

import { Editor, mergeAttributes, Extension, Node, Mark, InputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import katex from 'katex';

// Import Shiki core with JavaScript engine (no WASM - works with CSP restrictions)
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// Import bundled languages and themes
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import html from 'shiki/langs/html.mjs';
import css from 'shiki/langs/css.mjs';
import json from 'shiki/langs/json.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import python from 'shiki/langs/python.mjs';
import java from 'shiki/langs/java.mjs';
import c from 'shiki/langs/c.mjs';
import cpp from 'shiki/langs/cpp.mjs';
import go from 'shiki/langs/go.mjs';
import rust from 'shiki/langs/rust.mjs';
import bash from 'shiki/langs/bash.mjs';
import sql from 'shiki/langs/sql.mjs';
import xml from 'shiki/langs/xml.mjs';
import vue from 'shiki/langs/vue.mjs';
import svelte from 'shiki/langs/svelte.mjs';
import php from 'shiki/langs/php.mjs';
import ruby from 'shiki/langs/ruby.mjs';
import swift from 'shiki/langs/swift.mjs';
import kotlin from 'shiki/langs/kotlin.mjs';
import diff from 'shiki/langs/diff.mjs';

// Bundled languages for Shiki
const bundledLangs = [
	javascript, typescript, jsx, tsx,
	html, css, json, yaml, markdown,
	python, java, c, cpp, go, rust,
	bash, sql, xml, vue, svelte,
	php, ruby, swift, kotlin, diff
];

// Create highlighter with JavaScript engine (CSP-compatible)
async function createHighlighter(options) {
	return createHighlighterCore({
		engine: createJavaScriptRegexEngine(),
		...options,
	});
}

// Inline Math Node ($...$)
const InlineMath = Node.create({
	name: 'inlineMath',
	group: 'inline',
	inline: true,
	atom: true,

	addAttributes() {
		return {
			latex: {
				default: '',
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span[data-type="inline-math"]',
				getAttrs: (node) => ({
					latex: node.getAttribute('data-latex') || '',
				}),
			},
		];
	},

	renderHTML({ node, HTMLAttributes }) {
		let rendered = '';
		try {
			rendered = katex.renderToString(node.attrs.latex, {
				throwOnError: false,
				displayMode: false,
			});
		} catch (e) {
			rendered = `<span class="katex-error">${node.attrs.latex}</span>`;
		}

		return [
			'span',
			mergeAttributes(HTMLAttributes, {
				'data-type': 'inline-math',
				'data-latex': node.attrs.latex,
				class: 'typedown-math typedown-math-inline',
			}),
			['span', { class: 'katex-render' }],
		];
	},

	addNodeView() {
		return ({ node, editor }) => {
			const dom = document.createElement('span');
			dom.className = 'typedown-math typedown-math-inline';
			dom.setAttribute('data-type', 'inline-math');
			dom.setAttribute('data-latex', node.attrs.latex);
			dom.contentEditable = 'false';

			const renderMath = () => {
				try {
					katex.render(node.attrs.latex, dom, {
						throwOnError: false,
						displayMode: false,
					});
				} catch (e) {
					dom.innerHTML = `<span class="katex-error">${node.attrs.latex}</span>`;
				}
			};

			renderMath();

			// Double-click to edit
			dom.addEventListener('dblclick', () => {
				const openDialog = window.__typedownOpenMathDialog;
				if (openDialog) {
					openDialog({
						latex: node.attrs.latex,
						isBlock: false,
						onConfirm: (newLatex) => {
							if (newLatex !== node.attrs.latex) {
								const pos = editor.view.posAtDOM(dom, 0);
								editor.chain().focus().command(({ tr }) => {
									tr.setNodeMarkup(pos, undefined, { latex: newLatex });
									return true;
								}).run();
							}
						},
					});
				}
			});

			return {
				dom,
				update: (updatedNode) => {
					if (updatedNode.type.name !== 'inlineMath') {
						return false;
					}
					dom.setAttribute('data-latex', updatedNode.attrs.latex);
					try {
						katex.render(updatedNode.attrs.latex, dom, {
							throwOnError: false,
							displayMode: false,
						});
					} catch (e) {
						dom.innerHTML = `<span class="katex-error">${updatedNode.attrs.latex}</span>`;
					}
					return true;
				},
			};
		};
	},

	addInputRules() {
		return [
			// Match $...$ but not $$...$$
			new InputRule({
				find: /(?<!\$)\$([^$\n]+)\$(?!\$)$/,
				handler: ({ state, range, match }) => {
					const latex = match[1];
					const { tr } = state;
					tr.replaceWith(range.from, range.to, this.type.create({ latex }));
				},
			}),
		];
	},
});

// Math Block Node ($$...$$)
const MathBlock = Node.create({
	name: 'mathBlock',
	group: 'block',
	atom: true,

	addAttributes() {
		return {
			latex: {
				default: '',
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'div[data-type="math-block"]',
				getAttrs: (node) => ({
					latex: node.getAttribute('data-latex') || '',
				}),
			},
		];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-type': 'math-block',
				'data-latex': node.attrs.latex,
				class: 'typedown-math typedown-math-block',
			}),
			['div', { class: 'katex-render' }],
		];
	},

	addNodeView() {
		return ({ node, editor }) => {
			const dom = document.createElement('div');
			dom.className = 'typedown-math typedown-math-block';
			dom.setAttribute('data-type', 'math-block');
			dom.setAttribute('data-latex', node.attrs.latex);
			dom.contentEditable = 'false';

			const renderMath = () => {
				try {
					katex.render(node.attrs.latex, dom, {
						throwOnError: false,
						displayMode: true,
					});
				} catch (e) {
					dom.innerHTML = `<div class="katex-error">${node.attrs.latex}</div>`;
				}
			};

			renderMath();

			// Double-click to edit
			dom.addEventListener('dblclick', () => {
				const openDialog = window.__typedownOpenMathDialog;
				if (openDialog) {
					openDialog({
						latex: node.attrs.latex,
						isBlock: true,
						onConfirm: (newLatex) => {
							if (newLatex !== node.attrs.latex) {
								const pos = editor.view.posAtDOM(dom, 0);
								editor.chain().focus().command(({ tr }) => {
									tr.setNodeMarkup(pos, undefined, { latex: newLatex });
									return true;
								}).run();
							}
						},
					});
				}
			});

			return {
				dom,
				update: (updatedNode) => {
					if (updatedNode.type.name !== 'mathBlock') {
						return false;
					}
					dom.setAttribute('data-latex', updatedNode.attrs.latex);
					try {
						katex.render(updatedNode.attrs.latex, dom, {
							throwOnError: false,
							displayMode: true,
						});
					} catch (e) {
						dom.innerHTML = `<div class="katex-error">${updatedNode.attrs.latex}</div>`;
					}
					return true;
				},
			};
		};
	},

	addInputRules() {
		return [
			// Match $$...$$ on its own line
			new InputRule({
				find: /^\$\$([^$]+)\$\$$/,
				handler: ({ state, range, match }) => {
					const latex = match[1];
					const { tr } = state;
					tr.replaceWith(range.from, range.to, this.type.create({ latex }));
				},
			}),
		];
	},

	addKeyboardShortcuts() {
		return {
			// Allow Enter after math block to create new paragraph
			Enter: ({ editor }) => {
				const { state } = editor;
				const { selection } = state;
				const { $from } = selection;
				const node = $from.node($from.depth);
				
				if (node.type.name === 'mathBlock') {
					editor.commands.insertContentAt(selection.to, { type: 'paragraph' });
					return true;
				}
				return false;
			},
		};
	},
});

// Language aliases for common variations
const langAliases = {
	html: 'html',
	xml: 'xml',
	md: 'markdown',
	commonmark: 'markdown',
	gfm: 'markdown',
	javascript: 'javascript',
	js: 'javascript',
	typescript: 'typescript',
	ts: 'typescript',
	jsx: 'jsx',
	tsx: 'tsx',
	cpp: 'cpp',
	'c++': 'cpp',
	sh: 'bash',
	shell: 'bash',
	shellscript: 'bash',
	zsh: 'bash',
	fish: 'bash',
	vue: 'vue',
	svelte: 'svelte',
	yml: 'yaml',
	py: 'python',
	rb: 'ruby',
	rs: 'rust',
	golang: 'go',
};

const tiptapBundle = {
	Editor,
	StarterKit,
	CodeBlock,
	mergeAttributes,
	Extension,
	Node,
	Mark,
	InputRule,
	Plugin,
	PluginKey,
	Decoration,
	DecorationSet,
	Markdown,
	TaskList,
	TaskItem,
	Link,
	Image,
	Table,
	TableRow,
	TableHeader,
	TableCell,
	// Math extensions
	InlineMath,
	MathBlock,
	katex,
	// Shiki-related exports
	createHighlighter,
	bundledLangs,
	langAliases,
};

try {
	if (typeof window !== 'undefined') {
		window.tiptap = tiptapBundle;
	}
	if (typeof self !== 'undefined') {
		self.tiptap = tiptapBundle;
	}
	if (typeof globalThis !== 'undefined') {
		globalThis.tiptap = tiptapBundle;
	}
} catch (error) {
	console.error('[Typedown] Error exposing Tiptap bundle:', error);
}
