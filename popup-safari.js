// Safari-optimized popup script for managing slash commands

// Safari compatibility layer with enhanced error handling
const browserAPI = (() => {
    if (typeof browser !== 'undefined' && browser.storage) {
        console.log('Using browser API for Safari');
        return browser;
    } else if (typeof chrome !== 'undefined' && chrome.storage) {
        console.log('Using chrome API fallback');
        return chrome;
    } else {
        console.warn('No extension API available - using localStorage fallback');
        // Fallback for Safari if neither browser nor chrome is available
        return {
            storage: {
                sync: {
                    get: async (keys) => {
                        try {
                            const stored = localStorage.getItem('gemini_enhancer_commands');
                            const data = stored ? JSON.parse(stored) : {};
                            if (Array.isArray(keys)) {
                                const result = {};
                                keys.forEach(key => {
                                    result[key] = data[key];
                                });
                                return result;
                            }
                            return data;
                        } catch (error) {
                            console.error('localStorage get error:', error);
                            return {};
                        }
                    },
                    set: async (data) => {
                        try {
                            const existing = localStorage.getItem('gemini_enhancer_commands');
                            const parsed = existing ? JSON.parse(existing) : {};
                            Object.assign(parsed, data);
                            localStorage.setItem('gemini_enhancer_commands', JSON.stringify(parsed));
                        } catch (error) {
                            console.error('localStorage set error:', error);
                        }
                    }
                }
            }
        };
    }
})();

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Safari popup script loaded');
    
    const commandsList = document.getElementById('commandsList');
    const addCommandBtn = document.getElementById('addCommand');
    const triggerInput = document.getElementById('commandTrigger');
    const promptInput = document.getElementById('commandPrompt');
    
    // Safari-specific performance optimization
    let loadingTimeout = null;
    
    // Load and display existing commands with error handling
    try {
        await loadCommands();
    } catch (error) {
        console.error('Failed to load commands on startup:', error);
        showNotification('Failed to load existing commands', 'error');
    }
    
    // Event listeners with Safari optimizations
    addCommandBtn.addEventListener('click', addCommand);
    
    // Enhanced keyboard support for Safari
    triggerInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCommand();
        }
    });
    
    triggerInput.addEventListener('input', function(e) {
        // Real-time validation for Safari
        const value = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (e.target.value !== value) {
            e.target.value = value;
            showNotification('Only letters and numbers allowed', 'warning');
        }
    });
    
    promptInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            addCommand();
        }
    });
    
    // Auto-resize textarea for Safari
    promptInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
    
    async function loadCommands() {
        try {
            console.log('Loading commands...');
            
            // Show loading state
            commandsList.innerHTML = '<div class="empty-state">Loading commands...</div>';
            
            const result = await browserAPI.storage.sync.get(['slashCommands']);
            const commands = result.slashCommands || {};
            
            console.log('Loaded commands:', commands);
            
            displayCommands(commands);
        } catch (error) {
            console.error('Error loading commands:', error);
            commandsList.innerHTML = '<div class="empty-state">Error loading commands. Please refresh.</div>';
            throw error;
        }
    }
    
    function displayCommands(commands) {
        const commandsArray = Object.entries(commands);
        
        if (commandsArray.length === 0) {
            commandsList.innerHTML = '<div class="empty-state">No commands yet. Add one below!</div>';
            return;
        }
        
        commandsList.innerHTML = commandsArray.map(([trigger, prompt]) => `
            <div class="command-item" data-trigger="${escapeHtml(trigger)}">
                <div class="command-trigger">/${escapeHtml(trigger)}</div>
                <div class="command-description">${escapeHtml(prompt)}</div>
                <button class="delete-btn btn btn-danger" data-trigger="${escapeHtml(trigger)}">Delete</button>
            </div>
        `).join('');
        
        // Add delete event listeners with Safari optimizations
        commandsList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await deleteCommand(btn.dataset.trigger);
            });
        });
    }
    
    async function addCommand() {
        const trigger = triggerInput.value.trim().toLowerCase();
        const prompt = promptInput.value.trim();
        
        // Enhanced validation
        if (!trigger || !prompt) {
            showNotification('Please fill in both fields', 'error');
            if (!trigger) triggerInput.focus();
            else promptInput.focus();
            return;
        }
        
        // Validate trigger format
        if (!/^[a-z0-9]+$/.test(trigger)) {
            showNotification('Command must contain only letters and numbers', 'error');
            triggerInput.focus();
            return;
        }
        
        // Length validation
        if (trigger.length > 20) {
            showNotification('Command name too long (max 20 characters)', 'error');
            triggerInput.focus();
            return;
        }
        
        if (prompt.length > 500) {
            showNotification('Prompt too long (max 500 characters)', 'error');
            promptInput.focus();
            return;
        }
        
        try {
            // Disable button during operation
            addCommandBtn.disabled = true;
            addCommandBtn.textContent = 'Adding...';
            
            const result = await browserAPI.storage.sync.get(['slashCommands']);
            const commands = result.slashCommands || {};
            
            const isUpdate = commands[trigger];
            commands[trigger] = prompt;
            
            await browserAPI.storage.sync.set({ slashCommands: commands });
            
            // Clear inputs
            triggerInput.value = '';
            promptInput.value = '';
            promptInput.style.height = 'auto';
            
            // Show success message
            showNotification(isUpdate ? `Updated /${trigger}` : `Added /${trigger}`, 'success');
            
            // Reload display
            await loadCommands();
            
            // Focus back to trigger input for easy addition of more commands
            triggerInput.focus();
            
        } catch (error) {
            console.error('Error saving command:', error);
            showNotification('Error saving command. Please try again.', 'error');
        } finally {
            // Re-enable button
            addCommandBtn.disabled = false;
            addCommandBtn.textContent = 'Add Command';
        }
    }
    
    async function deleteCommand(trigger) {
        if (!confirm(`Delete command /${trigger}?`)) {
            return;
        }
        
        try {
            const result = await browserAPI.storage.sync.get(['slashCommands']);
            const commands = result.slashCommands || {};
            
            delete commands[trigger];
            
            await browserAPI.storage.sync.set({ slashCommands: commands });
            
            // Show success message
            showNotification(`Deleted /${trigger}`, 'success');
            
            // Reload display
            await loadCommands();
            
        } catch (error) {
            console.error('Error deleting command:', error);
            showNotification('Error deleting command. Please try again.', 'error');
        }
    }
    
    function showNotification(message, type = 'info') {
        // Remove any existing notification
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element with Safari-optimized styling
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const colors = {
            success: '#007AFF',
            error: '#FF3B30',
            warning: '#FF9500',
            info: '#007AFF'
        };
        
        const bgColor = colors[type] || colors.info;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 12px 20px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            opacity: 0;
            animation: slideInFade 0.3s ease forwards;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        `;
        
        // Add animation keyframes if not already added
        if (!document.querySelector('#safariNotificationStyles')) {
            const style = document.createElement('style');
            style.id = 'safariNotificationStyles';
            style.textContent = `
                @keyframes slideInFade {
                    from { 
                        opacity: 0; 
                        transform: translateX(-50%) translateY(-10px) scale(0.95); 
                    }
                    to { 
                        opacity: 1; 
                        transform: translateX(-50%) translateY(0) scale(1); 
                    }
                }
                @keyframes slideOutFade {
                    from { 
                        opacity: 1; 
                        transform: translateX(-50%) translateY(0) scale(1); 
                    }
                    to { 
                        opacity: 0; 
                        transform: translateX(-50%) translateY(-10px) scale(0.95); 
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds with Safari-optimized timing
        setTimeout(() => {
            notification.style.animation = 'slideOutFade 0.3s ease forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // Utility function for XSS prevention
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Safari-specific accessibility enhancements
    function setupAccessibility() {
        // Announce loading state to screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.style.position = 'absolute';
        announcer.style.left = '-10000px';
        announcer.style.width = '1px';
        announcer.style.height = '1px';
        announcer.style.overflow = 'hidden';
        document.body.appendChild(announcer);
        
        // Set up form labels and descriptions
        triggerInput.setAttribute('aria-describedby', 'trigger-help');
        promptInput.setAttribute('aria-describedby', 'prompt-help');
        
        // Add help text
        const triggerHelp = document.createElement('div');
        triggerHelp.id = 'trigger-help';
        triggerHelp.textContent = 'Enter a short command name using only letters and numbers';
        triggerHelp.style.fontSize = '12px';
        triggerHelp.style.color = 'var(--text-secondary)';
        triggerHelp.style.marginTop = '4px';
        triggerInput.parentNode.appendChild(triggerHelp);
        
        const promptHelp = document.createElement('div');
        promptHelp.id = 'prompt-help';
        promptHelp.textContent = 'Use {text} where you want the selected text to be inserted';
        promptHelp.style.fontSize = '12px';
        promptHelp.style.color = 'var(--text-secondary)';
        promptHelp.style.marginTop = '4px';
        promptInput.parentNode.appendChild(promptHelp);
    }
    
    // Initialize accessibility features
    setupAccessibility();
    
    console.log('Safari popup script initialization complete');
});
