console.log("Gemini Enhancer content script loaded.");

// Safari compatibility: Use browser API if available, fallback to chrome
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Legacy variables for backward compatibility - Initialize FIRST
let followUpButton = null;
let slashCommands = {};
let commandAutocomplete = null;
let lastInputBox = null;
let selectionTimeout = null;
let lastSelectedText = '';
let buttonStabilityTimeout = null;
let isHoveringButton = false;
let wideModeEnabled = false;
let wideModeWidth = 1200;
let wideModeApplied = false;
let wideModeInterval = null;

// Centralized State Management System
class EnhancerState {
    constructor() {
        this.state = {
            // Follow-up system state
            followUp: {
                button: null,
                selectedText: '',
                stabilityTimeout: null,
                isHoveringButton: false,
                selectionTimeout: null
            },
            
            // Slash commands state
            slashCommands: {
                commands: {},
                autocomplete: null,
                lastInputBox: null,
                isActive: false
            },
            
            // Wide mode state
            wideMode: {
                enabled: false,
                width: 1200,
                applied: false,
                interval: null,
                styleElement: null
            },
            
            // Auto-save state
            autoSave: {
                timeout: null,
                lastRestoredUrl: null,
                lastInputField: null
            },
            
            // UI state
            ui: {
                actionBar: null,
                contextMenu: null,
                activeFeature: null
            },
            
            // Observers and listeners
            observers: {
                mutation: null,
                input: new Set(),
                resize: null
            }
        };
        
        // Initialize cleanup functions as a separate property, not in state
        this.cleanup = new Set();
        this.eventBus = new EventTarget();
        this.initialized = false;
    }
    
    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.state);
    }
    
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.state);
        const oldValue = target[lastKey];
        target[lastKey] = value;
        
        // Emit change event
        this.eventBus.dispatchEvent(new CustomEvent('stateChange', {
            detail: { path, value, oldValue }
        }));
    }
    
    on(event, callback) {
        this.eventBus.addEventListener(event, callback);
    }
    
    emit(event, data) {
        this.eventBus.dispatchEvent(new CustomEvent(event, { detail: data }));
    }
    
    addCleanup(cleanupFn) {
        this.cleanup.add(cleanupFn);
    }
    
    destroy() {
        // Execute all cleanup functions
        if (this.cleanup) {
            this.cleanup.forEach(fn => {
                try {
                    fn();
                } catch (e) {
                    console.warn('Cleanup function failed:', e);
                }
            });
            this.cleanup.clear();
        }
        
        // Clear all state
        Object.keys(this.state).forEach(key => {
            this.state[key] = {};
        });
        
        this.initialized = false;
        console.log('Gemini Enhancer state cleaned up');
    }
}

// Global state instance
const enhancerState = new EnhancerState();

// Unified Event Coordination System
class EventCoordinator {
    constructor() {
        this.activeFeatures = new Set();
        this.eventQueue = [];
        this.isProcessing = false;
        this.featurePriority = {
            'follow-up': 3,
            'slash-commands': 2,
            'wide-mode': 1,
            'auto-save': 1
        };
    }
    
    // Register a feature as active
    activateFeature(featureName, data = {}) {
        this.activeFeatures.add(featureName);
        enhancerState.set('ui.activeFeature', featureName);
        enhancerState.emit('featureActivated', { feature: featureName, data });
        console.log(`Feature activated: ${featureName}`);
    }
    
    // Deactivate a feature
    deactivateFeature(featureName) {
        this.activeFeatures.delete(featureName);
        if (enhancerState.get('ui.activeFeature') === featureName) {
            enhancerState.set('ui.activeFeature', null);
        }
        enhancerState.emit('featureDeactivated', { feature: featureName });
        console.log(`Feature deactivated: ${featureName}`);
    }
    
    // Check if a feature can be activated (priority-based)
    canActivateFeature(featureName) {
        const currentFeature = enhancerState.get('ui.activeFeature');
        if (!currentFeature) return true;
        
        const currentPriority = this.featurePriority[currentFeature] || 0;
        const newPriority = this.featurePriority[featureName] || 0;
        
        return newPriority >= currentPriority;
    }
    
    // Coordinate UI element positioning to avoid conflicts
    requestUISpace(featureName, element, preferredPosition) {
        const rect = element.getBoundingClientRect();
        const conflicts = this.checkUIConflicts(rect);
        
        if (conflicts.length > 0) {
            // Adjust position to avoid conflicts
            const adjustedPosition = this.resolveUIConflict(rect, conflicts, preferredPosition);
            return adjustedPosition;
        }
        
        return preferredPosition;
    }
    
    checkUIConflicts(rect) {
        const conflicts = [];
        const threshold = 20; // Minimum distance between UI elements
        
        // Check against follow-up button
        const followUpButton = enhancerState.get('followUp.button');
        if (followUpButton) {
            const btnRect = followUpButton.getBoundingClientRect();
            if (this.rectsOverlap(rect, btnRect, threshold)) {
                conflicts.push({ type: 'follow-up', rect: btnRect });
            }
        }
        
        // Check against slash command autocomplete
        const autocomplete = enhancerState.get('slashCommands.autocomplete');
        if (autocomplete && autocomplete.style.display !== 'none') {
            const acRect = autocomplete.getBoundingClientRect();
            if (this.rectsOverlap(rect, acRect, threshold)) {
                conflicts.push({ type: 'slash-commands', rect: acRect });
            }
        }
        
        return conflicts;
    }
    
    rectsOverlap(rect1, rect2, threshold = 0) {
        return !(rect1.right + threshold < rect2.left || 
                rect2.right + threshold < rect1.left || 
                rect1.bottom + threshold < rect2.top || 
                rect2.bottom + threshold < rect1.top);
    }
    
    resolveUIConflict(rect, conflicts, preferredPosition) {
        // Simple conflict resolution: move down or to the side
        let { top, left } = preferredPosition;
        
        conflicts.forEach(conflict => {
            const conflictRect = conflict.rect;
            
            // If overlapping vertically, move below
            if (top < conflictRect.bottom + 20) {
                top = conflictRect.bottom + 20;
            }
            
            // If overlapping horizontally, move right
            if (left < conflictRect.right + 20) {
                left = conflictRect.right + 20;
            }
        });
        
        // Ensure within viewport
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        if (left + rect.width > viewport.width) {
            left = viewport.width - rect.width - 16;
        }
        
        if (top + rect.height > viewport.height) {
            top = viewport.height - rect.height - 16;
        }
        
        return { top, left };
    }
    
    // Handle feature conflicts gracefully
    handleFeatureConflict(activeFeature, newFeature) {
        const activePriority = this.featurePriority[activeFeature] || 0;
        const newPriority = this.featurePriority[newFeature] || 0;
        
        if (newPriority > activePriority) {
            // New feature has higher priority, deactivate current
            this.deactivateFeature(activeFeature);
            return true;
        } else if (newPriority === activePriority) {
            // Same priority, allow coexistence with coordination
            return true;
        }
        
        // New feature has lower priority, reject
        return false;
    }
}

const eventCoordinator = new EventCoordinator();

// Enhanced Context Menu Integration
class ContextMenuManager {
    constructor() {
        this.contextMenu = null;
        this.lastSelection = '';
        this.lastSelectionElement = null;
    }
    
