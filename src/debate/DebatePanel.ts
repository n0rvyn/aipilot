import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { ModelManager } from '../models/ModelManager';
import { AgentDebateEngine, DebateConfig, DebateMessage, DebateMode } from './AgentDebateEngine';

export const DEBATE_VIEW_TYPE = 'aipilot-debate-view';

export class DebatePanel extends ItemView {
  private modelManager: ModelManager;
  private debateEngine: AgentDebateEngine | null = null;
  private debateConfig: DebateConfig | null = null;
  
  // UI elements
  public containerEl: HTMLElement;
  private topicInputEl: HTMLInputElement;
  private messagesContainerEl: HTMLElement;
  private controlsEl: HTMLElement;
  private modeSelectEl: HTMLSelectElement;
  private roundsInputEl: HTMLInputElement;
  private startButtonEl: HTMLButtonElement;
  private exportButtonEl: HTMLButtonElement;
  private statusEl: HTMLElement;
  private languageSelectEl: HTMLSelectElement;
  
  constructor(leaf: WorkspaceLeaf, modelManager: ModelManager) {
    super(leaf);
    this.modelManager = modelManager;
  }

  getViewType(): string {
    return DEBATE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Debate & Reasoning';
  }

  async onOpen(): Promise<void> {
    this.containerEl = this.contentEl.createDiv({ cls: 'debate-view-container' });
    
    // Create UI components
    this.createHeader();
    this.createConfigPanel();
    this.createMessagesContainer();
    this.createStatusBar();
    
    // Initialize with default config
    this.initializeDefaultConfig();
  }

  async onClose(): Promise<void> {
    // Clean up resources if needed
  }
  
  private createHeader(): void {
    const headerEl = this.containerEl.createDiv({ cls: 'debate-header' });
    
    const titleEl = headerEl.createEl('h2', { text: 'AI Agent Debate' });
    
    const descriptionEl = headerEl.createEl('p', { 
      text: 'Create a multi-agent debate or discussion on any topic. Select a debate mode, configure your settings, and let multiple AI agents discuss the topic from different perspectives.'
    });
  }
  
  private createConfigPanel(): void {
    const configPanelEl = this.containerEl.createDiv({ cls: 'debate-config-panel' });
    
    // Header
    const headerEl = configPanelEl.createEl('h2', { text: 'AI Agent Debate' });
    
    // Topic input
    const topicWrapperEl = configPanelEl.createDiv({ cls: 'config-input-wrapper' });
    topicWrapperEl.createEl('label', { text: 'Topic', attr: { for: 'debate-topic' } });
    
    this.topicInputEl = topicWrapperEl.createEl('input', {
      cls: 'debate-topic-input',
      attr: {
        id: 'debate-topic',
        type: 'text',
        placeholder: 'Enter debate topic'
      }
    });
    
    // Language selection
    const languageWrapperEl = configPanelEl.createDiv({ cls: 'config-input-wrapper' });
    languageWrapperEl.createEl('label', { text: 'Language', attr: { for: 'debate-language' } });
    
    this.languageSelectEl = languageWrapperEl.createEl('select', {
      cls: 'debate-language-select',
      attr: { id: 'debate-language' }
    });
    
    // Add common languages
    const languages = [
      "English", "Spanish", "French", "German", "Chinese", "Japanese", 
      "Russian", "Arabic", "Hindi", "Portuguese", "Italian", "Dutch", 
      "Korean", "Turkish", "Swedish", "Polish", "Vietnamese", "Thai", 
      "Greek", "Hebrew"
    ];
    
    languages.forEach(lang => {
      this.languageSelectEl.createEl('option', { 
        text: lang, 
        attr: { value: lang } 
      });
    });
    
    // Mode selection
    const modeContainerEl = configPanelEl.createDiv({ cls: 'config-item config-row' });
    
    const modeWrapperEl = modeContainerEl.createDiv({ cls: 'config-input-wrapper' });
    modeWrapperEl.createEl('label', { text: 'Debate Mode', attr: { for: 'debate-mode' } });
    
    this.modeSelectEl = modeWrapperEl.createEl('select', {
      cls: 'debate-mode-select',
      attr: { id: 'debate-mode' }
    });
    
    this.modeSelectEl.createEl('option', { text: 'Debate (Pro vs Con)', attr: { value: 'debate' } });
    this.modeSelectEl.createEl('option', { text: 'Six Thinking Hats', attr: { value: 'sixHats' } });
    this.modeSelectEl.createEl('option', { text: 'Roundtable Discussion', attr: { value: 'roundtable' } });
    
    this.modeSelectEl.addEventListener('change', () => this.onModeChange());
    
    // Rounds input
    const roundsWrapperEl = modeContainerEl.createDiv({ cls: 'config-input-wrapper' });
    roundsWrapperEl.createEl('label', { text: 'Rounds', attr: { for: 'debate-rounds' } });
    
    this.roundsInputEl = roundsWrapperEl.createEl('input', {
      cls: 'debate-rounds-input',
      attr: {
        id: 'debate-rounds',
        type: 'number',
        min: '1',
        max: '5',
        value: '3'
      }
    });
    
    // Control buttons
    this.controlsEl = configPanelEl.createDiv({ cls: 'debate-controls' });
    
    this.startButtonEl = this.controlsEl.createEl('button', {
      cls: 'debate-start-button',
      text: 'Start Debate'
    });
    
    this.startButtonEl.addEventListener('click', () => this.startDebate());
    
    this.exportButtonEl = this.controlsEl.createEl('button', {
      cls: 'debate-export-button',
      text: 'Export to Note',
      attr: { disabled: 'true' }
    });
    
    this.exportButtonEl.addEventListener('click', () => this.exportToNote());
  }
  
