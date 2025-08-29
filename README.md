# Gemini Enhancer

A Chrome extension that enhances your experience with AI chat interfaces like Gemini by providing follow-up capabilities and custom slash commands. Features automatic dark/light theme support that syncs with your system preferences.

**Updated to Manifest V3** for continued Chrome support through 2025 and beyond.

v1.7: Polished native-feel UI, improved reliability (no duplicate injections on SPA navigations), accessible slash command dropdown (ARIA roles, keyboard-friendly), non-blocking toasts instead of alerts, autosave on tab hide, and robust dark/light styling (removed unsupported light-dark()).

## Features

### 🎨 Modern UI & Theme Support
- **Automatic Theme Detection**: Seamlessly switches between light and dark modes based on your system preferences
- **Modern Design**: Rounded corners, smooth animations, and a polished interface
- **Responsive Layout**: Optimized for different screen sizes and browser zoom levels
 - **Native Feel**: Controls use Chrome/Gemini-like spacing, shadows, and focus rings

### 1. Follow-up Helper
- Select any text on Gemini
- Choose from three action buttons that appear: "Ask about this", "Explain further", or "Give examples"
- Each button automatically generates an appropriate prompt and inserts it into the chat input
- No more manual typing - just select text and click your preferred action!

### 2. Slash Commands
Create custom shortcuts for frequently used prompts! Type `/` followed by your command name to quickly insert predefined prompts.

#### Default Commands
The extension comes with useful default commands:

- `/translate` - Translate text to English
- `/explain` - Explain concepts in simple terms  
- `/improve` - Improve writing and clarity
- `/summarize` - Provide concise summaries
- `/code` - Explain how code works
- `/debug` - Help debug code and find issues
- `/review` - Review text for grammar and style
- `/creative` - Use text as creative inspiration

#### How to Use Slash Commands

1. **Basic Usage**: Type `/` in any chat input to see available commands
2. **With Selected Text**: Select text first, then type a slash command - the `{text}` placeholder will be automatically replaced
3. **Navigation**: Use arrow keys to navigate the autocomplete menu
4. **Selection**: Press Enter or Tab to select a command

#### Managing Commands

Click the extension icon to open the Slash Commands manager where you can:

- View all your custom commands
- Add new commands with custom prompts
- Delete existing commands
 - Edit commands in place
 - Import/Export command sets as JSON
- Use `{text}` placeholder in prompts to insert selected text

#### Creating Custom Commands

1. Click the extension icon in your browser toolbar
2. Enter a command name (letters and numbers only)
3. Enter your prompt template
4. Use `{text}` where you want selected text to be inserted
5. Click "Add Command"

**Example Custom Commands:**
- Command: `meeting` → Prompt: `Summarize this meeting transcript and extract key action items: {text}`
- Command: `email` → Prompt: `Rewrite this email to be more professional and concise: {text}`
- Command: `bug` → Prompt: `Analyze this error message and suggest solutions: {text}`

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will be active on Gemini

## Permissions

- **activeTab**: To interact with chat interfaces
- **scripting**: To inject the follow-up and slash command functionality  
- **storage**: To save your custom slash commands

## Compatibility

- **Gemini**: gemini.google.com
- Works with various input types (contenteditable divs, textareas)

## Development

The extension consists of:

- `manifest.json` - Extension configuration (Manifest V3)
- `content.js` - Main functionality for both features
- `popup.html/js` - Slash command management interface
- `styles.css` - Styling for UI elements

## Version History

- **v1.4** - Enhanced follow-up system with three action buttons: "Ask about this", "Explain further", "Give examples"
- **v1.3** - Enhanced Gemini Enhancer with Wide Mode and UI improvements 
- **v1.2** - Updated to Manifest V3, removed Claude.ai support, improved clipboard API usage
- **v1.1** - Added slash commands feature with autocomplete
- **v1.0** - Initial release with follow-up helper

## Contributing

Feel free to submit issues and enhancement requests!
