// Popup script for managing slash commands

// Safari compatibility: Use browser API if available, fallback to chrome
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async function() {
    const commandsList = document.getElementById('commandsList');
    const addCommandBtn = document.getElementById('addCommand');
    const triggerInput = document.getElementById('commandTrigger');
    const promptInput = document.getElementById('commandPrompt');
    
    // Wide mode elements
    const wideModeToggle = document.getElementById('wideModeToggle');
    const wideModeOptions = document.getElementById('wideModeOptions');
    const widthSlider = document.getElementById('widthSlider');
    const widthValue = document.getElementById('widthValue');
    
    // Load and display existing commands and settings
    await loadCommands();
    await loadWideMode();
    
    // Add new command
    addCommandBtn.addEventListener('click', addCommand);
    
    // Enable adding command with Enter key
    triggerInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addCommand();
    });
    
    promptInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) addCommand();
    });
    
    // Wide mode event listeners
    wideModeToggle.addEventListener('change', toggleWideMode);
    widthSlider.addEventListener('input', updateWidth);
    widthSlider.addEventListener('change', saveWidth);
    
    async function loadCommands() {
        try {
            const result = await browserAPI.storage.sync.get(['slashCommands']);
            const commands = result.slashCommands || {};
            
            displayCommands(commands);
        } catch (error) {
            console.error('Error loading commands:', error);
        }
    }
    
    function displayCommands(commands) {
        const commandsArray = Object.entries(commands);
        
        if (commandsArray.length === 0) {
            commandsList.innerHTML = '<div class="empty-state">No commands yet. Add one below!</div>';
            return;
        }
        
        commandsList.innerHTML = commandsArray.map(([trigger, prompt]) => `
            <div class="command-item" data-trigger="${trigger}">
                <div class="command-trigger">/${trigger}</div>
                <div class="command-description">${prompt}</div>
                <button class="delete-btn" data-trigger="${trigger}">Delete</button>
            </div>
        `).join('');
        
        // Add delete event listeners
        commandsList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteCommand(btn.dataset.trigger));
        });
    }
    
    async function addCommand() {
        const trigger = triggerInput.value.trim().toLowerCase();
        const prompt = promptInput.value.trim();
        
        if (!trigger || !prompt) {
            showNotification('Please fill in both fields', 'error');
            return;
        }
        
        // Validate trigger (alphanumeric only)
        if (!/^[a-z0-9]+$/.test(trigger)) {
            showNotification('Command must contain only letters and numbers', 'error');
            return;
        }
        
        try {
            const result = await browserAPI.storage.sync.get(['slashCommands']);
            const commands = result.slashCommands || {};
            
            const isUpdate = commands[trigger];
            commands[trigger] = prompt;
            
            await browserAPI.storage.sync.set({ slashCommands: commands });
            
            // Clear inputs
            triggerInput.value = '';
            promptInput.value = '';
            
            // Show success message
            showNotification(isUpdate ? `Updated /${trigger}` : `Added /${trigger}`, 'success');
            
            // Reload display
            await loadCommands();
            
        } catch (error) {
            console.error('Error saving command:', error);
            showNotification('Error saving command. Please try again.', 'error');
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
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#d93025' : '#137333'};
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 400;
            line-height: 20px;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            transition: all 0.2s ease;
            opacity: 0;
            animation: slideInFade 0.2s ease forwards;
            max-width: calc(100% - 32px);
            text-align: center;
        `;
        
        // Add animation keyframes if not already added
        if (!document.querySelector('#notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                @keyframes slideInFade {
                    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes slideOutFade {
                    from { opacity: 1; transform: translateX(-50%) translateY(0); }
                    to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Auto-remove after 2.5 seconds (Chrome-like timing)
        setTimeout(() => {
            notification.style.animation = 'slideOutFade 0.2s ease forwards';
            setTimeout(() => notification.remove(), 200);
        }, 2500);
    }
    
    // Wide Mode Functions
    async function loadWideMode() {
        try {
            const result = await browserAPI.storage.sync.get(['wideModeEnabled', 'wideModeWidth']);
            const enabled = result.wideModeEnabled || false;
            const width = result.wideModeWidth || 1200;
            
            wideModeToggle.checked = enabled;
            widthSlider.value = width;
            widthValue.textContent = width;
            
            // Show/hide width options based on toggle state
            wideModeOptions.style.display = enabled ? 'block' : 'none';
            
        } catch (error) {
            console.error('Error loading wide mode settings:', error);
        }
    }
    
    async function toggleWideMode() {
        const enabled = wideModeToggle.checked;
        
        try {
            await browserAPI.storage.sync.set({ wideModeEnabled: enabled });
            
            // Show/hide width options
            wideModeOptions.style.display = enabled ? 'block' : 'none';
            
            // Send message to content script
            const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].url && tabs[0].url.includes('gemini.google.com')) {
                browserAPI.tabs.sendMessage(tabs[0].id, {
                    action: 'toggleWideMode',
                    enabled: enabled,
                    width: parseInt(widthSlider.value)
                });
            }
            
            showNotification(enabled ? 'Wide mode enabled' : 'Wide mode disabled', 'success');
            
        } catch (error) {
            console.error('Error toggling wide mode:', error);
            showNotification('Error updating wide mode', 'error');
        }
    }
    
    function updateWidth() {
        const width = widthSlider.value;
        widthValue.textContent = width;
    }
    
    async function saveWidth() {
        const width = parseInt(widthSlider.value);
        
        try {
            await browserAPI.storage.sync.set({ wideModeWidth: width });
            
            // Send updated width to content script if wide mode is enabled
            if (wideModeToggle.checked) {
                const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
                if (tabs[0] && tabs[0].url && tabs[0].url.includes('gemini.google.com')) {
                    browserAPI.tabs.sendMessage(tabs[0].id, {
                        action: 'updateWidth',
                        width: width
                    });
                }
            }
            
        } catch (error) {
            console.error('Error saving width:', error);
        }
    }
});
