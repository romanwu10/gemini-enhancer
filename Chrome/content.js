console.log("Gemini Enhancer content script loaded.");

// Prevent double-injection across SPA navigations or extension reloads
if (window.__GEMINI_ENHANCER_ACTIVE__) {
    console.log('Gemini Enhancer already active — skipping init.');
    // Halt further execution in this context to prevent duplicate listeners
    throw new Error('Gemini Enhancer already initialized');
}
window.__GEMINI_ENHANCER_ACTIVE__ = true;

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
let isRepositionScheduled = false; // throttle scroll-based reposition
// Wide mode variables removed

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
            
            // Wide mode state removed
            
            // Auto-save state
            autoSave: {
                timeout: null,
                lastRestoredUrl: null,
                lastInputField: null
            },
            
            // UI state
            ui: {
                actionBar: null,
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

// Lightweight in-page toast for non-blocking notifications
function showToast(message, type = 'info') {
    try {
        // Reuse style element if present
        if (!document.getElementById('ge_toast_styles')) {
            const style = document.createElement('style');
            style.id = 'ge_toast_styles';
            style.textContent = `
                @keyframes ge_slideInFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes ge_slideOutFade { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(8px); } }
                .ge-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                  background: #137333; color: #fff; padding: 8px 12px; border-radius: 6px; font: 500 13px 'Google Sans',system-ui,sans-serif;
                  z-index: 2147483647; box-shadow: 0 2px 8px rgba(0,0,0,.2); opacity: 0; animation: ge_slideInFade .15s ease forwards; }
                .ge-toast.error { background: #d93025; }
            `;
            document.head.appendChild(style);
        }
        const el = document.createElement('div');
        el.className = `ge-toast ${type === 'error' ? 'error' : ''}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'ge_slideOutFade .15s ease forwards';
            setTimeout(() => el.remove(), 180);
        }, 2200);
    } catch (_) {
        // Fallback to console if DOM not ready
        console.log('[Gemini Enhancer]', type, message);
    }
}

// Unified Event Coordination System
class EventCoordinator {
    constructor() {
        this.activeFeatures = new Set();
        this.eventQueue = [];
        this.isProcessing = false;
        this.featurePriority = {
            'follow-up': 3,
            'slash-commands': 2,
            // Wide mode priority removed
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

// Context menu functionality removed as requested by user

// Improved and more reliable AI response detection
function isSelectionFromAIResponse(selection) {
    if (!selection || selection.rangeCount === 0) return false;
    
    const selectedText = selection.toString().trim();
    console.log('🔍 Checking selection:', selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''));
    
    // Length validation (CJK-friendly): allow 1+ CJK chars or 2+ others
    const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(selectedText);
    if ((hasCJK ? selectedText.length < 1 : selectedText.length < 2) || selectedText.length > 2000) {
        console.log(`❌ Selection length invalid for rules, len=${selectedText.length}, hasCJK=${hasCJK}`);
        return false;
    }
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    let element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    
    // Check if selection is within input/editable areas (absolute block)
    while (element && element !== document.body) {
        const tagName = element.tagName?.toLowerCase();
        const isEditable = element.contentEditable === 'true' || element.contentEditable === '';
        const role = element.getAttribute('role');
        const ariaLabel = element.getAttribute('aria-label');
        
        if (
            tagName === 'textarea' ||
            tagName === 'input' ||
            isEditable ||
            role === 'textbox' ||
            role === 'searchbox' ||
            ariaLabel === 'Message Gemini' ||
            element.closest('[contenteditable="true"], [contenteditable=""], textarea, input, [role="textbox"], [aria-label="Message Gemini"]')
        ) {
            console.log('❌ Selection in input area:', { tagName, isEditable, role, ariaLabel });
            return false;
        }
        
        element = element.parentElement;
    }
    
    // Relaxed proximity rules: only block if the selection actually overlaps
    // any visible input-like element. This avoids false negatives.
    try {
        const selectionRect = range.getBoundingClientRect();
        if (selectionRect.width === 0 || selectionRect.height === 0) {
            console.log('❌ Selection has no visible dimensions');
            return false;
        }
        const visibleInputs = document.querySelectorAll(
            'textarea, input, [contenteditable="true"], [role="textbox"]'
        );
        for (const input of visibleInputs) {
            if (input.offsetParent === null || !input.getBoundingClientRect) continue;
            const r = input.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const overlap = !(
                selectionRect.right < r.left ||
                selectionRect.left > r.right ||
                selectionRect.bottom < r.top ||
                selectionRect.top > r.bottom
            );
            if (overlap) {
                console.log('❌ Selection overlaps with an input area');
                return false;
            }
        }
    } catch (error) {
        console.warn('Error in proximity check:', error);
        // Continue with other checks if proximity check fails
    }
    
    // Much more permissive content validation - allow almost any reasonable text
    const isValidText = (
        // Contains letters and basic punctuation
        /[a-zA-Z]/i.test(selectedText) &&
        // Not just random characters or numbers
        !/^[\d\s\W]*$/.test(selectedText) &&
        // Not just whitespace or single characters repeated
        !/^(.)\1*$/.test(selectedText.trim()) &&
        // Contains at least one word character
        /\w/.test(selectedText)
    );
    
    if (isValidText) {
        console.log('✅ Selection contains valid text content');
        return true;
    }
    
    console.log('❌ Selection does not contain valid text');
    return false;
}

// Note: browserAPI and legacy variables are now declared at the top

// Load slash commands from storage
loadSlashCommands();

// Wide mode loading removed

// Listen for messages from popup
browserAPI.runtime.onMessage.addListener((message) => {
    // Wide mode message handlers removed
    console.log('Message received:', message);
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
        // Primary selection events
        { type: 'mouseup', handler: handleTextSelection, options: { passive: true } },
        { type: 'mousedown', handler: handleMouseDown, options: { passive: true } },
        { type: 'selectionchange', handler: handleSelectionChange, options: { passive: true } },
        
        // Additional selection events for better reliability
        { type: 'touchend', handler: handleTextSelection, options: { passive: true } },  // Mobile support
        { type: 'keyup', handler: handleKeyboardSelection, options: { passive: true } }, // Keyboard selection
        // Keyup handler for slash command lifecycle (hide/show on release)
        { type: 'keyup', handler: handleKeyUp, options: { capture: true, passive: true } },
        // Capture scroll/gesture events on any container to keep overlays in sync
        { type: 'scroll', handler: handleAnyScroll, options: { capture: true, passive: true } },
        { type: 'wheel', handler: handleAnyScroll, options: { capture: true, passive: true } },
        { type: 'touchmove', handler: handleAnyScroll, options: { capture: true, passive: true } },
        
        // Other events
        { type: 'input', handler: handleInputChange, options: { capture: true, passive: true } },
        { type: 'keydown', handler: handleKeyDown, options: { capture: true, passive: false } },
        { type: 'click', handler: handleDocumentClick, options: { capture: true, passive: true } },
        { type: 'focusout', handler: handleFocusOut, options: { passive: true } }
    ];
    
    events.forEach(({ type, handler, options }) => {
        document.addEventListener(type, handler, options);
        enhancerState.addCleanup(() => {
            document.removeEventListener(type, handler, options);
        });
    });
    
    // Reposition UI on resize/scroll for native feel
    const onViewportChange = () => {
        try {
            // Reposition slash autocomplete if visible
            if (commandAutocomplete && commandAutocomplete.style.display === 'block' && enhancerState.get('slashCommands.lastInputBox')) {
                positionAutocomplete(enhancerState.get('slashCommands.lastInputBox'));
            }
            // Reposition follow-up button near selection if present
            updateButtonPosition();
        } catch (_) { /* noop */ }
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, { passive: true });
    enhancerState.addCleanup(() => {
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, { passive: true });
    });

    // Save autosave buffer when tab becomes hidden
    const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
            saveInputContent();
        }
    };
    document.addEventListener('visibilitychange', onVisibility);
    enhancerState.addCleanup(() => document.removeEventListener('visibilitychange', onVisibility));

    console.log('Event listeners initialized with cleanup');
}

// Initialize event listeners only if not on excluded paths
if (!isExcludedPath()) {
    initializeEventListeners();
}

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
        
        // Check if we're on an excluded path and disable features accordingly
        if (isExcludedPath()) {
            console.log('Gemini Enhancer disabled on excluded path:', window.location.pathname);
            // Clean up any active features
            const followUpButton = enhancerState.get('followUp.button');
            if (followUpButton) {
                followUpButton.remove();
                enhancerState.set('followUp.button', null);
            }
            hideCommandAutocomplete();
            return;
        }
        
        observeInputBox();
    } else if (!isExcludedPath()) {
        // Even if URL didn't change, try to restore if input is present and not restored
        const inputField = findGeminiInputBox();
        if (inputField) restoreInputContent(inputField);
    }
}

function startUrlPolling() {
    // Clear existing interval - reuse the removed wide mode interval variable for cleanup
    const currentInterval = enhancerState.get('observers.urlPolling');
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

function isExcludedPath() {
    const pathname = window.location.pathname;
    const excludedPaths = ['/u/1/apps', '/u/1/saved-info'];
    return excludedPaths.some(path => pathname.startsWith(path));
}

if (!isExcludedPath()) {
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
} else {
    console.log('Gemini Enhancer disabled on excluded path:', window.location.pathname);
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

// Context menu handler removed as requested by user

function handleSelectionChange() {
    // Use the main text selection handler instead of duplicating logic
    handleTextSelection({ type: 'selectionchange', target: document.activeElement || document.body });
}

function updateButtonPosition() {
    const followUpButton = enhancerState.get('followUp.button');
    if (!followUpButton || !followUpButton.parentNode) return;
    
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    
    try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Skip if selection is not visible
        if (rect.width === 0 || rect.height === 0) return;
        
    // Get container dimensions dynamically
    const containerWidth = followUpButton.offsetWidth || 320;
    const containerHeight = followUpButton.offsetHeight || 48;
    const margin = 8;
        
        // Calculate position above selection
        let buttonTop = rect.top - containerHeight - margin;
        let buttonLeft = rect.left + (rect.width / 2) - (containerWidth / 2);
        
        // Keep within viewport bounds
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
        };
        
        // Horizontal bounds
        buttonLeft = Math.max(8, Math.min(buttonLeft, viewport.width - containerWidth - 8));
        
        // Vertical bounds - if no room above, place below
        if (buttonTop < 8) {
            buttonTop = rect.bottom + margin;
            if (buttonTop + containerHeight > viewport.height - 8) {
                // If no room above or below, place at top of viewport
                buttonTop = 8;
            }
        }
        
        // Convert to absolute positioning
        const finalLeft = buttonLeft + viewport.scrollX;
        const finalTop = buttonTop + viewport.scrollY;
        
        // Update position if changed significantly
        const currentLeft = parseFloat(followUpButton.style.left) || 0;
        const currentTop = parseFloat(followUpButton.style.top) || 0;
        
        if (Math.abs(currentLeft - finalLeft) > 1 || Math.abs(currentTop - finalTop) > 1) {
            followUpButton.style.left = `${Math.max(0, finalLeft)}px`;
            followUpButton.style.top = `${Math.max(0, finalTop)}px`;
            console.log(`📝 Button positioned at (${finalLeft.toFixed(0)}, ${finalTop.toFixed(0)})`);
        }
    } catch (error) {
        console.warn('Error updating button position:', error);
    }
}

// Capture scroll from any scrollable container and keep follow-up button in sync
function handleAnyScroll() {
    const btn = enhancerState.get('followUp.button');
    if (!btn) return;
    if (isRepositionScheduled) return;
    isRepositionScheduled = true;
    requestAnimationFrame(() => {
        isRepositionScheduled = false;
        updateButtonPosition();
    });
}

function handleTextSelection(event) {
    console.log('📝 handleTextSelection called with event:', event.type, 'target:', event.target?.tagName);
    
    // Clear any existing timeout
    if (selectionTimeout) {
        clearTimeout(selectionTimeout);
    }
    
    // Use shorter debounce for better responsiveness
    selectionTimeout = setTimeout(() => {
        try {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            console.log('📝 Processing selection:', selectedText.length > 0 ? `"${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}"` : 'No selection');

            const followUpContainer = enhancerState.get('followUp.button');
            
            // If clicking on the follow-up button, don't interfere
            if (followUpContainer && event.target && (followUpContainer.contains(event.target) || followUpContainer === event.target)) {
                console.log('📝 Click was on follow-up button, ignoring');
                return;
            }

            // Handle meaningful text selection (CJK-friendly minimal length)
            const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(selectedText);
            const meetsMinLen = selectedText && (hasCJK ? selectedText.length >= 1 : selectedText.length >= 2);
            if (meetsMinLen) {
                // Check if this is a valid selection for follow-up
                if (!isSelectionFromAIResponse(selection)) {
                    console.log('📝 Selection blocked by AI response filter');
                    if (followUpContainer) {
                        removeFollowUpButton();
                    }
                    return;
                }
                
                // Update or create button
                if (followUpContainer && followUpContainer.parentNode) {
                    // Update existing button position and content
                    lastSelectedText = selectedText;
                    enhancerState.set('followUp.selectedText', selectedText);
                    updateButtonPosition();
                    
                    // Clear any removal timeout
                    const stabilityTimeout = enhancerState.get('followUp.stabilityTimeout');
                    if (stabilityTimeout) {
                        clearTimeout(stabilityTimeout);
                        enhancerState.set('followUp.stabilityTimeout', null);
                    }
                    
                    console.log('📝 Updated existing button for new selection');
                    return;
                }
                
                // Create new button - ensure we have a valid range first
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    
                    // More lenient visibility check
                    if (rect.width > 0 && rect.height > 0 && rect.top > -50 && rect.left > -50) {
                        lastSelectedText = selectedText;
                        enhancerState.set('followUp.selectedText', selectedText);
                        console.log('📝 Creating new follow-up button');
                        createFollowUpButton(selectedText);
                    } else {
                        console.log('📝 Selection not sufficiently visible:', rect);
                    }
                }
            } else {
                // No selection - remove follow-up button immediately (unless hovering)
                if (followUpContainer && followUpContainer.parentNode) {
                    const isHoveringButton = enhancerState.get('followUp.isHoveringButton');
                    if (!isHoveringButton) {
                        console.log('📝 No selection, removing follow-up button immediately');
                        const stabilityTimeout = enhancerState.get('followUp.stabilityTimeout');
                        if (stabilityTimeout) {
                            clearTimeout(stabilityTimeout);
                            enhancerState.set('followUp.stabilityTimeout', null);
                        }
                        removeFollowUpButton();
                    }
                }
            }
        } catch (error) {
            console.error('📝 Error in handleTextSelection:', error);
        }
    }, 50); // Shorter debounce for better responsiveness
}

// Handle keyboard-based text selection (Shift+arrows, Ctrl+A, etc.)
function handleKeyboardSelection(event) {
    console.log('⌨️ handleKeyboardSelection called with key:', event.key);
    
    // Only handle keys that might change selection
    const selectionKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'a'];
    const modifierKeys = event.shiftKey || event.ctrlKey || event.metaKey;
    
    if (selectionKeys.includes(event.key) && modifierKeys) {
        console.log('⌨️ Keyboard selection event detected');
        
        // Delay to let selection update
        setTimeout(() => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(selectedText);
            const meetsMinLen = selectedText && (hasCJK ? selectedText.length >= 1 : selectedText.length >= 2);
            if (meetsMinLen) {
                console.log('⌨️ Keyboard selection has text, processing');
                handleTextSelection({ type: 'keyboardselection', target: document.activeElement || document.body });
            }
        }, 20);
    }
}

function createFollowUpButton(text) {
    console.log('Creating follow-up action buttons for text:', text.substring(0, 50) + '...');
    
    // Check if we can activate this feature
    if (!eventCoordinator.canActivateFeature('follow-up')) {
        console.log('Cannot activate follow-up feature due to priority conflicts');
        return;
    }
    
    // Create container for the three buttons
    followUpButton = document.createElement('div');
    followUpButton.id = 'followUpButtonContainer';
    followUpButton.className = 'gemini-enhancer-action-buttons';
    followUpButton.setAttribute('role', 'toolbar');
    followUpButton.setAttribute('aria-label', 'Follow-up actions');
    
    // Store in state
    enhancerState.set('followUp.button', followUpButton);
    
    // Store original text for debugging and fallback
    followUpButton.dataset.originalText = text;
    
    // Define the three action buttons
    const actions = [
        { id: 'askAbout', text: 'Ask about this', prompt: 'Can you tell me more about this: "{text}"?' },
        { id: 'explainFurther', text: 'Explain further', prompt: 'Please explain this in more detail: "{text}"' },
        { id: 'giveExamples', text: 'Give examples', prompt: 'Can you give me some examples related to: "{text}"?' }
    ];
    
    // Create individual buttons
    actions.forEach((action, index) => {
        const button = document.createElement('button');
        button.id = `followUpAction_${action.id}`;
        button.className = 'gemini-enhancer-action-btn';
        button.innerHTML = action.text;
        button.dataset.prompt = action.prompt;
        button.setAttribute('aria-label', action.text);
        
        // Add click handler for each button
        button.onclick = function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            // Get the current selection at click time
            const currentSelection = window.getSelection();
            const currentText = currentSelection.toString().trim();
            
            // Use current selection if valid, otherwise fall back to original
            let textToUse = text;
            const originalText = followUpButton.dataset.originalText;
            
            if (currentText && isSelectionFromAIResponse(currentSelection)) {
                textToUse = currentText;
                console.log("Using current selection for action:", action.id, textToUse.substring(0, 30) + '...');
            } else {
                console.log("Using original selection for action:", action.id, textToUse.substring(0, 30) + '...');
            }
            
            // Generate the prompt text
            const promptText = action.prompt.replace('{text}', textToUse);
            console.log("Generated prompt:", promptText);
            
            // Add click feedback
            button.style.transform = 'translateY(0) scale(0.95)';
            
            setTimeout(() => {
                // Find input box and insert the generated text
                const inputBox = findGeminiInputBox();
                if (inputBox) {
                    // Clear any existing content and insert the new prompt
                    inputBox.value = '';
                    inputBox.textContent = '';
                    
                    // Insert the text
                    if (inputBox.tagName === 'TEXTAREA') {
                        inputBox.value = promptText;
                        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        inputBox.textContent = promptText;
                        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    // Focus the input box
                    inputBox.focus();
                    
                    // Set cursor to end
                    if (inputBox.setSelectionRange) {
                        inputBox.setSelectionRange(promptText.length, promptText.length);
                    } else if (window.getSelection) {
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        const range = document.createRange();
                        range.selectNodeContents(inputBox);
                        range.collapse(false);
                        selection.addRange(range);
                    }
                    
                    enhancerState.emit('promptGenerated', { action: action.id, text: textToUse, prompt: promptText });
                } else {
                    console.warn('Could not find input box');
                }
                removeFollowUpButton();
            }, 100);
        };
        
        followUpButton.appendChild(button);
    });
    
    // Position the button container using the reliable positioning logic
    followUpButton.style.position = 'absolute';
    followUpButton.style.zIndex = '10000';
    
    // Initial positioning to prevent flash
    followUpButton.style.left = '0px';
    followUpButton.style.top = '0px';
    
    // Add to DOM first so we can measure it
    document.body.appendChild(followUpButton);
    
    // Now position it properly
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        if (rect.width > 0 && rect.height > 0) {
            const containerWidth = followUpButton.offsetWidth || 320;
            const containerHeight = followUpButton.offsetHeight || 48;
            const margin = 8;
            
            // Calculate position above selection
            let buttonTop = rect.top - containerHeight - margin;
            let buttonLeft = rect.left + (rect.width / 2) - (containerWidth / 2);
            
            // Keep within viewport bounds
            buttonLeft = Math.max(8, Math.min(buttonLeft, window.innerWidth - containerWidth - 8));
            
            // If no room above, place below
            if (buttonTop < 8) {
                buttonTop = rect.bottom + margin;
                if (buttonTop + containerHeight > window.innerHeight - 8) {
                    buttonTop = 8; // Fallback to top
                }
            }
            
            // Convert to absolute positioning
            const finalLeft = buttonLeft + window.scrollX;
            const finalTop = buttonTop + window.scrollY;
            
            followUpButton.style.left = `${Math.max(0, finalLeft)}px`;
            followUpButton.style.top = `${Math.max(0, finalTop)}px`;
            
            console.log(`📝 Initial button position: (${finalLeft.toFixed(0)}, ${finalTop.toFixed(0)})`);
        }
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

    // Activate feature in coordinator
    eventCoordinator.activateFeature('follow-up', { text, position: { top: 0, left: 0 } });
    
    // Force a reflow to ensure initial hidden state is applied
    followUpButton.offsetHeight;
    
    // Trigger show animation on next frame to prevent flash
    requestAnimationFrame(() => {
        if (followUpButton) {
            followUpButton.classList.add('show');
        }
    });

    // Keep position synced while user scrolls/resizes (including inner scroll containers)
    const reposition = () => {
        if (isRepositionScheduled) return;
        isRepositionScheduled = true;
        requestAnimationFrame(() => {
            isRepositionScheduled = false;
            updateButtonPosition();
        });
    };
    window.addEventListener('scroll', reposition, { passive: true });
    document.addEventListener('scroll', reposition, { capture: true, passive: true });
    window.addEventListener('resize', reposition, { passive: true });
    enhancerState.addCleanup(() => {
        window.removeEventListener('scroll', reposition);
        document.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
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
        
        // Apply explicit hide styles to ensure smooth transition (no left/top animation)
        followUpButton.style.transition = 'opacity 0.15s cubic-bezier(0.4, 0.0, 0.2, 1), transform 0.15s cubic-bezier(0.4, 0.0, 0.2, 1)';
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
            showToast("Could not insert citation. Copied to clipboard.", 'error');
        }
    } else {
        showToast("Could not find the Gemini input box.", 'error');
    }
}

// Slash-command listeners are now registered via initializeEventListeners()
// to avoid duplicate handlers and race conditions.

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
        // Be permissive with Gemini's evolving DOM while staying targeted
        const geminiSelectors = [
            '#prompt-textarea',
            'textarea[aria-label*="Message"]',
            'textarea[aria-label*="Prompt"]',
            'textarea[placeholder*="Message"]',
            'textarea[data-testid*="chat-input"]',
            'div[role="textbox"][aria-label*="Send a message"]',
            'div[role="textbox"][aria-label*="Prompt"]',
            'div[role="textbox"][contenteditable="true"]'
        ].join(',');
        return element.matches(geminiSelectors) || !!element.closest(geminiSelectors);
    }
    
    // Fallback for any contenteditable or textarea that looks like a chat input
    const fallbackSelectors = 'div[contenteditable="true"], textarea, input[type="text"]';
    return element.matches(fallbackSelectors) || !!element.closest(fallbackSelectors);
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
    // Keep track of the active input for selection handling
    lastInputBox = inputElement;
    enhancerState.set('slashCommands.lastInputBox', inputElement);

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
    
    // Populate with matching commands in a native-like list style
    commandAutocomplete.innerHTML = matchingCommands.map((cmd, index) => {
        const commandPrompt = slashCommands[cmd] || '';
        const fullPreview = commandPrompt.replace('{text}', previewText);
        const truncatedPreview = fullPreview.length > 80
            ? fullPreview.substring(0, 80) + '...'
            : fullPreview;
        const id = `ge-ac-item-${index}`;
        const iconLetter = (cmd && cmd[0]) ? cmd[0].toUpperCase() : '•';
        return `
            <div id="${id}" class="autocomplete-item ${index === 0 ? 'selected' : ''}" role="option" aria-selected="${index === 0 ? 'true' : 'false'}" data-command="${cmd}">
                <div class="ac-row">
                    <div class="ac-icon">${iconLetter}</div>
                    <div class="ac-content">
                        <div class="ac-title">/${cmd}</div>
                        <div class="ac-sub">${truncatedPreview}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Mark active descendant for a11y
    const first = commandAutocomplete.querySelector('.autocomplete-item');
    if (first) {
        commandAutocomplete.setAttribute('aria-activedescendant', first.id || '');
    }
    
    // Add hover handlers for native-like selection
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
        
        // Hover selection
        item.addEventListener('mouseenter', () => {
            // Update selection state with a11y
            const items = commandAutocomplete.querySelectorAll('.autocomplete-item');
            const idx = Array.from(items).indexOf(item);
            updateSelection(items, Math.max(0, idx));
        });
        
        item.addEventListener('mouseleave', () => {
            // No-op
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
    commandAutocomplete.setAttribute('aria-expanded', 'true');
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
    commandAutocomplete.setAttribute('role', 'listbox');
    commandAutocomplete.setAttribute('aria-label', 'Slash command suggestions');
    commandAutocomplete.setAttribute('aria-expanded', 'false');
    commandAutocomplete.setAttribute('aria-live', 'polite');
    // Styles are now handled by the CSS file for better theme support
    document.body.appendChild(commandAutocomplete);
    // Track in centralized state for coordination
    try { enhancerState.set('slashCommands.autocomplete', commandAutocomplete); } catch (_) {}
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
        const dropdownWidth = 420; // Native-like width
        if (caretCoords.left + dropdownWidth > viewportWidth) {
            style.left = `${viewportWidth - dropdownWidth - 10}px`;
        }
        
        style.width = `${dropdownWidth}px`;
        style.minWidth = '360px';
        style.maxWidth = '480px';
    } else {
        // Fallback to old method if caret coordinates unavailable
        const rect = inputElement.getBoundingClientRect();
        style.left = `${window.scrollX + rect.left}px`;
        style.top = `${window.scrollY + rect.top - dropdownHeight - 8}px`;
        style.width = '420px';
        style.minWidth = '360px';
        style.maxWidth = '480px';
        
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
        const isSelected = index === selectedIndex;
        item.classList.toggle('selected', isSelected);
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        if (isSelected && item.id && commandAutocomplete) {
            commandAutocomplete.setAttribute('aria-activedescendant', item.id);
        }
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
                commandAutocomplete.setAttribute('aria-expanded', 'false');
                commandAutocomplete.setAttribute('aria-activedescendant', '');
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
