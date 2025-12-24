# Typedown - Markdown WYSIWYG Editor

A powerful WYSIWYG (What You See Is What You Get) editor for Markdown files in VS Code and Cursor. Edit your Markdown files with a visual, rich-text interface powered by CKEditor.

## Features

- **WYSIWYG Editing**: Edit Markdown files with a visual, rich-text editor
- **Context Menu Access**: Right-click on `.md` files in the explorer to open in WYSIWYG mode
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Full Markdown Support**: All standard markdown features including tables, images, code blocks, links, and more
- **Seamless Integration**: Switch between WYSIWYG and plain text modes easily

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Opening Files in WYSIWYG Mode](#opening-files-in-wysiwyg-mode)
  - [Command Palette](#command-palette)
- [Requirements](#requirements)
- [Development](#development)
  - [Building](#building)
  - [Watch Mode](#watch-mode)
  - [Packaging](#packaging)
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
2. **Command Palette**: Use the Command Palette to open files in WYSIWYG mode

### Command Palette

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Open in WYSIWYG mode"
3. Select the command to open the active Markdown file in WYSIWYG mode

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

The extension uses CKEditor and supports standard Markdown features including:
- Headings
- Bold and italic text
- Lists (ordered and unordered)
- Links
- Images
- Code blocks
- Tables
- Blockquotes

### Does the extension work with unsaved files?

The extension works best with saved files. For unsaved files, you may need to save them first before opening in WYSIWYG mode.

## Known Issues

- The extension requires files to be saved to disk for best compatibility
- Some advanced Markdown features may not be fully supported depending on CKEditor's capabilities
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
2. Install dependencies: `npm install`
3. Open the folder in VS Code
4. Press `F5` to open a new Extension Development Host window
5. Make changes and test in the development window

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