    createContextMenu(text, position) {
        // Remove existing context menu
        this.removeContextMenu();
        
        const menu = document.createElement('div');
        menu.className = 'gemini-enhancer-context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" data-action="follow-up">
                <span class="context-icon">↪</span>
                <span>Ask follow-up</span>
                <span class="context-shortcut">Ctrl+F</span>
            </div>
            <div class="context-menu-item" data-action="explain">
                <span class="context-icon">💡</span>
                <span>Explain this</span>
            </div>
            <div class="context-menu-item" data-action="examples">
                <span class="context-icon">📝</span>
                <span>Get examples</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="copy">
                <span class="context-icon">📋</span>
                <span>Copy text</span>
                <span class="context-shortcut">Ctrl+C</span>
            </div>
        `;
        
        // Position the menu
        menu.style.cssText = `
            position: absolute;
            left: ${position.x}px;
            top: ${position.y}px;
            z-index: 10003;
            opacity: 0;
            transform: scale(0.95) translateY(-5px);
            transition: all 0.15s cubic-bezier(0.4, 0.0, 0.2, 1);
        `;
        
        document.body.appendChild(menu);
        this.contextMenu = menu;
        enhancerState.set('ui.contextMenu', menu);
        
        // Add event listeners
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.context-menu-item');
            if (item) {
                const action = item.dataset.action;
                this.handleContextAction(action, text);
            }
        });
        
        // Auto-hide on click outside
        const hideHandler = (e) => {
            if (!menu.contains(e.target)) {
                this.removeContextMenu();
                document.removeEventListener('click', hideHandler, true);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', hideHandler, true);
        }, 100);
        
        // Animate in
        requestAnimationFrame(() => {
            menu.style.opacity = '1';
            menu.style.transform = 'scale(1) translateY(0)';
        });
        
        // Ensure menu stays in viewport
        this.adjustMenuPosition(menu, position);
        
        return menu;
    }
    
    adjustMenuPosition(menu, position) {
        const rect = menu.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        let { x, y } = position;
        
        // Adjust horizontal position
        if (x + rect.width > viewport.width) {
            x = viewport.width - rect.width - 16;
        }
        
        // Adjust vertical position
        if (y + rect.height > viewport.height) {
            y = y - rect.height - 10; // Show above cursor
        }
        
        menu.style.left = `${Math.max(8, x)}px`;
        menu.style.top = `${Math.max(8, y)}px`;
    }
    
    removeContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.opacity = '0';
            this.contextMenu.style.transform = 'scale(0.95) translateY(-5px)';
            
            setTimeout(() => {
                if (this.contextMenu) {
                    this.contextMenu.remove();
                    this.contextMenu = null;
                    enhancerState.set('ui.contextMenu', null);
                }
            }, 150);
        }
    }
    
    handleContextAction(action, text) {
        const inputBox = findGeminiInputBox();
        
        switch (action) {
            case 'follow-up':
                if (inputBox) {
                    createInlineCitationCard(text, inputBox);
                }
                break;
            case 'explain':
                if (inputBox) {
                    insertPromptWithCitation(text, 'explain', inputBox);
                }
                break;
            case 'examples':
                if (inputBox) {
                    insertPromptWithCitation(text, 'examples', inputBox);
                }
                break;
            case 'copy':
                navigator.clipboard.writeText(text).then(() => {
                    console.log('Text copied to clipboard');
                });
                break;
        }
        
        this.removeContextMenu();
    }
}

const contextMenuManager = new ContextMenuManager();

// Function to determine if selected text is from AI response vs user input
function isSelectionFromAIResponse(selection) {
    if (!selection || selection.rangeCount === 0) return false;
    
    // TEMPORARY: Make it less restrictive for testing - show button for any meaningful selection
    const selectedText = selection.toString().trim();
    if (selectedText.length >= 3) {
        console.log('Allowing follow-up button for selection:', selectedText.substring(0, 50) + '...');
        return true;
    }
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Find the closest parent element that might indicate content type
    let element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    
    // Look up the DOM tree to find conversation structure indicators
    while (element && element !== document.body) {
        // Common Gemini selectors for AI responses
        // These are based on Gemini's current DOM structure patterns
        const classList = element.classList ? Array.from(element.classList) : [];
        const role = element.getAttribute('role');
        const dataRole = element.getAttribute('data-role');
        
        // Check for AI response indicators
        if (
            // Gemini uses these patterns for AI responses
            classList.some(cls => cls.includes('model-response') || 
                               cls.includes('assistant') || 
                               cls.includes('response') ||
                               cls.includes('message-content') ||
                               cls.includes('model-turn') ||
                               cls.includes('conversation-turn') ||
                               cls.includes('response-container')) ||
            role === 'presentation' ||
            dataRole === 'assistant' ||
            dataRole === 'model' ||
            element.tagName === 'MESSAGE-CONTENT' ||
            element.tagName === 'MODEL-RESPONSE' ||
            // Look for specific Gemini response containers
            element.querySelector('[data-message-author-role="model"]') ||
            element.closest('[data-message-author-role="model"]') ||
            element.closest('[role="presentation"]') ||
            // Check for Gemini-specific response indicators
            element.closest('.model-response-text') ||
            element.closest('.response-container') ||
            element.closest('.conversation-turn[data-role="model"]')
        ) {
            console.log('Detected AI response element:', element.tagName, element.className);
            return true;
        }
        
        // Check for user input indicators (should return false)
        if (
            classList.some(cls => cls.includes('user-input') || 
                               cls.includes('user-message') ||
                               cls.includes('user-turn') ||
                               cls.includes('input') ||
                               cls.includes('prompt') ||
                               cls.includes('user-query')) ||
            dataRole === 'user' ||
            element.closest('[data-message-author-role="user"]') ||
            element.closest('[contenteditable="true"]') ||
            element.closest('[role="textbox"]') ||
            element.closest('.conversation-turn[data-role="user"]') ||
            element.closest('.user-message') ||
            element.closest('.user-turn') ||
            element.tagName === 'TEXTAREA' ||
            element.tagName === 'INPUT'
        ) {
            console.log('Detected user input element, blocking Follow-up button:', element.tagName, element.className);
            return false;
        }
        
        element = element.parentElement;
    }
    
    // Fallback: Use heuristics to determine if this is likely an AI response
    const selectionText = selection.toString().trim();
    const selectionRect = range.getBoundingClientRect();
    
    // Check distance from input areas - if too close, likely user input
    const inputElements = document.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]');
    
    for (const input of inputElements) {
        const inputRect = input.getBoundingClientRect();
        const distance = Math.sqrt(
            Math.pow(selectionRect.left - inputRect.left, 2) + 
            Math.pow(selectionRect.top - inputRect.top, 2)
        );
        
        // If selection is very close to an input, likely user input
        // Be more lenient with short selections as they might be technical terms
        const proximityThreshold = selectionText.length <= 10 ? 50 : 100;
        if (distance < proximityThreshold) {
            console.log(`Selection too close to input element (${distance.toFixed(0)}px < ${proximityThreshold}px), blocking Follow-up button`);
            return false;
        }
    }
    
    // Check if selection contains typical AI response patterns
    const aiResponsePatterns = [
        /I'd be happy to help/i,
        /Here's what/i,
        /According to/i,
        /Based on/i,
        /Let me explain/i,
        /To answer your question/i,
        /The answer is/i,
        /You can/i,
        /This means/i,
        /In other words/i,
        // Short-form patterns that often appear in AI responses
        /^However/i,
        /^Additionally/i,
        /^Furthermore/i,
        /^Therefore/i,
        /^Essentially/i,
        /^Basically/i
    ];
    
    const hasAIPattern = aiResponsePatterns.some(pattern => pattern.test(selectionText));
    
    // Check if selection contains typical user input patterns
    const userInputPatterns = [
        /^How do I/i,
        /^What is/i,
        /^Can you/i,
        /^Please/i,
        /^I want/i,
        /^I need/i,
        /^Could you/i,
        /\?$/  // Ends with question mark
    ];
    
    const hasUserPattern = userInputPatterns.some(pattern => pattern.test(selectionText));
    
    // For very short selections (single words), be less strict about user patterns
    // unless they're clearly questions
    if (hasUserPattern && (selectionText.length > 10 || selectionText.includes('?'))) {
        console.log('Selection matches user input pattern, blocking Follow-up button');
        return false;
    }
    
    // For shorter selections, be more permissive if they don't match user patterns
    // Single words or short phrases can be valuable for follow-ups (e.g., technical terms)
    const isSubstantial = selectionText.length >= 3;
    
    // Special handling for single words that are likely technical terms or concepts
    const isSingleWord = selectionText.split(/\s+/).length === 1;
    const looksLikeTechnicalTerm = isSingleWord && (
        /^[A-Z][a-z]+$/.test(selectionText) ||  // Capitalized word
        /^[a-z]+[A-Z]/.test(selectionText) ||   // camelCase
        /^[A-Z_]+$/.test(selectionText) ||      // CONSTANT_CASE
        /^[a-z-]+$/.test(selectionText) ||      // kebab-case
        selectionText.length > 6                // Longer single words are often technical
    );
    
    const result = hasAIPattern || (isSubstantial && !hasUserPattern) || looksLikeTechnicalTerm;
    
    console.log('Fallback AI response detection:', { 
        hasAIPattern, 
        hasUserPattern, 
        isSubstantial,
        isSingleWord,
        looksLikeTechnicalTerm,
        result,
        textSample: selectionText.length > 50 ? selectionText.substring(0, 50) + '...' : selectionText
    });
    
    return result;
}

// Note: browserAPI and legacy variables are now declared at the top

// Load slash commands from storage
loadSlashCommands();

// Load wide mode settings
loadWideModeSettings();

// Listen for messages from popup
browserAPI.runtime.onMessage.addListener((message) => {
    if (message.action === 'toggleWideMode') {
        wideModeEnabled = message.enabled;
        wideModeWidth = message.width;
        if (wideModeEnabled) {
            applyWideMode();
        } else {
            removeWideMode();
        }
    } else if (message.action === 'updateWidth') {
        wideModeWidth = message.width;
        if (wideModeEnabled) {
            applyWideMode();
        }
    }
});

// Listen for storage changes to update commands in real-time
browserAPI.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.slashCommands) {
        slashCommands = changes.slashCommands.newValue || {};
        console.log('Slash commands updated:', slashCommands);
    }
    // Listen for changes to autosaved text (e.g., cleared by popup)
    if (namespace === 'local' && changes.autosavedContent) {
        if (!changes.autosavedContent.newValue) {
            const currentUrl = window.location.href;
            const inputField = findGeminiInputBox();
            if (inputField && localStorage.getItem('autosave_last_cleared_url') === currentUrl) {
                // Potentially clear the input field if the saved data was cleared for this URL
                // and the user hasn't typed anything new yet.
                // However, this might be too aggressive. For now, we'll just log.
                console.log('Autosaved content cleared for this page.');
                localStorage.removeItem('autosave_last_cleared_url');
            }
        }
    }
});

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
        
        // Also update new state management system
        enhancerState.set('slashCommands.commands', slashCommands);
        
        console.log('Loaded slash commands:', slashCommands);
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            console.log('Extension context invalidated - skipping slash commands load');
            return;
        }
        console.error('Error loading slash commands:', error);
    }
}

// Improved Event Management with Cleanup
function initializeEventListeners() {
    const events = [
        { type: 'mouseup', handler: handleTextSelection, options: { passive: true } },
        { type: 'mousedown', handler: handleMouseDown, options: { passive: true } },
        { type: 'selectionchange', handler: handleSelectionChange, options: { passive: true } },
        { type: 'contextmenu', handler: handleContextMenu, options: { passive: false } },
        { type: 'input', handler: handleInputChange, options: { capture: true, passive: true } },
        { type: 'keydown', handler: handleKeyDown, options: { capture: true, passive: false } },
        { type: 'keyup', handler: handleKeyUp, options: { passive: true } },
        { type: 'click', handler: handleDocumentClick, options: { capture: true, passive: true } },
        { type: 'focusout', handler: handleFocusOut, options: { passive: true } }
    ];
    
    events.forEach(({ type, handler, options }) => {
        document.addEventListener(type, handler, options);
        enhancerState.addCleanup(() => {
            document.removeEventListener(type, handler, options);
        });
    });
    
    console.log('Event listeners initialized with cleanup');
}

// Initialize event listeners
initializeEventListeners();

// --- AUTOSAVE FEATURE ---
const AUTOSAVE_STORAGE_KEY = 'autosavedContent_gemini';
const AUTOSAVE_DEBOUNCE_MS = 2000;

function findGeminiInputBox() {
    const selectors = [
        '#prompt-textarea',
        'textarea[aria-label*="Prompt"]',
        'textarea[aria-label*="Message"]',
        'textarea[placeholder*="Message"]',
        'textarea[data-testid*="chat-input"]',
        'div[role="textbox"][aria-label*="Send a message"]',
        'div[role="textbox"][aria-label*="Prompt"]',
        '.input-box[contenteditable="true"]',
        'textarea',
        'div[role="textbox"]'
    ];
    for (let selector of selectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.offsetParent !== null && elem.offsetHeight > 0 && elem.offsetWidth > 0) {
            return elem;
        }
    }
    return null;
}

function attachAutosave(inputField) {
    if (!inputField) return;
    
    const currentInputField = enhancerState.get('autoSave.lastInputField');
    if (currentInputField === inputField) return; // Already attached
    
    // Remove listeners from previous input field
    if (currentInputField) {
        currentInputField.removeEventListener('input', handleAutosaveInput);
        currentInputField.removeEventListener('keyup', handleAutosaveInput);
    }
    
    // Attach to new input field
    enhancerState.set('autoSave.lastInputField', inputField);
    inputField.addEventListener('input', handleAutosaveInput);
    inputField.addEventListener('keyup', handleAutosaveInput);
    
    // Add cleanup for these listeners
    enhancerState.addCleanup(() => {
        inputField.removeEventListener('input', handleAutosaveInput);
        inputField.removeEventListener('keyup', handleAutosaveInput);
    });
}

async function saveInputContent() {
    const inputField = enhancerState.get('autoSave.lastInputField') || findGeminiInputBox();
    if (!inputField) return;
    
    const currentUrl = window.location.href;
    const textToSave = inputField.tagName === 'TEXTAREA' || inputField.tagName === 'INPUT' 
        ? inputField.value 
        : inputField.innerText;
    
    try {
        if (textToSave.trim() === '') {
            const savedData = await browserAPI.storage.local.get(AUTOSAVE_STORAGE_KEY);
            if (savedData[AUTOSAVE_STORAGE_KEY] && savedData[AUTOSAVE_STORAGE_KEY].url === currentUrl) {
                await browserAPI.storage.local.remove(AUTOSAVE_STORAGE_KEY);
            }
            return;
        }
        const dataToStore = { url: currentUrl, text: textToSave, timestamp: Date.now() };
        await browserAPI.storage.local.set({ [AUTOSAVE_STORAGE_KEY]: dataToStore });
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            console.log('Extension context invalidated - skipping autosave');
            return;
        }
        console.error('Error saving input content:', error);
    }
}

function handleAutosaveInput() {
    const currentTimeout = enhancerState.get('autoSave.timeout');
    if (currentTimeout) {
        clearTimeout(currentTimeout);
    }
    
    const newTimeout = setTimeout(saveInputContent, AUTOSAVE_DEBOUNCE_MS);
    enhancerState.set('autoSave.timeout', newTimeout);
    enhancerState.addCleanup(() => clearTimeout(newTimeout));
}

async function restoreInputContent(inputField) {
    if (!inputField) return;
    
    const currentUrl = window.location.href;
    const lastRestoredUrl = enhancerState.get('autoSave.lastRestoredUrl');
    if (lastRestoredUrl === currentUrl) return;
    
    try {
        const result = await browserAPI.storage.local.get(AUTOSAVE_STORAGE_KEY);
        const savedData = result[AUTOSAVE_STORAGE_KEY];
        if (savedData && savedData.url === currentUrl && savedData.text) {
            if (inputField.tagName === 'TEXTAREA' || inputField.tagName === 'INPUT') {
                inputField.value = savedData.text;
            } else {
                inputField.innerText = savedData.text;
            }
            inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            enhancerState.set('autoSave.lastRestoredUrl', currentUrl);
        }
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            console.log('Extension context invalidated - skipping autosave restore');
            return;
        }
        console.error('Error restoring input content:', error);
    }
}

function observeInputBox() {
    // Disconnect existing observer
    const currentObserver = enhancerState.get('observers.mutation');
    if (currentObserver) {
        currentObserver.disconnect();
    }
    
    // Create new observer
    const observer = new MutationObserver(() => {
        const inputField = findGeminiInputBox();
        if (inputField) {
            attachAutosave(inputField);
            restoreInputContent(inputField);
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    enhancerState.set('observers.mutation', observer);
    
    // Add cleanup
    enhancerState.addCleanup(() => {
        observer.disconnect();
    });
    
    // Initial check
    const inputField = findGeminiInputBox();
    if (inputField) {
        attachAutosave(inputField);
        restoreInputContent(inputField);
    }
}

let lastKnownUrl = location.href;

function onUrlChange() {
    if (lastKnownUrl !== location.href) {
        lastKnownUrl = location.href;
        enhancerState.set('autoSave.lastRestoredUrl', null);
        observeInputBox();
    } else {
        // Even if URL didn't change, try to restore if input is present and not restored
        const inputField = findGeminiInputBox();
        if (inputField) restoreInputContent(inputField);
    }
}

function startUrlPolling() {
    // Clear existing interval
    const currentInterval = enhancerState.get('wideMode.interval');
    if (currentInterval) {
        clearInterval(currentInterval);
    }
    
    const urlInterval = setInterval(onUrlChange, 500);
    enhancerState.set('observers.urlPolling', urlInterval);
    
    // Add cleanup
    enhancerState.addCleanup(() => {
        clearInterval(urlInterval);
    });
}

function hookHistoryEvents() {
    const pushState = history.pushState;
    history.pushState = function() {
        pushState.apply(this, arguments);
        setTimeout(onUrlChange, 100);
    };
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);
}

if (document.readyState === 'complete') {
    observeInputBox();
    hookHistoryEvents();
    startUrlPolling();
} else {
    window.addEventListener('load', () => {
        observeInputBox();
        hookHistoryEvents();
        startUrlPolling();
    });
}
// --- END AUTOSAVE FEATURE ---

function handleMouseDown(event) {
    const followUpButton = enhancerState.get('followUp.button');
    
    // If clicking on the follow-up button, don't remove it
    if (followUpButton && followUpButton.contains(event.target)) {
        return;
    }
    
    // If there's a follow-up button and we're clicking elsewhere, only remove it
    // if we're not just adjusting text selection or clicking nearby
    if (followUpButton) {
        // Don't remove button immediately - let the selection change handler decide
        // This prevents button removal during text selection adjustments
        const buttonRect = followUpButton.getBoundingClientRect();
        const clickX = event.clientX;
        const clickY = event.clientY;
        
        // If clicking far from the button (more than 100px away), remove it
        const distance = Math.sqrt(
            Math.pow(clickX - (buttonRect.left + buttonRect.width / 2), 2) +
            Math.pow(clickY - (buttonRect.top + buttonRect.height / 2), 2)
        );
        
        if (distance > 100) {
            // Clear stability timeout and remove button
            const stabilityTimeout = enhancerState.get('followUp.stabilityTimeout');
            if (stabilityTimeout) {
                clearTimeout(stabilityTimeout);
                enhancerState.set('followUp.stabilityTimeout', null);
            }
            removeFollowUpButton();
            enhancerState.set('followUp.selectedText', '');
        }
    }
}

function handleContextMenu(event) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // Only show our context menu for AI response text selections
    if (selectedText && selectedText.length >= 3 && isSelectionFromAIResponse(selection)) {
        // Prevent default context menu
        event.preventDefault();
        event.stopPropagation();
        
        // Show our custom context menu
        const position = {
            x: event.clientX,
            y: event.clientY
        };
        
        contextMenuManager.createContextMenu(selectedText, position);
        console.log('Custom context menu shown for AI response text');
        return false;
    }
    
    // For non-AI content, let the default context menu show
}

function handleSelectionChange() {
    // Clear any existing stability timeout
    const stabilityTimeout = enhancerState.get('followUp.stabilityTimeout');
    if (stabilityTimeout) {
        clearTimeout(stabilityTimeout);
        enhancerState.set('followUp.stabilityTimeout', null);
    }
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    const lastSelectedText = enhancerState.get('followUp.selectedText');
    const followUpButton = enhancerState.get('followUp.button');
    
    // If we have a meaningful selection from AI response, update selectedText and keep button
    if (selectedText && selectedText.length >= 3 && isSelectionFromAIResponse(selection)) {
        // Check if selection has been extended significantly
        const selectionExtended = Math.abs(selectedText.length - lastSelectedText.length) > 5;
        enhancerState.set('followUp.selectedText', selectedText);
        
        // If we have a button, update its position smoothly
        if (followUpButton && followUpButton.classList.contains('show')) {
            updateButtonPosition();
            
            // Provide subtle visual feedback when selection is extended
            if (selectionExtended) {
                console.log('Selection extended, button will use current selection on click');
                // Brief highlight to indicate the button is aware of the extended selection
                followUpButton.style.boxShadow = 'light-dark(0 2px 8px rgba(26, 115, 232, 0.4), 0 2px 8px rgba(138, 180, 248, 0.4))';
                setTimeout(() => {
                    if (followUpButton) {
                        followUpButton.style.boxShadow = '';
                    }
                }, 200);
            }
        }
        return;
    }
    
    // If no meaningful selection but we recently had one, don't remove button immediately
    // This prevents the button from disappearing during selection adjustments
    const isHoveringButton = enhancerState.get('followUp.isHoveringButton');
    if (!selectedText && followUpButton && lastSelectedText && !isHoveringButton) {
        // Give the user 5 seconds to click the button before removing it
        const newTimeout = setTimeout(() => {
            const currentButton = enhancerState.get('followUp.button');
            const currentHovering = enhancerState.get('followUp.isHoveringButton');
            if (currentButton && !window.getSelection().toString().trim() && !currentHovering) {
                console.log('Removing follow-up button after stability timeout');
                removeFollowUpButton();
                enhancerState.set('followUp.selectedText', '');
            }
        }, 5000); // Increased to 5 seconds
        
        enhancerState.set('followUp.stabilityTimeout', newTimeout);
        enhancerState.addCleanup(() => clearTimeout(newTimeout));
    }
}

function updateButtonPosition() {
    const followUpButton = enhancerState.get('followUp.button');
    if (!followUpButton || !followUpButton.classList.contains('show')) return;
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Only update position if selection is visible
        if (rect.width > 0 && rect.height > 0) {
            // Calculate new position
            const buttonTop = window.scrollY + rect.top - 44;
            const buttonLeft = window.scrollX + rect.left;
            
            // Ensure button doesn't go off screen
            const viewportWidth = window.innerWidth;
            const buttonWidth = 120;
            const finalLeft = Math.min(buttonLeft, viewportWidth - buttonWidth - 16);
            
            // Only update position if it's significantly different to prevent jitter
            const currentLeft = parseInt(followUpButton.style.left) || 0;
            const currentTop = parseInt(followUpButton.style.top) || 0;
            const newLeft = Math.max(8, finalLeft);
            const newTop = Math.max(8, buttonTop);
            
            if (Math.abs(currentLeft - newLeft) > 10 || Math.abs(currentTop - newTop) > 10) {
                // Smooth position update with dedicated position transition
                followUpButton.style.transition = 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1), top 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)';
                followUpButton.style.left = `${newLeft}px`;
                followUpButton.style.top = `${newTop}px`;
            }
        }
    }
}

function handleTextSelection(event) {
    console.log('handleTextSelection called with event:', event.type);
    
    // Clear any existing timeout
    if (selectionTimeout) {
        clearTimeout(selectionTimeout);
    }
    
    // Debounce selection handling for better performance
    selectionTimeout = setTimeout(() => {
        const selectedText = window.getSelection().toString().trim();
        console.log('Processing selection:', selectedText.length > 0 ? selectedText.substring(0, 30) + '...' : 'No selection');

        // If clicking on the follow-up button, don't interfere
        if (followUpButton && followUpButton.contains(event.target)) {
            return;
        }

        // If we have meaningful selected text FROM AI RESPONSE, create or keep the button
        if (selectedText && selectedText.length >= 3) {
            const selection = window.getSelection();
            
            // Only proceed if selection is from AI response
            if (!isSelectionFromAIResponse(selection)) {
                console.log('Selection is from user input, not showing Follow-up button');
                return;
            }
            
            // If button already exists and text hasn't changed significantly, just update position
            // But allow for larger changes in case of drag-extended selections
            if (followUpButton && Math.abs(selectedText.length - lastSelectedText.length) < 20) {
                lastSelectedText = selectedText;
                updateButtonPosition();
                
                // Log selection changes for debugging drag extensions
                if (selectedText !== lastSelectedText) {
                    console.log('Selection updated:', { 
                        from: lastSelectedText.substring(0, 30) + '...', 
                        to: selectedText.substring(0, 30) + '...',
                        lengthChange: selectedText.length - lastSelectedText.length
                    });
                }
                return;
            }
            
            // Remove existing button and create new one
            if (followUpButton) {
                // Clear any stability timeout since we're creating a new button
                if (buttonStabilityTimeout) {
                    clearTimeout(buttonStabilityTimeout);
                    buttonStabilityTimeout = null;
                }
                removeFollowUpButton();
            }

            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                // Only show button if selection is visible on screen
                if (rect.width > 0 && rect.height > 0) {
                    lastSelectedText = selectedText;
                    console.log('Creating Follow-up button for AI response selection:', selectedText.substring(0, 50) + '...');
                    createFollowUpButton(selectedText);
                }
            }
        }
        // If no meaningful selection, let handleSelectionChange deal with button removal
    }, 150); // Increased debounce to 150ms for better stability
}

function createFollowUpButton(text) {
    console.log('Creating follow-up button for text:', text.substring(0, 50) + '...');
    
    // Check if we can activate this feature
    if (!eventCoordinator.canActivateFeature('follow-up')) {
        console.log('Cannot activate follow-up feature due to priority conflicts');
        return;
    }
    
    // Create button element
    followUpButton = document.createElement('button');
    followUpButton.id = 'followUpButton';
    followUpButton.innerHTML = 'Follow-up';
    
    // Store in state
    enhancerState.set('followUp.button', followUpButton);
    
    // Store original text for debugging and fallback
    followUpButton.dataset.originalText = text;
    
    // Position the button above the selection with native spacing
    let preferredPosition = { top: 100, left: 100 }; // Default position
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Calculate optimal position
        preferredPosition = {
            top: window.scrollY + rect.top - 44, // 44px above for better spacing
            left: window.scrollX + rect.left
        };
        
        // Use event coordinator to resolve UI conflicts
        const adjustedPosition = eventCoordinator.requestUISpace('follow-up', followUpButton, preferredPosition);
        
        // Ensure button doesn't go off screen
        const viewportWidth = window.innerWidth;
        const buttonWidth = 120; // Approximate button width
        const finalLeft = Math.min(adjustedPosition.left, viewportWidth - buttonWidth - 16);
        
        followUpButton.style.position = 'absolute';
        followUpButton.style.left = `${Math.max(8, finalLeft)}px`;
        followUpButton.style.top = `${Math.max(8, adjustedPosition.top)}px`;
    }

    // Add hover event listeners to track hover state
    followUpButton.addEventListener('mouseenter', () => {
        enhancerState.set('followUp.isHoveringButton', true);
        // Cancel any pending removal when hovering
        const stabilityTimeout = enhancerState.get('followUp.stabilityTimeout');
        if (stabilityTimeout) {
            clearTimeout(stabilityTimeout);
            enhancerState.set('followUp.stabilityTimeout', null);
        }
    });
    
    followUpButton.addEventListener('mouseleave', () => {
        enhancerState.set('followUp.isHoveringButton', false);
    });
    
    followUpButton.onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Get the current selection at click time, not creation time
        // This handles cases where user extends selection after button appears
        const currentSelection = window.getSelection();
        const currentText = currentSelection.toString().trim();
        
        // Use current selection if it exists and is from AI response, otherwise fall back to original
        let textToUse = text;
        const originalText = followUpButton.dataset.originalText;
        
        if (currentText && currentText.length >= 3 && isSelectionFromAIResponse(currentSelection)) {
            textToUse = currentText;
            console.log("Using current selection:", {
                original: originalText?.substring(0, 30) + '...',
                current: textToUse.substring(0, 30) + '...',
                lengthChange: textToUse.length - (originalText?.length || 0)
            });
        } else if (currentText && currentText !== originalText) {
            console.log("Current selection rejected (not from AI response):", {
                current: currentText.substring(0, 30) + '...',
                usingOriginal: textToUse.substring(0, 30) + '...'
            });
        } else {
            console.log("Using original selection:", textToUse.substring(0, 30) + '...');
        }
        
        console.log("Follow-up button final text:", textToUse);
        
        // Add click feedback
        followUpButton.style.transform = 'translateY(0) scale(0.95)';
        
        setTimeout(() => {
            // Find input box and show enhanced citation card instead of just pasting text
            const inputBox = findGeminiInputBox();
            if (inputBox) {
                createInlineCitationCard(textToUse, inputBox);
                enhancerState.emit('citationCreated', { text: textToUse, inputBox });
            } else {
                // Fallback to old method if input box not found
                insertTextIntoInputBox(textToUse);
            }
            removeFollowUpButton();
        }, 100);
    };

    document.body.appendChild(followUpButton);
    
    // Activate feature in coordinator
    eventCoordinator.activateFeature('follow-up', { text, position: preferredPosition });
    
    // Force a reflow to ensure initial hidden state is applied
    followUpButton.offsetHeight;
    
    // Trigger show animation on next frame to prevent flash
    requestAnimationFrame(() => {
        if (followUpButton) {
            followUpButton.classList.add('show');
        }
    });
}

function removeFollowUpButton() {
    const followUpButton = enhancerState.get('followUp.button');
    
    if (followUpButton) {
        // Clear any stability timeout
        const stabilityTimeout = enhancerState.get('followUp.stabilityTimeout');
        if (stabilityTimeout) {
            clearTimeout(stabilityTimeout);
            enhancerState.set('followUp.stabilityTimeout', null);
        }
        
        // Disable pointer events immediately to prevent interaction during hide
        followUpButton.style.pointerEvents = 'none';
        
        // Remove show class to trigger hide animation
        followUpButton.classList.remove('show');
        
        // Apply explicit hide styles to ensure smooth transition
        followUpButton.style.transition = 'all 0.15s cubic-bezier(0.4, 0.0, 0.2, 1)';
        followUpButton.style.opacity = '0';
        followUpButton.style.transform = 'translateY(8px) scale(0.9)';
        
        setTimeout(() => {
            const currentButton = enhancerState.get('followUp.button');
            if (currentButton) {
                currentButton.remove();
                enhancerState.set('followUp.button', null);
            }
        }, 150);
        
        // Deactivate feature in coordinator
        eventCoordinator.deactivateFeature('follow-up');
    }
    
    // Reset state
    enhancerState.set('followUp.selectedText', '');
    enhancerState.set('followUp.isHoveringButton', false);
}

// Enhanced Citation System - Creates native-feeling inline citations
function createInlineCitationCard(text, inputBox) {
    const citationCard = document.createElement('div');
    citationCard.className = 'gemini-enhancer-citation-card';
    citationCard.innerHTML = `
        <div class="citation-header">
            <span class="citation-icon">↪</span>
            <span class="citation-label">Following up on:</span>
            <button class="citation-close" aria-label="Remove citation">×</button>
        </div>
        <div class="citation-content">${text}</div>
        <div class="citation-actions">
            <button class="citation-action" data-action="ask">Ask about this</button>
            <button class="citation-action" data-action="explain">Explain further</button>
            <button class="citation-action" data-action="examples">Give examples</button>
        </div>
    `;
    
    // Position card above input box
    const inputRect = inputBox.getBoundingClientRect();
    citationCard.style.cssText = `
        position: absolute;
        top: ${window.scrollY + inputRect.top - 160}px;
        left: ${window.scrollX + inputRect.left}px;
        width: ${Math.min(inputRect.width, 600)}px;
        z-index: 10002;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
    `;
    
    // Add event listeners
    const closeBtn = citationCard.querySelector('.citation-close');
    const actionBtns = citationCard.querySelectorAll('.citation-action');
    
    closeBtn.addEventListener('click', () => {
        removeCitationCard(citationCard);
    });
    
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            insertPromptWithCitation(text, action, inputBox);
            removeCitationCard(citationCard);
        });
    });
    
    document.body.appendChild(citationCard);
    
    // Animate in
    requestAnimationFrame(() => {
        citationCard.style.opacity = '1';
        citationCard.style.transform = 'translateY(0)';
    });
    
    // Auto-remove after 10 seconds if not interacted with
    setTimeout(() => {
        if (document.body.contains(citationCard)) {
            removeCitationCard(citationCard);
        }
    }, 10000);
    
    return citationCard;
}

function removeCitationCard(card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-10px)';
    setTimeout(() => {
        if (document.body.contains(card)) {
            card.remove();
        }
    }, 300);
}

function insertPromptWithCitation(text, action, inputBox) {
    let prompt = '';
    const shortText = text.length > 50 ? text.substring(0, 50) + '...' : text;
    
    switch (action) {
        case 'ask':
            prompt = `Regarding "${shortText}", I want to ask: `;
            break;
        case 'explain':
            prompt = `Please explain this in more detail: "${text}"`;
            break;
        case 'examples':
            prompt = `Can you provide examples related to: "${text}"`;
            break;
    }
    
    // Insert with smooth focus transition
    if (inputBox.hasAttribute('contenteditable')) {
        inputBox.innerText = prompt;
        inputBox.focus();
        
        // Position cursor at end
        const range = document.createRange();
        range.selectNodeContents(inputBox);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        inputBox.value = prompt;
        inputBox.focus();
        inputBox.setSelectionRange(prompt.length, prompt.length);
    }
    
    // Dispatch events for proper integration
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    inputBox.dispatchEvent(new Event('change', { bubbles: true }));
}

function insertTextIntoInputBox(text) {
    let inputBox = null;
    const hostname = window.location.hostname;

    if (hostname.includes('gemini.google.com')) {
        // Updated selectors for Gemini based on current structure
        const geminiSelectors = [
            'div[contenteditable="true"][role="textbox"]', // Most common for Gemini
            'rich-textarea div[contenteditable="true"]',
            'textarea[placeholder*="Enter a prompt"]', // Common Gemini placeholder
            'textarea[aria-label*="prompt"]',
            'div.ql-editor[contenteditable="true"]', // Quill editor format
            'div[data-placeholder*="Enter a prompt"]',
            '*[contenteditable="true"]' // Very broad fallback
        ];
        
        for (const selector of geminiSelectors) {
            inputBox = document.querySelector(selector);
            if (inputBox) {
                selectorUsed = selector;
                console.log(`Gemini input box found with selector: ${selector}`);
                break;
            }
        }

    }

    // Ultimate fallback - try any contenteditable or textarea
    if (!inputBox) {
        console.log("Trying fallback selectors...");
        const fallbackSelectors = [
            'div[contenteditable="true"]',
            'textarea',
            'input[type="text"]'
        ];
        
        for (const selector of fallbackSelectors) {
            const elements = document.querySelectorAll(selector);
            // Find the most likely input (visible and not too small)
            for (const element of elements) {
                const rect = element.getBoundingClientRect();
                if (rect.width > 100 && rect.height > 20 && element.offsetParent !== null) {
                    inputBox = element;
                    selectorUsed = `${selector} (fallback)`;
                    console.log(`Fallback input box found with selector: ${selector}`);
                    break;
                }
            }
            if (inputBox) break;
        }
    }

    if (inputBox) {
        console.log("Input box found:", inputBox, "using selector:", selectorUsed);
        console.log("Input box type:", inputBox.tagName, "contenteditable:", inputBox.getAttribute('contenteditable'));
        
        // Store reference for slash commands
        lastInputBox = inputBox;
        
        // Focus the input box
        inputBox.focus();
        inputBox.click(); // Sometimes click is needed to properly focus

        // Try multiple methods to insert text
        let success = false;

        // Method 1: For contenteditable elements
        if (inputBox.hasAttribute('contenteditable') && inputBox.getAttribute('contenteditable') === 'true') {
            try {
                // Place citation on first line, cursor on next
                inputBox.innerText = citationText;
                inputBox.focus();
                // Move cursor to end (new line)
                const range = document.createRange();
                range.selectNodeContents(inputBox);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                // Dispatch input event
                inputBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                success = true;
            } catch (e) {
                console.warn("contenteditable method failed:", e);
            }
        } 
        // Method 2: For textarea and input elements
        else if (inputBox.tagName.toLowerCase() === 'textarea' || inputBox.tagName.toLowerCase() === 'input') {
            try {
                inputBox.value = citationText;
                inputBox.focus();
                // Move cursor to end (new line)
                inputBox.setSelectionRange(inputBox.value.length, inputBox.value.length);
                // Dispatch input event
                inputBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                success = true;
            } catch (e) {
                console.warn("textarea/input method failed:", e);
            }
        }
        // Modern clipboard API fallback
        if (!success) {
            try {
                navigator.clipboard.writeText(citationText).then(() => {
                    inputBox.focus();
                    // Suggest manual paste to user since execCommand is deprecated
                    console.log("Text copied to clipboard. You can paste it manually with Ctrl+V or Cmd+V");
                });
                success = true;
            } catch (e) {
                console.warn("Clipboard fallback failed:", e);
            }
        }
        if (success) {
            console.log(`Successfully inserted citation: "${citationText}" into input box`);
        } else {
            alert("Failed to insert citation. Please try copying manually.");
        }
    } else {
        alert("Follow-up Helper: Could not find the chat input box. Please check console for details.");
    }
}

// Monitor input changes for slash commands
document.addEventListener('input', handleInputChange, true);
document.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
document.addEventListener('keyup', handleKeyUp, true);
document.addEventListener('click', handleDocumentClick, true);
document.addEventListener('focusout', handleFocusOut, true);

function handleInputChange(event) {
    const target = event.target;
    
    // Check if this is a chat input box
    if (isChatInputBox(target)) {
        lastInputBox = target;
        enhancerState.set('slashCommands.lastInputBox', target);
        const text = getInputText(target);
        const cursorPos = getCursorPosition(target);
        
        // Check for slash command at cursor position
        const beforeCursor = text.substring(0, cursorPos);
        const slashMatch = beforeCursor.match(/\/(\w*)$/);
        
        // Debug logging
        console.log('Input change detected:', {
            text: text,
            cursorPos: cursorPos,
            beforeCursor: beforeCursor,
            slashMatch: slashMatch,
            dropdownVisible: commandAutocomplete ? commandAutocomplete.style.display !== 'none' : false
        });
        
        if (slashMatch) {
            const partial = slashMatch[1].toLowerCase();
            showCommandAutocomplete(target, partial, slashMatch.index);
        } else {
            hideCommandAutocomplete();
        }
    } else {
        // If this is not a chat input box but dropdown is visible, hide it
        if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
            console.log('Hiding dropdown because target is not a chat input box');
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
                scrollIntoViewIfNeeded(items[selectedIndex]);
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                event.stopPropagation();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection(items, selectedIndex);
                scrollIntoViewIfNeeded(items[selectedIndex]);
                break;
                
            case 'Enter':
            case 'Tab':
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    selectCommand(items[selectedIndex].dataset.command);
                }
                // Return false to prevent any further processing
                return false;
                
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                hideCommandAutocomplete();
                break;
                
            case 'Backspace':
            case 'Delete':
                // On deletion keys, we'll let the input event handle the logic
                // but we can do an immediate check for edge cases
                console.log('Delete key pressed, will recheck slash command state after input event');
                break;
        }
    }
}

function handleKeyUp(event) {
    // Additional check after key release for better responsiveness
    if (event.target && isChatInputBox(event.target)) {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            const text = getInputText(event.target);
            const cursorPos = getCursorPosition(event.target);
            const beforeCursor = text.substring(0, cursorPos);
            const slashMatch = beforeCursor.match(/\/(\w*)$/);
            
            if (!slashMatch && commandAutocomplete && commandAutocomplete.style.display !== 'none') {
                console.log('KeyUp: No slash command found, hiding dropdown');
                hideCommandAutocomplete();
            }
        }, 0);
    }
}

function handleFocusOut(event) {
    // Hide dropdown when input loses focus, but with a delay to allow click events
    if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
        if (!event.relatedTarget || !commandAutocomplete.contains(event.relatedTarget)) {
            console.log('Focus lost, hiding dropdown with delay');
            setTimeout(() => {
                if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
                    hideCommandAutocomplete();
                }
            }, 200); // Small delay to allow click events to process
        }
    }
}

function handleDocumentClick(event) {
    if (commandAutocomplete && commandAutocomplete.style.display !== 'none') {
        // If clicking on an autocomplete item, let it handle the selection
        if (commandAutocomplete.contains(event.target)) {
            return;
        }
        
        // If clicking outside the dropdown and not on the input box, hide dropdown
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
    
    // Fallback for any contenteditable or textarea that looks like a chat input
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
    // Use the legacy variable for compatibility
    const matchingCommands = Object.keys(slashCommands).filter(cmd => 
        cmd.toLowerCase().startsWith(partial)
    );
    
    console.log('showCommandAutocomplete called:', {
        partial: partial,
        matchingCommands: matchingCommands,
        slashIndex: slashIndex
    });
    
    if (matchingCommands.length === 0) {
        hideCommandAutocomplete();
        return;
    }
    
    // Double-check that we still have a valid slash command at cursor position
    const currentText = getInputText(inputElement);
    const currentCursorPos = getCursorPosition(inputElement);
    const currentBeforeCursor = currentText.substring(0, currentCursorPos);
    const currentSlashMatch = currentBeforeCursor.match(/\/(\w*)$/);
    
    if (!currentSlashMatch) {
        console.log('Slash command no longer valid, hiding dropdown');
        hideCommandAutocomplete();
        return;
    }
    
    // Create or update autocomplete dropdown
    if (!commandAutocomplete) {
        commandAutocomplete = createAutocompleteDropdown();
    }
    
    // Position the dropdown
    positionAutocomplete(inputElement);
    
    // Get selected text for better preview
    const selectedText = window.getSelection().toString().trim();
    const previewText = selectedText || '[selected text]';
    
    // Populate with matching commands with enhanced UI and live preview
    commandAutocomplete.innerHTML = matchingCommands.map((cmd, index) => {
        const commandPrompt = slashCommands[cmd] || '';
        const fullPreview = commandPrompt.replace('{text}', previewText);
        const truncatedPreview = fullPreview.length > 80 
            ? fullPreview.substring(0, 80) + '...' 
            : fullPreview;
        
        return `
            <div class="autocomplete-item ${index === 0 ? 'selected' : ''}" data-command="${cmd}" data-full-preview="${fullPreview}">
                <div class="command-header">
                    <div class="command-name">
                        <span class="slash-indicator">/</span>${cmd}
                    </div>
                    <div class="keyboard-hint">↵</div>
                </div>
                <div class="command-preview">${truncatedPreview}</div>
                <div class="live-preview" style="display: none;">
                    <div class="preview-label">Preview:</div>
                    <div class="preview-content">${fullPreview}</div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add enhanced hover handlers for live preview
    commandAutocomplete.querySelectorAll('.autocomplete-item').forEach((item, index) => {
        // Click handlers
        item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectCommand(item.dataset.command);
        }, { capture: true });
        
        item.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectCommand(item.dataset.command);
        }, { capture: true });
        
        // Enhanced hover for live preview
        item.addEventListener('mouseenter', () => {
            // Update selection state
            commandAutocomplete.querySelectorAll('.autocomplete-item').forEach(i => 
                i.classList.remove('selected'));
            item.classList.add('selected');
            
            // Show live preview
            const livePreview = item.querySelector('.live-preview');
            if (livePreview) {
                livePreview.style.display = 'block';
                // Animate in
                livePreview.style.opacity = '0';
                livePreview.style.transform = 'translateY(-5px)';
                setTimeout(() => {
                    livePreview.style.transition = 'all 0.2s ease';
                    livePreview.style.opacity = '1';
                    livePreview.style.transform = 'translateY(0)';
                }, 10);
            }
        });
        
        item.addEventListener('mouseleave', () => {
            // Hide live preview
            const livePreview = item.querySelector('.live-preview');
            if (livePreview) {
                livePreview.style.opacity = '0';
                setTimeout(() => {
                    livePreview.style.display = 'none';
                }, 200);
            }
        });
    });
    
    // Activate feature in coordinator
    eventCoordinator.activateFeature('slash-commands', { 
        partial, 
        commands: matchingCommands,
        inputElement 
    });
    
    // Show with smooth animation
    commandAutocomplete.style.display = 'block';
    // Force a reflow to ensure the display change is applied
    commandAutocomplete.offsetHeight;
    // Trigger the animation
    setTimeout(() => {
        if (commandAutocomplete) {
            commandAutocomplete.style.opacity = '1';
            commandAutocomplete.style.transform = 'translateY(0) scale(1)';
        }
    }, 0);
    
    // Re-position after content is populated (for accurate height calculation)
    setTimeout(() => positionAutocomplete(inputElement), 0);
}

