import { App, Modal, Setting, Notice } from 'obsidian';
import { ModelConfig as ManagerModelConfig } from './ModelManager';

export class ModelConfigModal extends Modal {
  private model: ManagerModelConfig;
  private onSubmit: (model: ManagerModelConfig) => void;
  private isNewModel: boolean;

  constructor(
    app: App, 
    model: ManagerModelConfig | null, 
    onSubmit: (model: ManagerModelConfig) => void
  ) {
    super(app);

    this.isNewModel = !model;
    
    // If no model is provided, we're creating a new one
    this.model = model || {
      id: `model_${Date.now()}`,
      name: '',
      type: 'openai',
      apiKey: '',
      baseUrl: '',
      systemPrompt: 'You are a helpful assistant.',
      active: true
    };
    
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    
    // Set the title based on whether we're editing or creating
    contentEl.createEl('h2', { 
      text: this.isNewModel ? 'Add AI Model' : 'Edit AI Model'
    });
    
    // Model name
    new Setting(contentEl)
      .setName('Model Name')
      .setDesc('A friendly name to identify this model')
      .addText(text => text
        .setPlaceholder('e.g., GPT-4, Ollama Local, Claude')
        .setValue(this.model.name)
        .onChange(value => this.model.name = value)
      );
    
    // Model type
    new Setting(contentEl)
      .setName('Provider')
      .setDesc('Select the provider for this model')
      .addDropdown(dropdown => dropdown
        .addOption('openai', 'OpenAI')
        .addOption('zhipuai', 'ZhipuAI')
        .addOption('baidu', 'Baidu')
        .addOption('claude', 'Claude/Anthropic')
        .addOption('ollama', 'Ollama (local)')
        .addOption('custom', 'Custom API')
        .setValue(this.model.type)
        .onChange(value => {
          this.model.type = value as 'openai' | 'zhipuai' | 'baidu' | 'claude' | 'ollama' | 'custom';
          // Clear model-specific fields when changing provider
          this.model.baseUrl = '';
          this.model.modelName = '';
          this.contentEl.empty();
          this.onOpen();
        })
      );
    
    // API Key (for most model types)
    if (this.model.type !== 'ollama') {
      new Setting(contentEl)
        .setName('API Key')
        .setDesc('Your API key for authenticating with the service')
        .addText(text => text
          .setPlaceholder('sk-...')
          .setValue(this.model.apiKey || '')
          .onChange((value: string) => this.model.apiKey = value)
          .inputEl.setAttribute('type', 'password')
        );
    }
    
    // Base URL
    new Setting(contentEl)
      .setName('Base URL')
      .setDesc(this.getUrlDescription())
      .addText(text => text
        .setPlaceholder(this.model.type === 'ollama' ? 'http://localhost:11434/api/generate' : '')
        .setValue(this.model.baseUrl || '')
        .onChange(value => this.model.baseUrl = value)
      );
    
    // Model name/ID
    new Setting(contentEl)
      .setName('Model Name/ID')
      .setDesc(this.getModelNameDescription())
      .addText(text => text
        .setPlaceholder(this.getModelNamePlaceholder())
        .setValue(this.model.modelName || '')
        .onChange(value => this.model.modelName = value)
      );
    
    // System prompt
    new Setting(contentEl)
      .setName('System Prompt')
      .setDesc('Default system prompt for this model')
      .addTextArea(text => text
        .setPlaceholder('You are a helpful assistant.')
        .setValue(this.model.systemPrompt || '')
        .onChange(value => this.model.systemPrompt = value)
      );
    
    // Description
    new Setting(contentEl)
      .setName('Description')
      .setDesc('Optional description for this model')
      .addText(text => text
        .setPlaceholder('e.g., Fast and efficient for general tasks')
        .setValue(this.model.description || '')
        .onChange(value => this.model.description = value)
      );
    
    // Model status
    contentEl.createEl('h3', { text: 'Model Status' });

    // Active status (for debate)
    new Setting(contentEl)
        .setName('Active')
        .setDesc('Enable this model for AI debate')
        .addToggle(toggle => toggle
            .setValue(this.model.active || false)
            .onChange(value => this.model.active = value));

    // Default status (for chat/functions)
    new Setting(contentEl)
        .setName('Set as Default')
        .setDesc('Make this model the default for AI chat and function icons')
        .addToggle(toggle => toggle
            .setValue(this.model.isDefault || false)
            .onChange(value => this.model.isDefault = value));
    
    // Proxy settings
    new Setting(contentEl)
      .setName('Use Proxy')
      .setDesc('Use proxy for API calls to this model')
      .addToggle(toggle => toggle
        .setValue(this.model.useProxy || false)
        .onChange(value => this.model.useProxy = value)
      );
    
    // Submit button
    const submitButtonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    const submitButton = submitButtonContainer.createEl('button', {
      text: this.isNewModel ? 'Add Model' : 'Save Changes',
      cls: 'mod-cta'
    });
    submitButton.addEventListener('click', async () => {
      if (this.validateModel()) {
        this.onSubmit(this.model);
        this.close();
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
  
  private validateModel(): boolean {
    if (!this.model.name) {
      new Notice('Please provide a name for the model');
      return false;
    }
    
    if (this.model.type !== 'ollama' && !this.model.apiKey) {
      new Notice('API key is required for this model type');
      return false;
    }
    
    // For Ollama, ensure we have a base URL
    if (this.model.type === 'ollama' && !this.model.baseUrl) {
      this.model.baseUrl = 'http://localhost:11434/api/generate';
    }
    
    return true;
  }
  
  private getUrlDescription(): string {
    switch (this.model.type) {
      case 'openai':
        return 'OpenAI API endpoint (leave blank for default)';
      case 'ollama':
        return 'Local URL for Ollama server';
      case 'claude':
        return 'Anthropic API endpoint (leave blank for default)';
      case 'custom':
        return 'Full URL to your custom API endpoint';
      default:
        return 'API endpoint URL';
    }
  }
  
  private getUrlPlaceholder(): string {
    switch (this.model.type) {
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'ollama':
        return 'http://localhost:11434/api/generate';
      case 'claude':
        return 'https://api.anthropic.com/v1/messages';
      case 'zhipuai':
        return 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
      case 'baidu':
        return 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/';
      case 'custom':
        return 'https://your-custom-api-endpoint.com/generate';
      default:
        return '';
    }
  }

  private getModelNameDescription(): string {
    switch (this.model.type) {
      case 'openai':
        return 'The specific OpenAI model to use (e.g., gpt-3.5-turbo, gpt-4)';
      case 'ollama':
        return 'The specific Ollama model to use (e.g., llama2, mistral)';
      case 'claude':
        return 'The specific Claude model to use (e.g., claude-3-opus-20240229)';
      case 'zhipuai':
        return 'The specific ZhipuAI model to use (e.g., glm-4)';
      case 'baidu':
        return 'The specific Baidu model to use';
      case 'custom':
        return 'The model identifier for your custom API';
      default:
        return 'Model name as it appears to the provider';
    }
  }

  private getModelNamePlaceholder(): string {
    switch (this.model.type) {
      case 'openai':
        return 'gpt-4-turbo';
      case 'ollama':
        return 'llama2';
      case 'claude':
        return 'claude-3-opus-20240229';
      case 'zhipuai':
        return 'glm-4';
      case 'baidu':
        return 'ERNIE-Bot-4';
      case 'custom':
        return 'model-name';
      default:
        return '';
    }
  }
} 