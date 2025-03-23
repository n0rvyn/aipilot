import { ItemView, WorkspaceLeaf, TFile, Component, TFolder, setIcon, Notice, MarkdownView, Editor, Modal, App, Plugin, PluginSettingTab, Setting, addIcon, normalizePath } from "obsidian";
import type AIPilot from "./main";
import { DEFAULT_SETTINGS } from "./main";
import { MarkdownRenderer as NewMarkdownRenderer } from './MarkdownRenderer';
import { LoadingModal, PolishResultModal } from './main';
import { ModelManager, ModelConfig } from './models/ModelManager';

export const VIEW_TYPE_CHAT = "chat-view";

// Add ConfirmModal class
class ConfirmModal extends Modal {
    message: string;
    onConfirm: () => Promise<void> | void;

    constructor(app: App, message: string, onConfirm: () => Promise<void> | void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('confirm-modal');
        
        contentEl.createEl('p', { text: this.message, cls: 'confirm-message' });
        
        const buttonContainer = contentEl.createDiv({ cls: 'confirm-button-container' });
        
        const confirmBtn = buttonContainer.createEl('button', { text: 'Confirm', cls: 'confirm-button' });
        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-button' });
        
        confirmBtn.onclick = () => {
            this.close();
            this.onConfirm();
        };
        
        cancelBtn.onclick = () => {
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Add this class before the ChatView class
class ChatHistoryModal extends Modal {
    private histories: ChatHistory[];
    private onSelect: (history: ChatHistory) => void;
    private plugin: AIPilot;

    constructor(app: App, histories: ChatHistory[], onSelect: (history: ChatHistory) => void, plugin?: AIPilot) {
        super(app);
        this.histories = histories;
        this.onSelect = onSelect;
        this.plugin = plugin as AIPilot;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('chat-history-modal');
        
        // Add header and export button in a container
        const headerContainer = contentEl.createDiv({ cls: 'history-header-container' });
        headerContainer.createEl('h2', { text: 'Chat History' });
        
        // Add export button next to title if we have histories
        this.addExportButton(headerContainer, this.histories);
        
        // Add search bar
        const searchInput = this.addSearchBar(contentEl);
        
        // Setup keyboard shortcuts
        this.setupModalKeyboardShortcuts(searchInput);
        
        if (this.histories.length === 0) {
            contentEl.createEl('p', { text: 'No chat history found.' });
            return;
        }
        
        const historyList = contentEl.createDiv({ cls: 'history-list' });
        
        // Check if there are any pinned conversations
        const pinnedHistories = this.histories.filter(h => h.pinned);
        
        // Add pinned section if there are any pinned conversations
        if (pinnedHistories.length > 0) {
            const pinnedSection = historyList.createDiv({ cls: 'pinned-section' });
            const pinnedHeader = pinnedSection.createEl('h3', { text: 'Pinned Conversations', cls: 'pinned-header' });
            
            pinnedHistories.forEach(history => {
                this.createHistoryItem(pinnedSection, history);
            });
        }
        
        // Group remaining conversations by date (using just the day portion)
        const conversationsByDate = new Map<string, ChatHistory[]>();
        
        this.histories
            .filter(h => !h.pinned) // Skip pinned histories as they are already displayed
            .forEach(history => {
                const date = new Date(history.date);
                const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
                
                if (!conversationsByDate.has(dateKey)) {
                    conversationsByDate.set(dateKey, []);
                }
                conversationsByDate.get(dateKey)?.push(history);
            });
        
        // Sort dates in descending order (newest first)
        const sortedDates = Array.from(conversationsByDate.keys())
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        
        // Iterate through each date group
        sortedDates.forEach(dateKey => {
            const conversations = conversationsByDate.get(dateKey);
            if (!conversations || conversations.length === 0) return;
            
            // Create date header
            const dateObj = new Date(dateKey);
            const dateHeader = historyList.createDiv({ cls: 'history-date-header' });
            dateHeader.setText(dateObj.toLocaleDateString(undefined, { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }));
            
            // Create a container for this date's conversations
            const dateGroup = historyList.createDiv({ cls: 'history-date-group' });
            
            // Create conversation items for this date
            conversations.forEach(history => {
                this.createHistoryItem(dateGroup, history);
            });
        });
        
        // Add a small notice about keyboard shortcuts at the bottom
        const keyboardHelpText = contentEl.createDiv({ cls: 'keyboard-help-text' });
        keyboardHelpText.setText('Tip: Use up/down arrows to navigate, Enter to select, Esc to close');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    private addExportButton(container: HTMLElement, histories: ChatHistory[]) {
        if (histories.length === 0) return;
        
        const exportButtonContainer = container.createDiv({ cls: 'export-button-container' });
        
        const exportButton = exportButtonContainer.createEl('button', {
            text: 'Export All Conversations',
            cls: 'export-button'
        });
        
        exportButton.addEventListener('click', async () => {
            try {
                // Generate markdown content
                const markdownContent = this.generateMarkdownExport(histories);
                
                // Create a temporary textarea to copy content
                const textArea = document.createElement('textarea');
                textArea.value = markdownContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                // Offer download
                const blob = new Blob([markdownContent], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chat-history-export-${new Date().toISOString().slice(0, 10)}.md`;
                document.body.appendChild(a);
                a.click();
                
                // Cleanup
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
                
                new Notice('Chat history exported and copied to clipboard', 2000);
            } catch (error) {
                console.error('Failed to export chat history:', error);
                new Notice('Failed to export chat history', 2000);
            }
        });
    }

    private generateMarkdownExport(histories: ChatHistory[]): string {
        // Sort histories by date (newest first)
        const sortedHistories = [...histories].sort((a, b) => b.date - a.date);
        
        let markdownContent = `# Chat History Export\nExported on ${new Date().toLocaleString()}\n\n`;
        
        sortedHistories.forEach((history, index) => {
            // Add conversation header
            markdownContent += `## Conversation ${index + 1}: ${history.title}\n`;
            markdownContent += `Date: ${new Date(history.date).toLocaleString()}\n\n`;
            
            // Add messages
            history.messages.forEach(message => {
                const role = message.role === 'user' ? '👤 User' : '🤖 AI';
                markdownContent += `### ${role}\n\n${message.content}\n\n`;
            });
            
            markdownContent += `---\n\n`;
        });
        
        return markdownContent;
    }

    private addSearchBar(container: HTMLElement) {
        const searchContainer = container.createDiv({ cls: 'history-search-container' });
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search conversations...',
            cls: 'history-search-input'
        });
        
        // Add clear button
        const clearButton = searchContainer.createEl('button', {
            cls: 'history-search-clear',
            attr: { 'aria-label': 'Clear search' }
        });
        setIcon(clearButton, 'x');
        clearButton.style.display = 'none';
        
        // Handle search input
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            clearButton.style.display = query ? 'flex' : 'none';
            this.filterHistoryItems(query);
        });
        
        // Handle clear button
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            clearButton.style.display = 'none';
            this.filterHistoryItems('');
        });
        
        return searchInput;
    }

    private filterHistoryItems(query: string) {
        // Get all sections, date headers, date groups and history items
        const pinnedSection = this.contentEl.querySelector('.pinned-section');
        const dateHeaders = this.contentEl.querySelectorAll('.history-date-header');
        const dateGroups = this.contentEl.querySelectorAll('.history-date-group');
        const historyItems = this.contentEl.querySelectorAll('.history-item');
        
        // Normalize query
        const normalizedQuery = query.trim().toLowerCase();
        
        if (!normalizedQuery) {
            // Show all items if query is empty
            if (pinnedSection) {
                (pinnedSection as HTMLElement).style.display = 'block';
            }
            dateHeaders.forEach(header => {
                (header as HTMLElement).style.display = 'block';
            });
            dateGroups.forEach(group => {
                (group as HTMLElement).style.display = 'flex';
            });
            historyItems.forEach(item => {
                (item as HTMLElement).style.display = 'flex';
            });
            return;
        }
        
        // Track which date headers and groups have visible items
        const headersWithVisibleItems = new Set<string>();
        const groupsWithVisibleItems = new Set<Element>();
        
        // Track if any pinned items are visible
        let hasPinnedVisible = false;
        
        // Filter history items
        historyItems.forEach(item => {
            const titleEl = item.querySelector('.history-title');
            const previewEl = item.querySelector('.history-preview-content');
            
            const title = titleEl ? titleEl.textContent?.toLowerCase() || '' : '';
            const preview = previewEl ? previewEl.textContent?.toLowerCase() || '' : '';
            
            // Check if item matches search query
            const matches = title.includes(normalizedQuery) || preview.includes(normalizedQuery);
            (item as HTMLElement).style.display = matches ? 'flex' : 'none';
            
            // If this item is visible, note its parent section
            if (matches) {
                // Check if this is a pinned item
                if (item.classList.contains('pinned-conversation') || item.closest('.pinned-section')) {
                    hasPinnedVisible = true;
                } else {
                    // Find the parent date group
                    const dateGroup = item.closest('.history-date-group');
                    if (dateGroup) {
                        groupsWithVisibleItems.add(dateGroup);
                        
                        // Find the closest date header for this group
                        const dateHeader = dateGroup.previousElementSibling;
                        if (dateHeader && dateHeader.classList.contains('history-date-header')) {
                            headersWithVisibleItems.add(dateHeader.textContent || '');
                        }
                    }
                }
            }
        });
        
        // Show/hide pinned section based on if any pinned items are visible
        if (pinnedSection) {
            (pinnedSection as HTMLElement).style.display = hasPinnedVisible ? 'block' : 'none';
        }
        
        // Show/hide date headers based on if they have visible items
        dateHeaders.forEach(header => {
            const headerText = header.textContent || '';
            const shouldShow = headersWithVisibleItems.has(headerText);
            (header as HTMLElement).style.display = shouldShow ? 'block' : 'none';
        });
        
        // Show/hide date groups based on if they have visible items
        dateGroups.forEach(group => {
            const shouldShow = groupsWithVisibleItems.has(group);
            (group as HTMLElement).style.display = shouldShow ? 'flex' : 'none';
        });
    }

    // Helper method to find the corresponding date header for an item
    private findClosestDateHeader(element: Element): Element | null {
        let current = element.previousElementSibling;
        
        // Traverse backward through siblings
        while (current) {
            if (current.classList.contains('history-date-header')) {
                return current;
            }
            current = current.previousElementSibling;
        }
        
        return null;
    }

    private setupModalKeyboardShortcuts(searchInput: HTMLInputElement) {
        // Focus search bar on modal open
        setTimeout(() => searchInput.focus(), 50);
        
        // Handle keyboard events for the entire modal
        this.contentEl.addEventListener('keydown', (event) => {
            // ESC key already closes the modal (built into Obsidian's Modal class)
            
            // Ctrl+F or / to focus search
            if ((event.key === 'f' && (event.ctrlKey || event.metaKey)) || 
                (event.key === '/' && !event.isComposing && 
                 !(event.target instanceof HTMLInputElement))) {
                event.preventDefault();
                searchInput.focus();
            }
            
            // Enter on history item should select it
            if (event.key === 'Enter' && event.target instanceof HTMLElement) {
                const historyItem = event.target.closest('.history-item');
                if (historyItem) {
                    event.preventDefault();
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    historyItem.querySelector('.history-item-content')?.dispatchEvent(clickEvent);
                }
            }
        });
    }

    private addRenameButton(actionsDiv: HTMLElement, history: ChatHistory, item: HTMLElement) {
        const renameBtn = actionsDiv.createEl('button', {
            cls: 'history-rename-button',
            attr: {
                'aria-label': 'Rename conversation',
                'title': 'Rename conversation'
            }
        });
        setIcon(renameBtn, 'edit-2');
        
        // Add tooltip
        const renameTooltip = renameBtn.createSpan({ cls: 'history-button-tooltip' });
        renameTooltip.setText('Rename');
        
        renameBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation(); // Prevent triggering the parent click
            
            // Create an inline rename input
            const titleEl = item.querySelector('.history-title');
            if (!titleEl) return;
            
            const currentTitle = titleEl.textContent || '';
            const inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.value = currentTitle;
            inputEl.className = 'history-rename-input';
            
            // Replace the title with the input
            titleEl.empty();
            titleEl.appendChild(inputEl);
            
            // Focus the input
            inputEl.focus();
            inputEl.select();
            
            // Handle blur and key events
            const handleRename = async () => {
                const newTitle = inputEl.value.trim() || currentTitle;
                
                // Update UI
                titleEl.empty();
                titleEl.setText(newTitle);
                
                // Update history object
                history.title = newTitle;
                
                // Save to file
                if (this.plugin) {
                    try {
                        const historyDir = this.plugin.settings.chatHistoryPath;
                        const filePath = `${historyDir}/chat-${history.id}.json`;
                        
                        await this.app.vault.adapter.write(
                            filePath,
                            JSON.stringify(history, null, 2)
                        );
                        
                        new Notice('Conversation renamed', 2000);
                    } catch (error) {
                        console.error('Failed to rename conversation:', error);
                        new Notice('Failed to rename conversation', 2000);
                    }
                }
            };
            
            inputEl.addEventListener('blur', () => {
                handleRename();
            });
            
            inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    handleRename();
                } else if (evt.key === 'Escape') {
                    titleEl.empty();
                    titleEl.setText(currentTitle);
                }
            });
        });
        
        return renameBtn;
    }

    private addPinButton(actionsDiv: HTMLElement, history: ChatHistory, item: HTMLElement) {
        const pinBtn = actionsDiv.createEl('button', {
            cls: `history-pin-button ${history.pinned ? 'pinned' : ''}`,
            attr: {
                'aria-label': history.pinned ? 'Unpin conversation' : 'Pin conversation',
                'title': history.pinned ? 'Unpin conversation' : 'Pin conversation'
            }
        });
        setIcon(pinBtn, history.pinned ? 'pin-off' : 'pin');
        
        // Add tooltip
        const pinTooltip = pinBtn.createSpan({ cls: 'history-button-tooltip' });
        pinTooltip.setText(history.pinned ? 'Unpin' : 'Pin');
        
        // Add pin/unpin logic
        pinBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent triggering the parent click
            
            // Toggle pinned state
            history.pinned = !history.pinned;
            
            // Update UI
            pinBtn.className = `history-pin-button ${history.pinned ? 'pinned' : ''}`;
            pinBtn.setAttribute('aria-label', history.pinned ? 'Unpin conversation' : 'Pin conversation');
            pinBtn.setAttribute('title', history.pinned ? 'Unpin conversation' : 'Pin conversation');
            pinBtn.empty();
            setIcon(pinBtn, history.pinned ? 'pin-off' : 'pin');
            
            // Update tooltip
            const newTooltip = pinBtn.createSpan({ cls: 'history-button-tooltip' });
            newTooltip.setText(history.pinned ? 'Unpin' : 'Pin');
            
            // Apply visual indicator to the item
            if (history.pinned) {
                item.classList.add('pinned-conversation');
            } else {
                item.classList.remove('pinned-conversation');
            }
            
            // Save changes to file
            if (this.plugin) {
                try {
                    const historyDir = this.plugin.settings.chatHistoryPath;
                    const filePath = `${historyDir}/chat-${history.id}.json`;
                    
                    await this.app.vault.adapter.write(
                        filePath, 
                        JSON.stringify(history, null, 2)
                    );
                    
                    // Move the item to the pinned section if needed
                    this.reorderHistoryItems();
                    
                    new Notice(history.pinned ? 'Conversation pinned' : 'Conversation unpinned', 2000);
                } catch (error) {
                    console.error('Failed to update pin status:', error);
                    new Notice('Failed to update pin status', 2000);
                }
            }
        });
        
        return pinBtn;
    }

    private reorderHistoryItems() {
        const historyList = this.contentEl.querySelector('.history-list');
        if (!historyList) return;
        
        const pinnedSection = this.contentEl.querySelector('.pinned-section');
        if (!pinnedSection) {
            // Create pinned section if there are any pinned items
            const hasPinnedItems = this.histories.some(h => h.pinned);
            if (hasPinnedItems) {
                const pinnedHeader = this.contentEl.createDiv({ cls: 'pinned-section' });
                pinnedHeader.createEl('h3', { text: 'Pinned Conversations', cls: 'pinned-header' });
                historyList.insertBefore(pinnedHeader, historyList.firstChild);
            }
        } else {
            // Remove pinned section if no pinned items remain
            const hasPinnedItems = this.histories.some(h => h.pinned);
            if (!hasPinnedItems) {
                pinnedSection.remove();
            }
        }
        
        // Force a re-render by simulating a search filter reset
        const searchInput = this.contentEl.querySelector('.history-search-input') as HTMLInputElement;
        if (searchInput) {
            const currentQuery = searchInput.value;
            this.filterHistoryItems(currentQuery);
        }
    }

    private createHistoryItem(container: HTMLElement, history: ChatHistory) {
        const item = container.createDiv({ 
            cls: `history-item ${history.pinned ? 'pinned-conversation' : ''}` 
        });
        
        // Content container (clickable area)
        const contentDiv = item.createDiv({ cls: 'history-item-content' });
        
        // Title with message count
        const titleEl = contentDiv.createDiv({ cls: 'history-title' });
        // Use first message content as title if no title is set
        const title = history.title || (history.messages[0]?.content || '').substring(0, 50) + '...';
        titleEl.setText(title);
        
        // Message count and time
        const metaEl = contentDiv.createDiv({ cls: 'history-meta' });
        const countEl = metaEl.createSpan({ cls: 'history-meta-count' });
        countEl.setText(`${history.messages.length} messages`);
        
        const dotEl = metaEl.createSpan({ cls: 'history-meta-dot' });
        dotEl.setText('•'); // Add dot character for visibility
        
        const timeEl = metaEl.createSpan({ cls: 'history-meta-time' });
        const date = new Date(history.date);
        timeEl.setText(date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
        
        // Preview of last message
        if (history.messages.length > 0) {
            const lastMessage = history.messages[history.messages.length - 1];
            const previewEl = contentDiv.createDiv({ cls: 'history-preview' });
            
            // Show who sent the last message
            const roleEl = previewEl.createSpan({ cls: 'history-preview-role' });
            roleEl.setText(lastMessage.role === 'user' ? 'You: ' : 'AI: ');
            
            // Show preview of the content
            const contentPreview = lastMessage.content
                .replace(/\n/g, ' ')
                .substring(0, 60) + 
                (lastMessage.content.length > 60 ? '...' : '');
            
            const contentEl = previewEl.createSpan({ cls: 'history-preview-content' });
            contentEl.setText(contentPreview);
        }
        
        // Make the conversation item clickable
        contentDiv.addEventListener('click', () => {
            this.onSelect(history);
            this.close();
        });
        
        // Actions container (pin, rename, delete buttons)
        const actionsDiv = item.createDiv({ cls: 'history-item-actions' });
        
        // Add pin button
        this.addPinButton(actionsDiv, history, item);
        
        // Add rename button
        this.addRenameButton(actionsDiv, history, item);
        
        // Add delete button with tooltip
        const deleteBtn = actionsDiv.createEl('button', { 
            cls: 'history-delete-button',
            attr: {
                'aria-label': 'Delete conversation',
                'title': 'Delete conversation'
            }
        });
        setIcon(deleteBtn, 'trash-2');
        
        // Add delete tooltip
        const deleteTooltip = deleteBtn.createSpan({ cls: 'history-button-tooltip' });
        deleteTooltip.setText('Delete');
        
        // Delete logic
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent triggering the parent click
            
            // Confirm deletion
            new ConfirmModal(this.app, 
                "Are you sure you want to delete this conversation?",
                async () => {
                    if (this.plugin) {
                        try {
                            // Delete the history file
                            const historyDir = this.plugin.settings.chatHistoryPath;
                            const filePath = `${historyDir}/chat-${history.id}.json`;
                            
                            await this.app.vault.adapter.remove(filePath);
                            
                            // Remove from the histories array
                            const index = this.histories.findIndex(h => h.id === history.id);
                            if (index >= 0) {
                                this.histories.splice(index, 1);
                            }
                            
                            // Remove the item from the UI
                            item.remove();
                            
                            // Update pinned section if needed
                            this.reorderHistoryItems();
                            
                            new Notice("Conversation deleted", 2000);
                        } catch (error) {
                            console.error("Failed to delete conversation:", error);
                            new Notice("Failed to delete conversation", 2000);
                        }
                    }
                }
            ).open();
        });
        
        return item;
    }
}

