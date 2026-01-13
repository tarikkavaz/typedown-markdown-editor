// Entry point for bundling TUI Editor with all dependencies
// This file imports TUI Editor and exposes it as a global variable

import { Editor } from '@toast-ui/editor';

// With IIFE format, we need to assign directly
// The global will be available as 'toastui'
if (typeof window !== 'undefined') {
	window.toastui = { Editor: Editor };
}
if (typeof self !== 'undefined') {
	self.toastui = { Editor: Editor };
}
