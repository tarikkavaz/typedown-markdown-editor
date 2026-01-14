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
		
		// Path to Prism One theme files (absolute path to Downloads folder)
		const prismOneLightSource = '/Users/tarik/Downloads/prism-one-light.css';
		const prismOneDarkSource = '/Users/tarik/Downloads/prism-one-dark.css';
		
		// Copy and modify PrismJS light theme CSS with Prism One Light colors
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
			
			// Apply Prism One Light colors if theme file exists
			if (fs.existsSync(prismOneLightSource)) {
				try {
					const oneLightCss = fs.readFileSync(prismOneLightSource, 'utf8');
					
					// Extract colors from Prism One Light theme
					const colors = {
						comment: 'hsl(230, 4%, 64%)', // Comments
						punctuation: 'hsl(230, 8%, 24%)', // Punctuation/Doctype/Entity
						attrName: 'hsl(35, 99%, 36%)', // Attr-name/Class-name/Boolean/Constant/Number/Atrule
						keyword: 'hsl(301, 63%, 40%)', // Keywords
						property: 'hsl(5, 74%, 59%)', // Property/Tag/Symbol/Deleted/Important
						string: 'hsl(119, 34%, 47%)', // Selector/String/Char/Builtin/Inserted/Regex/Attr-value
						variable: 'hsl(221, 87%, 60%)', // Variable/Operator/Function
						url: 'hsl(198, 99%, 37%)', // URL
					};
					
					// Replace color values in light theme CSS
					// Comments - slategray
					prismCss = prismCss.replace(/slategray/g, colors.comment);
					
					// Punctuation - #999
					prismCss = prismCss.replace(/color:\s*#999/g, `color: ${colors.punctuation}`);
					
					// Properties/Tags/etc - #905
					prismCss = prismCss.replace(/#905/g, colors.property);
					
					// Strings - #690
					prismCss = prismCss.replace(/#690/g, colors.string);
					
					// Operators - #9a6e3a
					prismCss = prismCss.replace(/#9a6e3a/g, colors.variable);
					
					// Keywords - #07a
					prismCss = prismCss.replace(/#07a/g, colors.keyword);
					
					// Functions - #DD4A68
					prismCss = prismCss.replace(/#DD4A68/g, colors.variable);
					
					// Variables/Regex - #e90
					prismCss = prismCss.replace(/#e90/g, colors.string);
					
					// Add custom overrides for Prism One Light theme
					prismCss += `\n\n/* Prism One Light Theme Color Overrides */\n`;
					prismCss += `.token.comment,\n.token.prolog,\n.token.cdata {\n\tcolor: ${colors.comment};\n}\n`;
					prismCss += `.token.doctype,\n.token.punctuation,\n.token.entity {\n\tcolor: ${colors.punctuation};\n}\n`;
					prismCss += `.token.attr-name,\n.token.class-name,\n.token.boolean,\n.token.constant,\n.token.number,\n.token.atrule {\n\tcolor: ${colors.attrName};\n}\n`;
					prismCss += `.token.keyword {\n\tcolor: ${colors.keyword};\n}\n`;
					prismCss += `.token.property,\n.token.tag,\n.token.symbol,\n.token.deleted,\n.token.important {\n\tcolor: ${colors.property};\n}\n`;
					prismCss += `.token.selector,\n.token.string,\n.token.char,\n.token.builtin,\n.token.inserted,\n.token.regex,\n.token.attr-value {\n\tcolor: ${colors.string};\n}\n`;
					prismCss += `.token.variable,\n.token.operator,\n.token.function {\n\tcolor: ${colors.variable};\n}\n`;
					prismCss += `.token.url {\n\tcolor: ${colors.url};\n}\n`;
					
					console.log('Prism One Light theme colors applied');
				} catch (error) {
					console.warn('Failed to apply Prism One Light theme colors:', error.message);
				}
			}
			
			fs.writeFileSync(prismCssDest, prismCss, 'utf8');
			console.log('PrismJS light theme CSS copied and modified successfully');
		}
		
		// Copy and modify PrismJS dark theme CSS with K Material theme colors
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
			
			// Apply Prism One Dark colors if theme file exists
			if (fs.existsSync(prismOneDarkSource)) {
				try {
					const oneDarkCss = fs.readFileSync(prismOneDarkSource, 'utf8');
					
					// Extract colors from Prism One Dark theme
					const colors = {
						comment: 'hsl(220, 10%, 40%)', // Comments
						punctuation: 'hsl(220, 14%, 71%)', // Punctuation/Doctype/Entity
						attrName: 'hsl(29, 54%, 61%)', // Attr-name/Class-name/Boolean/Constant/Number/Atrule
						keyword: 'hsl(286, 60%, 67%)', // Keywords
						property: 'hsl(355, 65%, 65%)', // Property/Tag/Symbol/Deleted/Important
						string: 'hsl(95, 38%, 62%)', // Selector/String/Char/Builtin/Inserted/Regex/Attr-value
						variable: 'hsl(207, 82%, 66%)', // Variable/Operator/Function
						url: 'hsl(187, 47%, 55%)', // URL
					};
					
					// Replace HSL and hex color values directly, then add overrides
					// Comments - hsl(30, 20%, 50%)
					prismDarkCss = prismDarkCss.replace(/hsl\(30,\s*20%,\s*50%\)/g, colors.comment);
					
					// Properties/Tags/etc - hsl(350, 40%, 70%)
					prismDarkCss = prismDarkCss.replace(/hsl\(350,\s*40%,\s*70%\)/g, colors.property);
					
					// Strings - hsl(75, 70%, 60%)
					prismDarkCss = prismDarkCss.replace(/hsl\(75,\s*70%,\s*60%\)/g, colors.string);
					
					// Operators/Variables - hsl(40, 90%, 60%)
					prismDarkCss = prismDarkCss.replace(/hsl\(40,\s*90%,\s*60%\)/g, colors.variable);
					
					// Regex/Important - #e90
					prismDarkCss = prismDarkCss.replace(/#e90/g, colors.string);
					
					// Deleted - red
					prismDarkCss = prismDarkCss.replace(/\bcolor:\s*red\b/g, `color: ${colors.property}`);
					
					// Punctuation - replace opacity with color
					prismDarkCss = prismDarkCss.replace(
						/\.token\.punctuation\s*\{[\s\S]*?opacity:\s*[^;]+;[\s\S]*?\}/g,
						`.token.punctuation {\n\tcolor: ${colors.punctuation};\n\topacity: 1;\n}`
					);
					
					// Namespace - replace opacity with color
					prismDarkCss = prismDarkCss.replace(
						/\.token\.namespace\s*\{[\s\S]*?opacity:\s*[^;]+;[\s\S]*?\}/g,
						`.token.namespace {\n\tcolor: ${colors.punctuation};\n\topacity: 1;\n}`
					);
					
					// Add custom overrides for Prism One Dark theme
					prismDarkCss += `\n\n/* Prism One Dark Theme Color Overrides */\n`;
					prismDarkCss += `.token.comment,\n.token.prolog,\n.token.cdata {\n\tcolor: ${colors.comment};\n}\n`;
					prismDarkCss += `.token.doctype,\n.token.punctuation,\n.token.entity {\n\tcolor: ${colors.punctuation};\n}\n`;
					prismDarkCss += `.token.attr-name,\n.token.class-name,\n.token.boolean,\n.token.constant,\n.token.number,\n.token.atrule {\n\tcolor: ${colors.attrName};\n}\n`;
					prismDarkCss += `.token.keyword {\n\tcolor: ${colors.keyword};\n}\n`;
					prismDarkCss += `.token.property,\n.token.tag,\n.token.symbol,\n.token.deleted,\n.token.important {\n\tcolor: ${colors.property};\n}\n`;
					prismDarkCss += `.token.selector,\n.token.string,\n.token.char,\n.token.builtin,\n.token.inserted,\n.token.regex,\n.token.attr-value {\n\tcolor: ${colors.string};\n}\n`;
					prismDarkCss += `.token.variable,\n.token.operator,\n.token.function {\n\tcolor: ${colors.variable};\n}\n`;
					prismDarkCss += `.token.url {\n\tcolor: ${colors.url};\n}\n`;
					
					console.log('Prism One Dark theme colors applied');
				} catch (error) {
					console.warn('Failed to apply Prism One Dark theme colors:', error.message);
				}
			}
			
			fs.writeFileSync(prismDarkCssDest, prismDarkCss, 'utf8');
			console.log('PrismJS dark theme CSS copied and modified successfully');
		}
		
		// Copy plugin CSS
		const pluginCssSource = path.resolve(__dirname, '../node_modules/@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css');
		const pluginCssDest = path.resolve(__dirname, '../resources/toastui-editor-plugin-code-syntax-highlight.css');
		
		if (fs.existsSync(pluginCssSource)) {
			fs.copyFileSync(pluginCssSource, pluginCssDest);
			console.log('Plugin CSS copied successfully');
		}
	})
	.catch((error) => {
		console.error('Error building TUI Editor bundle:', error);
		process.exit(1);
	});
