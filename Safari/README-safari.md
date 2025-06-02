# Gemini Enhancer - Safari Extension

A Safari browser extension that enhances your experience with AI chat interfaces like Gemini by adding custom slash commands and follow-up functionality.

## Safari-Specific Features

This Safari version includes optimizations and compatibility improvements specifically for Safari:

- **Native Safari API Support**: Uses `browser.*` APIs with Chrome fallback
- **Safari Performance Optimizations**: Enhanced event handling and DOM manipulation
- **Safari Design Language**: Follows Apple's design guidelines with native Safari styling
- **Accessibility Enhancements**: Improved support for VoiceOver and other assistive technologies
- **LocalStorage Fallback**: Graceful degradation if extension APIs are unavailable

## Installation

### For Safari on macOS

1. **Enable Developer Features**:
   - Open Safari
   - Go to Safari > Preferences > Advanced
   - Check "Show Develop menu in menu bar"

2. **Load the Extension**:
   - Open Safari
   - Go to Develop > Allow Unsigned Extensions
   - Go to Safari > Preferences > Extensions
   - Click the "+" button and select the extension folder
   - Enable "Gemini Enhancer"

### File Structure for Safari

```
Gemini-Enhancer-Safari/
├── manifest-safari.json     # Safari-specific manifest
├── content-safari.js        # Safari-optimized content script
├── popup-safari.html        # Safari-styled popup interface
├── popup-safari.js          # Safari-compatible popup logic
├── styles-safari.css        # Safari-specific styles
└── README-safari.md         # This file
```

## Features

### 1. Follow-up Button
- **Selection Enhancement**: Select any text on Gemini
- **Quick Citation**: Automatically formats selected text as a citation
- **Safari Optimized**: Smooth animations and native-feeling interactions

### 2. Custom Slash Commands
- **Type `/` in chat**: Triggers autocomplete dropdown
- **Predefined Commands**: Includes translate, explain, improve, summarize, and more
- **Custom Commands**: Add your own slash commands through the popup interface
- **Variable Substitution**: Use `{text}` to insert selected text into prompts

### 3. Safari-Specific Enhancements
- **Native Scrollbars**: Styled to match Safari's native appearance
- **Dark Mode Support**: Automatically adapts to Safari's dark/light mode
- **High Contrast Mode**: Supports accessibility preferences
- **Reduced Motion**: Respects user's motion preferences
- **Keyboard Navigation**: Full keyboard accessibility

## Default Slash Commands

- `/translate` - Translate text to English
- `/explain` - Explain concepts in simple terms
- `/improve` - Improve writing and clarity
- `/summarize` - Provide concise summaries
- `/code` - Explain how code works
- `/debug` - Help debug code and find issues
- `/review` - Review text for grammar and style
- `/creative` - Use text for creative inspiration

## Usage

### Using Follow-up Button
1. Select any text on a supported website
2. Click the blue "Follow-up" button that appears
3. The text will be inserted as a citation in the chat input

### Using Slash Commands
1. Type `/` in the chat input box
2. Select a command from the dropdown or continue typing
3. Press Enter or Tab to insert the command
4. The `{text}` placeholder will be replaced with any selected text

### Managing Commands
1. Click the extension icon in Safari's toolbar
2. View existing commands
3. Add new commands using the form
4. Delete commands you no longer need

## Safari Compatibility

### Supported Safari Versions
- Safari 14.0 and later on macOS
- Safari on iOS/iPadOS (with limitations)

### Browser API Compatibility
- Uses WebExtensions API with Safari-specific optimizations
- Graceful fallback to localStorage if extension APIs are unavailable
- Enhanced error handling for Safari's security restrictions

### Website Compatibility
- **Gemini (gemini.google.com)**: Full support
- **Other sites**: Basic functionality may work

## Privacy & Security

### Data Storage
- All commands stored locally in Safari
- No data transmitted to external servers
- Uses Safari's secure storage APIs

### Permissions
- **activeTab**: Required to interact with chat interfaces
- **storage**: Required to save custom commands
- **Host permissions**: Limited to Gemini domains

### Safari Security Features
- Follows Safari's enhanced security model
- Compatible with Safari's Intelligent Tracking Prevention
- Respects Safari's privacy settings

## Troubleshooting

### Extension Not Loading
1. Check that Developer features are enabled
2. Ensure "Allow Unsigned Extensions" is enabled
3. Verify the extension is enabled in Safari Preferences

### Commands Not Working
1. Check browser console for errors
2. Verify the website is supported
3. Try reloading the page

### Storage Issues
1. Check Safari's storage permissions
2. Clear extension data and reload
3. Verify localStorage is enabled

### Performance Issues
1. Disable other extensions temporarily
2. Check Safari's memory usage
3. Restart Safari if needed

## Development

### Safari Extension Development
This extension is built using:
- WebExtensions API with Safari compatibility layer
- Vanilla JavaScript (no external dependencies)
- CSS with Safari-specific optimizations
- Manifest v2 format (Safari requirement)

### Building for Safari
1. Use `manifest-safari.json` as the manifest
2. Ensure all file references use Safari-compatible paths
3. Test with Safari's Web Inspector
4. Validate with Safari's extension validator

### Testing
1. Load extension in Safari Developer mode
2. Test on both light and dark themes
3. Verify accessibility with VoiceOver
4. Test on different screen sizes

## Contributing

When contributing to the Safari version:
1. Test changes in Safari specifically
2. Ensure compatibility with Safari's security model
3. Follow Apple's Human Interface Guidelines
4. Test with Safari's accessibility features

## License

This project is licensed under the MIT License - see the main project LICENSE file for details.

## Support

For Safari-specific issues:
- Check Safari's Web Inspector console
- Verify extension permissions in Safari Preferences
- Test with Safari's built-in debugging tools

For general issues, refer to the main project documentation.