function createAutocompleteDropdown() {
    commandAutocomplete = document.createElement('div');
    commandAutocomplete.id = 'slashCommandAutocomplete';
    // Styles are now handled by the CSS file for better theme support
    document.body.appendChild(commandAutocomplete);
    return commandAutocomplete;
}

function positionAutocomplete(inputElement) {
    const style = commandAutocomplete.style;
    const dropdownHeight = commandAutocomplete.offsetHeight || 280; // fallback height matches max-height
    
    // Get cursor position for precise positioning
    const cursorPos = getCursorPosition(inputElement);
    const caretCoords = getCaretCoordinates(inputElement, cursorPos);
    
    if (caretCoords) {
        // Position dropdown above the cursor line with proper spacing (native feel)
        const targetTop = caretCoords.top - dropdownHeight - 8; // 8px gap for better visual spacing
        
        style.left = `${caretCoords.left}px`;
        style.top = `${targetTop}px`;
        
        // Handle viewport boundaries
        const viewportWidth = window.innerWidth;
        
        // If dropdown goes above viewport, position below cursor line instead
        if (targetTop < window.scrollY + 20) {
            style.top = `${caretCoords.bottom + 2}px`;
        }
        
        // Ensure dropdown doesn't go off right edge
        const dropdownWidth = 150; // Fixed width - 40% of original 280px
        if (caretCoords.left + dropdownWidth > viewportWidth) {
            style.left = `${viewportWidth - dropdownWidth - 10}px`;
        }
        
        style.width = `${dropdownWidth}px`;
        style.minWidth = '150px';
        style.maxWidth = '150px';
    } else {
        // Fallback to old method if caret coordinates unavailable
        const rect = inputElement.getBoundingClientRect();
        style.left = `${window.scrollX + rect.left}px`;
        style.top = `${window.scrollY + rect.top - dropdownHeight - 8}px`;
        style.width = '150px';
        style.minWidth = '150px';
        style.maxWidth = '240px';
        
        if (rect.top - dropdownHeight < 0) {
            style.top = `${window.scrollY + rect.bottom + 8}px`;
        }
    }
}

