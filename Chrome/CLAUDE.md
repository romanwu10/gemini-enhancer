# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Gemini Enhancer" that provides three main features for enhancing the Gemini chat interface:
1. **Follow-up Helper**: Allows users to select text and create follow-up questions
2. **Slash Commands**: Custom shortcuts for frequently used prompts with autocomplete
3. **Wide Mode**: Expands Gemini's interface width for better readability on large screens

## Architecture

The extension uses Chrome Manifest V3 and consists of:

- **Content Script** (`content.js`): Main functionality injected into gemini.google.com
  - Follow-up button creation and positioning
  - Slash command autocomplete system  
  - Auto-save functionality for input preservation
  - Safari/Chrome browser API compatibility layer
- **Popup Interface** (`popup.html/js`): Chrome-native management UI for slash commands
- **Storage**: Chrome sync storage for slash commands, local storage for auto-save
- **Styling** (`styles.css`): UI theming with automatic dark/light mode detection

## Key Components

### Follow-up System
- Monitors text selection on Gemini pages with debounced performance optimization  
- **AI Response Detection**: Only shows button for text selected from Gemini's responses, not user input
- Creates native-style floating "Follow-up" button above selected text
- Google Material Design styling matching Gemini's interface
- Smart positioning with viewport boundary detection
- Smooth animations and transitions
- Minimum 3-character selection threshold - supports single words and short phrases
- Multi-layer detection system:
  - DOM structure analysis (data attributes, CSS classes, element hierarchy)
  - Proximity detection to input areas (adaptive distance based on selection length)
  - Content pattern analysis (AI vs user language patterns)
  - Technical term detection (camelCase, CONSTANT_CASE, capitalized words)
  - Adaptive thresholds for short vs long selections
- Inserts quoted text with citation formatting into chat input
- 5-second stability timeout with hover protection
- Responsive to selection changes with smooth position updates

### Wide Mode
- Toggle switch in popup to enable/disable wide mode
- Adjustable width slider (800px - 2000px range)
- Chrome-native toggle switch and slider styling
- Real-time width adjustment with immediate visual feedback
- CSS injection system that targets Gemini's main containers
- Responsive design with viewport-based fallbacks
- Persistent settings via Chrome sync storage
- Navigation-aware reapplication for single-page app behavior

### Slash Commands
- Default commands: `/translate`, `/explain`, `/improve`, `/summarize`, `/code`, `/debug`, `/review`, `/creative`
- Native-style autocomplete dropdown with Gemini's design patterns
- Enhanced keyboard navigation with smooth scrolling
- Rich preview showing command descriptions
- Smooth animations matching Google's Material Design
- Text replacement using `{text}` placeholder
- Real-time storage synchronization

### Auto-save Feature
- Monitors input field changes
- Saves content to local storage
- Restores content on page reload
- URL-specific storage keys

## Development Commands

This is a vanilla JavaScript Chrome extension with no build process. Key development tasks:

- **Testing**: Load unpacked extension in `chrome://extensions/` with Developer mode enabled
- **Debugging**: Use Chrome DevTools console for content script logs
- **Installation**: Load the entire Chrome folder as an unpacked extension

## Browser Compatibility

- Primary target: Chrome (Manifest V3)
- Secondary: Safari support via browser API compatibility layer
- Host permissions: `*://gemini.google.com/*`

## Storage Architecture

- **Sync Storage**: Slash commands (shared across devices)
- **Local Storage**: Auto-save content (device-specific)
- **Storage listeners**: Real-time updates between popup and content script