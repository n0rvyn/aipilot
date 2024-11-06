import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    MarkdownView,
    Modal,
    MarkdownRenderer,
    Notice,
} from "obsidian";
import axios from "axios";
import { v4 as uuidv4 } from "uuid-browser"; // To generate unique IDs for each session

interface AIPilotSettings {
    apiKey: string;
    model: string;
    provider: 'zhipuai' | 'openai';
    promptOrganize: string;
    promptCheckGrammar: string;
    promptGenerateContent: string;
    promptCompareText: string; // New prompt for text comparison
}

const DEFAULT_SETTINGS: AIPilotSettings = {
    apiKey: '',
    model: 'gpt-4',
    provider: 'openai',
    promptOrganize: 'Organize this text: ',
    promptCheckGrammar: 'Check the grammar of this text: ',
    promptGenerateContent: 'Generate content for: ',
    promptCompareText: 'Compare the following texts and show differences: ', // Default text comparison prompt
};

export default class AIPilot extends Plugin {
    settings: AIPilotSettings;
    requestId: string | null = null;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new AITextSettingTab(this.app, this));

        // Ribbon icons for each feature
        this.addRibbonIcon("pencil", "Organize text", () => this.organizeText());
        this.addRibbonIcon("spell-check", "Check grammar", () => this.checkGrammar());
        this.addRibbonIcon("file-text", "Generate content", () => this.generateAIContent());
        this.addRibbonIcon("file-diff", "Compare text differences", () => this.compareTextDifferences());

        this.addCommands(); // Register commands
        this.initializeRequestId();
    }

    onunload() {
        // Resources will be automatically cleaned up using registerEvent(), addCommand(), etc.
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    initializeRequestId() {
        if (!this.requestId) {
            this.requestId = uuidv4();
        }
    }

    addCommands() {
        this.addCommand({
            id: "organize-text",
            name: "Organize text",
            editorCallback: (editor, view) => this.organizeText(editor),
        });

        this.addCommand({
            id: "check-grammar",
            name: "Check grammar",
            editorCallback: (editor, view) => this.checkGrammar(editor),
        });

        this.addCommand({
            id: "generate-content",
            name: "Generate content",
            editorCallback: (editor, view) => this.generateAIContent(editor),
        });

        this.addCommand({
            id: "compare-text-differences",
            name: "Compare text differences",
            checkCallback: (checking) => {
                if (checking) {
                    return this.app.workspace.getActiveFile() != null;
                }
                this.compareTextDifferences();
            },
        });
    }

    async callAI(content: string): Promise<string> {
        const { apiKey, model, provider } = this.settings;
        let url = '';
        let data: any = {};

        if (provider === 'openai') {
            url = 'https://api.openai.com/v1/completions';
            data = {
                model: model,
                prompt: content,
                max_tokens: 1000,
                request_id: this.requestId,
            };
        } else if (provider === 'zhipuai') {
            url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            data = {
                model: model,
                messages: [{ role: 'user', content }],
                stream: false,
                request_id: this.requestId,
            };
        }

        try {
            const response = await axios.post(url, data, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
            });

            return provider === 'openai'
                ? response.data.choices[0]?.text || 'No response'
                : response.data.choices[0]?.message?.content || 'No response';
        } catch (error) {
            console.error("Error calling AI:", error);
            return 'Error fetching AI response';
        }
    }

    async organizeText(editor?: any) {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        this.initializeRequestId();
        const selectedText = editor.getSelection();
        if (!selectedText) {
            new ConfirmModal(this.app, "No text selected. Apply organization to the entire document?", async () => {
                const content = editor.getValue();
                await this.processOrganize(content, editor);
            }).open();
        } else {
            await this.processOrganize(selectedText, editor);
        }
    }

    async processOrganize(content: string, editor: any) {
        const loadingModal = new LoadingModal(this.app);
        loadingModal.open();

        const organizedText = await this.callAI(`${this.settings.promptOrganize}${content}`);

        loadingModal.close();

        new AIContentModal(this.app, organizedText, (newContent) => {
            if (editor.getSelection()) {
                editor.replaceSelection(newContent);
            } else {
                editor.setValue(newContent);
            }
        }).open();
    }

    async checkGrammar(editor?: any) {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        this.initializeRequestId();
        const selectedText = editor.getSelection();
        if (!selectedText) {
            new ConfirmModal(this.app, "No text selected. Apply grammar check to the entire document?", async () => {
                const content = editor.getValue();
                await this.processGrammar(content, editor);
            }).open();
        } else {
            await this.processGrammar(selectedText, editor);
        }
    }

    async processGrammar(content: string, editor: any) {
        const loadingModal = new LoadingModal(this.app);
        loadingModal.open();

        const grammarCheckedText = await this.callAI(`${this.settings.promptCheckGrammar}${content}`);

        loadingModal.close();

        new AIContentModal(this.app, grammarCheckedText, (newContent) => {
            if (editor.getSelection()) {
                editor.replaceSelection(newContent);
            } else {
                editor.setValue(newContent);
            }
        }).open();
    }

    async generateAIContent(editor?: any) {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        this.initializeRequestId();
        const selectedText = editor.getSelection();
        if (!selectedText) {
            new ConfirmModal(this.app, "No text selected. Apply content generation to the entire document?", async () => {
                const content = editor.getValue();
                await this.processGenerate(content, editor);
            }).open();
        } else {
            await this.processGenerate(selectedText, editor);
        }
    }

    async processGenerate(content: string, editor: any) {
        const loadingModal = new LoadingModal(this.app);
        loadingModal.open();

        const generatedContent = await this.callAI(`${this.settings.promptGenerateContent}${content}`);

        loadingModal.close();

        new AIContentModal(this.app, generatedContent, (newContent) => {
            if (editor.getSelection()) {
                editor.replaceSelection(newContent);
            } else {
                editor.setValue(newContent);
            }
        }).open();
    }

    async compareTextDifferences() {
        this.initializeRequestId();
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("Please select a note to compare.");
            return;
        }

        new ConfirmModal(this.app, "Compare the entire document content?", async () => {
            const content1 = await this.app.vault.read(activeFile);
            const comparisonPrompt = `${this.settings.promptCompareText} \nText 1: ${content1}`;

            const loadingModal = new LoadingModal(this.app);
            loadingModal.open();

            const comparisonResult = await this.callAI(comparisonPrompt);

            loadingModal.close();

            new AIContentModal(this.app, comparisonResult, () => {}).open();
        }).open();
    }
}

