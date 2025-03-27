import { ItemView, WorkspaceLeaf, TFile, Component, TFolder, setIcon, Notice, MarkdownView, Editor, Modal, App, Plugin, PluginSettingTab, Setting, addIcon, normalizePath } from "obsidian";
import type AIPilot from "./main";
import { DEFAULT_SETTINGS } from "./main";
import { MarkdownRenderer as NewMarkdownRenderer } from './MarkdownRenderer';
import { LoadingModal } from './modals';
import { ModelManager, ModelConfig } from './models/ModelManager';

export const VIEW_TYPE_CHAT = "chat-view";

// Add missing type definitions
interface Message {
    role: "user" | "assistant";
    content: string;
}

// Add the diff match patch library type to the AIPilot interface
declare module "./main" {
    interface AIPilot extends Plugin {
        settings: any;
        requestId: string | null;
        saveSettings(): Promise<void>;
        diffMatchPatchLib?: any; // Add this line for the diff library
    }
}

type FunctionMode = 'none' | 'organize' | 'grammar' | 'generate' | 'dialogue' | 'summary' | 'polish' | 'custom';

// Define CustomFunction interface if not imported
interface CustomFunction {
    name: string;
    icon: string;
    prompt: string;
    tooltip?: string;
    isBuiltIn?: boolean;
}

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
    plugin: AIPilot;
    modelManager: ModelManager;
    messagesContainer: HTMLElement;
    inputContainer: HTMLElement;
    chatContainer: HTMLElement;
    messages: Message[] = [];
    viewContainer: HTMLElement;
    chatHistoryButton: HTMLElement;
    currentInput: HTMLTextAreaElement | null = null;
    isGenerating: boolean = false;
    currentMessage: HTMLElement | null = null;
    controller: AbortController | null = null;
    conversationId: string | null = null;
    requestId: string | null = null;
    lastHistorySave: number = 0;
    isEndingConversation: boolean = false;
    currentFunctionMode: FunctionMode = 'none';
    currentMode: 'chat' = 'chat'; // No more search mode, only chat

    constructor(leaf: WorkspaceLeaf, plugin: AIPilot, modelManager: ModelManager) {
        super(leaf);
        this.plugin = plugin;
        this.modelManager = modelManager;
        this.requestId = plugin.requestId;
    }

    getViewType(): string {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText(): string {
        return "AI Chat Assistant";
    }

    async onOpen(): Promise<void> {
        // Add container class for styling
        this.contentEl.addClass('chat-view-container');
        
        // Create view container - simplified with no tabs
        this.viewContainer = this.contentEl.createDiv({ cls: "view-container" });
        
        // Initialize the chat view directly
        this.initializeChatView();
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

        // Add the function buttons
        this.createFunctionButtons(functionIconsContainer);
        
        // Add auto-resize for textarea
        this.setupInputAutoResize();
        
        // Handle input events (Enter to send, Shift+Enter for new line)
        this.setupInputEvents();
        
        // Load any previous chat history or show welcome message
        await this.loadOrInitializeChat();
    }
    
    // Add necessary methods for creating function buttons
    private createFunctionButtons(container: HTMLElement) {
        // Ensure the functions array is initialized
        this.ensureFunctionsInitialized();
        
        // Add function buttons
        this.plugin.settings.functions.forEach(func => {
            const iconButton = container.createEl('button', {
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
            
            // Map function to appropriate handler
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
    }
    
    // Helper method to ensure functions array is initialized
    private ensureFunctionsInitialized() {
        if (!this.plugin.settings.functions) {
            console.log("Initializing functions array from defaults");
            this.plugin.settings.functions = DEFAULT_SETTINGS.functions ? 
                [...DEFAULT_SETTINGS.functions] : 
                [];
            
            if (this.plugin.settings.customFunctions && this.plugin.settings.customFunctions.length > 0) {
                this.plugin.settings.functions.push(...this.plugin.settings.customFunctions);
            }
            
            this.plugin.saveSettings();
        } else if (this.plugin.settings.functions.length === 0) {
            this.plugin.settings.functions = DEFAULT_SETTINGS.functions ? 
                [...DEFAULT_SETTINGS.functions] : 
                [];
            this.plugin.saveSettings();
        }
        
        // Ensure Polish function is present
        if (!this.plugin.settings.functions.some(f => f.name === "Polish")) {
            this.plugin.settings.functions.push({
                name: "Polish",
                prompt: "Please polish and refine the following text to improve clarity, flow, and style while preserving the original meaning and language. Enhance the expression, eliminate redundancies, and make it more engaging. Return the polished version only, without explanations:",
                icon: "bird",
                tooltip: "Polish and refine text",
                isBuiltIn: true
            });
            this.plugin.saveSettings();
        }
    }
    
    // Add method stubs for required functionality
    private showChatHistory() {
        // Implementation of chat history viewing
        // Will be kept from existing code
    }
    
    private async startNewChat() {
        // Implementation of starting a new chat
        // Will be kept from existing code
    }
    
    private setupInputAutoResize() {
        // Implementation for auto-resizing the input field
        if (!this.currentInput) return;
        
        const adjustHeight = () => {
            const input = this.currentInput;
            if (!input) return;
            
            input.style.height = 'auto';
            const newHeight = Math.min(input.scrollHeight, 200);
            input.style.height = newHeight + 'px';
        };
        
        this.currentInput.addEventListener('input', adjustHeight);
        
        // Initial adjustment
        setTimeout(adjustHeight, 0);
    }
    
    private setupInputEvents() {
        // Implementation for setup of input events
        if (!this.currentInput) return;
        
        this.currentInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }
    
    private async loadOrInitializeChat() {
        // Implementation for loading or initializing chat
        // This will be implemented as needed
        this.showWelcomeMessage();
    }
    
    private showWelcomeMessage() {
        // Implementation for showing a welcome message
        if (!this.messagesContainer) return;
        
        this.messagesContainer.empty();
        
        const welcomeEl = this.messagesContainer.createDiv({ cls: "welcome-message" });
        welcomeEl.createEl("h3", { text: "Welcome to AI Chat Assistant" });
        welcomeEl.createEl("p", { text: "Type a message to start chatting with the AI assistant." });
    }
    
    private async sendMessage() {
        if (!this.currentInput || this.isGenerating) return;

        const userMessage = this.currentInput.value.trim();
        if (!userMessage) return;

        try {
            // Get the default model
            const defaultModel = this.modelManager.getDefaultModel();
            if (!defaultModel) {
                throw new Error("No default model configured. Please set a default model in settings.");
            }

            // Add user message to chat
            this.addMessage("user", userMessage);
            
            // Clear input field and reset height
            this.currentInput.value = "";
            this.currentInput.style.height = 'auto';
            
            // Set generating flag
            this.isGenerating = true;
            
            // Create placeholder for assistant message
            const assistantMessageId = `msg-${Date.now()}`;
            this.currentMessage = this.addMessage("assistant", "", assistantMessageId);
            
            // Add loading indicator
            const loadingIndicator = this.currentMessage.createDiv({ cls: 'loading-indicator' });
            loadingIndicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            
            // Initialize controller for potential cancellation
            this.controller = new AbortController();
            
            let accumulatedResponse = '';
            
            // Call model with streaming
            const response = await this.modelManager.callModel(
                defaultModel.id,
                userMessage,
                {
                    streaming: true,
                    onChunk: (chunk) => {
                        try {
                            // Update UI with streaming chunks
                            if (this.currentMessage) {
                                const contentDiv = this.currentMessage.querySelector('.message-content') as HTMLElement;
                                if (contentDiv) {
                                    // Append new content
                                    accumulatedResponse += chunk;
                                    
                                    // Render markdown on the fly
                                    contentDiv.empty();
                                    NewMarkdownRenderer.renderMarkdown(accumulatedResponse, contentDiv, '', this.plugin);
                                    
                                    // Keep scroll at bottom
                                    this.scrollToBottom();
                                }
                            }
                        } catch (error) {
                            console.error('Error handling stream chunk:', error);
                        }
                    },
                    signal: this.controller.signal
                }
            );
            
            // Remove loading indicator
            loadingIndicator?.remove();
            
            // Reset UI state
            this.isGenerating = false;
            this.controller = null;
            this.currentMessage = null;
            
            // Check if we should save chat history
            if (this.shouldSaveHistory()) {
                await this.saveChatHistory();
            }
        } catch (error) {
            console.error("Error sending message:", error);
            
            // Remove loading indicator if it exists
            this.currentMessage?.querySelector('.loading-indicator')?.remove();
            
            // Display error to user
            if (this.currentMessage) {
                const contentDiv = this.currentMessage.querySelector('.message-content') as HTMLElement;
                if (contentDiv) {
                    contentDiv.empty();
                    const errorMessage = error instanceof Error ? error.message : "Failed to generate response";
                    contentDiv.createEl('div', { 
                        cls: 'error-message',
                        text: `Error: ${errorMessage}. Please try again.`
                    });
                }
            }

            // Reset UI state
            this.isGenerating = false;
            this.controller = null;
            this.currentMessage = null;
        }
    }

    // Add messages to the chat
    private addMessage(role: "user" | "assistant", content: string, id?: string): HTMLElement {
        // Create message and add to internal state
        const message: Message = { role, content };
        this.messages.push(message);

        // Create message element
        const messageEl = this.messagesContainer.createDiv({
            cls: `message ${role}-message`,
            attr: id ? { id } : {}
        });

        // Create content container
        const contentDiv = messageEl.createDiv({ cls: 'message-content' });
        
        // Render content based on role
        if (role === "assistant") {
            // Use Markdown renderer for assistant messages
            NewMarkdownRenderer.renderMarkdown(content, contentDiv, '', this.plugin);
            
            // Add action buttons for assistant messages if content exists
            if (content) {
                this.addMessageActions(messageEl);
            }
        } else {
            // Plain text for user messages
            contentDiv.setText(content);
        }
        
        // Scroll to the new message
        this.scrollToBottom();
        
        return messageEl;
    }

    // Add action buttons to assistant messages
    private addMessageActions(messageEl: HTMLElement) {
        // Create action container
        const actionContainer = messageEl.createDiv({ cls: 'message-actions hover-only' });
            
        // Add copy button
        const copyButton = actionContainer.createEl('button', {
            cls: 'message-action-button copy-button',
            attr: { 'aria-label': 'Copy message' }
        });
        setIcon(copyButton, 'copy');
        
        copyButton.onclick = async () => {
            try {
                const contentDiv = messageEl.querySelector('.message-content') as HTMLElement;
                if (contentDiv) {
                    await navigator.clipboard.writeText(contentDiv.textContent || "");
                    new Notice('Copied to clipboard', 2000);
                }
            } catch (err) {
                console.error("Failed to copy content:", err);
                new Notice("Failed to copy content", 2000);
            }
        };

        // Add insert button
        const insertButton = actionContainer.createEl('button', {
            cls: 'message-action-button insert-button',
            attr: { 'aria-label': 'Insert into editor' }
        });
        setIcon(insertButton, 'file-plus');
        
        insertButton.onclick = () => {
            const contentDiv = messageEl.querySelector('.message-content') as HTMLElement;
            if (!contentDiv) return;

            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView) {
                new Notice("Please open a markdown file first", 3000);
                return;
            }

            const editor = activeView.editor;
            const content = contentDiv.textContent || "";
            
            // Insert at cursor position
            editor.replaceSelection(content);
            new Notice("Content inserted at cursor position", 2000);
        };

        // Add apply button
        const applyButton = actionContainer.createEl('button', {
            cls: 'message-action-button apply-button',
            attr: { 'aria-label': 'Apply changes' }
        });
        setIcon(applyButton, 'check');
        
        applyButton.onclick = () => {
            const contentDiv = messageEl.querySelector('.message-content') as HTMLElement;
            if (!contentDiv) return;

            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView) {
                new Notice("Please open a markdown file first", 3000);
                return;
            }

            const editor = activeView.editor;
            const newText = contentDiv.textContent || "";
            
            // Get selected text or entire file content
            const originalText = editor.somethingSelected() ? 
                editor.getSelection() : 
                editor.getValue();
            
            // Show diff modal
            this.showDiffModal(editor, originalText, newText);
        };
    }

    // Scroll to bottom of messages container
    private scrollToBottom() {
        if (this.messagesContainer) {
        this.messagesContainer.scrollTo({
            top: this.messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    // Function handlers with proper diff functionality
    private handleOrganize() {
        if (!this.currentInput) return;
        const selectedText = this.getSelectedTextFromEditor();
        
        if (selectedText) {
            const prompt = `${this.plugin.settings.functions.find(f => f.name === "Organize")?.prompt || ''} ${selectedText}`;
            this.currentInput.value = prompt;
            this.currentFunctionMode = 'organize';
            this.sendMessageWithDiff(selectedText);
        } else {
            new Notice("No text available. Please open a markdown file or select text.", 3000);
        }
    }

    private handleGrammar() {
        if (!this.currentInput) return;
        const selectedText = this.getSelectedTextFromEditor();
        
        if (selectedText) {
            const prompt = `${this.plugin.settings.functions.find(f => f.name === "Grammar")?.prompt || ''} ${selectedText}`;
            this.currentInput.value = prompt;
            this.currentFunctionMode = 'grammar';
            this.sendMessageWithDiff(selectedText);
        } else {
            new Notice("No text available. Please open a markdown file or select text.", 3000);
        }
    }

    private handleGenerate() {
        if (!this.currentInput) return;
        const selectedText = this.getSelectedTextFromEditor();
        
        if (selectedText) {
            const prompt = `${this.plugin.settings.functions.find(f => f.name === "Generate")?.prompt || ''} ${selectedText}`;
            this.currentInput.value = prompt;
            this.currentFunctionMode = 'generate';
            this.sendMessageWithDiff(selectedText);
        } else {
            new Notice("No text available. Please open a markdown file or select text.", 3000);
        }
    }

    private handleDialogue() {
        if (!this.currentInput) return;
        const selectedText = this.getSelectedTextFromEditor();
        
        if (selectedText) {
            const prompt = `${this.plugin.settings.functions.find(f => f.name === "Dialogue")?.prompt || ''} ${selectedText}`;
            this.currentInput.value = prompt;
            this.currentFunctionMode = 'dialogue';
            this.sendMessageWithDiff(selectedText);
        } else {
            new Notice("No text available. Please open a markdown file or select text.", 3000);
        }
    }

    private handleSummarize() {
        if (!this.currentInput) return;
        const selectedText = this.getSelectedTextFromEditor();
        
        if (selectedText) {
            const prompt = `${this.plugin.settings.functions.find(f => f.name === "Summarize")?.prompt || ''} ${selectedText}`;
            this.currentInput.value = prompt;
            this.currentFunctionMode = 'summary';
            this.sendMessageWithDiff(selectedText);
        } else {
            new Notice("No text available. Please open a markdown file or select text.", 3000);
        }
    }

    private handlePolish() {
        if (!this.currentInput) return;
        const selectedText = this.getSelectedTextFromEditor();
        
        if (selectedText) {
            const prompt = `${this.plugin.settings.functions.find(f => f.name === "Polish")?.prompt || ''} ${selectedText}`;
            this.currentInput.value = prompt;
            this.currentFunctionMode = 'polish';
            this.sendMessageWithDiff(selectedText);
        } else {
            new Notice("No text available. Please open a markdown file or select text.", 3000);
        }
    }

    private handleCustomFunction(func: CustomFunction) {
        if (!this.currentInput) return;
        const selectedText = this.getSelectedTextFromEditor();
        
        if (selectedText) {
            const prompt = `${func.prompt} ${selectedText}`;
            this.currentInput.value = prompt;
            this.currentFunctionMode = 'custom';
            this.sendMessageWithDiff(selectedText);
        } else {
            this.currentInput.value = func.prompt;
            this.currentFunctionMode = 'custom';
            this.currentInput.focus();
        }
    }

    // Add debugging and improved detection of active view
    private getSelectedTextFromEditor(): string {
        console.log("Getting selected text from editor");
        return NewMarkdownRenderer.getSelectedText(this.app);
    }

    // Add method for sending message with diff functionality
    private async sendMessageWithDiff(originalText: string) {
        if (!this.currentInput || this.isGenerating) return;

        const userMessage = this.currentInput.value.trim();
        if (!userMessage) return;

        try {
            // Get the default model
            const defaultModel = this.modelManager.getDefaultModel();
            if (!defaultModel) {
                throw new Error("No default model configured. Please set a default model in settings.");
            }

            // Add user message to chat
            this.addMessage("user", userMessage);
            
            // Clear input field and reset height
        this.currentInput.value = "";
            this.currentInput.style.height = 'auto';
            
            // Set generating flag
            this.isGenerating = true;
            
            // Create placeholder for assistant message
            const assistantMessageId = `msg-${Date.now()}`;
            this.currentMessage = this.addMessage("assistant", "", assistantMessageId);
            
            // Add loading indicator
            const loadingIndicator = this.currentMessage.createDiv({ cls: 'loading-indicator' });
            loadingIndicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            
            // Initialize controller for potential cancellation
            this.controller = new AbortController();
            
            let accumulatedResponse = '';
            
            // Call model with streaming
            const response = await this.modelManager.callModel(
                defaultModel.id,
                userMessage,
                {
                            streaming: true,
                    onChunk: (chunk) => {
                        try {
                            // Update UI with streaming chunks
                            if (this.currentMessage) {
                                const contentDiv = this.currentMessage.querySelector('.message-content') as HTMLElement;
                                if (contentDiv) {
                                    // Append new content
                                    accumulatedResponse += chunk;
                                    
                                    // Render markdown on the fly
                                    contentDiv.empty();
                                    NewMarkdownRenderer.renderMarkdown(accumulatedResponse, contentDiv, '', this.plugin);
                                    
                                    // Keep scroll at bottom
                                    this.scrollToBottom();
                }
            }
        } catch (error) {
                            console.error('Error handling stream chunk:', error);
                        }
                    },
                    signal: this.controller.signal
                }
            );
            
            // Remove loading indicator
            loadingIndicator?.remove();
            
            // Reset UI state
            this.isGenerating = false;
            this.controller = null;
            
            // Save for diff view later
            const responseText = this.currentMessage?.querySelector('.message-content')?.textContent || "";
            this.currentMessage = null;
            
            // Add apply button for diffs
            if (this.currentFunctionMode !== 'none') {
                this.addApplyButton(originalText, responseText);
            }
            
            // Check if we should save chat history
            if (this.shouldSaveHistory()) {
                await this.saveChatHistory();
            }
            } catch (error) {
            console.error("Error sending message:", error);
            
            // Display error to user
            if (this.currentMessage) {
                const contentDiv = this.currentMessage.querySelector('.message-content') as HTMLElement;
                if (contentDiv) {
                    contentDiv.textContent = "Error: Failed to generate response. Please try again.";
                }
            }
            
            // Reset UI state
            this.isGenerating = false;
            this.controller = null;
            this.currentMessage = null;
        }
    }

    // Method to add apply button for diffs with improved active editor checking
    private addApplyButton(originalText: string, responseText: string) {
        const messages = this.messagesContainer.querySelectorAll('.message.assistant-message');
        if (messages.length === 0) return;
        
        const lastMessage = messages[messages.length - 1] as HTMLElement;
        if (!lastMessage) return;
        
        // Check if action container already exists
        let actionContainer = lastMessage.querySelector('.message-actions');
        if (!actionContainer) {
            actionContainer = lastMessage.createDiv({ cls: 'message-actions hover-only' });
        }
        
        // Add apply button
        const applyButton = (actionContainer as HTMLElement).createEl('button', {
            cls: 'message-action-button apply-button',
            attr: { 'aria-label': 'Apply changes' }
        });
        setIcon(applyButton, 'check');
        
        // Add tooltip
        applyButton.createSpan({ cls: 'action-tooltip', text: 'Apply changes' });
        
        // Add click handler for showing diff and applying
        applyButton.onclick = () => {
            // Get active editor - try multiple methods
            let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            
            // If not found through standard method, try from active leaf
            if (!activeView) {
                const activeLeaf = this.app.workspace.activeLeaf;
                if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
                    activeView = activeLeaf.view as MarkdownView;
                }
            }
            
            if (!activeView || !activeView.editor) {
                new Notice("Please open a markdown file first", 3000);
                return;
            }
            
            // Show diff modal to apply changes
            this.showDiffModal(activeView.editor, originalText, responseText);
        };
    }

    // Method to show diff modal
    private showDiffModal(editor: Editor, originalText: string, newText: string) {
        // Create modal for showing diff
        const modal = new Modal(this.app);
        modal.titleEl.setText("Review Changes");
        modal.contentEl.addClass("diff-modal");
        
        // Create diff container
        const diffContainer = modal.contentEl.createDiv({ cls: "diff-container" });
        
        // Add diff visualization
        this.visualizeDiff(diffContainer, originalText, newText);
        
        // Add action buttons
        const buttonContainer = modal.contentEl.createDiv({ cls: "diff-actions" });
        
        // Apply button
        const applyButton = buttonContainer.createEl("button", {
            text: "Apply Changes",
            cls: "diff-apply-button"
        });
        
        // Cancel button
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel",
            cls: "diff-cancel-button"
        });
        
        // Add event listeners
        applyButton.onclick = () => {
            // Check if it's a selection or entire document
            if (editor.somethingSelected()) {
                editor.replaceSelection(newText);
            } else {
                editor.setValue(newText);
            }
            modal.close();
            new Notice("Changes applied successfully", 2000);
        };
        
        cancelButton.onclick = () => {
            modal.close();
        };
        
        // Open the modal
        modal.open();
    }

    // Method to visualize diff
    private visualizeDiff(container: HTMLElement, originalText: string, newText: string) {
        // Create formatted diff if we have the library
        if (this.plugin.diffMatchPatchLib) {
            try {
                const dmp = new this.plugin.diffMatchPatchLib();
                const diffs = dmp.diff_main(originalText, newText);
                dmp.diff_cleanupSemantic(diffs);
                
                // Create diff view
                const diffView = container.createDiv({ cls: "diff-view" });
                
                for (const [op, text] of diffs) {
                    const span = diffView.createSpan({
                        cls: op === -1 ? "diff-delete" : op === 1 ? "diff-add" : "diff-equal",
                        text
                    });
                }
            } catch (error) {
                console.error("Error creating diff:", error);
                this.createSimpleDiffView(container, originalText, newText);
            }
            } else {
            // Fallback to simple diff view
            this.createSimpleDiffView(container, originalText, newText);
        }
    }

    // Create a simple side-by-side diff view
    private createSimpleDiffView(container: HTMLElement, originalText: string, newText: string) {
        const diffContainer = container.createDiv({ cls: "simple-diff-container" });
        
        // Create original text column
        const originalCol = diffContainer.createDiv({ cls: "diff-column original-column" });
        originalCol.createEl("h3", { text: "Original" });
        const originalContent = originalCol.createDiv({ cls: "diff-content" });
        originalContent.setText(originalText);
        
        // Create new text column
        const newCol = diffContainer.createDiv({ cls: "diff-column new-column" });
        newCol.createEl("h3", { text: "New Version" });
        const newContent = newCol.createDiv({ cls: "diff-content" });
        newContent.setText(newText);
    }

    // Add shouldSaveHistory method
    private shouldSaveHistory(): boolean {
        // Always save after a few messages
        if (this.messages.length % 5 === 0 && this.messages.length > 0) {
            return true;
        }
        
        // Also save if it's been more than 10 minutes since the last save
        const lastSaveTime = this.lastHistorySave || 0;
        const TEN_MINUTES = 10 * 60 * 1000;
        
        if (this.messages.length > 0 && Date.now() - lastSaveTime > TEN_MINUTES) {
            return true;
        }
        
        return false;
    }

    // Add saveChatHistory method
    private async saveChatHistory(): Promise<void> {
        try {
            // Generate chat title from first message if possible
            let chatTitle = "Chat " + new Date().toLocaleString();
            if (this.messages.length > 0 && this.messages[0].role === "user") {
                // Use first few words of first message
                const firstMessage = this.messages[0].content;
                chatTitle = firstMessage.split(' ').slice(0, 5).join(' ');
                if (firstMessage.length > chatTitle.length) {
                    chatTitle += '...';
                }
            }
            
            // Create history object
            const history = {
                id: this.conversationId || `chat-${Date.now()}`,
                title: chatTitle,
                date: Date.now(),
                messages: this.messages,
                requestId: this.requestId
            };
            
            // Save to file
            if (!this.plugin.settings.chatHistoryPath) {
                this.plugin.settings.chatHistoryPath = 'chat-history';
                await this.plugin.saveSettings();
            }
            
            // Create folder if it doesn't exist
            const folderPath = this.plugin.settings.chatHistoryPath;
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            
            if (!folder) {
                await this.app.vault.createFolder(folderPath);
            }
            
            // Write history to file
            const fileName = `${folderPath}/${history.id}.json`;
            await this.app.vault.adapter.write(
                fileName,
                JSON.stringify(history, null, 2)
            );
            
            // Update conversation ID if not set
            if (!this.conversationId) {
                this.conversationId = history.id;
            }
            
            // Update last save time
            this.lastHistorySave = Date.now();
            
            console.log(`Chat history saved to ${fileName}`);
        } catch (error) {
            console.error("Failed to save chat history:", error);
        }
    }
} 