type ViewMode = 'chat' | 'search';

interface DiffMatchPatch {
    diff_main(text1: string, text2: string): Array<[number, string]>;
    diff_cleanupSemantic(diffs: Array<[number, string]>): void;
}

interface TextDiff {
    operation: -1 | 0 | 1;  // -1: deletion, 0: unchanged, 1: addition
    text: string;
}

interface ChatHistory {
    id: string;
    title: string;
    date: number;
    messages: { role: 'user' | 'assistant', content: string }[];
    requestId: string | null;
    pinned?: boolean;
}

export class ChatView extends ItemView implements Component {
    private chatContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private messagesContainer: HTMLElement;
    private plugin: AIPilot;
    private messages: { role: 'user' | 'assistant', content: string }[] = [];
    private currentMode: ViewMode = 'chat';
    private tabsContainer: HTMLElement;
    private viewContainer: HTMLElement;
    private requestId: string | null = null;
    private currentInput: HTMLTextAreaElement;
    private knowledgeBaseCache: Map<string, { 
        similarity: number, 
        content: string, 
        timestamp: number,
        hash: string 
    }> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000;
    private readonly MAX_TOKENS = 4096;
    private readonly RENDER_THROTTLE = 30; // Reduced from 50ms to 30ms for smoother updates
    private chatHistoryButton: HTMLElement; // New history button
    private lastHistorySave: number = 0;
    private isEndingConversation: boolean = false;
    private conversationId: string | null = null;
    private lastNoticedFile: string | null = null;
    private modelManager: ModelManager;
    private modelSelectEl: HTMLSelectElement;
    private currentModelId: string = '';

