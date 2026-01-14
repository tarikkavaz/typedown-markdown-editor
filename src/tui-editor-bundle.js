// Entry point for bundling TUI Editor with all dependencies
// This file imports TUI Editor and exposes it as a global variable

import { Editor } from '@toast-ui/editor';
import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight';
// Import PrismJS - the plugin was designed for PrismJS, not highlight.js
import Prism from 'prismjs';

// Import PrismJS language definitions for syntax highlighting
// IMPORTANT: Order matters! Languages that extend others must be imported after their dependencies
// PrismJS core already includes: markup, css, clike, javascript

// Standalone languages (no dependencies)
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';

// JavaScript family - TypeScript and JSX both extend JavaScript (in core)
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
// TSX extends both JSX and TypeScript, so it must come after both
import 'prismjs/components/prism-tsx';

// CRITICAL: Expose toastui FIRST, before Prism, so editor can load even if Prism has errors
// With IIFE format, we need to assign directly
// The global will be available as 'toastui'
try {
	if (typeof window !== 'undefined') {
		window.toastui = { 
			Editor: Editor,
			codeSyntaxHighlight: codeSyntaxHighlight
		};
	}
	if (typeof self !== 'undefined') {
		self.toastui = { 
			Editor: Editor,
			codeSyntaxHighlight: codeSyntaxHighlight
		};
	}
	if (typeof globalThis !== 'undefined') {
		globalThis.toastui = { 
			Editor: Editor,
			codeSyntaxHighlight: codeSyntaxHighlight
		};
	}
	console.log('toastui exposed globally:', typeof window !== 'undefined' && typeof window.toastui !== 'undefined');
} catch (e) {
	console.error('Error exposing toastui globally:', e);
}

// PrismJS needs to be exposed globally for the plugin
// Wrap in try-catch so Prism errors don't prevent editor from loading
try {
	if (typeof window !== 'undefined') {
		window.Prism = Prism;
		if (typeof globalThis !== 'undefined') {
			globalThis.Prism = Prism;
		}
	}
	if (typeof self !== 'undefined') {
		self.Prism = Prism;
	}
	console.log('Prism exposed globally:', typeof window !== 'undefined' && typeof window.Prism !== 'undefined');
} catch (e) {
	console.error('Error exposing Prism globally (non-fatal):', e);
	// Don't throw - allow editor to load without syntax highlighting
}
