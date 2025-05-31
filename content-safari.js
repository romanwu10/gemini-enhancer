console.log("Gemini Enhancer Safari content script loaded.");

let followUpButton = null;
let slashCommands = {};
let commandAutocomplete = null;
let lastInputBox = null;

// Safari compatibility layer
const browserAPI = (() => {
    if (typeof browser !== 'undefined') {
        return browser;
    } else if (typeof chrome !== 'undefined') {
        return chrome;
    } else {
        // Fallback for Safari if neither browser nor chrome is available
        return {
            storage: {
                sync: {
                    get: (keys) => Promise.resolve({}),
                    set: (data) => Promise.resolve(),
                    onChanged: {
                        addListener: () => {}
                    }
                }
            }
        };
    }
})();

// Load slash commands from storage
loadSlashCommands();

// Listen for storage changes to update commands in real-time
if (browserAPI.storage && browserAPI.storage.onChanged) {
    browserAPI.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.slashCommands) {
            slashCommands = changes.slashCommands.newValue || {};
            console.log('Slash commands updated:', slashCommands);
        }
    });
}

async function loadSlashCommands() {
    try {
        const result = await browserAPI.storage.sync.get(['slashCommands']);
        slashCommands = result.slashCommands || {};
        
        // Initialize with default commands if none exist
        if (Object.keys(slashCommands).length === 0) {
            const defaultCommands = {
                'translate': 'Translate the following text to English: {text}',
                'explain': 'Explain this concept in simple terms: {text}',
                'improve': 'Improve the writing and clarity of this text: {text}',
                'summarize': 'Provide a concise summary of: {text}',
                'code': 'Explain how this code works: {text}',
                'debug': 'Help me debug this code and find potential issues: {text}',
                'review': 'Review this text for grammar, style, and clarity: {text}',
                'creative': 'Use this as inspiration for a creative story or idea: {text}'
            };
            
            await browserAPI.storage.sync.set({ slashCommands: defaultCommands });
            slashCommands = defaultCommands;
            console.log('Initialized with default slash commands');
        }
        
        console.log('Loaded slash commands:', slashCommands);
    } catch (error) {
        console.error('Error loading slash commands:', error);
    }
}

// Safari-optimized event listeners with better performance
const addEventListenerSafari = (element, event, handler, options = {}) => {
    try {
        element.addEventListener(event, handler, options);
    } catch (error) {
        console.warn(`Failed to add ${event} listener:`, error);
    }
};

addEventListenerSafari(document, 'mouseup', handleTextSelection);
addEventListenerSafari(document, 'mousedown', handleMouseDown);
addEventListenerSafari(document, 'selectionchange', handleSelectionChange);

function handleMouseDown(event) {
    // If clicking on the follow-up button, don't remove it
    if (followUpButton && followUpButton.contains(event.target)) {
        return;
    }
    
    // If there's a follow-up button and we're clicking elsewhere, remove it
    if (followUpButton) {
        removeFollowUpButton();
    }
}

function handleSelectionChange() {
    // Safari optimization: Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
        const selectedText = window.getSelection().toString().trim();
        
        if (!selectedText && followUpButton) {
            removeFollowUpButton();
            return;
        }
        
        if (selectedText && followUpButton) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                followUpButton.style.left = `${window.scrollX + rect.left}px`;
                followUpButton.style.top = `${window.scrollY + rect.top - 36}px`;
            }
        }
    });
}

function handleTextSelection(event) {
    const selectedText = window.getSelection().toString().trim();

    if (followUpButton && followUpButton.contains(event.target)) {
        return;
    }

    if (followUpButton) {
        removeFollowUpButton();
    }

    if (selectedText) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            createFollowUpButton(selectedText, rect.left, rect.top);
        }
    }
}

function createFollowUpButton(text, x, y) {
    followUpButton = document.createElement('button');
    followUpButton.id = 'followUpButton';
    followUpButton.textContent = 'Follow-up';
    followUpButton.className = 'safari-follow-up-button';
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Safari-specific positioning with better viewport handling
        const buttonWidth = 100;
        const buttonHeight = 32;
        const leftPos = Math.max(10, Math.min(window.innerWidth - buttonWidth - 10, window.scrollX + rect.left));
        const topPos = Math.max(10, window.scrollY + rect.top - buttonHeight - 8);
        
        followUpButton.style.position = 'absolute';
        followUpButton.style.left = `${leftPos}px`;
        followUpButton.style.top = `${topPos}px`;
        followUpButton.style.zIndex = '999999';
    }

    followUpButton.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Follow-up button clicked with text:", text);
        insertTextIntoInputBox(text);
        removeFollowUpButton();
    };

    document.body.appendChild(followUpButton);
}