    constructor(leaf: WorkspaceLeaf, plugin: AIPilot, modelManager: ModelManager) {
        super(leaf);
        this.plugin = plugin;
        this.requestId = this.plugin.requestId;
        this.modelManager = modelManager;
        
        // Initialize with the first available model
        const models = this.modelManager.getActiveModels();
        if (models.length > 0) {
          this.currentModelId = models[0].id;
        }
    }

    load(): void {
        // Required by Component interface
    }

    unload(): void {
        // Required by Component interface
    }

    getViewType(): string {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText(): string {
        return "AI Chat";
    }

    getIcon(): string {
        return "message-square";
    }

    async onOpen(): Promise<void> {
        // Add container class for styling
        this.contentEl.addClass('chat-view-container');
        
        // Create tabs
        this.tabsContainer = this.contentEl.createDiv({ cls: "chat-tabs" });
        this.createTabs();

        // Create view container
        this.viewContainer = this.contentEl.createDiv({ cls: "view-container" });
        
        // Initialize the default view
        this.initializeChatView();
    }

    private createTabs() {
        const chatTab = this.tabsContainer.createDiv({
            cls: `chat-tab ${this.currentMode === 'chat' ? 'active' : ''}`,
        });
        chatTab.innerHTML = '<svg viewBox="0 0 100 100" class="chat-icon"><path d="M20,20v45h10v15l15-15h35V20H20z M25,25h50v35H42.5L35,67.5V60H25V25z"/></svg>';
        
        const searchTab = this.tabsContainer.createDiv({
            cls: `chat-tab ${this.currentMode === 'search' ? 'active' : ''}`,
        });
        searchTab.innerHTML = '<svg viewBox="0 0 100 100" class="search-icon"><path d="M80,75 L65,60 C70,54 73,46 73,38 C73,22 60,9 44,9 C28,9 15,22 15,38 C15,54 28,67 44,67 C52,67 60,64 66,59 L81,74 L80,75 Z M44,62 C31,62 20,51 20,38 C20,25 31,14 44,14 C57,14 68,25 68,38 C68,51 57,62 44,62 Z"/></svg>';

        chatTab.onclick = () => this.switchMode('chat');
        searchTab.onclick = () => this.switchMode('search');
    }

    private async switchMode(mode: ViewMode) {
        // Save the current chat before switching if we have messages
        if (this.currentMode === 'chat' && mode === 'search' && this.messages.length > 0) {
            // Set flag to indicate we're ending the current conversation
            this.isEndingConversation = true;
            await this.saveChatHistory();
        }
        
        this.currentMode = mode;
        
        // Update tab styling
        const tabs = this.tabsContainer.querySelectorAll('.chat-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        const activeTab = this.tabsContainer.querySelector(`.chat-tab:nth-child(${mode === 'chat' ? 1 : 2})`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Clear view container
        this.viewContainer.empty();

        if (mode === 'chat') {
            await this.initializeChatView();
        } else {
            await this.initializeSearchView();
        }
    }

    private async initializeChatView() {
        // Create chat interface with proper ordering
        this.chatContainer = this.viewContainer.createDiv({ cls: "chat-container" });
        
        // Add chat history button
        this.chatHistoryButton = this.chatContainer.createDiv({ cls: "chat-history-button" });
        setIcon(this.chatHistoryButton, "history");
        this.chatHistoryButton.setAttribute("aria-label", "View chat history");
        this.chatHistoryButton.addEventListener("click", () => this.showChatHistory());
        
        // Add new chat button
        const newChatButton = this.chatContainer.createDiv({ cls: "new-chat-button" });
        setIcon(newChatButton, "plus-circle");
        newChatButton.setAttribute("aria-label", "Start new chat");
        newChatButton.addEventListener("click", () => this.startNewChat());
        
        // Messages area - should be first in DOM
        this.messagesContainer = this.chatContainer.createDiv({ cls: "messages-container" });

        // Input area - should be after messages to appear at bottom
        this.inputContainer = this.chatContainer.createDiv({ cls: "input-container" });
        
        // Create input wrapper (textarea + send in same container)
        const inputWrapper = this.inputContainer.createDiv({ cls: "input-wrapper" });
        
        this.currentInput = inputWrapper.createEl("textarea", {
            cls: "chat-input",
            attr: { placeholder: "Type your message... (Press Enter to send) ⏎" }
        }) as HTMLTextAreaElement;
        
        // Create container for function icons
        const functionIconsContainer = this.inputContainer.createDiv({ cls: 'function-icons-container' });

        // Initialize the plugin functions array if it doesn't exist
        if (!this.plugin.settings.functions) {
            console.log("Initializing functions array from defaults");
            // Use default functions from settings - ensure it's initialized properly
            this.plugin.settings.functions = DEFAULT_SETTINGS.functions ? 
                [...DEFAULT_SETTINGS.functions] : 
                [];
            
            // Copy any existing custom functions
            if (this.plugin.settings.customFunctions && this.plugin.settings.customFunctions.length > 0) {
                this.plugin.settings.functions.push(...this.plugin.settings.customFunctions);
            }
            
            // Save the updated settings
            this.plugin.saveSettings();
        } else if (this.plugin.settings.functions.length === 0) {
            // If array exists but is empty
            this.plugin.settings.functions = DEFAULT_SETTINGS.functions ? 
                [...DEFAULT_SETTINGS.functions] : 
                [];
            this.plugin.saveSettings();
        }
        
        // Debug: Log available functions
        console.log("Available functions:", this.plugin.settings.functions.map(f => f.name).join(", "));
        
        // Ensure Polish function is present
        if (!this.plugin.settings.functions.some(f => f.name === "Polish")) {
            console.log("Polish function missing, adding it");
            this.plugin.settings.functions.push({
                name: "Polish",
                prompt: "Please polish and refine the following text to improve clarity, flow, and style while preserving the original meaning and language. Enhance the expression, eliminate redundancies, and make it more engaging. Return the polished version only, without explanations:",
                icon: "bird",
                tooltip: "Polish and refine text",
                isBuiltIn: true
            });
            this.plugin.saveSettings();
        }

        // Add all functions from the unified functions array
        this.plugin.settings.functions.forEach(func => {
            console.log(`Creating button for function: ${func.name}, icon: ${func.icon}`);
            const iconButton = functionIconsContainer.createEl('button', {
                cls: `function-icon-button ${func.isBuiltIn ? 'built-in' : 'custom-function'}`,
                attr: { 'aria-label': `${func.name} ${func.tooltip ? `(${func.tooltip})` : ''}` }
            });
            
            try {
                setIcon(iconButton, func.icon);
            } catch (e) {
                // Fallback to default icon if the specified icon is invalid
                setIcon(iconButton, 'bot');
                console.warn(`Invalid icon '${func.icon}' for function '${func.name}'`);
            }
            
            const tooltipEl = iconButton.createSpan({ cls: 'function-icon-tooltip' });
            tooltipEl.setText(func.tooltip || func.name);
            
            // Map function to appropriate handler based on name for built-in functions
            // or use generic custom function handler for custom functions
            if (func.isBuiltIn) {
                switch (func.name) {
                    case "Organize":
                        iconButton.onclick = () => this.handleOrganize();
                        break;
                    case "Grammar":
                        iconButton.onclick = () => this.handleGrammar();
                        break;
                    case "Generate":
                        iconButton.onclick = () => this.handleGenerate();
                        break;
                    case "Dialogue":
                        iconButton.onclick = () => this.handleDialogue();
                        break;
                    case "Summarize":
                        iconButton.onclick = () => this.handleSummarize();
                        break;
                    case "Polish":
                        iconButton.onclick = () => this.handlePolish();
                        break;
                    default:
                        iconButton.onclick = () => this.handleCustomFunction(func);
                }
            } else {
                iconButton.onclick = () => this.handleCustomFunction(func);
            }
        });

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Render existing messages if any (for mode switching)
        if (this.messages.length > 0) {
            this.renderChatHistory();
        }
    }

    private async initializeSearchView() {
        const searchContainer = this.viewContainer.createDiv({ cls: "search-container" });
        
        const inputContainer = searchContainer.createDiv({ cls: "search-input-container" });
        
        // Create directory selector
        const dirSelector = inputContainer.createEl("select", {
            cls: "search-dir-selector",
            attr: {
                'aria-label': 'Select directory to search in'
            }
        });
        
        // Add "All Files" option
        dirSelector.createEl("option", {
            text: "All Files",
            value: ""
        });
        
        // Get and add first-level directories
        const rootFolder = this.app.vault.getRoot();
        const folders = rootFolder.children
            .filter(child => child instanceof TFolder)
            .sort((a, b) => a.name.localeCompare(b.name));
            
        folders.forEach(folder => {
            dirSelector.createEl("option", {
                text: folder.name,
                value: folder.path
            });
        });

        // Create search input row
        const searchInputRow = inputContainer.createDiv({ cls: "search-input-row" });
        const searchInput = searchInputRow.createEl("input", {
            cls: "search-input",
            attr: {
                placeholder: "Enter your search query...",
                'aria-label': 'Search query',
                type: 'search'
            }
        });
        const searchButton = searchInputRow.createEl("button", {
            cls: "search-button",
            text: "Search"
        });

        const resultsContainer = searchContainer.createDiv({ cls: "search-results" });

        // Add progress indicator
        const progressContainer = searchContainer.createDiv({ cls: "search-progress" });
        const progressBar = progressContainer.createDiv({ cls: "search-progress-bar" });
        const progressText = progressContainer.createDiv({ cls: "search-progress-text" });
        const countText = progressContainer.createDiv({ cls: "count-text" });
        progressContainer.style.display = 'none';

        // Search handler
        const handleSearch = async () => {
            const query = searchInput.value.trim();
            if (!query) {
                resultsContainer.empty();
                resultsContainer.createDiv({ 
                    cls: "error-message", 
                    text: "Please enter a search query." 
                });
                return;
            }

            progressContainer.style.display = 'block';
            progressText.textContent = 'Initializing search...';
            progressBar.style.width = '0%';
            countText.textContent = '';
            resultsContainer.empty();

            try {
                const selectedDir = dirSelector.value;
                const files = await this.plugin.getKnowledgeBaseNotes(selectedDir);
                const now = Date.now();
                const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

                if (files.length === 0) {
                    progressContainer.style.display = 'none';
                    resultsContainer.createDiv({ 
                        cls: "error-message", 
                        text: selectedDir 
                            ? `No files found in directory: ${selectedDir}` 
                            : "No files found in knowledge base." 
                    });
                    return;
                }

                let processed = 0;
                const results = [];
                const totalFiles = files.length;
                countText.textContent = `Found ${totalFiles} files to process`;

                for (const file of files) {
                    const content = await this.app.vault.read(file);
                    const currentHash = await this.calculateFileHash(content);
                    
                    // Check cache validity
                    const cached = this.knowledgeBaseCache.get(file.path);
                    if (cached && 
                        now - cached.timestamp < CACHE_DURATION && 
                        cached.hash === currentHash) {
                        results.push({ 
                            file, 
                            similarity: cached.similarity, 
                            content: cached.content 
                        });
                        processed++;
                        continue;
                    }

                    // Calculate new similarity if cache invalid or missing
                    const similarity = await this.plugin.calculateSimilarity(query, content);
                    results.push({ file, similarity, content });

                    // Update cache
                    this.knowledgeBaseCache.set(file.path, { 
                        similarity, 
                        content, 
                        timestamp: now,
                        hash: currentHash 
                    });
                    
                    processed++;
                    const progress = (processed / files.length) * 100;
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `Processing ${processed}/${files.length} files...`;
                    countText.textContent = `Found ${files.length} files, processed ${processed}`;
                }

                progressText.textContent = 'Generating summary...';
                progressBar.style.width = '100%';
                countText.textContent = `Processing summary for top ${Math.min(5, results.length)} results...`;

                const topResults = results
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, 5);

                await this.displaySearchResults(resultsContainer, topResults);
                progressContainer.style.display = 'none';
            } catch (error) {
                progressContainer.style.display = 'none';
                resultsContainer.createDiv({ 
                    cls: "error-message", 
                    text: `Error: ${error.message}` 
                });
            }
        };

        // Add event listeners
        searchInput.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                await handleSearch();
            }
        });
        searchButton.addEventListener("click", handleSearch);

        // Focus search input by default
        searchInput.focus();
    }

    private async addMessage(role: 'user' | 'assistant', content: string) {
        // Add to messages array
        this.messages.push({ role, content });

        // Create message element
        const messageDiv = this.messagesContainer.createDiv({
            cls: role === 'user' ? 'user-message' : 'ai-message'
        });

        // Create content container
        const contentDiv = messageDiv.createDiv({ cls: "message-content" });

        // Add metadata (timestamp)
        const metadata = contentDiv.createDiv({ cls: "message-metadata" });
        metadata.setText(new Date().toLocaleTimeString());

        // Create message text container
        const textDiv = contentDiv.createDiv({ cls: "message-text" });

        // Render markdown content for the message
        await NewMarkdownRenderer.renderMarkdown(
            content,
            textDiv,
            '',
            this.plugin
        );

        // For assistant messages, only add action buttons that appear on hover
        if (role === 'assistant') {
            const actionContainer = contentDiv.createDiv({ cls: 'message-actions hover-only' });
            
            // Add copy button
            const copyButton = actionContainer.createEl('button', {
                cls: 'message-action-button copy-button',
                attr: { 'aria-label': 'Copy message' }
            });
            setIcon(copyButton, 'copy');
            copyButton.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(content);
                    new Notice('Copied to clipboard', 2000);
                } catch (err) {
                    console.error("Failed to copy content:", err);
                    new Notice("Failed to copy content");
                }
            };
            
            // Add insert button
            const insertButton = actionContainer.createEl('button', {
                cls: 'message-action-button insert-button',
                attr: { 'aria-label': 'Insert into editor' }
            });
            setIcon(insertButton, 'plus');
            insertButton.onclick = () => {
                const activeLeaf = this.app.workspace.activeLeaf;
                if (!activeLeaf) {
                    new Notice('Please open a markdown file first');
                    return;
                }

                const view = activeLeaf.view;
                if (!(view instanceof MarkdownView)) {
                    new Notice('Please open a markdown file first');
                    return;
                }

                const editor = view.editor;
                const cursor = editor.getCursor();
                editor.replaceRange(content + '\n', cursor);
                editor.focus();
                new Notice('Content inserted into editor', 2000);
            };
            
            // Add apply button (for applying changes directly to original text)
            const applyButton = actionContainer.createEl('button', {
                cls: 'message-action-button apply-button',
                attr: { 'aria-label': 'Apply changes to original text' }
            });
            setIcon(applyButton, 'check');
            applyButton.onclick = () => {
                const editor = this.getEditor();
                if (!editor) {
                    new Notice('Please open a markdown file first');
                    return;
                }
                
                // Find the original text (selected or entire document)
                let originalText = "";
                let isSelection = false;
                
                if (editor.somethingSelected()) {
                    originalText = editor.getSelection();
                    isSelection = true;
                } else {
                    originalText = editor.getValue();
                }
                
                // Create visual diff and apply using the Polish comparison modal
                new PolishResultModal(
                    this.plugin.app,
                    originalText,
                    content,
                    (updatedContent: string) => {
                        if (editor) {
                            if (isSelection) {
                                editor.replaceSelection(updatedContent);
                            } else {
                                editor.setValue(updatedContent);
                            }
                            new Notice("AI polish applied successfully");
                        }
                    },
                    this.plugin  // Pass the plugin instance
                ).open();
            };
        }

        // Scroll to bottom
        this.messagesContainer.scrollTo({
            top: this.messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    // Improved method to get the editor, trying to find an open markdown file
    // even if the chat view is currently active
    private getEditor(): any {
        // First, check the active leaf in case we're in an editor already
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
            // We're already in a markdown editor
            const fileName = activeLeaf.getDisplayText();
            this.lastNoticedFile = fileName;
            return activeLeaf.view.editor;
        }
        
        // If not, look for any open markdown view in the workspace
        const mdLeaves = this.app.workspace.getLeavesOfType('markdown');
        if (mdLeaves.length > 0) {
            // Return the editor from the first markdown leaf we find
            const mdView = mdLeaves[0].view as MarkdownView;
            const fileName = mdLeaves[0].getDisplayText();
            
            if (mdView && mdView.editor) {
                // Only show notice when we switch to a different file
                if (this.lastNoticedFile !== fileName) {
                    new Notice(`Using the file "${fileName}" for content`, 2000);
                    this.lastNoticedFile = fileName;
                }
                return mdView.editor;
            }
        }
        
        // Look for any editor view that might be open - more permissive approach
        const leaves = this.app.workspace.getLeavesOfType('');
        for (const leaf of leaves) {
            if (leaf.view && 
                'getViewType' in leaf.view && 
                leaf.view.getViewType() === 'markdown' && 
                'editor' in leaf.view) {
                const fileName = leaf.getDisplayText();
                new Notice(`Using the file "${fileName}" for content`, 2000);
                this.lastNoticedFile = fileName;
                return (leaf.view as any).editor;
            }
        }
        
        // No markdown views open anywhere
        return null;
    }
    
    // Method to get the selected text from the editor
    private async getSelectedText(): Promise<string> {
        const editor = this.getEditor();
        if (!editor) return "";
        
        return editor.somethingSelected() ? editor.getSelection() : "";
    }
    
    // Method to get the content of the current file
    private async getCurrentFileContent(): Promise<string> {
        const editor = this.getEditor();
        if (!editor) return "";
        
        return editor.getValue();
    }

    // Helper method to send a message to the chat with a function prompt
    private async sendFunctionPromptToChat(prompt: string, content: string = "") {
        if (content) {
            // Send the message immediately instead of just filling the input
            this.sendMessage(prompt, content);
            new Notice(`Applied function to ${await this.getSelectedText() ? "selected text" : "current document"}`, 2000);
        } else {
            // Always try to get content from the current editor even in chat mode
            const editor = this.getEditor();
            let documentContent = "";
            let isSelection = false;
            
            if (editor) {
                if (editor.somethingSelected()) {
                    documentContent = editor.getSelection();
                    isSelection = true;
                } else {
                    documentContent = editor.getValue();
                }
            }
            
            // If we have document content, use it
            if (documentContent) {
                // Send the message immediately instead of just filling the input
                this.sendMessage(prompt, documentContent);
                const source = isSelection ? "selected text" : "current document";
                new Notice(`Applied function to ${source}`, 2000);
            } else {
                // No document content available, fall back to input field with helpful prompt
                this.currentInput.value = prompt + "\n\n(Paste your text here or open a file first)";
                this.currentInput.focus();
                
                // Select the placeholder text to make it easy to replace
                const placeholderPos = this.currentInput.value.indexOf("(Paste your text here");
                if (placeholderPos > -1) {
                    this.currentInput.setSelectionRange(placeholderPos, placeholderPos + "(Paste your text here or open a file first)".length);
                }
            }
        }
    }

    // Updated handler methods to use a consistent approach
    private async handleSummarize() {
        const content = await this.getCurrentFileContent();
        const selectedText = await this.getSelectedText();
        
        // Find the summarize function in the functions array
        const summarizeFunc = this.plugin.settings.functions.find(f => f.name === "Summarize");
        const prompt = summarizeFunc ? summarizeFunc.prompt : "";
        
        // If no content is available, just insert the prompt
        if (!content) {
            this.sendFunctionPromptToChat(prompt);
                return;
            }

        // Use selected text if available, otherwise use the entire document
        this.sendFunctionPromptToChat(prompt, selectedText || content);
    }

    // Updated method to check if we can use an editor
    private shouldUseEditorMode(): boolean {
        // Check if there's an active editor
        const editor = this.getEditor();
        if (!editor) {
            // If no editor is available, show a notice and use chat
            new Notice("No active editor found. Please open a file first.", 2000);
            return false;
        }
        
        return true;
    }

    // Add this method to handle the Polish function
    private async handlePolish() {
        const content = await this.getCurrentFileContent();
        const selectedText = await this.getSelectedText();
        
        // Find the polish function in the functions array
        const polishFunc = this.plugin.settings.functions.find(f => f.name === "Polish");
        const prompt = polishFunc ? polishFunc.prompt : "";
        
        // If no content is available, just insert the prompt
        if (!content) {
            console.log("Polish function: No active file content found");
            this.sendFunctionPromptToChat(prompt);
                return;
            }
        
        // Use selected text if available, otherwise use the entire document
        console.log("Polish function: Using " + (selectedText ? "selected text" : "entire document"));
        this.sendFunctionPromptToChat(prompt, selectedText || content);
    }

    private async handleOrganize() {
        const content = await this.getCurrentFileContent();
        const selectedText = await this.getSelectedText();
        
        // Find the organize function in the functions array
        const organizeFunc = this.plugin.settings.functions.find(f => f.name === "Organize");
        const prompt = organizeFunc ? organizeFunc.prompt : "";
        
        // If no content is available, just insert the prompt
        if (!content) {
            this.sendFunctionPromptToChat(prompt);
            return;
        }
        
        // Use selected text if available, otherwise use the entire document
        this.sendFunctionPromptToChat(prompt, selectedText || content);
    }

    private async handleGrammar() {
        const content = await this.getCurrentFileContent();
        const selectedText = await this.getSelectedText();
        
        // Find the grammar function in the functions array
        const grammarFunc = this.plugin.settings.functions.find(f => f.name === "Grammar");
        const prompt = grammarFunc ? grammarFunc.prompt : "";
        
        // If no content is available, just insert the prompt
        if (!content) {
            this.sendFunctionPromptToChat(prompt);
            return;
        }
        
        // Use selected text if available, otherwise use the entire document
        this.sendFunctionPromptToChat(prompt, selectedText || content);
    }

    // Handler for custom functions
    async handleCustomFunction(func: any) {
        const content = await this.getCurrentFileContent();
        const selectedText = await this.getSelectedText();
        
        // If no content is available, just insert the prompt
        if (!content) {
            this.sendFunctionPromptToChat(func.prompt);
            return;
        }
        
        // Use selected text if available, otherwise use the entire document
        this.sendFunctionPromptToChat(func.prompt, selectedText || content);
    }

    // Handler for built-in generate content function
    async handleGenerate() {
        const content = await this.getCurrentFileContent();
        const selectedText = await this.getSelectedText();
        
        // Find the generate function in the functions array
        const generateFunc = this.plugin.settings.functions.find(f => f.isBuiltIn && f.name === "Generate");
        const prompt = generateFunc ? generateFunc.prompt : "";
        
        // If no content is available, just insert the prompt
        if (!content) {
            this.sendFunctionPromptToChat(prompt);
            return;
        }
        
        // Use selected text if available, otherwise use the entire document
        this.sendFunctionPromptToChat(prompt, selectedText || content);
    }

    // Handler for built-in dialogue function
    async handleDialogue() {
        const content = await this.getCurrentFileContent();
        const selectedText = await this.getSelectedText();
        
        // Find the dialogue function in the functions array
        const dialogueFunc = this.plugin.settings.functions.find(f => f.isBuiltIn && f.name === "Dialogue");
        const prompt = dialogueFunc ? dialogueFunc.prompt : "";
        
        // If no content is available, just insert the prompt
        if (!content) {
            this.sendFunctionPromptToChat(prompt);
            return;
        }
        
        // Use selected text if available, otherwise use the entire document
        this.sendFunctionPromptToChat(prompt, selectedText || content);
    }

    private async handleSend() {
        const content = this.currentInput.value.trim();
        if (!content) return;

        // Clear input
        this.currentInput.value = "";

        // Add user message
        await this.addMessage('user', content);

        // Create a loading message element that will be updated with streaming content
        const messageDiv = this.messagesContainer.createDiv({
            cls: 'ai-message'
        });
        const contentDiv = messageDiv.createDiv({ cls: "message-content" });
        const metadata = contentDiv.createDiv({ cls: "message-metadata" });
        metadata.setText(new Date().toLocaleTimeString());
        const textDiv = contentDiv.createDiv({ cls: "message-text" });

        try {
            // Ensure request ID consistency
            if (!this.requestId) {
                this.requestId = crypto.randomUUID();
                this.plugin.requestId = this.requestId;
            }

            let streamedContent = '';
            let lastRenderTime = Date.now();
            let retries = 0;
            
            // Get AI response with streaming updates and retry logic
            while (retries < this.MAX_RETRIES) {
                try {
                    const response = await this.plugin.callAIChat([
                        ...this.messages,
                        { role: 'user', content }
                    ], async (chunk: string) => {
                        if (!chunk) return;

                        streamedContent += chunk;
                        const now = Date.now();

                        // Throttle rendering to prevent performance issues
                        if (now - lastRenderTime >= this.RENDER_THROTTLE) {
                            let renderRetries = 0;
                            const MAX_RENDER_RETRIES = 3;

                            while (renderRetries < MAX_RENDER_RETRIES) {
                                try {
                                    // Clear and render new content
            textDiv.empty();
                                    await NewMarkdownRenderer.renderMarkdown(
                                        streamedContent,
                                        textDiv,
                                        '',
                                        this.plugin
                                    );

                                    // Scroll to bottom smoothly
                                    this.scrollToBottom();
                                    break; // Success, exit retry loop
                                } catch (e) {
                                    console.warn(`Error rendering markdown (attempt ${renderRetries + 1}/${MAX_RENDER_RETRIES}):`, e);
                                    if (renderRetries === MAX_RENDER_RETRIES - 1) {
                                        // On final retry, fall back to plain text
                                        textDiv.setText(streamedContent);
                                    }
                                    renderRetries++;
                                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retry
                                }
                            }

                            lastRenderTime = now;
                        }
                    });

                    // Add the complete message to history
                    this.messages.push({ role: 'assistant', content: response });

                    // Add action buttons after streaming is complete
                    const actionContainer = contentDiv.createDiv({ cls: 'message-actions hover-only' });

            // Add copy button
            const copyButton = actionContainer.createEl('button', {
                cls: 'message-action-button copy-button',
                        attr: { 'aria-label': 'Copy message' }
            });
            setIcon(copyButton, 'copy');
            copyButton.onclick = async () => {
                try {
                            await navigator.clipboard.writeText(response);
                            new Notice('Copied to clipboard', 2000);
                } catch (err) {
                    console.error("Failed to copy content:", err);
                    new Notice("Failed to copy content");
                }
            };

                    // Add insert button
                    const insertButton = actionContainer.createEl('button', {
                        cls: 'message-action-button insert-button',
                        attr: { 'aria-label': 'Insert into editor' }
                    });
                    setIcon(insertButton, 'plus');
                    insertButton.onclick = () => {
                        const activeLeaf = this.app.workspace.activeLeaf;
                        if (!activeLeaf) {
                            new Notice('Please open a markdown file first');
                            return;
                        }

                        const view = activeLeaf.view;
                        if (!(view instanceof MarkdownView)) {
                            new Notice('Please open a markdown file first');
                            return;
                        }

                        const editor = view.editor;
                        const cursor = editor.getCursor();
                        editor.replaceRange(response + '\n', cursor);
                        editor.focus();
                        new Notice('Content inserted into editor', 2000);
                    };

                    // Add apply button (for applying changes directly to original text)
            const applyButton = actionContainer.createEl('button', {
                cls: 'message-action-button apply-button',
                        attr: { 'aria-label': 'Apply changes to original text' }
            });
            setIcon(applyButton, 'check');
            applyButton.onclick = () => {
                        const editor = this.getEditor();
                        if (!editor) {
                    new Notice('Please open a markdown file first');
                    return;
                }

                        // Find the original text (selected or entire document)
                        let originalText = "";
                        let isSelection = false;
                        
                        if (editor.somethingSelected()) {
                            originalText = editor.getSelection();
                            isSelection = true;
                } else {
                            originalText = editor.getValue();
                        }
                        
                        // Create visual diff and apply using the Polish comparison modal
                        new PolishResultModal(
                            this.plugin.app,
                            originalText,
                            response,
                            (updatedContent: string) => {
                                if (editor) {
                                    if (isSelection) {
                                        editor.replaceSelection(updatedContent);
                                    } else {
                                        editor.setValue(updatedContent);
                                    }
                                    new Notice("AI polish applied successfully");
                                }
                            },
                            this.plugin  // Pass the plugin instance
                        ).open();
                    };

                    break; // Success, exit retry loop

        } catch (error) {
                    console.error(`AI request failed (retry ${retries + 1}/${this.MAX_RETRIES}):`, error);
                    if (retries === this.MAX_RETRIES - 1) {
                        throw new Error('Failed to get AI response after multiple retries');
                    }
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * Math.pow(2, retries)));
                }
            }

        } catch (error) {
            console.error('Error in chat:', error);
            
            // Provide more specific error messages based on the error type
            let errorMessage = 'Sorry, an error occurred. Please try again.';
            
            if (error && error.message) {
                if (error.message.includes('images') || error.message.includes('unsupported content')) {
                    errorMessage = 'Error: Your message contains images or unsupported content that the AI cannot process. Please remove any images and try again.';
                } else if (error.message.includes('rate limit') || error.message.includes('429')) {
                    errorMessage = 'Error: Rate limit exceeded. Please wait a moment before trying again.';
                } else if (error.message.includes('Invalid API key') || error.message.includes('401')) {
                    errorMessage = 'Error: Invalid API key. Please check your API key in settings.';
                } else if (error.message.includes('Failed to get AI response after multiple retries')) {
                    errorMessage = 'Error: Failed to get a response after multiple attempts. Please check your internet connection and try again.';
                }
            }
            
            // Update the message div with the error
            textDiv.empty();
            const errorContainer = textDiv.createDiv({ cls: 'error-container' });
            
            // Add warning icon
            const warningIcon = errorContainer.createDiv({ cls: 'error-icon' });
            setIcon(warningIcon, 'alert-triangle');
            
            // Add error message
            const errorText = errorContainer.createDiv({ cls: 'error-text' });
            errorText.setText(errorMessage);
            
            // Add retry button
            const retryButton = errorContainer.createEl('button', { 
                cls: 'compact-retry-button',
                text: 'Retry Last Message'
            });
            
            retryButton.addEventListener('click', () => {
                // Remove the error message
                messageDiv.remove();
                // Put the last message back in the input
                this.currentInput.value = content;
                // Focus the input
                this.currentInput.focus();
            });
        }

        // Save chat history after every 5 messages or after 10 minutes
        if (this.shouldSaveHistory()) {
            await this.saveChatHistory();
        }
    }

    private async displaySearchResults(resultsContainer: HTMLElement, topResults: Array<{file: TFile, similarity: number, content: string}>) {
        const contextsWithRefs = topResults.map((result, index) => {
            const cleanContent = result.content
                .replace(/\n+/g, ' ')
                .slice(0, 1000);
            return `Document [${index + 1}] (${result.file.basename}):\n${cleanContent}...`;
        }).join('\n\n');

        const summaryPrompt = `${this.plugin.settings.promptSummary}\n\n${contextsWithRefs}`;
        const summary = await this.plugin.getAIResponse(summaryPrompt);

        // Display summary
        const summaryDiv = resultsContainer.createDiv({ cls: "search-summary" });
        await NewMarkdownRenderer.renderMarkdown(summary, summaryDiv, '', this.plugin);

        // Add references
        const refsDiv = resultsContainer.createDiv({ cls: "search-references" });
        refsDiv.createEl('h3', { text: 'References' });
        
        topResults.forEach((result, index) => {
            const refDiv = refsDiv.createDiv({ cls: 'search-reference-item' });
            const link = refDiv.createEl('a', {
                text: `[${index + 1}] ${result.file.basename}`,
                cls: 'search-reference-link'
            });
            link.addEventListener('click', () => {
                this.app.workspace.getLeaf().openFile(result.file);
            });
        });
    }

    private async calculateFileHash(content: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    private estimateTokenCount(text: string): number {
        // Rough estimation: ~4 chars per token
        return Math.ceil(text.length / 4);
    }

    private scrollToBottom(smooth = true) {
        if (this.messagesContainer) {
            // Force layout recalculation to get accurate scrollHeight
            void this.messagesContainer.offsetHeight;
            
            // Calculate if we're already at the bottom (within 100px)
            const isAtBottom = this.messagesContainer.scrollHeight - this.messagesContainer.scrollTop - this.messagesContainer.clientHeight < 100;
            
            // Only use smooth scrolling if we're not already at the bottom
            const behavior = smooth && !isAtBottom ? 'smooth' : 'auto';
            
            this.messagesContainer.scrollTo({
                top: this.messagesContainer.scrollHeight,
                behavior: behavior
            });
        }
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    private setupKeyboardShortcuts() {
        // Chat input shortcuts
        this.currentInput.addEventListener("keydown", async (event: KeyboardEvent) => {
            // Enter to send (without holding modifiers except shift for line break)
            if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                await this.handleSend();
            }
            
            // Shift+Enter to insert new line
            if (event.key === "Enter" && event.shiftKey) {
                // Let default behavior happen (insert newline)
                return;
            }
            
            // Alt+Enter also inserts new line
            if (event.key === "Enter" && event.altKey) {
                event.preventDefault();
                const start = this.currentInput.selectionStart;
                const end = this.currentInput.selectionEnd;
                this.currentInput.value = 
                    this.currentInput.value.substring(0, start) + 
                    "\n" + 
                    this.currentInput.value.substring(end);
                this.currentInput.selectionStart = this.currentInput.selectionEnd = start + 1;
            }

            // Esc to clear input
            if (event.key === "Escape") {
                event.preventDefault();
                this.currentInput.value = "";
                this.currentInput.focus();
            }

            // Ctrl/Cmd + L to clear chat
            if (event.key.toLowerCase() === "l" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.clearChat();
            }
        });
    }

    private clearChat() {
        if (this.messagesContainer) {
            this.messagesContainer.empty();
            this.messages = [];
            new Notice("Chat cleared");
        }
    }

    private sendMessage(prompt: string, content: string) {
        this.currentInput.value = `${prompt}\n\n${content}`;
        this.handleSend();
    }

    // Add this method to save the current chat history
    private async saveChatHistory() {
        if (this.messages.length === 0) return;
        
        try {
            // Create or use existing conversation ID
            if (!this.conversationId) {
                this.conversationId = crypto.randomUUID();
            }
            
            // Create history entry
            const history: ChatHistory = {
                id: this.conversationId,
                title: this.getHistoryTitle(),
                date: Date.now(),
                messages: [...this.messages],
                requestId: this.requestId
            };
            
            // Ensure chat history directory exists
            const historyDir = this.plugin.settings.chatHistoryPath;
            const folderExists = await this.ensureFolderExists(historyDir);
            
            if (!folderExists) {
                throw new Error(`Failed to create chat history directory: ${historyDir}`);
            }
            
            // Save to file with consistent name based on conversation ID
            const fileName = `chat-${this.conversationId}.json`;
            const filePath = `${historyDir}/${fileName}`;
            await this.plugin.app.vault.adapter.write(filePath, JSON.stringify(history, null, 2));
            
            // Update last save time
            this.lastHistorySave = Date.now();
            
            console.log(`Chat history saved: ${filePath} with ${this.messages.length} messages`);
            return true;
        } catch (error) {
            return this.handleHistoryError('save chat history', error);
        }
    }
    
    // Helper to ensure a folder exists
    private async ensureFolderExists(path: string): Promise<boolean> {
        const { vault } = this.plugin.app;
        const folderExists = await vault.adapter.exists(path);
        
        if (!folderExists) {
            try {
                await vault.createFolder(path);
                return true;
            } catch (error) {
                console.error(`Failed to create folder ${path}:`, error);
                return false;
            }
        }
        
        return true;
    }
    
    // Get a title for the chat history based on first user message
    private getHistoryTitle(): string {
        const firstUserMsg = this.messages.find(m => m.role === 'user');
        if (!firstUserMsg) return "Chat Session";
        
        // Get first 30 chars of first message
        const title = firstUserMsg.content.substring(0, 30).trim();
        return title + (firstUserMsg.content.length > 30 ? "..." : "");
    }
    
    // Show the chat history modal
    private async showChatHistory() {
        // Set flag to indicate we're potentially ending the current conversation
        this.isEndingConversation = true;
        
        try {
            const histories = await this.loadChatHistories();
            new ChatHistoryModal(this.plugin.app, histories, (history) => {
                this.loadChatFromHistory(history);
            }, this.plugin).open();
        } catch (error) {
            console.error("Failed to load chat histories:", error);
            new Notice("Failed to load chat histories", 2000);
        }
    }
    
    // Load all chat histories
    private async loadChatHistories(): Promise<ChatHistory[]> {
        try {
            const historyDir = this.plugin.settings.chatHistoryPath;
            const folderExists = await this.ensureFolderExists(historyDir);
            
            if (!folderExists) {
                throw new Error(`Chat history directory does not exist: ${historyDir}`);
            }
            
            const files = await this.plugin.app.vault.adapter.list(historyDir);
            const histories: ChatHistory[] = [];
            
            for (const file of files.files) {
                if (file.endsWith('.json')) {
                    try {
                        const content = await this.plugin.app.vault.adapter.read(file);
                        const historyData = JSON.parse(content);
                        
                        // Ensure backward compatibility with older history files
                        if (!historyData.requestId) {
                            historyData.requestId = null;
                        }
                        
                        const history = historyData as ChatHistory;
                        histories.push(history);
                    } catch (error) {
                        console.error(`Failed to read chat history ${file}:`, error);
                        // Continue with other files
                    }
                }
            }
            
            // Sort by date descending (newest first)
            return histories.sort((a, b) => b.date - a.date);
        } catch (error) {
            return this.handleHistoryError('load chat histories', error);
        }
    }
    
    // Load a specific chat history
    private loadChatFromHistory(history: ChatHistory) {
        // Save current chat before loading a different one if messages exist
        if (this.messages.length > 0) {
            this.saveChatHistory();
        }
        
        this.clearChat();
        
        // Set the conversation ID to match the loaded history
        this.conversationId = history.id;
        
        // Restore messages
        this.messages = [...history.messages];
        
        // Restore requestId if available
        if (history.requestId) {
            this.requestId = history.requestId;
            this.plugin.requestId = history.requestId;
        }
        
        this.renderChatHistory();
        new Notice(`Loaded chat: ${history.title}`, 2000);
    }

    // Fix the renderChatHistory method in ChatView
    private renderChatHistory() {
        if (!this.messagesContainer) return;
        
        this.messagesContainer.empty();
        
        for (const message of this.messages) {
            const messageEl = this.messagesContainer.createDiv({ 
                cls: `message ${message.role}-message` 
            });
            
            const contentDiv = messageEl.createDiv({ cls: 'message-content' });
            
            if (message.role === 'assistant') {
                NewMarkdownRenderer.renderMarkdown(message.content, contentDiv, '', this.plugin);
                
                // Add action buttons for assistant messages
                const actionContainer = messageEl.createDiv({ cls: 'message-actions hover-only' });
                
                const copyButton = actionContainer.createEl('button', { 
                    cls: 'message-action-button copy-button',
                    attr: { 'aria-label': 'Copy message' }
                });
                setIcon(copyButton, 'copy');
                copyButton.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(message.content);
                        new Notice('Copied to clipboard', 2000);
                    } catch (err) {
                        console.error("Failed to copy content:", err);
                        new Notice("Failed to copy content", 2000);
                    }
                };
                
                const insertButton = actionContainer.createEl('button', { 
                    cls: 'message-action-button insert-button',
                    attr: { 'aria-label': 'Insert into editor' }
                });
                setIcon(insertButton, 'plus');
                insertButton.onclick = () => {
                    const activeLeaf = this.app.workspace.activeLeaf;
                    if (!activeLeaf) {
                        new Notice('Please open a markdown file first');
                        return;
                    }

                    const view = activeLeaf.view;
                    if (!(view instanceof MarkdownView)) {
                        new Notice('Please open a markdown file first');
                        return;
                    }

                    const editor = view.editor;
                    const cursor = editor.getCursor();
                    editor.replaceRange(message.content + '\n', cursor);
                    editor.focus();
                    new Notice('Content inserted into editor', 2000);
                };
                
                const applyButton = actionContainer.createEl('button', { 
                    cls: 'message-action-button apply-button',
                    attr: { 'aria-label': 'Apply changes to original text' }
                });
                setIcon(applyButton, 'check');
                applyButton.onclick = () => {
                    const editor = this.getEditor();
                    if (!editor) {
                        new Notice('Please open a markdown file first');
                        return;
                    }
                    
                    // Find the original text (selected or entire document)
                    let originalText = "";
                    let isSelection = false;
                    
                    if (editor.somethingSelected()) {
                        originalText = editor.getSelection();
                        isSelection = true;
                    } else {
                        originalText = editor.getValue();
                    }
                    
                    // Create visual diff and apply using the Polish comparison modal
                    new PolishResultModal(
                        this.plugin.app,
                        originalText,
                        message.content,
                        (updatedContent: string) => {
                            if (editor) {
                                if (isSelection) {
                                    editor.replaceSelection(updatedContent);
                                } else {
                                    editor.setValue(updatedContent);
                                }
                                new Notice("AI polish applied successfully");
                            }
                        },
                        this.plugin  // Pass the plugin instance
                    ).open();
                };
            } else {
                contentDiv.setText(message.content);
            }
        }
        
        // Scroll to bottom
        if (this.messagesContainer.scrollHeight) {
            this.messagesContainer.scrollTo({
                top: this.messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    private async startNewChat() {
        // Set flag to indicate we're ending the current conversation
        this.isEndingConversation = true;
        
        // Save current conversation if it exists
        if (this.messages.length > 0) {
            await this.saveChatHistory();
        }
        
        // Clear the chat and start fresh
        this.clearChat();
        
        // Reset conversation tracking
        this.conversationId = null;
        
        // Generate a new requestId for the new conversation
        this.requestId = crypto.randomUUID();
        this.plugin.requestId = this.requestId;
        
        new Notice("Started new chat", 2000);
    }

    // Update shouldSaveHistory to include a check for ending a conversation
    private shouldSaveHistory(): boolean {
        // Always save when conversation is explicitly ended (new chat or switching conversations)
        if (this.isEndingConversation) {
            this.isEndingConversation = false;
            return true;
        }
        
        // Save after every 5 messages
        if (this.messages.length % 5 === 0 && this.messages.length > 0) {
            return true;
        }
        
        // Also save if we have messages but haven't saved in the last 10 minutes
        const lastSaveTime = this.lastHistorySave || 0;
        const TEN_MINUTES = 10 * 60 * 1000;
        
        if (this.messages.length > 0 && Date.now() - lastSaveTime > TEN_MINUTES) {
            return true;
        }
        
        return false;
    }

    // Add this method to improve error handling for chat history operations
    private handleHistoryError(operation: string, error: any): any {
        console.error(`Error during ${operation}:`, error);
        
        // Create a more user-friendly error message
        let errorMessage = `Failed to ${operation}`;
        
        // Add more context based on error type
        if (error instanceof Error) {
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                errorMessage = `Chat history directory not found. Please check your settings.`;
            } else if (error.message.includes('permission')) {
                errorMessage = `Permission denied. Cannot access chat history files.`;
            } else if (error.message.includes('JSON')) {
                errorMessage = `Invalid chat history file format.`;
            }
        }
        
        // Show a notification to the user
        new Notice(errorMessage, 3000);
        
        // Return a safe default value based on operation
        switch (operation) {
            case 'load chat histories':
                return [] as ChatHistory[];
            case 'save chat history':
            case 'delete chat history':
            default:
                return false;
        }
    }

    createInputContainer() {
        // ... existing input container code ...
        
        // Add model selection before or after the input
        this.createModelSelector();
        
        // ... rest of existing input container code ...
    }
    
    private createModelSelector() {
        const modelSelectorContainer = this.inputContainer.createDiv({ cls: 'model-selector-container' });
        
        modelSelectorContainer.createEl('label', {
          text: 'AI Model:',
          attr: { for: 'model-selector' }
        });
        
        this.modelSelectEl = modelSelectorContainer.createEl('select', {
          cls: 'model-selector',
          attr: { id: 'model-selector' }
        });
        
        // Populate the model selector
        this.updateModelSelector();
        
        // Handle model selection changes
        this.modelSelectEl.addEventListener('change', () => {
          this.currentModelId = this.modelSelectEl.value;
        });
    }
    
    updateModelSelector() {
        // Clear existing options
        this.modelSelectEl.empty();
        
        // Get active models
        const models = this.modelManager.getActiveModels();
        
        // Add options for each model
        models.forEach(model => {
          const option = this.modelSelectEl.createEl('option', {
            text: model.isDefault ? `${model.name} (Default)` : model.name,
            attr: { value: model.id }
          });
          
          if (model.isDefault) {
            option.style.fontWeight = 'bold';
          }
        });
        
        // If no current model is set or it's no longer available, set to default model
        const defaultModel = this.modelManager.getDefaultModel();
        if (!this.currentModelId || !models.find(m => m.id === this.currentModelId)) {
          this.currentModelId = defaultModel?.id || (models.length > 0 ? models[0].id : '');
        }
        
        // Set the current selection
        this.modelSelectEl.value = this.currentModelId;
    }
    
    async onSendMessage() {
        // Get the user input
        const userInput = this.currentInput.value.trim();
        
        if (!userInput) {
          return; // Don't send empty messages
        }
        
        // Add user message to chat
        await this.addMessage('user', userInput);
        
        // Clear input
        this.currentInput.value = '';
        
        // Use the selected model when sending the message
        try {
          let response: string;
          
          if (this.modelManager && this.currentModelId) {
            // Use the model manager to call the selected model
            response = await this.modelManager.callModel(this.currentModelId, userInput);
          } else {
            // Fallback to the plugin's existing API call
            response = await this.plugin.callAI(userInput);
          }
          
          // Add the response to the chat
          await this.addMessage('assistant', response);
          
          // Save chat history
          await this.saveChatHistory();
        } catch (error) {
          console.error('Error sending message to model:', error);
          await this.addMessage('assistant', `Error: ${error.message}`);
        }
    }
} 