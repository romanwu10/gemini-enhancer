// Popup script for managing slash commands

// Safari compatibility: Use browser API if available, fallback to chrome
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async function() {
    const commandsList = document.getElementById('commandsList');
    const addCommandBtn = document.getElementById('addCommand');
    const triggerInput = document.getElementById('commandTrigger');
    const promptInput = document.getElementById('commandPrompt');
    const exportBtn = document.getElementById('exportCommands');
    const importBtn = document.getElementById('importCommands');
    const importFile = document.getElementById('importFile');

    // Track editing state
    let editingKey = null;
    
    
    // Load and display existing commands
    await loadCommands();
    
    // Add new command
    addCommandBtn.addEventListener('click', addOrUpdateCommand);
    
    // Enable adding command with Enter key
    triggerInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addOrUpdateCommand();
    });
    
    promptInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) addOrUpdateCommand();
    });

    // Export/import
    exportBtn.addEventListener('click', async () => {
        try {
            const result = await browserAPI.storage.sync.get(['slashCommands']);
            const commands = result.slashCommands || {};
            const json = JSON.stringify(commands, null, 2);
            await navigator.clipboard.writeText(json);
            showNotification('Copied commands JSON to clipboard', 'success');
        } catch (err) {
            console.error('Export failed:', err);
            showNotification('Export failed', 'error');
        }
    });
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
            const result = await browserAPI.storage.sync.get(['slashCommands']);
            const existing = result.slashCommands || {};
            const merged = { ...existing, ...parsed };
            await browserAPI.storage.sync.set({ slashCommands: merged });
            showNotification('Imported commands', 'success');
            await loadCommands();
        } catch (err) {
            console.error('Import failed:', err);
            showNotification('Import failed', 'error');
        } finally {
            importFile.value = '';
        }
    });
    
    
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
                <div style="display:flex; gap:8px;">
                  <button class="delete-btn" data-trigger="${trigger}">Delete</button>
                  <button class="delete-btn" data-edit="${trigger}">Edit</button>
                </div>
            </div>
        `).join('');
        
        // Add delete event listeners
        commandsList.querySelectorAll('.delete-btn').forEach(btn => {
            if (btn.dataset.trigger) {
                btn.addEventListener('click', () => deleteCommand(btn.dataset.trigger));
            }
            if (btn.dataset.edit) {
                btn.addEventListener('click', () => startEditCommand(btn.dataset.edit));
            }
        });
    }
    
    async function addOrUpdateCommand() {
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
            
            let isUpdate = false;
            if (editingKey && editingKey !== trigger) {
                // Renaming: remove old key
                delete commands[editingKey];
                isUpdate = true;
            }
            if (commands[trigger]) isUpdate = true;
            commands[trigger] = prompt;
            
            await browserAPI.storage.sync.set({ slashCommands: commands });
            
            // Clear inputs
            triggerInput.value = '';
            promptInput.value = '';
            editingKey = null;
            addCommandBtn.textContent = 'Add Command';
            
            // Show success message
            showNotification(isUpdate ? `Updated /${trigger}` : `Added /${trigger}`, 'success');
            
            // Reload display
            await loadCommands();
            
        } catch (error) {
            console.error('Error saving command:', error);
            showNotification('Error saving command. Please try again.', 'error');
        }
    }

    function startEditCommand(trigger) {
        // Prefill form and switch button label
        triggerInput.value = trigger;
        triggerInput.focus();
        browserAPI.storage.sync.get(['slashCommands']).then(result => {
            const commands = result.slashCommands || {};
            promptInput.value = commands[trigger] || '';
        });
        editingKey = trigger;
        addCommandBtn.textContent = 'Save Changes';
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
    
});
