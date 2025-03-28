import { App, Modal, Setting } from "obsidian";
import { EmbeddingModelConfig } from "./ModelManager";
import { getIcon } from "../utils";

export class EmbeddingModelConfigModal extends Modal {
    private model: EmbeddingModelConfig;
    private onSubmit: (model: EmbeddingModelConfig) => void;

    constructor(
        app: App,
        model: EmbeddingModelConfig | null,
        onSubmit: (model: EmbeddingModelConfig) => void
    ) {
        super(app);
        this.onSubmit = onSubmit;
        
        // If editing existing model, clone it
        // If creating new model, create default template
        this.model = model ? { ...model } : {
            id: crypto.randomUUID(),
            name: '',
            type: 'openai',
            modelName: '',
            active: false,
            description: ''
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('embedding-model-config-modal');

        contentEl.createEl('h2', { text: this.model.id ? 'Edit Embedding Model' : 'Add Embedding Model' });

        // Basic Information
        contentEl.createEl('h3', { text: 'Basic Information' });

        // Model name
        new Setting(contentEl)
            .setName('Model Name')
            .setDesc('Display name for this embedding model')
            .addText(text => text
                .setPlaceholder('e.g., OpenAI Ada 2')
                .setValue(this.model.name)
                .onChange(value => this.model.name = value));

        // Provider type
        new Setting(contentEl)
            .setName('Provider')
            .setDesc('Select the embedding model provider')
            .addDropdown(dropdown => dropdown
                .addOption('openai', 'OpenAI')
                .addOption('zhipuai', 'ZhipuAI')
                .addOption('custom', 'Custom API')
                .setValue(this.model.type)
                .onChange(value => {
                    this.model.type = value as 'openai' | 'zhipuai' | 'custom';
                    // Clear model name when provider changes
                    this.model.modelName = '';
                    // Refresh the modal to update available options
                    this.onOpen();
                }));

        // Model name (specific to provider)
        const modelNameSetting = new Setting(contentEl)
            .setName('Model Name/ID')
            .setDesc('Select from known models or enter a custom identifier')
            .addDropdown(dropdown => {
                // Add provider-specific models
                if (this.model.type === 'openai') {
                    dropdown
                        .addOption('text-embedding-3-small', 'text-embedding-3-small')
                        .addOption('text-embedding-3-large', 'text-embedding-3-large')
                        .addOption('text-embedding-ada-002', 'text-embedding-ada-002')
                        .addOption('custom', '-- Custom Model --');
                } else if (this.model.type === 'zhipuai') {
                    dropdown
                        .addOption('embedding-2', 'embedding-2')
                        .addOption('embedding-3', 'embedding-3')
                        .addOption('custom', '-- Custom Model --');
                } else {
                    // For custom API providers
                    dropdown.addOption('custom', '-- Custom Model --');
                }
                
                // Set initial value
                const isCustomValue = 
                    (this.model.type === 'openai' && !['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'].includes(this.model.modelName)) ||
                    (this.model.type === 'zhipuai' && !['embedding-2', 'embedding-3'].includes(this.model.modelName)) ||
                    (this.model.type === 'custom');
                
                dropdown.setValue(isCustomValue ? 'custom' : this.model.modelName);
                
                dropdown.onChange(value => {
                    if (value === 'custom') {
                        // Show the custom model input when custom is selected
                        customModelInput.settingEl.style.display = 'flex';
                    } else {
                        // Hide the custom model input and set the model name directly
                        customModelInput.settingEl.style.display = 'none';
                        this.model.modelName = value;
                    }
                });
                
                return dropdown;
            });
        
        // Custom model input (initially hidden if a standard model is selected)
        const customModelInput = new Setting(contentEl)
            .setName('Custom Model ID')
            .setDesc('Enter the custom model identifier')
            .addText(text => text
                .setPlaceholder('e.g., your-custom-model-name')
                .setValue(this.model.modelName !== 'custom' ? this.model.modelName : '')
                .onChange(value => {
                    if (modelNameSetting.components[0].getValue() === 'custom') {
                        this.model.modelName = value;
                    }
                }));
        
        // Initially hide/show based on whether custom is selected
        const dropdown = modelNameSetting.components[0] as any;
        const isCustomSelected = dropdown.getValue() === 'custom';
        customModelInput.settingEl.style.display = isCustomSelected ? 'flex' : 'none';

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Optional description for this model')
            .addText(text => text
                .setPlaceholder('e.g., Fast and efficient for most tasks')
                .setValue(this.model.description || '')
                .onChange(value => this.model.description = value));

        // API Configuration
        contentEl.createEl('h3', { text: 'API Configuration' });

        // API Key
        new Setting(contentEl)
            .setName('API Key')
            .setDesc('API key for this model (leave empty to use global key)')
            .addText(text => text
                .setPlaceholder('Enter API key')
                .setValue(this.model.apiKey || '')
                .onChange(value => this.model.apiKey = value));

        // Base URL (for custom API)
        if (this.model.type === 'custom') {
            new Setting(contentEl)
                .setName('Base URL')
                .setDesc('Base URL for custom API endpoint')
                .addText(text => text
                    .setPlaceholder('e.g., https://api.example.com')
                    .setValue(this.model.baseUrl || '')
                    .onChange(value => this.model.baseUrl = value));
        }

        // Vector dimensions
        if (this.model.type === 'zhipuai' || this.model.type === 'custom') {
            new Setting(contentEl)
                .setName('Vector Dimensions')
                .setDesc('Number of dimensions for embedding vectors')
                .addText(text => text
                    .setPlaceholder('e.g., 1024')
                    .setValue(this.model.dimensions?.toString() || '')
                    .onChange(value => {
                        const dimensions = parseInt(value);
                        this.model.dimensions = isNaN(dimensions) ? undefined : dimensions;
                    }));
        }

        // Proxy settings
        new Setting(contentEl)
            .setName('Use Proxy')
            .setDesc('Use proxy for API calls to this model')
            .addToggle(toggle => toggle
                .setValue(this.model.useProxy || false)
                .onChange(value => this.model.useProxy = value));

        // Active status
        new Setting(contentEl)
            .setName('Set as Active')
            .setDesc('Make this the active embedding model')
            .addToggle(toggle => toggle
                .setValue(this.model.active)
                .onChange(value => this.model.active = value));

        // Buttons
        const buttonContainer = contentEl.createDiv('modal-button-container');

        // Save button
        const saveButton = buttonContainer.createEl('button', {
            text: this.model.id ? 'Save Changes' : 'Create Model',
            cls: 'mod-cta'
        });

        saveButton.addEventListener('click', () => {
            if (this.validateModel()) {
                this.close();
                this.onSubmit(this.model);
            }
        });

        // Cancel button
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }

    private validateModel(): boolean {
        if (!this.model.name) {
            new Notice('Model name is required');
            return false;
        }

        if (!this.model.modelName) {
            new Notice('Model ID is required');
            return false;
        }

        if (this.model.type === 'custom' && !this.model.baseUrl) {
            new Notice('Base URL is required for custom API');
            return false;
        }

        return true;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 