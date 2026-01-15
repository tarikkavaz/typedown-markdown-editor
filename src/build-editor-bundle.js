const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

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
		
		const resourcesDir = path.resolve(__dirname, '../resources');
		
		if (!fs.existsSync(resourcesDir)) {
			fs.mkdirSync(resourcesDir, { recursive: true });
		}
		
		// Copy and tweak PrismJS light theme CSS
		const prismCssSource = path.resolve(__dirname, '../node_modules/prismjs/themes/prism.css');
		const prismCssDest = path.resolve(__dirname, '../resources/prism.css');
		
		if (fs.existsSync(prismCssSource)) {
			let prismCss = fs.readFileSync(prismCssSource, 'utf8');
			
			// Replace hardcoded light background with transparent (will use code block background)
			prismCss = prismCss.replace(/#f5f2f0/g, 'transparent');
			
			// Replace text-shadow that makes text hard to read
			prismCss = prismCss.replace(/text-shadow:\s*0\s+1px\s+white;/g, 'text-shadow: none !important;');
			
			// Remove padding from pre elements to eliminate inner border effect
			prismCss = prismCss.replace(/padding:\s*1em\s*;/g, 'padding: 0 !important;');
			
			fs.writeFileSync(prismCssDest, prismCss, 'utf8');
			console.log('PrismJS light theme CSS copied successfully');
		}
		
		// Copy and modify PrismJS dark theme CSS
		const prismDarkCssSource = path.resolve(__dirname, '../node_modules/prismjs/themes/prism-dark.css');
		const prismDarkCssDest = path.resolve(__dirname, '../resources/prism-dark.css');
		
		if (fs.existsSync(prismDarkCssSource)) {
			let prismDarkCss = fs.readFileSync(prismDarkCssSource, 'utf8');
			
			// Replace hardcoded dark background with transparent
			prismDarkCss = prismDarkCss.replace(/#2d2d2d/g, 'transparent');
			prismDarkCss = prismDarkCss.replace(/#1e1e1e/g, 'transparent');
			
			// Remove padding from pre elements to eliminate inner border effect
			prismDarkCss = prismDarkCss.replace(/padding:\s*1em\s*;/g, 'padding: 0 !important;');
			
			// Remove box-shadow from code blocks
			prismDarkCss = prismDarkCss.replace(/box-shadow:\s*[^;]+;/g, 'box-shadow: none !important;');
			
			fs.writeFileSync(prismDarkCssDest, prismDarkCss, 'utf8');
			console.log('PrismJS dark theme CSS copied successfully');
		}
	})
	.catch((error) => {
		console.error('Error building Tiptap bundle:', error);
		process.exit(1);
	});