// Loading Modal
class LoadingModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Generating AI content..." });
        contentEl.createEl("p", { text: "Please wait while the AI processes the request." });
    }

    onClose() {
        this.contentEl.empty();
    }
}

// AI Content Modal with Apply, Copy, and Discard buttons
class AIContentModal extends Modal {
    content: string;
    onApply: (content: string) => void;

    constructor(app: App, content: string, onApply: (content: string) => void) {
        super(app);
        this.content = content;
        this.onApply = onApply;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "AI generated content" });

        const markdownContainer = contentEl.createDiv({ cls: 'ai-markdown-container' });
        await MarkdownRenderer.renderMarkdown(this.content, markdownContainer, '', null);

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        const applyBtn = buttonContainer.createEl("button", { text: "Apply" });
        const copyBtn = buttonContainer.createEl("button", { text: "Copy" });
        const discardBtn = buttonContainer.createEl("button", { text: "Discard" });

        applyBtn.onclick = () => {
            this.onApply(this.content);
            this.close();
        };

        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(this.content);
                new Notice("Content copied to clipboard!");
            } catch (err) {
                console.error("Failed to copy content:", err);
                new Notice("Failed to copy content.");
            }
        };

        discardBtn.onclick = () => {
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

// Confirm Modal for selection check
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
        contentEl.createEl("h2", { text: "Confirmation" });
        contentEl.createEl("p", { text: this.message });

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        const continueBtn = buttonContainer.createEl("button", { text: "Continue" });
        const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });

        continueBtn.onclick = async () => {
            try {
                await this.onConfirm();
            } catch (error) {
                console.error("Error in onConfirm:", error);
                new Notice("An error occurred. Please try again.");
            } finally {
                this.close();
            }
        };
        cancelBtn.onclick = () => {
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

// Settings tab for API key, provider, model, and custom prompts
class AITextSettingTab extends PluginSettingTab {
    plugin: AIPilot;

    constructor(app: App, plugin: AIPilot) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('AI Pilot settings').setHeading();

        new Setting(containerEl)
            .setName("API key")
            .setDesc("Enter your API key for the AI service.")
            .addText((text) => text
                .setPlaceholder("API key")
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Provider")
            .setDesc("Select the AI provider.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("openai", "OpenAI")
                    .addOption("zhipuai", "ZhipuAI")
                    .setValue(this.plugin.settings.provider)
                    .onChange(async (value) => {
                        this.plugin.settings.provider = value as 'zhipuai' | 'openai';
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        new Setting(containerEl)
            .setName("AI model")
            .setDesc("Choose the AI model.")
            .addDropdown((dropdown) => {
                const models = this.plugin.settings.provider === 'openai'
                    ? {
                        "gpt-4": "GPT-4",
                        "gpt-4-turbo": "GPT-4 Turbo",
                        "gpt-3.5-turbo": "GPT-3.5 Turbo",
                        "text-davinci-003": "Text-DaVinci-003"
                    }
                    : { "GLM-3-Turbo": "GLM-3-Turbo", "GLM-4": "GLM-4", "GLM-4-Air": "GLM-4-Air" };

                dropdown.addOptions(models);
                dropdown.setValue(this.plugin.settings.model);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Organize text prompt")
            .addTextArea((text) => text
                .setPlaceholder(DEFAULT_SETTINGS.promptOrganize)
                .setValue(this.plugin.settings.promptOrganize)
                .onChange(async (value) => {
                    this.plugin.settings.promptOrganize = value;
                    await this.plugin.saveSettings();
                })
                .inputEl.style.height = '200px'
            );

        new Setting(containerEl)
            .setName("Check grammar prompt")
            .addTextArea((text) => text
                .setPlaceholder(DEFAULT_SETTINGS.promptCheckGrammar)
                .setValue(this.plugin.settings.promptCheckGrammar)
                .onChange(async (value) => {
                    this.plugin.settings.promptCheckGrammar = value;
                    await this.plugin.saveSettings();
                })
                .inputEl.style.height = '200px'
            );

        new Setting(containerEl)
            .setName("Generate content prompt")
            .addTextArea((text) => text
                .setPlaceholder(DEFAULT_SETTINGS.promptGenerateContent)
                .setValue(this.plugin.settings.promptGenerateContent)
                .onChange(async (value) => {
                    this.plugin.settings.promptGenerateContent = value;
                    await this.plugin.saveSettings();
                })
                .inputEl.style.height = '200px'
            );

        new Setting(containerEl)
            .setName("Compare text prompt")
            .setDesc("Prompt used for text comparison.")
            .addTextArea((text) => text
                .setPlaceholder(DEFAULT_SETTINGS.promptCompareText)
                .setValue(this.plugin.settings.promptCompareText)
                .onChange(async (value) => {
                    this.plugin.settings.promptCompareText = value;
                    await this.plugin.saveSettings();
                })
                .inputEl.style.height = '200px'
            );
    }
}
