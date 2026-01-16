// Entry point for bundling Tiptap editor with dependencies
// Exposes Tiptap and Shiki globally for the webview init script

import { Editor, mergeAttributes, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader as BaseTableHeader } from '@tiptap/extension-table-header';
import { TableCell as BaseTableCell } from '@tiptap/extension-table-cell';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Import Shiki core with JavaScript engine (no WASM - works with CSP restrictions)
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// Import bundled languages (core set only to reduce bundle size)
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import html from 'shiki/langs/html.mjs';
import css from 'shiki/langs/css.mjs';
import json from 'shiki/langs/json.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import python from 'shiki/langs/python.mjs';
import bash from 'shiki/langs/bash.mjs';
import sql from 'shiki/langs/sql.mjs';

// Extended TableHeader with textAlign support for markdown alignment
const TableHeader = BaseTableHeader.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			textAlign: {
				default: null,
				parseHTML: (element) => {
					const style = element.getAttribute('style') || '';
					const match = style.match(/text-align:\s*(left|center|right)/i);
					return match ? match[1].toLowerCase() : null;
				},
				renderHTML: (attributes) => {
					if (!attributes.textAlign) {
						return {};
					}
					return { style: `text-align: ${attributes.textAlign}` };
				},
			},
		};
	},
});

// Extended TableCell with textAlign support for markdown alignment
const TableCell = BaseTableCell.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			textAlign: {
				default: null,
				parseHTML: (element) => {
					const style = element.getAttribute('style') || '';
					const match = style.match(/text-align:\s*(left|center|right)/i);
					return match ? match[1].toLowerCase() : null;
				},
				renderHTML: (attributes) => {
					if (!attributes.textAlign) {
						return {};
					}
					return { style: `text-align: ${attributes.textAlign}` };
				},
			},
		};
	},
});

// Bundled languages for Shiki (core set)
const bundledLangs = [
	javascript, typescript,
	html, css, json, yaml, markdown,
	python, bash, sql
];

// Create highlighter with JavaScript engine (CSP-compatible)
async function createHighlighter(options) {
	return createHighlighterCore({
		engine: createJavaScriptRegexEngine(),
		...options,
	});
}

// Language aliases for common variations
const langAliases = {
	html: 'html',
	htm: 'html',
	md: 'markdown',
	commonmark: 'markdown',
	gfm: 'markdown',
	javascript: 'javascript',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	typescript: 'typescript',
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	sh: 'bash',
	shell: 'bash',
	shellscript: 'bash',
	zsh: 'bash',
	yml: 'yaml',
	py: 'python',
	python3: 'python',
};

const tiptapBundle = {
	Editor,
	StarterKit,
	CodeBlock,
	mergeAttributes,
	Extension,
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
