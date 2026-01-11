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
  private topicInputEl: HTMLTextAreaElement;
  private messagesContainerEl: HTMLElement;
  private controlsEl: HTMLElement;
  private modeSelectEl: HTMLSelectElement;
  private roundsInputEl: HTMLInputElement;
  private startButtonEl: HTMLButtonElement;
  private exportButtonEl: HTMLButtonElement;
  private statusEl: HTMLElement;
  private languageSelectEl: HTMLSelectElement;
  private configPanelEl: HTMLElement;
  private isConfigPanelCollapsed: boolean = false;
  private configToggleButton: HTMLElement;
  
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
    this.configPanelEl = this.containerEl.createDiv({ cls: 'debate-config-panel' });
    
    // Add config header with toggle button
    const configHeaderEl = this.configPanelEl.createDiv({ cls: 'debate-config-header' });
    
    // Header
    const headerEl = configHeaderEl.createEl('h2', { text: 'AI Agent Debate' });
    
    // Add toggle button
    this.configToggleButton = configHeaderEl.createDiv({ 
      cls: 'debate-config-toggle',
      attr: { title: 'Toggle configuration panel' }
    });
    const svgEl = this.configToggleButton.createSvg('svg', {
      attr: {
        xmlns: "http://www.w3.org/2000/svg",
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'stroke-linejoin': "round"
      }
    });
    svgEl.createSvg('polyline', {
      attr: {
        points: "18 15 12 9 6 15"
      }
    });
    
    this.configToggleButton.addEventListener('click', () => this.toggleConfigPanel());
    
    // Config content div that can be collapsed
    const configContentEl = this.configPanelEl.createDiv({ cls: 'debate-config-content' });
    
    // Topic input
    const topicWrapperEl = configContentEl.createDiv({ cls: 'config-input-wrapper' });
    topicWrapperEl.createEl('label', { text: 'Topic', attr: { for: 'debate-topic' } });
    
    this.topicInputEl = topicWrapperEl.createEl('textarea', {
      cls: 'debate-topic-input',
      attr: {
        id: 'debate-topic',
        placeholder: 'Enter debate topic'
      }
    });
    
    // Language selection
    const languageWrapperEl = configContentEl.createDiv({ cls: 'config-input-wrapper' });
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
    const modeContainerEl = configContentEl.createDiv({ cls: 'config-item config-row' });
    
    const modeWrapperEl = modeContainerEl.createDiv({ cls: 'config-input-wrapper' });
    modeWrapperEl.createEl('label', { text: 'Debate Mode', attr: { for: 'debate-mode' } });
    
    this.modeSelectEl = modeWrapperEl.createEl('select', {
      cls: 'debate-mode-select',
      attr: { id: 'debate-mode' }
    });
    
    // Basic Debate Types
    const basicGroup = this.modeSelectEl.createEl('optgroup', { attr: { label: 'Basic Debate Types' }});
    basicGroup.createEl('option', { text: 'Debate (Pro vs Con)', attr: { value: 'debate' } });
    basicGroup.createEl('option', { text: 'Six Thinking Hats', attr: { value: 'sixHats' } });
    basicGroup.createEl('option', { text: 'Roundtable Discussion', attr: { value: 'roundtable' } });
    
    // Strategic Thinking Models
    const strategicGroup = this.modeSelectEl.createEl('optgroup', { attr: { label: 'Strategic Thinking Models' }});
    strategicGroup.createEl('option', { text: 'SMART Goals', attr: { value: 'smart' } });
    strategicGroup.createEl('option', { text: 'OKR Framework', attr: { value: 'okr' } });
    strategicGroup.createEl('option', { text: 'SWOT Analysis', attr: { value: 'swot' } });
    strategicGroup.createEl('option', { text: 'PEST Analysis', attr: { value: 'pest' } });
    
    // Problem Finding Models
    const problemGroup = this.modeSelectEl.createEl('optgroup', { attr: { label: 'Problem Finding Models' }});
    problemGroup.createEl('option', { text: 'Pre-Mortem Analysis', attr: { value: 'premortem' } });
    problemGroup.createEl('option', { text: '5 Whys Method', attr: { value: 'fivewhys' } });
    problemGroup.createEl('option', { text: 'Fishbone Diagram', attr: { value: 'fishbone' } });
    problemGroup.createEl('option', { text: 'Rubber Duck Debugging', attr: { value: 'rubberduck' } });
    
    // Creative Thinking Models
    const creativeGroup = this.modeSelectEl.createEl('optgroup', { attr: { label: 'Creative Thinking Models' }});
    creativeGroup.createEl('option', { text: 'SCAMPER Method', attr: { value: 'scamper' } });
    creativeGroup.createEl('option', { text: 'Lateral Thinking', attr: { value: 'lateralthinking' } });
    creativeGroup.createEl('option', { text: 'PMI Analysis', attr: { value: 'pmi' } });
    creativeGroup.createEl('option', { text: 'Double Diamond', attr: { value: 'doublediamond' } });
    
    // Learning Models
    const learningGroup = this.modeSelectEl.createEl('optgroup', { attr: { label: 'Learning Models' }});
    learningGroup.createEl('option', { text: 'Feynman Technique', attr: { value: 'feynman' } });
    learningGroup.createEl('option', { text: 'GROW Model', attr: { value: 'grow' } });
    
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
    this.controlsEl = configContentEl.createDiv({ cls: 'debate-controls' });
    
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
    
    // Show initial mode description
    this.updateModeDescription('debate');
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
    
    // Update the message container to show mode description
    this.updateModeDescription(selectedMode);
  }
  
  private updateModeDescription(mode: DebateMode): void {
    // Clear messages container
    this.messagesContainerEl.empty();
    
    // Create container for mode description
    const descriptionEl = this.messagesContainerEl.createDiv({ cls: 'debate-mode-description' });
    
    // Add mode title
    descriptionEl.createEl('h3', { text: this.getModeName(mode) });
    
    // Get current language
    const language = this.languageSelectEl.value;
    
    // Add mode description based on selected language
    descriptionEl.createEl('p', { text: this.getModeDescription(mode, language) });
    
    // Add agents involved if available
    if (this.debateConfig && this.debateConfig.agents.length > 0) {
      const agentsEl = descriptionEl.createDiv({ cls: 'debate-agents-preview' });
      agentsEl.createEl('h4', { text: language === 'Chinese' ? '参与的代理' : 'Participating Agents' });
      
      const agentsList = agentsEl.createEl('ul');
      
      // Add host agent
      const hostItem = agentsList.createEl('li');
      hostItem.createEl('strong', { text: this.debateConfig.hostAgent.name });
      hostItem.createSpan({ text: language === 'Chinese' ? ` — 主持人` : ` — Host` });
      
      // Add other agents
      this.debateConfig.agents.forEach(agent => {
        const agentItem = agentsList.createEl('li');
        agentItem.createEl('strong', { text: agent.name });
        agentItem.createSpan({ text: ` — ${agent.role}` });
      });
    }
  }
  
  private getModeDescription(mode: DebateMode, language: string = 'English'): string {
    if (language === 'Chinese') {
      return this.getChineseModeDescription(mode);
    }
    return this.getEnglishModeDescription(mode);
  }
  
  private getEnglishModeDescription(mode: DebateMode): string {
    switch (mode) {
      case 'debate':
        return 'A structured debate between two opposing viewpoints (Pro vs Con) on the given topic. The agents will present arguments and counterarguments, with a moderator guiding the discussion.';
      case 'sixHats':
        return 'The Six Thinking Hats method is a discussion framework that explores a topic from six different perspectives: facts, emotions, caution, benefits, creativity, and process management.';
      case 'roundtable':
        return 'A collaborative discussion among multiple experts with different specialties, focusing on sharing diverse perspectives on the topic.';
      case 'smart':
        return 'SMART Goals framework helps define objectives that are Specific, Measurable, Achievable, Relevant, and Time-bound. Agents will analyze how to apply SMART criteria to your topic.';
      case 'okr':
        return 'Objectives and Key Results (OKR) framework focuses on setting ambitious objectives and defining measurable key results to track progress.';
      case 'swot':
        return 'SWOT Analysis examines the Strengths, Weaknesses, Opportunities, and Threats related to the topic, providing a comprehensive strategic overview.';
      case 'pest':
        return 'PEST Analysis evaluates Political, Economic, Social, and Technological factors that could impact the topic, ideal for understanding external influences.';
      case 'premortem':
        return 'Pre-Mortem Analysis imagines a future where a project or initiative has failed, then works backward to identify potential causes of failure before they occur.';
      case 'fivewhys':
        return 'The 5 Whys method involves asking "why" multiple times to explore the cause-and-effect relationships underlying a problem, helping to identify the root cause.';
      case 'fishbone':
        return 'The Fishbone Diagram (Ishikawa) maps out all the possible causes of a problem, organizing them into categories to identify root causes.';
      case 'rubberduck':
        return 'Rubber Duck Debugging involves explaining a problem step-by-step as if to an inanimate object (like a rubber duck), which often helps reveal solutions.';
      case 'scamper':
        return 'SCAMPER is a creative thinking technique that explores how to Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, and Reverse aspects of the topic.';
      case 'lateralthinking':
        return 'Lateral Thinking involves approaching problems from unexpected angles and challenging conventional thinking patterns to generate innovative solutions.';
      case 'pmi':
        return 'Plus-Minus-Interesting analysis explores the positive aspects, negative aspects, and interesting implications of an idea or topic.';
      case 'doublediamond':
        return 'The Double Diamond design process consists of four phases: Discover (gather insights), Define (frame the challenge), Develop (create solutions), and Deliver (implement).';
      case 'feynman':
        return 'The Feynman Technique involves explaining complex topics in simple terms to test and deepen understanding, identifying and filling knowledge gaps.';
      case 'grow':
        return 'The GROW model (Goals, Reality, Options, Will) is a coaching framework for problem-solving and goal-setting through structured conversation.';
      default:
        return 'Select a debate mode above and enter a topic to begin exploring this subject from multiple perspectives.';
    }
  }
  
  private getChineseModeDescription(mode: DebateMode): string {
    switch (mode) {
      case 'debate':
        return '一场有关给定主题的正反两方（正方vs反方）之间的结构化辩论。代理人将提出论点和反驳，由主持人引导讨论。';
      case 'sixHats':
        return '六顶思考帽方法是一个从六个不同角度探讨主题的讨论框架：事实、情感、谨慎、益处、创造性和过程管理。';
      case 'roundtable':
        return '由不同专业领域的多位专家进行的协作讨论，侧重于分享对主题的多元视角。';
      case 'smart':
        return 'SMART目标框架帮助定义具体（Specific）、可衡量（Measurable）、可实现（Achievable）、相关（Relevant）和有时限（Time-bound）的目标。代理人将分析如何将SMART标准应用于您的主题。';
      case 'okr':
        return '目标与关键结果（OKR）框架专注于设定宏大的目标并定义可衡量的关键结果以跟踪进度。';
      case 'swot':
        return 'SWOT分析检查与主题相关的优势（Strengths）、劣势（Weaknesses）、机会（Opportunities）和威胁（Threats），提供全面的战略概览。';
      case 'pest':
        return 'PEST分析评估可能影响主题的政治（Political）、经济（Economic）、社会（Social）和技术（Technological）因素，适合理解外部影响。';
      case 'premortem':
        return '预防性事后分析想象项目或计划失败的未来，然后逆向工作以在问题发生前识别潜在的失败原因。';
      case 'fivewhys':
        return '五个为什么方法包括多次询问"为什么"以探索问题背后的因果关系，帮助识别根本原因。';
      case 'fishbone':
        return '鱼骨图（石川图）列出问题的所有可能原因，将它们组织成类别以识别根本原因。';
      case 'rubberduck':
        return '小黄鸭调试法涉及逐步向一个无生命物体（如小黄鸭）解释问题，这通常有助于发现解决方案。';
      case 'scamper':
        return 'SCAMPER是一种创造性思维技术，探索如何替代（Substitute）、组合（Combine）、调整（Adapt）、修改（Modify）、用于其他用途（Put to other uses）、消除（Eliminate）和逆向思考（Reverse）主题的各个方面。';
      case 'lateralthinking':
        return '横向思维涉及从意想不到的角度处理问题，挑战常规思维模式，以产生创新解决方案。';
      case 'pmi':
        return '正负面白分析（Plus-Minus-Interesting）探索一个想法或主题的积极方面、消极方面和有趣的含义。';
      case 'doublediamond':
        return '双钻石设计过程包括四个阶段：发现（收集见解）、定义（构建挑战）、开发（创建解决方案）和交付（实施）。';
      case 'feynman':
        return '费曼技巧包括用简单的术语解释复杂的主题，以测试和加深理解，识别并填补知识空白。';
      case 'grow':
        return 'GROW模型（目标、现实、选择、意愿）是一个通过结构化对话进行问题解决和目标设定的教练框架。';
      default:
        return '在上方选择一个辩论模式并输入主题，开始从多个角度探索此主题。';
    }
  }
  
  private toggleConfigPanel(): void {
    this.isConfigPanelCollapsed = !this.isConfigPanelCollapsed;
    
    if (this.isConfigPanelCollapsed) {
      this.configPanelEl.addClass('collapsed');
      this.configToggleButton.empty();
      const svgEl = this.configToggleButton.createSvg('svg', {
        attr: {
          xmlns: "http://www.w3.org/2000/svg",
          width: "18",
          height: "18",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          'stroke-width': "2",
          'stroke-linecap': "round",
          'stroke-linejoin': "round"
        }
      });
      svgEl.createSvg('polyline', {
        attr: {
          points: "6 9 12 15 18 9"
        }
      });
    } else {
      this.configPanelEl.removeClass('collapsed');
      this.configToggleButton.empty();
      const svgEl = this.configToggleButton.createSvg('svg', {
        attr: {
          xmlns: "http://www.w3.org/2000/svg",
          width: "18",
          height: "18",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          'stroke-width': "2",
          'stroke-linecap': "round",
          'stroke-linejoin': "round"
        }
      });
      svgEl.createSvg('polyline', {
        attr: {
          points: "18 15 12 9 6 15"
        }
      });
    }
    
    // Force a re-layout
    this.containerEl.style.display = 'none';
    setTimeout(() => {
      this.containerEl.style.display = '';
    }, 10);
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
    
    // Auto-collapse the config panel when debate starts
    if (!this.isConfigPanelCollapsed) {
      this.toggleConfigPanel();
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
      case 'smart': return 'SMART Goals Framework';
      case 'okr': return 'OKR (Objectives & Key Results)';
      case 'swot': return 'SWOT Analysis';
      case 'pest': return 'PEST Analysis';
      case 'premortem': return 'Pre-Mortem Analysis';
      case 'fivewhys': return '5 Whys Root Cause Analysis';
      case 'fishbone': return 'Fishbone Diagram (Cause & Effect)';
      case 'rubberduck': return 'Rubber Duck Debugging';
      case 'scamper': return 'SCAMPER Method';
      case 'lateralthinking': return 'Lateral Thinking';
      case 'pmi': return 'PMI (Plus-Minus-Interesting)';
      case 'doublediamond': return 'Double Diamond Design Process';
      case 'feynman': return 'Feynman Technique';
      case 'grow': return 'GROW Coaching Model';
      default: return mode;
    }
  }
} 