// Utility: Get caret coordinates in textarea or contenteditable
function getCaretCoordinates(element, caretPos) {
    if (!element) return null;
    let rect = element.getBoundingClientRect();
    let left = rect.left, top = rect.top, bottom = rect.bottom;
    // For textarea/input
    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
        // Use a hidden mirror div to get caret position
        const mirror = document.createElement('div');
        const computed = getComputedStyle(element);
        for (const prop of [
            'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
            'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration',
            'letterSpacing', 'wordSpacing'
        ]) {
            mirror.style[prop] = computed[prop];
        }
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.left = '-9999px';
        mirror.style.top = '0px';
        mirror.textContent = element.value.substring(0, caretPos !== undefined ? caretPos : element.selectionStart);
        // Add a marker span
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
    // For contenteditable
    if (element.hasAttribute('contenteditable')) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0).cloneRange();
            if (caretPos !== undefined) {
                // Move range to the slash position
                let node = element.firstChild;
                let pos = caretPos;
                while (node && pos > 0) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.length >= pos) {
                            range.setStart(node, pos);
                            range.collapse(true);
                            break;
                        } else {
                            pos -= node.length;
                        }
                    }
                    node = node.nextSibling;
                }
            }
            const rects = range.getClientRects();
            if (rects.length > 0) {
                const r = rects[0];
                return { left: r.left + window.scrollX, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
            }
        }
    }
    // fallback to input box top/left
    return { left, top, bottom };
}

