# Gemini Enhancer

A Chrome extension that enhances your experience with AI chat interfaces like Gemini by providing follow-up capabilities and custom slash commands. Features automatic dark/light theme support that syncs with your system preferences.

**Updated to Manifest V3** for continued Chrome support through 2025 and beyond.

## Features

### 🎨 Modern UI & Theme Support
- **Automatic Theme Detection**: Seamlessly switches between light and dark modes based on your system preferences
- **Modern Design**: Rounded corners, smooth animations, and a polished interface
- **Responsive Layout**: Optimized for different screen sizes and browser zoom levels

### 1. Follow-up Helper
- Select any text on Gemini
- Click the stylish "Follow-up" button that appears
- Automatically inserts the selected text as a quoted citation in the chat input

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

- **v1.2** - Updated to Manifest V3, removed Claude.ai support, improved clipboard API usage
- **v1.1** - Added slash commands feature with autocomplete
- **v1.0** - Initial release with follow-up helper

## Contributing

Feel free to submit issues and enhancement requests!
