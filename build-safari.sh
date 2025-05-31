#!/bin/bash

# Safari Extension Builder Script
# This script helps package the Gemini Enhancer extension for Safari

echo "🚀 Building Gemini Enhancer for Safari..."

# Create Safari build directory
SAFARI_DIR="./safari-build"
rm -rf "$SAFARI_DIR"
mkdir -p "$SAFARI_DIR"

# Copy Safari-specific files
echo "📁 Copying Safari-specific files..."
cp manifest-safari.json "$SAFARI_DIR/manifest.json"
cp content-safari.js "$SAFARI_DIR/content.js"
cp popup-safari.html "$SAFARI_DIR/popup.html"
cp popup-safari.js "$SAFARI_DIR/popup.js"
cp styles-safari.css "$SAFARI_DIR/styles.css"
cp README-safari.md "$SAFARI_DIR/README.md"

# Copy shared files
echo "📄 Copying shared documentation..."
cp PRIVACY_POLICY.md "$SAFARI_DIR/" 2>/dev/null || echo "⚠️  PRIVACY_POLICY.md not found, skipping..."

# Create icons directory if it doesn't exist
mkdir -p "$SAFARI_DIR/icons"

# Check for icon files and copy them
if [ -f "icon16.png" ]; then
    cp icon*.png "$SAFARI_DIR/icons/" 2>/dev/null || echo "⚠️  Some icon files not found"
fi

# Create a simple icon if none exists
if [ ! -f "$SAFARI_DIR/icons/icon16.png" ]; then
    echo "🎨 Creating placeholder icons..."
    # Create simple colored squares as placeholders
    # (In a real scenario, you'd want proper icon files)
    touch "$SAFARI_DIR/icons/icon16.png"
    touch "$SAFARI_DIR/icons/icon48.png"
    touch "$SAFARI_DIR/icons/icon128.png"
fi

# Validate manifest
echo "🔍 Validating manifest..."
if command -v jq >/dev/null 2>&1; then
    if jq . "$SAFARI_DIR/manifest.json" >/dev/null 2>&1; then
        echo "✅ Manifest JSON is valid"
    else
        echo "❌ Manifest JSON is invalid"
        exit 1
    fi
else
    echo "⚠️  jq not installed, skipping JSON validation"
fi

# Check file sizes
echo "📊 Checking file sizes..."
find "$SAFARI_DIR" -type f -exec ls -lh {} \; | awk '{print $9 ": " $5}'

echo ""
echo "✅ Safari extension built successfully!"
echo "📂 Extension files are in: $SAFARI_DIR"
echo ""
echo "📋 Next steps:"
echo "1. Open Safari and go to Safari > Preferences > Extensions"
echo "2. Enable 'Developer' mode in Safari's Advanced preferences"
echo "3. Click '+' in Extensions and select the $SAFARI_DIR folder"
echo "4. Enable the 'Gemini Enhancer' extension"
echo ""
echo "🧪 For testing:"
echo "- Open Safari's Web Inspector (Develop menu)"
echo "- Check the Console for any errors"
echo "- Test on gemini.google.com or claude.ai"
echo ""
echo "🔗 Safari Extension Documentation:"
echo "https://developer.apple.com/documentation/safariservices/safari_web_extensions"