function updateSelection(items, selectedIndex) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });
}

function selectCommand(commandName) {
    console.log('selectCommand called with:', commandName);
    console.log('lastInputBox:', lastInputBox);
    console.log('slashCommands[commandName]:', slashCommands[commandName]);
    
    if (!lastInputBox || !slashCommands[commandName]) {
        console.log('Cannot select command - missing input box or command');
        hideCommandAutocomplete();
        return;
    }
    
    const text = getInputText(lastInputBox);
    const cursorPos = getCursorPosition(lastInputBox);
    
    console.log('Current text:', text);
    console.log('Cursor position:', cursorPos);
    
    // Find the slash command in the text
    const beforeCursor = text.substring(0, cursorPos);
    const slashMatch = beforeCursor.match(/\/(\w*)$/);
    
    console.log('Slash match:', slashMatch);
    
    if (slashMatch) {
        const commandPrompt = slashCommands[commandName];
        const selectedText = window.getSelection().toString().trim();
        
        console.log('Command prompt:', commandPrompt);
        console.log('Selected text:', selectedText);
        
        // Replace {text} placeholder with selected text
        const finalPrompt = commandPrompt.replace(/\{text\}/g, selectedText || '');
        
        // Replace the slash command with the prompt
        const newText = text.substring(0, slashMatch.index) + finalPrompt + text.substring(cursorPos);
        
        console.log('Final prompt:', finalPrompt);
        console.log('New text:', newText);
        
        // Update the input
        setInputText(lastInputBox, newText);
        
        // Position cursor after the inserted text
        const newCursorPos = slashMatch.index + finalPrompt.length;
        setCursorPosition(lastInputBox, newCursorPos);
        
        console.log('Command selection completed successfully');
    } else {
        console.log('No slash match found in text');
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
        
        // Find the text node and position
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
        console.log('Hiding command autocomplete dropdown');
        
        // Deactivate feature in coordinator
        eventCoordinator.deactivateFeature('slash-commands');
        
        // Smooth hide animation
        commandAutocomplete.style.opacity = '0';
        commandAutocomplete.style.transform = 'translateY(8px) scale(0.95)';
        setTimeout(() => {
            if (commandAutocomplete) {
                commandAutocomplete.style.display = 'none';
                commandAutocomplete.innerHTML = ''; // Clear content to avoid stale state
            }
        }, 150);
    }
}

