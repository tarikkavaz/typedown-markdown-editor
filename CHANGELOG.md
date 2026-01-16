# Changelog

All notable changes to this project will be documented in this file.

## 1.1.4

### Added
- New `typedown.openByDefault` setting to open markdown files in WYSIWYG mode by default
- When enabled, regular click opens WYSIWYG mode; context menu offers "Open in Text Editor"
- When disabled (default), regular click opens text editor; context menu offers "Open in WYSIWYG mode"
- **Math/LaTeX Support**: Inline math (`$...$`) and block math (`$$...$$`) with KaTeX rendering
- Toolbar buttons for inserting inline and block math
- Double-click on math to edit

## 1.1.3

### Changed
- Switched from PrismJS to Shiki for code block syntax highlighting with exact VS Code theme color matching

## 1.1.2

### Fixed
- Code block syntax highlighting now automatically uses colors from your active VS Code theme.

## 1.1.1

### Added
- Table insertion dialog that prompts for row and column counts

## 1.1.0

### Changed
- Migrated from CKEditor to Tiptap for better performance and smaller bundle size

### Added
- Syntax highlighting for code blocks
- Image insertion dialog with file picker
- Link editing dialog for inserting and editing links
- Task list support with checkboxes

## 1.0.2

### Added
- Keyboard handlers to exit code blocks using Arrow Down, Arrow Up, Enter, and Escape keys
- Dynamic theme color support using VS Code CSS variables for dropdown borders, toolbar separators, HR lines, and table borders
- Automatic conversion of HTML tables to markdown table syntax when saving

### Changed
- Dropdown menus are now scrollable with proper max-height
- Theme colors now adapt dynamically to VS Code theme changes (no hardcoded colors)
- Tables are automatically converted to markdown format with proper separator rows

### Fixed
- Code block exit functionality - users can now navigate out of code blocks using keyboard
- Dropdown menu visibility - options are now properly displayed
- Dropdown menu scrolling - all options are accessible even in long lists
- Table markdown conversion - tables now output correct markdown syntax with separator rows

## 1.0.1

### Added
- Font and font size configuration options (`typedown.editor.fontFamily` and `typedown.editor.fontSize`)
- Dynamic font size updates when VS Code editor font size changes
- Context menu items in editor tab context menu for opening in WYSIWYG mode

### Changed
- Editor font size now matches VS Code's editor font size by default
- Improved font rendering for crisper text appearance (subpixel antialiasing)
- Toolbar aligned and constrained to match content area width
- Keyboard shortcut now works more reliably

### Fixed
- Toolbar alignment with content area
- Font smoothing for better readability

## 1.0.0

### Added
- WYSIWYG markdown editor powered by Tiptap
- Context menu integration in file explorer
- Command palette support
- Seamless switching between WYSIWYG and default editor modes
- Full markdown feature support (tables, images, code blocks, links, etc.)
