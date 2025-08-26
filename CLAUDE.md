# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gemini Enhancer is a Chrome extension that enhances the user experience on gemini.google.com with three main features:

1. **Follow-up Helper**: Allows users to select text from AI responses and create follow-up questions with proper citation formatting
2. **Slash Commands**: Custom shortcuts for frequently used prompts with intelligent autocomplete
3. **Wide Mode**: Expands Gemini's interface width (800px - 2000px) for better readability on large screens

## Repository Structure

The active codebase is located in the `Chrome/` directory:
- `Chrome/manifest.json` - Chrome Manifest V3 configuration
- `Chrome/content.js` - Main content script (1600+ lines) with all core functionality
- `Chrome/popup.html/js` - Extension popup UI for managing settings
- `Chrome/styles.css` - Native Gemini-style CSS with theme support

**Note**: Safari-related files in git status are being removed (marked for deletion).

## Architecture

This is a vanilla JavaScript Chrome extension with **no build process**. Key architectural patterns:

### Content Script (`content.js`)
- **AI Response Detection**: Multi-layer system to distinguish AI responses from user input using DOM analysis, proximity detection, and content patterns
- **Follow-up System**: Creates native-style floating buttons with smart positioning and 5-second stability timeouts
- **Slash Commands**: Real-time autocomplete with keyboard navigation and command insertion
- **Wide Mode**: CSS injection system targeting Gemini's layout containers
- **Auto-save**: Preserves user input across page reloads with URL-specific storage

### Browser Compatibility
- Safari/Chrome API compatibility layer: `const browserAPI = typeof browser !== 'undefined' ? browser : chrome;`
- Primary target: Chrome (Manifest V3)
- Host permissions: `*://gemini.google.com/*`

### Storage Architecture
- **Sync Storage**: Slash commands and wide mode settings (cross-device)
- **Local Storage**: Auto-save content (device-specific)
- Real-time synchronization between popup and content script

## Development Commands

**Testing**: Load unpacked extension at `chrome://extensions/` with Developer mode enabled
**Installation**: Load the entire `Chrome/` folder as unpacked extension
**Debugging**: Use Chrome DevTools console for content script logs

## Key Implementation Details

### Follow-up Detection Logic
The extension uses sophisticated heuristics to only show follow-up buttons for AI-generated content:
- DOM structure analysis (data attributes, CSS classes)
- Proximity detection to input areas (adaptive distance thresholds)
- Content pattern matching (AI vs user language patterns)
- Technical term detection for short selections

### Slash Command System
- Triggers on `/` character with real-time matching
- Native-style dropdown with keyboard navigation (↑↓ arrows, Enter/Tab to select)
- Template system with `{text}` placeholder for selected text
- Default commands: `/translate`, `/explain`, `/improve`, `/summarize`, `/code`, `/debug`, `/review`, `/creative`

### Wide Mode Implementation
- CSS injection targeting Gemini's responsive breakpoints
- Interval-based reapplication (every 2 seconds) for dynamic content
- Navigation-aware updates using history API hooks
- Viewport boundary detection with responsive fallbacks

## Permissions

- `activeTab`: Interact with chat interfaces
- `storage`: Save custom commands and settings
- `tabs`: Send messages between popup and content script

## Browser Support

- Chrome (Manifest V3) - Primary target
- Host permission: `*://gemini.google.com/*`
- No external dependencies or build tools required