  private createMessagesContainer(): void {
    this.messagesContainerEl = this.containerEl.createDiv({ cls: 'debate-messages-container' });
    
    // Initial empty state
    const emptyStateEl = this.messagesContainerEl.createDiv({ cls: 'debate-empty-state' });
    
    const emptyIconEl = emptyStateEl.createDiv({ cls: 'debate-empty-icon' });
    // SVG icon could be added here
    
    emptyStateEl.createEl('h3', { text: 'No Active Debate' });
    emptyStateEl.createEl('p', { 
      text: 'Configure your debate settings above and click "Start Debate" to begin a new multi-agent discussion.'
    });
  }
  
  private createStatusBar(): void {
    this.statusEl = this.containerEl.createDiv({ cls: 'debate-status-bar' });
    this.statusEl.textContent = 'Ready to start';
  }
  
  private initializeDefaultConfig(): void {
    // Get the first available model or use a placeholder
    const models = this.modelManager.getModels();
    const defaultModelId = models.length > 0 ? models[0].id : 'default_model_id';
    
    // Create default debate config
    this.debateConfig = AgentDebateEngine.generateDefaultConfig(
      '',
      'debate',
      defaultModelId,
      this.languageSelectEl.value
    );
  }
  
  private onModeChange(): void {
    if (!this.debateConfig) return;
    
    const selectedMode = this.modeSelectEl.value as DebateMode;
    const topic = this.topicInputEl.value.trim();
    const language = this.languageSelectEl.value;
    
    // Get the first available model or use a placeholder
    const models = this.modelManager.getModels();
    const defaultModelId = models.length > 0 ? models[0].id : 'default_model_id';
    
    // Create new config with the selected mode
    this.debateConfig = AgentDebateEngine.generateDefaultConfig(
      topic,
      selectedMode,
      defaultModelId,
      language
    );
    
    // You could update UI here to show the different agents for the selected mode
  }
  
