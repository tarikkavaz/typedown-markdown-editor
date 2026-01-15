// Entry point for bundling Tiptap editor with dependencies
// Exposes Tiptap and Prism globally for the webview init script

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
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import Prism from 'prismjs';

// PrismJS language definitions - core essentials only for fast loading
// Core includes: markup, css, clike, javascript
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-diff';

const prismAliases = {
	html: 'markup',
	xml: 'markup',
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
	zsh: 'bash',
	fish: 'bash',
	vue: 'markup',
	svelte: 'markup',
	astro: 'markup',
	yml: 'yaml',
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
};

try {
	Object.keys(prismAliases).forEach((alias) => {
		const target = prismAliases[alias];
		if (Prism.languages[target] && !Prism.languages[alias]) {
			Prism.languages[alias] = Prism.languages[target];
		}
	});

	if (typeof window !== 'undefined') {
		window.tiptap = tiptapBundle;
		window.Prism = Prism;
	}
	if (typeof self !== 'undefined') {
		self.tiptap = tiptapBundle;
		self.Prism = Prism;
	}
	if (typeof globalThis !== 'undefined') {
		globalThis.tiptap = tiptapBundle;
		globalThis.Prism = Prism;
	}
	// Disable automatic highlighting. We'll trigger it manually.
	if (Prism) {
		Prism.manual = true;
	}
	console.log('Tiptap bundle exposed globally');
} catch (error) {
	console.error('Error exposing Tiptap bundle:', error);
}
