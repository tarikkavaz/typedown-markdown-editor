# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - Initial Release

### Added
- WYSIWYG markdown editor powered by CKEditor5
- Context menu integration in file explorer
- Command palette support
- Seamless switching between WYSIWYG and default editor modes
- Full markdown feature support (tables, images, code blocks, links, etc.)


## [1.0.1] - 2025-01-25

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