function removeFollowUpButton() {
    if (followUpButton && followUpButton.parentNode) {
        followUpButton.parentNode.removeChild(followUpButton);
        followUpButton = null;
    }
}

function insertTextIntoInputBox(text) {
    let inputBox = null;
    const hostname = window.location.hostname;
    let selectorUsed = '';

    const citationText = `↪ "${text}"
`;

    console.log(`Safari: Attempting to insert text on: ${hostname}`);

    // Safari-optimized selectors with better specificity
    if (hostname.includes('gemini.google.com')) {
        const geminiSelectors = [
            'div[contenteditable="true"][role="textbox"]:not([aria-hidden="true"])',
            'rich-textarea div[contenteditable="true"]:not([aria-hidden="true"])',
            'textarea[placeholder*="Enter a prompt"]:not([style*="display: none"])',
            'div.ql-editor[contenteditable="true"]:not([aria-hidden="true"])',
            'div[contenteditable="true"]:not([aria-hidden="true"]):not([role="button"])'
        ];
        
        for (const selector of geminiSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (isVisibleAndInteractable(element)) {
                    inputBox = element;
                    selectorUsed = selector;
                    break;
                }
            }
            if (inputBox) break;
        }

    } else if (hostname.includes('claude.ai')) {
        const claudeSelectors = [
            'div[contenteditable="true"][role="textbox"]:not([aria-hidden="true"])',
            'div[contenteditable="true"][aria-multiline="true"]:not([aria-hidden="true"])',
            'textarea[placeholder*="Message Claude"]:not([style*="display: none"])',
            'div.ProseMirror[contenteditable="true"]:not([aria-hidden="true"])',
            'div[contenteditable="true"]:not([aria-hidden="true"]):not([role="button"])'
        ];
        
        for (const selector of claudeSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (isVisibleAndInteractable(element)) {
                    inputBox = element;
                    selectorUsed = selector;
                    break;
                }
            }
            if (inputBox) break;
        }
    }

    if (inputBox) {
        console.log("Safari: Input box found using selector:", selectorUsed);
        lastInputBox = inputBox;
        
        inputBox.focus();
        
        // Safari-optimized text insertion
        if (insertTextSafari(inputBox, citationText)) {
            console.log(`Safari: Successfully inserted citation: "${citationText}"`);
        } else {
            alert("Failed to insert citation. Please try copying manually.");
        }
    } else {
        alert("Gemini Enhancer: Could not find the chat input box.");
    }
}

// Safari-specific helper functions
function isVisibleAndInteractable(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return rect.width > 50 && 
           rect.height > 20 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null;
}

function insertTextSafari(element, text) {
    try {
        if (element.hasAttribute('contenteditable')) {
            // Method 1: Direct text insertion for contenteditable
            element.textContent = text;
            element.focus();
            
            // Move cursor to end
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            // Trigger events
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
            
        } else if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
            // Method 2: For textarea and input elements
            element.value = text;
            element.focus();
            element.setSelectionRange(text.length, text.length);
            
            // Trigger events
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
    } catch (error) {
        console.warn('Safari: Text insertion failed:', error);
    }
    
    return false;
}

// Slash command functionality with Safari optimizations
addEventListenerSafari(document, 'input', handleInputChange, true);
addEventListenerSafari(document, 'keydown', handleKeyDown, { capture: true, passive: false });
addEventListenerSafari(document, 'keyup', handleKeyUp, true);
addEventListenerSafari(document, 'click', handleDocumentClick, true);
addEventListenerSafari(document, 'focusout', handleFocusOut, true);

// ...existing code for slash commands functionality...
// (The rest of the slash command functions remain the same but with Safari optimizations)

function handleInputChange(event) {
    const target = event.target;
    
    if (isChatInputBox(target)) {
        lastInputBox = target;
        const text = getInputText(target);
        const cursorPos = getCursorPosition(target);
        
        const beforeCursor = text.substring(0, cursorPos);
        const slashMatch = beforeCursor.match(/\/(\w*)$/);
        
        if (slashMatch) {
            const partial = slashMatch[1].toLowerCase();
            showCommandAutocomplete(target, partial, slashMatch.index);
        } else {
            hideCommandAutocomplete();
        }
    } else {
        if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
            hideCommandAutocomplete();
        }
    }
}