function scrollIntoViewIfNeeded(element) {
    if (!element || !commandAutocomplete) return;
    
    const container = commandAutocomplete;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    if (elementRect.top < containerRect.top) {
        // Element is above visible area
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (elementRect.bottom > containerRect.bottom) {
        // Element is below visible area
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// Wide Mode Functionality
async function loadWideModeSettings() {
    try {
        const result = await browserAPI.storage.sync.get(['wideModeEnabled', 'wideModeWidth']);
        wideModeEnabled = result.wideModeEnabled || false;
        wideModeWidth = result.wideModeWidth || 1200;
        
        if (wideModeEnabled) {
            // Apply wide mode on page load if enabled
            applyWideMode();
        }
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            console.log('Extension context invalidated - skipping wide mode settings load');
            return;
        }
        console.error('Error loading wide mode settings:', error);
    }
}

function applyWideMode() {
    if (wideModeApplied) {
        // Update existing wide mode
        updateWideMode();
        return;
    }
    
    console.log('Applying wide mode with width:', wideModeWidth);
    
    // Create style element for wide mode if it doesn't exist
    let wideStyleElement = document.getElementById('gemini-enhancer-wide-mode');
    if (!wideStyleElement) {
        wideStyleElement = document.createElement('style');
        wideStyleElement.id = 'gemini-enhancer-wide-mode';
        document.head.appendChild(wideStyleElement);
    }
    
    // CSS rules to widen only the conversation area, don't touch sidebar at all
    wideStyleElement.textContent = `
        /* Only target content containers - leave sidebar completely untouched */
        
        /* Override common width constraints in conversation messages */
        [data-testid="conversation-turn"],
        [data-testid*="turn-content"],
        .model-response-text,
        .user-input-text {
            max-width: ${wideModeWidth}px !important;
        }
        
        /* Widen the input area */
        rich-textarea,
        [contenteditable="true"][role="textbox"] {
            max-width: ${wideModeWidth}px !important;
        }
        
        /* Target input containers */
        rich-textarea > div,
        [role="textbox"] > div,
        [data-testid*="input"] {
            max-width: ${wideModeWidth}px !important;
        }
        
        /* Override inline styles with common hardcoded widths */
        [style*="max-width: 768px"],
        [style*="max-width: 720px"],
        [style*="max-width: 800px"],
        [style*="max-width: 900px"] {
            max-width: ${wideModeWidth}px !important;
        }
        
        /* Target any message content containers */
        [data-testid*="message"],
        [data-testid*="response"],
        .conversation-container {
            max-width: ${wideModeWidth}px !important;
        }
        
        /* Ensure body can accommodate wider content */
        body {
            overflow-x: auto !important;
        }
    `;
    
    // Also directly modify elements that might be constraining width
    setTimeout(() => {
        applyWideModeToElements();
    }, 100);
    
    // Start interval to continuously apply wide mode as content loads
    if (wideModeInterval) {
        clearInterval(wideModeInterval);
    }
    wideModeInterval = setInterval(() => {
        if (wideModeEnabled) {
            applyWideModeToElements();
        }
    }, 2000); // Check every 2 seconds
    
    wideModeApplied = true;
    console.log('Wide mode applied successfully');
}

function applyWideModeToElements() {
    // Only target content elements that need widening, avoid layout containers
    const contentSelectors = [
        '[data-testid="conversation-turn"]',
        '[data-testid*="turn-content"]',
        'rich-textarea',
        '[contenteditable="true"][role="textbox"]',
        '.model-response-text',
        '.user-input-text'
    ];
    
    contentSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            const computedStyle = window.getComputedStyle(element);
            const currentMaxWidth = computedStyle.maxWidth;
            
            // Only modify if element has a restrictive max-width that's smaller than our target
            if (currentMaxWidth && currentMaxWidth !== 'none' && parseInt(currentMaxWidth) < wideModeWidth) {
                element.style.maxWidth = `${wideModeWidth}px`;
                console.log(`Wide mode: Updated ${selector} from ${currentMaxWidth} to ${wideModeWidth}px`);
            }
        });
    });
    
    // Look for conversation-related divs with inline width constraints
    const constrainedDivs = document.querySelectorAll('[data-testid*="conversation"] div[style*="max-width"], [data-testid*="turn"] div[style*="max-width"]');
    constrainedDivs.forEach(div => {
        const style = div.getAttribute('style');
        if (style && (style.includes('768px') || style.includes('720px') || style.includes('800px') || style.includes('900px'))) {
            div.style.maxWidth = `${wideModeWidth}px`;
            console.log('Wide mode: Updated conversation div with inline style');
        }
    });
}

