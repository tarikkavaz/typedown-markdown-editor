const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Build TUI Editor bundle
esbuild
	.build({
		entryPoints: ['./src/tui-editor-bundle.js'],
		bundle: true,
		outfile: './resources/tui-editor-bundle.js',
		format: 'iife',
		platform: 'browser',
		target: ['es2017'],
		minify: true,
		sourcemap: false,
		define: {
			'process.env.NODE_ENV': '"production"',
		},
	})
	.then(() => {
		console.log('TUI Editor bundle built successfully');
		
		// Copy CSS file to resources
		const cssSource = path.resolve(__dirname, '../node_modules/@toast-ui/editor/dist/toastui-editor.css');
		const cssDest = path.resolve(__dirname, '../resources/tui-editor.css');
		const resourcesDir = path.resolve(__dirname, '../resources');
		
		if (!fs.existsSync(resourcesDir)) {
			fs.mkdirSync(resourcesDir, { recursive: true });
		}
		
		fs.copyFileSync(cssSource, cssDest);
		console.log('TUI Editor CSS copied successfully');
	})
	.catch((error) => {
		console.error('Error building TUI Editor bundle:', error);
		process.exit(1);
	});