function handleKeyDown(event) {
    if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
        const items = commandAutocomplete.querySelectorAll('.autocomplete-item');
        let selectedIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                event.stopPropagation();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection(items, selectedIndex);
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                event.stopPropagation();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection(items, selectedIndex);
                break;
                
            case 'Enter':
            case 'Tab':
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    selectCommand(items[selectedIndex].dataset.command);
                }
                return false;
                
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                hideCommandAutocomplete();
                break;
        }
    }
}

function handleKeyUp(event) {
    if (event.target && isChatInputBox(event.target)) {
        setTimeout(() => {
            const text = getInputText(event.target);
            const cursorPos = getCursorPosition(event.target);
            const beforeCursor = text.substring(0, cursorPos);
            const slashMatch = beforeCursor.match(/\/(\w*)$/);
            
            if (!slashMatch && commandAutocomplete && commandAutocomplete.style.display !== 'none') {
                hideCommandAutocomplete();
            }
        }, 0);
    }
}

function handleFocusOut(event) {
    if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
        if (!event.relatedTarget || !commandAutocomplete.contains(event.relatedTarget)) {
            setTimeout(() => {
                if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
                    hideCommandAutocomplete();
                }
            }, 200);
        }
    }
}

function handleDocumentClick(event) {
    if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
        if (commandAutocomplete.contains(event.target)) {
            return;
        }
        
        if (!commandAutocomplete.contains(event.target) && !isChatInputBox(event.target)) {
            hideCommandAutocomplete();
        }
    }
}

function isChatInputBox(element) {
    const hostname = window.location.hostname;
    
    if (hostname.includes('gemini.google.com')) {
        return element.matches('div[contenteditable="true"][role="textbox"]') ||
               element.matches('rich-textarea div[contenteditable="true"]') ||
               element.matches('textarea[placeholder*="Enter a prompt"]');
    }
    
    if (hostname.includes('claude.ai')) {
        return element.matches('div[contenteditable="true"][role="textbox"]') ||
               element.matches('div[contenteditable="true"][aria-multiline="true"]') ||
               element.matches('textarea[placeholder*="Message Claude"]');
    }
    
    return element.matches('div[contenteditable="true"]') ||
           element.matches('textarea') ||
           element.matches('input[type="text"]');
}

function getInputText(element) {
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
        return element.value;
    } else if (element.hasAttribute('contenteditable')) {
        return element.innerText || element.textContent || '';
    }
    return '';
}

function getCursorPosition(element) {
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
        return element.selectionStart || 0;
    } else if (element.hasAttribute('contenteditable')) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            try {
                const range = sel.getRangeAt(0);
                const preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(element);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                return preCaretRange.toString().length;
            } catch (e) {
                console.warn('Error getting cursor position:', e);
                return 0;
            }
        }
    }
    return 0;
}

function showCommandAutocomplete(inputElement, partial, slashIndex) {
    const matchingCommands = Object.keys(slashCommands).filter(cmd => 
        cmd.toLowerCase().startsWith(partial)
    );
    
    if (matchingCommands.length === 0) {
        hideCommandAutocomplete();
        return;
    }
    
    if (!commandAutocomplete) {
        createAutocompleteDropdown();
    }
    
    positionAutocomplete(inputElement);
    
    commandAutocomplete.innerHTML = matchingCommands.map((cmd, index) => `
        <div class="autocomplete-item ${index === 0 ? 'selected' : ''}" data-command="${cmd}">
            <div class="command-name">/${cmd}</div>
        </div>
    `).join('');
    
    commandAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectCommand(item.dataset.command);
        }, { capture: true });
    });
    
    commandAutocomplete.style.display = 'block';
    
    setTimeout(() => positionAutocomplete(inputElement), 0);
}

function createAutocompleteDropdown() {
    commandAutocomplete = document.createElement('div');
    commandAutocomplete.id = 'slashCommandAutocomplete';
    commandAutocomplete.className = 'safari-autocomplete';
    document.body.appendChild(commandAutocomplete);
}