  private async startDebate(): Promise<void> {
    const topic = this.topicInputEl.value.trim();
    if (!topic) {
      new Notice('Please enter a topic for the debate');
      return;
    }
    
    if (!this.debateConfig) {
      new Notice('Debate configuration not initialized');
      return;
    }
    
    // Update rounds
    const rounds = parseInt(this.roundsInputEl.value);
    if (rounds > 0) {
      this.debateConfig.maxRounds = rounds;
    }
    
    // Update topic and language
    this.debateConfig.topic = topic;
    this.debateConfig.language = this.languageSelectEl.value;
    
    // Clear messages container
    this.messagesContainerEl.empty();
    
    // Update status
    this.statusEl.textContent = 'Starting debate...';
    this.startButtonEl.disabled = true;
    this.startButtonEl.textContent = 'Debate in Progress...';
    
    try {
      // Create debate engine
      this.debateEngine = AgentDebateEngine.createFromConfig(
        this.debateConfig,
        this.modelManager
      );
      
      // Set up message callback
      this.debateEngine.onMessage((message) => {
        this.renderMessage(message);
        // Auto-scroll to bottom
        this.messagesContainerEl.scrollTo({
          top: this.messagesContainerEl.scrollHeight,
          behavior: 'smooth'
        });
      });
      
      // Set up message update callback for streaming
      this.debateEngine.onMessageUpdate((message) => {
        this.updateMessage(message);
        // Auto-scroll to bottom
        this.messagesContainerEl.scrollTo({
          top: this.messagesContainerEl.scrollHeight,
          behavior: 'smooth'
        });
      });
      
      // Set up completion callback
      this.debateEngine.onComplete(() => {
        this.statusEl.textContent = 'Debate completed';
        this.startButtonEl.disabled = false;
        this.startButtonEl.textContent = 'Start New Debate';
        this.exportButtonEl.removeAttribute('disabled');
      });
      
      // Start the debate
      await this.debateEngine.startDebate(topic);
    } catch (error) {
      console.error('Error starting debate:', error);
      new Notice(`Error starting debate: ${error.message}`);
      
      this.statusEl.textContent = 'Error starting debate';
      this.startButtonEl.disabled = false;
      this.startButtonEl.textContent = 'Start Debate';
    }
  }
  
  private renderMessage(message: DebateMessage): void {
    if (!this.debateEngine || !this.debateConfig) return;
    
    const messageEl = this.messagesContainerEl.createDiv({ cls: 'debate-message' });
    messageEl.setAttribute('data-message-id', message.id);
    
    // Find the agent
    const isHost = message.agentId === this.debateConfig.hostAgent.id;
    const agent = isHost 
      ? this.debateConfig.hostAgent 
      : this.debateConfig.agents.find(a => a.id === message.agentId);
    
    if (!agent) return;
    
    // Add agent info and styling based on role
    messageEl.addClass(`agent-role-${agent.role}`);
    if (isHost) messageEl.addClass('host-message');
    if (message.streaming) messageEl.addClass('streaming-message');
    
    // Message header with agent name and round
    const headerEl = messageEl.createDiv({ cls: 'message-header' });
    
    const nameEl = headerEl.createEl('span', { 
      cls: 'agent-name',
      text: agent.name 
    });
    
    const roundEl = headerEl.createEl('span', { 
      cls: 'message-round',
      text: message.round === 0 
        ? 'Introduction' 
        : message.round > this.debateConfig.maxRounds 
          ? 'Conclusion' 
          : `Round ${message.round}` 
    });
    
    // Message content - using basic HTML rendering
    const contentEl = messageEl.createDiv({ cls: 'message-content' });
    
    // Convert markdown-like formatting to basic HTML
    const formattedContent = this.formatMarkdown(message.content);
    contentEl.appendChild(formattedContent);
    
    // Add streaming indicator if message is still streaming
    if (message.streaming) {
      const indicatorEl = messageEl.createDiv({ cls: 'streaming-indicator' });
      indicatorEl.createSpan({ text: 'Typing', cls: 'typing-text' });
      
      // Create a container for the dots with the CSS animation
      const dotsContainer = indicatorEl.createDiv({ cls: 'typing-dots-container' });
    }
  }
  
