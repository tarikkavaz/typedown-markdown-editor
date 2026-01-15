const esbuild = require('esbuild');

// Build Tiptap editor bundle
esbuild
	.build({
		entryPoints: ['./src/tiptap-bundle.js'],
		bundle: true,
		outfile: './resources/tiptap-bundle.js',
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
		console.log('Tiptap bundle built successfully');
	})
	.catch((error) => {
		console.error('Error building Tiptap bundle:', error);
		process.exit(1);
	});
