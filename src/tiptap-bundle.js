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

// PrismJS language definitions
// Core includes: markup, css, clike, javascript
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-json5';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-php-extras';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-git';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-regex';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-xml-doc';
import 'prismjs/components/prism-asciidoc';
import 'prismjs/components/prism-latex';
import 'prismjs/components/prism-rest';
import 'prismjs/components/prism-handlebars';
import 'prismjs/components/prism-ejs';
import 'prismjs/components/prism-pug';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-apacheconf';
import 'prismjs/components/prism-mongodb';
import 'prismjs/components/prism-elixir';
import 'prismjs/components/prism-haskell';
import 'prismjs/components/prism-julia';
import 'prismjs/components/prism-groovy';
import 'prismjs/components/prism-wasm';
import 'prismjs/components/prism-zig';

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
	csharp: 'csharp',
	'c#': 'csharp',
	objectivec: 'objectivec',
	'objective-c': 'objectivec',
	objc: 'objectivec',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	fish: 'bash',
	dockerfile: 'docker',
	docker: 'docker',
	nginxconf: 'nginx',
	apache: 'apacheconf',
	env: 'ini',
	dotenv: 'ini',
	vue: 'markup',
	svelte: 'markup',
	astro: 'markup',
	prisma: 'graphql',
	wat: 'wasm',
	graphql: 'graphql',
	mongo: 'mongodb',
	mongodb: 'mongodb',
	rst: 'rest',
	asciidoc: 'asciidoc',
	latex: 'latex',
	tex: 'latex',
	wasm: 'wasm',
	makefile: 'makefile',
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