function positionAutocomplete(inputElement) {
    const style = commandAutocomplete.style;
    const dropdownHeight = commandAutocomplete.offsetHeight || 160;
    
    const cursorPos = getCursorPosition(inputElement);
    const caretCoords = getCaretCoordinates(inputElement, cursorPos);
    
    if (caretCoords) {
        const targetTop = caretCoords.top - dropdownHeight - 2;
        
        style.left = `${caretCoords.left}px`;
        style.top = `${targetTop}px`;
        
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        if (targetTop < window.scrollY + 10) {
            style.top = `${caretCoords.bottom + 2}px`;
        }
        
        const dropdownWidth = 150;
        if (caretCoords.left + dropdownWidth > viewportWidth) {
            style.left = `${viewportWidth - dropdownWidth - 10}px`;
        }
        
        style.width = `${dropdownWidth}px`;
    } else {
        const rect = inputElement.getBoundingClientRect();
        style.left = `${window.scrollX + rect.left}px`;
        style.top = `${window.scrollY + rect.top - dropdownHeight - 8}px`;
        style.width = '150px';
    }
}

function getCaretCoordinates(element, caretPos) {
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    let left = rect.left, top = rect.top, bottom = rect.bottom;
    
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
        // Safari-optimized caret position detection
        const mirror = document.createElement('div');
        const computed = getComputedStyle(element);
        
        const properties = [
            'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
            'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
            'letterSpacing', 'wordSpacing'
        ];
        
        properties.forEach(prop => {
            mirror.style[prop] = computed[prop];
        });
        
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.left = '-9999px';
        mirror.style.top = '0px';
        
        mirror.textContent = element.value.substring(0, caretPos || element.selectionStart);
        
        const marker = document.createElement('span');
        marker.textContent = '\u200b';
        mirror.appendChild(marker);
        
        document.body.appendChild(mirror);
        
        const markerRect = marker.getBoundingClientRect();
        const mirrorRect = mirror.getBoundingClientRect();
        
        left = mirrorRect.left + markerRect.left - mirrorRect.left - element.scrollLeft + window.scrollX;
        top = mirrorRect.top + markerRect.top - mirrorRect.top - element.scrollTop + window.scrollY;
        bottom = top + markerRect.height;
        
        document.body.removeChild(mirror);
        
        return { left, top, bottom };
    }
    
    if (element.hasAttribute('contenteditable')) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0).cloneRange();
            const rects = range.getClientRects();
            if (rects.length > 0) {
                const r = rects[0];
                return { 
                    left: r.left + window.scrollX, 
                    top: r.top + window.scrollY, 
                    bottom: r.bottom + window.scrollY 
                };
            }
        }
    }
    
    return { left, top, bottom };
}

function updateSelection(items, selectedIndex) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });
}

function selectCommand(commandName) {
    if (!lastInputBox || !slashCommands[commandName]) {
        hideCommandAutocomplete();
        return;
    }
    
    const text = getInputText(lastInputBox);
    const cursorPos = getCursorPosition(lastInputBox);
    
    const beforeCursor = text.substring(0, cursorPos);
    const slashMatch = beforeCursor.match(/\/(\w*)$/);
    
    if (slashMatch) {
        const commandPrompt = slashCommands[commandName];
        const selectedText = window.getSelection().toString().trim();
        
        const finalPrompt = commandPrompt.replace(/\{text\}/g, selectedText || '');
        const newText = text.substring(0, slashMatch.index) + finalPrompt + text.substring(cursorPos);
        
        setInputText(lastInputBox, newText);
        
        const newCursorPos = slashMatch.index + finalPrompt.length;
        setCursorPosition(lastInputBox, newCursorPos);
    }
    
    hideCommandAutocomplete();
}

function setInputText(element, text) {
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (element.hasAttribute('contenteditable')) {
        element.innerText = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function setCursorPosition(element, position) {
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
        element.setSelectionRange(position, position);
    } else if (element.hasAttribute('contenteditable')) {
        const range = document.createRange();
        const sel = window.getSelection();
        
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let currentPos = 0;
        let textNode = walker.nextNode();
        
        while (textNode && currentPos + textNode.textContent.length < position) {
            currentPos += textNode.textContent.length;
            textNode = walker.nextNode();
        }
        
        if (textNode) {
            range.setStart(textNode, position - currentPos);
            range.setEnd(textNode, position - currentPos);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
}

function hideCommandAutocomplete() {
    if (commandAutocomplete) {
        commandAutocomplete.style.display = 'none';
        commandAutocomplete.innerHTML = '';
    }
}
