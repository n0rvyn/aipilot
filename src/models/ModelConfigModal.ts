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
        .addOption('ollama', 'Ollama')
        .addOption('claude', 'Anthropic Claude')
        .addOption('zhipuai', 'Zhipu AI')
        .addOption('baidu', 'Baidu')
        .addOption('custom', 'Custom API')
        .setValue(this.model.type)
        .onChange(value => {
          this.model.type = value as any;
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
      .setName('API Endpoint URL')
      .setDesc(this.getUrlDescription())
      .addText(text => text
        .setPlaceholder(this.getUrlPlaceholder())
        .setValue(this.model.baseUrl || '')
        .onChange(value => this.model.baseUrl = value)
      );
    
    // Specific Model Name (for the provider)
    new Setting(contentEl)
      .setName('Model Name')
      .setDesc(this.getModelNameDescription())
      .addText(text => text
        .setPlaceholder(this.getModelNamePlaceholder())
        .setValue(this.model.modelName || '')
        .onChange(value => this.model.modelName = value)
      );
    
    // System Prompt
    new Setting(contentEl)
      .setName('System Prompt')
      .setDesc('Instructions that define how the AI responds')
      .addTextArea(text => text
        .setPlaceholder('You are a helpful assistant...')
        .setValue(this.model.systemPrompt || '')
        .onChange(value => this.model.systemPrompt = value)
      );
    
    // Proxy settings
    new Setting(contentEl)
      .setName('Use Proxy')
      .setDesc('Override global proxy settings for this model')
      .addToggle(toggle => toggle
        .setValue(this.model.useProxy || false)
        .onChange(value => this.model.useProxy = value)
      );
    
    // Add embedding model settings - only for supported providers
    if (['openai', 'zhipuai', 'custom'].includes(this.model.type)) {
      contentEl.createEl('h3', { text: 'Embedding Settings' });
      
      // Embedding model
      new Setting(contentEl)
        .setName('Embedding Model')
        .setDesc('The model to use for generating embeddings')
        .addText(text => {
          const placeholder = this.model.type === 'openai' 
            ? 'e.g., text-embedding-3-small' 
            : this.model.type === 'zhipuai'
              ? 'e.g., embedding-3'
              : 'Embedding model name';
          
          text
            .setPlaceholder(placeholder)
            .setValue(this.model.embeddingModel || '')
            .onChange(value => this.model.embeddingModel = value);
        });
      
      // Embedding dimensions (only if needed)
      if (this.model.type === 'zhipuai' || this.model.type === 'custom') {
        new Setting(contentEl)
          .setName('Embedding Dimensions')
          .setDesc('Number of dimensions for the embedding vectors (leave empty to use default)')
          .addText(text => text
            .setPlaceholder('e.g., 1024')
            .setValue(this.model.embeddingDimensions?.toString() || '')
            .onChange(value => {
              const dimensions = parseInt(value);
              this.model.embeddingDimensions = isNaN(dimensions) ? undefined : dimensions;
            })
          );
      }
    }
    
    // Active status
    new Setting(contentEl)
      .setName('Active')
      .setDesc('Enable or disable this model')
      .addToggle(toggle => toggle
        .setValue(this.model.active)
        .onChange(value => this.model.active = value)
      );
    
    // Default model setting
    new Setting(contentEl)
      .setName('Set as Default')
      .setDesc('Use this model as the default when no specific model is selected')
      .addToggle(toggle => toggle
        .setValue(this.model.isDefault || false)
        .onChange(value => this.model.isDefault = value)
      );
    
    // Buttons
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText(this.isNewModel ? 'Add Model' : 'Save Changes')
        .setCta()
        .onClick(() => {
          if (this.validateModel()) {
            this.onSubmit(this.model);
            this.close();
          }
        })
      )
      .addButton(button => button
        .setButtonText('Cancel')
        .onClick(() => this.close())
      );
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