// Entry point for bundling TUI Editor with all dependencies
// This file imports TUI Editor and exposes it as a global variable

import { Editor } from '@toast-ui/editor';
import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight';
// Import PrismJS - the plugin was designed for PrismJS, not highlight.js
import Prism from 'prismjs';

// PrismJS needs to be exposed globally for the plugin
if (typeof window !== 'undefined') {
	window.Prism = Prism;
	if (typeof globalThis !== 'undefined') {
		globalThis.Prism = Prism;
	}
}
if (typeof self !== 'undefined') {
	self.Prism = Prism;
}

// With IIFE format, we need to assign directly
// The global will be available as 'toastui'
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