  private updateMessage(message: DebateMessage): void {
    // Find the message element
    const messageEl = this.messagesContainerEl.querySelector(`[data-message-id="${message.id}"]`) as HTMLElement;
    if (!messageEl) return;
    
    // Update the content
    const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
    if (contentEl) {
      // Clear previous content before adding the updated content
      contentEl.empty();
      const formattedContent = this.formatMarkdown(message.content);
      contentEl.appendChild(formattedContent);
    }
    
    // Update streaming status
    if (message.streaming) {
      messageEl.addClass('streaming-message');
      
      // Add streaming indicator if it doesn't exist
      if (!messageEl.querySelector('.streaming-indicator')) {
        const indicatorEl = messageEl.createDiv({ cls: 'streaming-indicator' });
        indicatorEl.createSpan({ text: 'Typing', cls: 'typing-text' });
        
        // Create a container for the dots with the CSS animation
        const dotsContainer = indicatorEl.createDiv({ cls: 'typing-dots-container' });
      }
    } else {
      messageEl.removeClass('streaming-message');
      
      // Remove streaming indicator
      const indicatorEl = messageEl.querySelector('.streaming-indicator');
      if (indicatorEl) {
        indicatorEl.remove();
      }
    }
  }
  
  // Simple markdown formatter - replaced with a safer implementation
  private formatMarkdown(text: string): HTMLElement {
    // Create a container element with the markdown container class
    const container = document.createElement('div');
    container.className = 'debate-markdown-container';
    
    // Split the text by lines to handle headings
    const lines = text.split('\n');
    
    lines.forEach(line => {
      // Check for headings
      const h1Match = line.match(/^# (.*?)$/);
      const h2Match = line.match(/^## (.*?)$/);
      const h3Match = line.match(/^### (.*?)$/);
      const h4Match = line.match(/^#### (.*?)$/);
      
      if (h1Match) {
        const h1 = document.createElement('h1');
        h1.textContent = h1Match[1];
        h1.className = 'debate-markdown-heading debate-markdown-h1';
        container.appendChild(h1);
      } else if (h2Match) {
        const h2 = document.createElement('h2');
        h2.textContent = h2Match[1];
        h2.className = 'debate-markdown-heading debate-markdown-h2';
        container.appendChild(h2);
      } else if (h3Match) {
        const h3 = document.createElement('h3');
        h3.textContent = h3Match[1];
        h3.className = 'debate-markdown-heading debate-markdown-h3';
        container.appendChild(h3);
      } else if (h4Match) {
        const h4 = document.createElement('h4');
        h4.textContent = h4Match[1];
        h4.className = 'debate-markdown-heading debate-markdown-h4';
        container.appendChild(h4);
      } else {
        // Process inline formatting for normal paragraphs
        const paragraph = document.createElement('p');
        paragraph.className = 'debate-markdown-paragraph';
        let content = line;
        
        // Process the content to handle inline markdown
        const processedContent = this.processInlineMarkdown(content);
        paragraph.appendChild(processedContent);
        container.appendChild(paragraph);
      }
    });
    
    return container;
  }
  
  // Helper method to process inline markdown formatting
  private processInlineMarkdown(text: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    
    // Handle different inline patterns
    let currentPos = 0;
    let lastProcessedPos = 0;
    
    // Process bold text (**text**)
    const processBold = (text: string, fragment: DocumentFragment) => {
      let pos = 0;
      while ((pos = text.indexOf('**', pos)) !== -1) {
        const endPos = text.indexOf('**', pos + 2);
        if (endPos === -1) break;
        
        // Add text before the bold
        if (pos > lastProcessedPos) {
          fragment.appendChild(document.createTextNode(text.substring(lastProcessedPos, pos)));
        }
        
        // Add the bold text with class
        const bold = document.createElement('strong');
        bold.textContent = text.substring(pos + 2, endPos);
        bold.className = 'debate-markdown-bold';
        fragment.appendChild(bold);
        
        lastProcessedPos = endPos + 2;
        pos = endPos + 2;
      }
    };
    
    // Process italic text (*text*)
    const processItalic = (text: string, fragment: DocumentFragment) => {
      let pos = 0;
      while ((pos = text.indexOf('*', pos)) !== -1) {
        if (pos > 0 && text[pos-1] === '*') {
          pos++;
          continue;
        }
        if (pos < text.length - 1 && text[pos+1] === '*') {
          pos += 2;
          continue;
        }
        
        const endPos = text.indexOf('*', pos + 1);
        if (endPos === -1) break;
        
        // Add text before the italic
        if (pos > lastProcessedPos) {
          fragment.appendChild(document.createTextNode(text.substring(lastProcessedPos, pos)));
        }
        
        // Add the italic text with class
        const italic = document.createElement('em');
        italic.textContent = text.substring(pos + 1, endPos);
        italic.className = 'debate-markdown-italic';
        fragment.appendChild(italic);
        
        lastProcessedPos = endPos + 1;
        pos = endPos + 1;
      }
    };
    
    // Process code (`text`)
    const processCode = (text: string, fragment: DocumentFragment) => {
      let pos = 0;
      while ((pos = text.indexOf('`', pos)) !== -1) {
        const endPos = text.indexOf('`', pos + 1);
        if (endPos === -1) break;
        
        // Add text before the code
        if (pos > lastProcessedPos) {
          fragment.appendChild(document.createTextNode(text.substring(lastProcessedPos, pos)));
        }
        
        // Add the code with class
        const code = document.createElement('code');
        code.textContent = text.substring(pos + 1, endPos);
        code.className = 'debate-markdown-code';
        fragment.appendChild(code);
        
        lastProcessedPos = endPos + 1;
        pos = endPos + 1;
      }
    };
    
    // Process inline markdown patterns
    processBold(text, fragment);
    processItalic(text, fragment);
    processCode(text, fragment);
    
    // Add any remaining text
    if (lastProcessedPos < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastProcessedPos)));
    }
    
    return fragment;
  }
  
  private async exportToNote(): Promise<void> {
    if (!this.debateEngine || !this.debateConfig) {
      new Notice('No debate to export');
      return;
    }
    
    const messages = this.debateEngine.getMessages();
    if (messages.length === 0) {
      new Notice('No debate messages to export');
      return;
    }
    
    try {
      // Format debate as markdown
      let markdown = `# Debate: ${this.debateConfig.topic}\n\n`;
      markdown += `*Mode: ${this.getModeName(this.debateConfig.mode)} | Rounds: ${this.debateConfig.maxRounds} | Date: ${new Date().toLocaleString()}*\n\n`;
      
      // Add messages
      for (const message of messages) {
        const isHost = message.agentId === this.debateConfig.hostAgent.id;
        const agent = isHost 
          ? this.debateConfig.hostAgent 
          : this.debateConfig.agents.find(a => a.id === message.agentId);
        
        if (!agent) continue;
        
        const roundLabel = message.round === 0 
          ? 'Introduction' 
          : message.round > this.debateConfig.maxRounds 
            ? 'Conclusion' 
            : `Round ${message.round}`;
        
        markdown += `## ${agent.name} (${roundLabel})\n\n`;
        markdown += `${message.content}\n\n`;
      }
      
      // Create a new note
      try {
        // Create a new note with a name based on the topic
        const noteName = `Debate - ${this.debateConfig.topic.substring(0, 30)}`;
        const file = await this.app.vault.create(`${noteName}.md`, markdown);
        
        // Open the new note
        await this.app.workspace.openLinkText(file.path, '', true);
        new Notice('Debate exported to new note');
      } catch (error) {
        console.error('Error creating note:', error);
        // Copy to clipboard as fallback
        await navigator.clipboard.writeText(markdown);
        new Notice('Could not create note. Debate content copied to clipboard.');
      }
    } catch (error) {
      console.error('Error exporting debate:', error);
      new Notice(`Error exporting debate: ${error.message}`);
    }
  }
  
  private getModeName(mode: DebateMode): string {
    switch (mode) {
      case 'debate': return 'Debate (Pro vs Con)';
      case 'sixHats': return 'Six Thinking Hats';
      case 'roundtable': return 'Roundtable Discussion';
      default: return mode;
    }
  }
} 