# Typedown - Markdown WYSIWYG Editor

A powerful WYSIWYG (What You See Is What You Get) editor for Markdown files in VS Code and Cursor. Edit your Markdown files with a visual, rich-text interface powered by Tiptap.

## Features

- **WYSIWYG Editing**: Edit Markdown files with a visual, rich-text editor
- **Syntax Highlighting**: PrismJS-powered code block highlighting for 16+ languages
- **Context Menu Access**: Right-click on `.md` files in the explorer to open in WYSIWYG mode
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Full Markdown Support**: All standard markdown features including tables, images, code blocks, links, task lists, and more
- **Seamless Integration**: Switch between WYSIWYG and plain text modes easily
- **Fast Loading**: Optimized bundle for instant editor initialization

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Opening Files in WYSIWYG Mode](#opening-files-in-wysiwyg-mode)
  - [Command Palette](#command-palette)
- [Configuration](#configuration)
- [Requirements](#requirements)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Known Issues](#known-issues)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)

## Installation

### Via VS Code Extensions Marketplace

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Typedown - Markdown WYSIWYG Editor"
4. Click Install

### Via Command Line (VS Code)

For Visual Studio Code (Microsoft Marketplace):

```bash
code --install-extension tarikkavaz.typedown-markdown-editor
```

### Via Open VSX Registry

For VSCodium or other VS Code forks using Open VSX Registry:

```bash
codium --install-extension tarikkavaz.typedown-markdown-editor
```

Or using the `ovsx` CLI tool:

```bash
ovsx install tarikkavaz.typedown-markdown-editor
```

You can also install directly from the [Open VSX Registry](https://open-vsx.org/) in the Extensions view.

## Usage

### Opening Files in WYSIWYG Mode

You can open Markdown files in WYSIWYG mode in several ways:

1. **File Explorer Context Menu**: Right-click on any `.md` file in the explorer and select "Open in WYSIWYG mode"
2. **Editor Tab Context Menu**: Right-click on a markdown file tab and select "Open in WYSIWYG mode"
3. **Command Palette**: Use the Command Palette to open files in WYSIWYG mode
4. **Keyboard Shortcut**: Use the keyboard shortcut (see below)

### Command Palette

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Open in WYSIWYG mode"
3. Select the command to open the active Markdown file in WYSIWYG mode

### Keyboard Shortcut

- **Mac**: `Ctrl+Option+Command+M`
- **Windows/Linux**: `Ctrl+Alt+M`

Opens the active markdown file in WYSIWYG mode, or switches back to the default editor if already in WYSIWYG mode.

## Configuration

You can customize the editor appearance and behavior through VS Code settings.

### Font Family

Set a custom font family for the markdown editor:

```json
{
  "typedown.editor.fontFamily": "Consolas"
}
```

Or use multiple fonts with fallbacks:

```json
{
  "typedown.editor.fontFamily": "'Fira Code', 'Courier New', monospace"
}
```

If not set, the editor will use VS Code's `editor.fontFamily` setting.

### Font Size

Set a custom font size for the markdown editor:

```json
{
  "typedown.editor.fontSize": 16
}
```

If not set, the editor will use VS Code's `editor.fontSize` setting (default: 14).

### Code Block Font Family

Set a custom font family for code blocks:

```json
{
  "typedown.editor.codeBlockfontFamily": "'Fira Code', monospace"
}
```

### Editor Width

Set the maximum width of the editor content area:

```json
{
  "typedown.editor.width": "120ch"
}
```

Default is `91ch`. Accepts any valid CSS width value (e.g., `800px`, `100%`).

### Custom Prism Theme

Use a custom PrismJS theme for syntax highlighting:

```json
{
  "typedown.editor.prismThemePath": "/path/to/custom-prism-theme.css"
}
```

### Example Configuration

Here's a complete example configuration:

```json
{
  "typedown.editor.fontFamily": "'Fira Code', monospace",
  "typedown.editor.fontSize": 16,
  "typedown.editor.codeBlockfontFamily": "'JetBrains Mono', monospace",
  "typedown.editor.width": "100ch"
}
```

**Note**: Changes to these settings will be applied immediately when you open or switch to a markdown file in WYSIWYG mode.

## Requirements

- VS Code or Cursor version 1.32.0 or higher

## Troubleshooting

### WYSIWYG Editor Not Opening

**Problem**: The WYSIWYG editor doesn't open when you click the context menu or use the command.

**Solutions**:
- Ensure the file has a `.md` extension
- Reload the VS Code window (`Ctrl+R` / `Cmd+R` or `Ctrl+Shift+P` → "Developer: Reload Window")
- Verify the extension is installed and enabled
- Check the Output panel for extension errors (`View` → `Output` → select "Typedown" from dropdown)

### Editor Content Not Saving

**Problem**: Changes made in WYSIWYG mode are not being saved.

**Solutions**:
- Ensure the file is saved (check for unsaved indicator in the tab)
- The editor automatically syncs with the file system - try switching back to default editor and then back to WYSIWYG
- Check file permissions
- Look for errors in the Output panel

### Context Menu Not Appearing

**Problem**: The "Open in WYSIWYG mode" option doesn't appear in the context menu.

**Solutions**:
- Reload the VS Code window (`Ctrl+R` / `Cmd+R`)
- Verify the extension is installed and enabled
- Check that you're right-clicking on a `.md` file (not a folder)
- Ensure the file is saved to disk

## FAQ

### What is WYSIWYG?

WYSIWYG stands for "What You See Is What You Get". It means you can edit your Markdown files visually, seeing the formatted output as you type, rather than seeing the raw Markdown syntax.

### Can I use this extension with any Markdown file?

Yes! The extension works with any file that has a `.md` extension. It automatically detects Markdown files and provides the WYSIWYG editing option.

### Does the extension support all Markdown features?

The extension uses Tiptap and supports standard Markdown features including:
- Headings (H1-H6)
- Bold, italic, and strikethrough text
- Lists (ordered, unordered, and task lists)
- Links
- Images
- Code blocks with syntax highlighting
- Tables
- Blockquotes
- Horizontal rules

### What programming languages are supported for syntax highlighting?

The editor includes syntax highlighting for:
JavaScript, TypeScript, JSX, TSX, Python, Java, C, C++, Go, Rust, HTML, CSS, JSON, YAML, SQL, Bash/Shell, Markdown, and Diff.

### Does the extension work with unsaved files?

The extension works best with saved files. For unsaved files, you may need to save them first before opening in WYSIWYG mode.

## Known Issues

- The extension requires files to be saved to disk for best compatibility
- Large Markdown files may experience performance issues in WYSIWYG mode

## Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository** and create your feature branch (`git checkout -b feature/AmazingFeature`)
2. **Make your changes** following the existing code style
3. **Test your changes** on multiple platforms if possible
4. **Commit your changes** with clear commit messages (`git commit -m 'Add some AmazingFeature'`)
5. **Push to the branch** (`git push origin feature/AmazingFeature`)
6. **Open a Pull Request**

### Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build the editor bundle: `pnpm run build:editor`
4. Open the folder in VS Code
5. Press `F5` to open a new Extension Development Host window
6. Make changes and test in the development window

### Reporting Bugs

Please use the [GitHub Issues](https://github.com/tarikkavaz/typedown-markdown-editor/issues) page to report bugs. Include:
- VS Code version
- Operating system
- Extension version
- Steps to reproduce
- Expected vs actual behavior

## Support

- **Issues**: [GitHub Issues](https://github.com/tarikkavaz/typedown-markdown-editor/issues)
- **Repository**: [GitHub Repository](https://github.com/tarikkavaz/typedown-markdown-editor)
- **VS Code Marketplace**: [Extension Page](https://marketplace.visualstudio.com/items?itemName=tarikkavaz.typedown-markdown-editor)
- **Open VSX Registry**: [Extension Page](https://open-vsx.org/extension/tarikkavaz/typedown-markdown-editor)

If you find this extension helpful, please consider giving it a star on GitHub!

## License

MIT