function updateWideMode() {
    const wideStyleElement = document.getElementById('gemini-enhancer-wide-mode');
    if (wideStyleElement && wideModeApplied) {
        // Reapply the styles with new width
        wideModeApplied = false; // Reset to force reapplication
        applyWideMode();
        console.log('Wide mode updated to width:', wideModeWidth);
    }
}

function removeWideMode() {
    console.log('Removing wide mode');
    const wideStyleElement = document.getElementById('gemini-enhancer-wide-mode');
    if (wideStyleElement) {
        wideStyleElement.remove();
    }
    
    // Clear the monitoring interval
    if (wideModeInterval) {
        clearInterval(wideModeInterval);
        wideModeInterval = null;
    }
    
    wideModeApplied = false;
    console.log('Wide mode removed successfully');
}

// Apply wide mode on page navigation changes
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function() {
    originalPushState.apply(history, arguments);
    setTimeout(() => {
        if (wideModeEnabled) {
            applyWideMode();
        }
    }, 500);
};

history.replaceState = function() {
    originalReplaceState.apply(history, arguments);
    setTimeout(() => {
        if (wideModeEnabled) {
            applyWideMode();
        }
    }, 500);
};

window.addEventListener('popstate', () => {
    setTimeout(() => {
        if (wideModeEnabled) {
            applyWideMode();
        }
    }, 500);
});



