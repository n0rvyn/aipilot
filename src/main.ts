// main.ts

import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    MarkdownView,
    Modal,
    MarkdownRenderer,
    Notice,
    EditorPosition,
    requestUrl
} from "obsidian";

import "./styles.css";

interface AIPilotSettings {
    apiKey: string;
    model: string;
    provider: 'zhipuai' | 'openai';
    promptOrganize: string;
    promptCheckGrammar: string;
    promptGenerateContent: string;
    promptDialogue: string;
}

const DEFAULT_SETTINGS: AIPilotSettings = {
    apiKey: '',
    model: 'gpt-4',
    provider: 'openai',
    promptOrganize: 'Organize this text: ',
    promptCheckGrammar: 'Check the grammar of this text: ',
    promptGenerateContent: 'Generate content for: ',
    promptDialogue: 'Please engage me in a Socratic dialogue based on the following text: ',
};

export default class AIPilot extends Plugin {
    settings: AIPilotSettings;
    requestId: string | null = null;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new AITextSettingTab(this.app, this));

        // Single Ribbon icon for AI Pilot features
        this.addRibbonIcon("brain", "AI Pilot", () => this.showFeatureModal());

        this.addCommands();
        this.initializeRequestId();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    initializeRequestId() {
        if (!this.requestId) {
            this.requestId = crypto.randomUUID();
        }
    }

    showFeatureModal() {
        new FeatureSelectionModal(this.app, this).open();
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
            id: "engage-in-dialogue",
            name: "Engage in Dialogue",
            editorCallback: (editor, view) => this.engageInDialogue(editor),
        });

        this.addCommand({
            id: "custom-prompt",
            name: "Custom Prompt",
            editorCallback: (editor, view) => this.handleCustomPrompt(editor),
        });
    }

    async callAI(content: string): Promise<string> {
        const { apiKey, model, provider } = this.settings;
        let url = '';
        let data: any = {};

        const chatModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];

        if (provider === 'openai') {
            if (chatModels.includes(model)) {
                url = 'https://api.openai.com/v1/chat/completions';
                data = {
                    model: model,
                    messages: [{ role: 'user', content }],
                    request_id: this.requestId,
                };
            } else {
                url = 'https://api.openai.com/v1/completions';
                data = {
                    model: model,
                    prompt: content,
                    max_tokens: 1000,
                    request_id: this.requestId,
                };
            }
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
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(data),
                contentType: 'application/json',
            });

            const responseData = response.json;

            if (provider === 'openai' && chatModels.includes(model)) {
                return responseData.choices[0]?.message?.content || 'No response';
            } else if (provider === 'openai') {
                return responseData.choices[0]?.text || 'No response';
            } else {
                return responseData.choices[0]?.message?.content || 'No response';
            }
        } catch (error) {
            console.error("Error calling AI:", error);
            return 'Error fetching AI response';
        }
    }

    async callAIChat(messages: { role: 'user' | 'assistant', content: string }[]): Promise<string> {
        const { apiKey, model, provider } = this.settings;
        let url = '';
        let data: any = {};

        if (provider === 'openai') {
            url = 'https://api.openai.com/v1/chat/completions';
            data = {
                model: model,
                messages: messages,
                request_id: this.requestId,
            };
        } else if (provider === 'zhipuai') {
            url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            data = {
                model: model,
                messages: messages,
                stream: false,
                request_id: this.requestId,
            };
        }

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(data),
                contentType: 'application/json',
            });

            const responseData = response.json;

            return responseData.choices[0]?.message?.content || 'No response';
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

        new AIContentModal(this.app, this, organizedText, editor, (updatedContent) => {
            // Handle apply changes
            if (editor.somethingSelected()) {
                editor.replaceSelection(updatedContent);
            } else {
                editor.setValue(updatedContent);
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

        new AIContentModal(this.app, this, grammarCheckedText, editor, (updatedContent) => {
            // Handle apply changes
            if (editor.somethingSelected()) {
                editor.replaceSelection(updatedContent);
            } else {
                editor.setValue(updatedContent);
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

        new AIContentModal(this.app, this, generatedContent, editor, (updatedContent) => {
            // Handle apply changes
            if (editor.somethingSelected()) {
                editor.replaceSelection(updatedContent);
            } else {
                editor.setValue(updatedContent);
            }
        }).open();
    }

    async engageInDialogue(editor?: any) {
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
            new ConfirmModal(this.app, "No text selected. Apply dialogue to the entire document?", async () => {
                const content = editor.getValue();
                await this.processDialogue(content, editor);
            }).open();
        } else {
            await this.processDialogue(selectedText, editor);
        }
    }

    async processDialogue(content: string, editor: any) {
        const loadingModal = new LoadingModal(this.app);
        loadingModal.open();

        const dialoguePrompt = `${this.settings.promptDialogue}${content}`;

        const aiResponse = await this.callAI(dialoguePrompt);

        loadingModal.close();

        const history = [
            { role: 'assistant', content: aiResponse }
        ];

        new ChatModal(this.app, this, history, editor).open();
    }

    async handleCustomPrompt(editor?: any) {
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
        let contentToProcess: string;

        new CustomPromptInputModal(this.app, async (inputPrompt: string) => {
            if (!inputPrompt) {
                new Notice("No prompt entered.");
                return;
            }
            if (selectedText) {
                contentToProcess = `${inputPrompt} ${selectedText}`;
            } else {
                contentToProcess = inputPrompt;
            }
            await this.processCustomPrompt(contentToProcess, editor);
        }).open();
    }

    async processCustomPrompt(content: string, editor: any) {
        const loadingModal = new LoadingModal(this.app);
        loadingModal.open();

        const customResponse = await this.callAI(content);

        loadingModal.close();

        new AIContentModal(this.app, this, customResponse, editor, (updatedContent) => {
            // Handle apply changes
            if (editor.somethingSelected()) {
                editor.replaceSelection(updatedContent);
            } else {
                editor.setValue(updatedContent);
            }
        }).open();
    }
}

class CustomPromptInputModal extends Modal {
    onSubmit: (inputPrompt: string) => void;

    constructor(app: App, onSubmit: (inputPrompt: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Enter Your Custom Prompt" });

        const promptInput = contentEl.createEl("textarea", {
            placeholder: "Type your custom prompt here...",
            cls: "custom-prompt-input",
        });

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        const submitBtn = buttonContainer.createEl("button", { text: "Submit" });
        const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });

        submitBtn.onclick = () => {
            const inputValue = promptInput.value.trim();
            if (inputValue) {
                this.onSubmit(inputValue);
                this.close();
            } else {
                new Notice("Please enter a prompt.");
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

class FeatureSelectionModal extends Modal {
    plugin: AIPilot;

    constructor(app: App, plugin: AIPilot) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Select AI Function" });

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        const organizeBtn = buttonContainer.createEl("button", { text: "Organize Text" });
        const grammarBtn = buttonContainer.createEl("button", { text: "Check Grammar" });
        const generateBtn = buttonContainer.createEl("button", { text: "Generate Content" });
        const dialogueBtn = buttonContainer.createEl("button", { text: "Engage in Dialogue" });
        const customPromptBtn = buttonContainer.createEl("button", { text: "Custom Prompt" });

        organizeBtn.onclick = () => {
            this.close();
            this.plugin.organizeText();
        };
        grammarBtn.onclick = () => {
            this.close();
            this.plugin.checkGrammar();
        };
        generateBtn.onclick = () => {
            this.close();
            this.plugin.generateAIContent();
        };
        dialogueBtn.onclick = () => {
            this.close();
            this.plugin.engageInDialogue();
        };
        customPromptBtn.onclick = () => {
            this.close();
            this.plugin.handleCustomPrompt();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

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

class AIContentModal extends Modal {
    content: string;
    onApply: (content: string) => void;
    plugin: AIPilot;
    editor: any;
    undoStack: { from: EditorPosition, to: EditorPosition, text: string }[] = [];

    constructor(app: App, plugin: AIPilot, content: string, editor: any, onApply: (content: string) => void) {
        super(app);
        this.plugin = plugin;
        this.content = content;
        this.onApply = onApply;
        this.editor = editor;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "AI Generated Content" });

        const messageContainer = contentEl.createDiv({ cls: 'message-container' });

        const msgDiv = messageContainer.createDiv({ cls: 'ai-message' });
        await MarkdownRenderer.renderMarkdown(this.content, msgDiv, '', null);

        const buttonContainer = msgDiv.createDiv({ cls: 'button-container' });

        const copyBtn = buttonContainer.createEl("button", { text: "Copy" });
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(this.content);
                new Notice("Content copied to clipboard!");
            } catch (err) {
                console.error("Failed to copy content:", err);
                new Notice("Failed to copy content.");
            }
        };

        const insertBtn = buttonContainer.createEl("button", { text: "Insert" });
        insertBtn.onclick = () => {
            if (this.editor) {
                const startPos = this.editor.getCursor();
                const insertedContent = this.content;
                this.editor.replaceRange(insertedContent, startPos);
                const endOffset = this.editor.posToOffset(startPos) + insertedContent.length;
                const endPos = this.editor.offsetToPos(endOffset);
                this.undoStack.push({ from: startPos, to: endPos, text: '' });
                new Notice("Content inserted at cursor position!");
            } else {
                new Notice("No active editor found.");
            }
        };

        const undoBtn = buttonContainer.createEl("button", { text: "Undo" });
        undoBtn.onclick = () => {
            if (this.undoStack.length > 0 && this.editor) {
                const lastAction = this.undoStack.pop();
                if (lastAction) {
                    this.editor.replaceRange(lastAction.text, lastAction.from, lastAction.to);
                    new Notice("Undo applied to last insertion!");
                }
            } else {
                new Notice("Nothing to undo.");
            }
        };

        const chatBtn = buttonContainer.createEl("button", { text: "Chat" });
        chatBtn.onclick = () => {
            this.close();
            new ChatModal(this.app, this.plugin, [{ role: 'assistant', content: this.content }], this.editor).open();
        };

        const applyBtn = contentEl.createEl("button", { text: "Apply Changes", cls: 'apply-button' });
        applyBtn.onclick = () => {
            this.onApply(this.content);
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ChatModal extends Modal {
    plugin: AIPilot;
    history: { role: 'user' | 'assistant', content: string }[];
    editor: any;
    undoStack: { from: EditorPosition, to: EditorPosition, text: string }[] = [];

    constructor(app: App, plugin: AIPilot, history: { role: 'user' | 'assistant', content: string }[], editor: any) {
        super(app);
        this.plugin = plugin;
        this.history = history;
        this.editor = editor;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Chat with AI" });

        const chatContainer = contentEl.createDiv({ cls: 'chat-container' });

        await this.renderChatHistory(chatContainer);

        const inputContainer = contentEl.createDiv({ cls: 'input-container' });

        const inputEl = inputContainer.createEl("textarea", { cls: 'chat-input', placeholder: 'Type your message...' });

        const sendBtn = inputContainer.createEl("button", { text: "Send" });
        sendBtn.onclick = async () => {
            const userMessage = inputEl.value.trim();
            if (userMessage) {
                inputEl.value = '';
                this.history.push({ role: 'user', content: userMessage });
                await this.renderChatHistory(chatContainer);

                const loadingMsg = chatContainer.createDiv({ cls: 'ai-message' });
                loadingMsg.setText('AI is typing...');

                chatContainer.scrollTop = chatContainer.scrollHeight;

                const aiResponse = await this.plugin.callAIChat(this.history);

                chatContainer.removeChild(loadingMsg);

                this.history.push({ role: 'assistant', content: aiResponse });
                await this.renderChatHistory(chatContainer);

                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        };
    }

    async renderChatHistory(container: HTMLElement) {
        container.empty();
        for (const msg of this.history) {
            const msgDiv = container.createDiv({ cls: msg.role === 'user' ? 'user-message' : 'ai-message' });
            await MarkdownRenderer.renderMarkdown(msg.content, msgDiv, '', null);

            const buttonContainer = msgDiv.createDiv({ cls: 'button-container' });

            const copyBtn = buttonContainer.createEl("button", { text: "Copy" });
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(msg.content);
                    new Notice("Message copied to clipboard!");
                } catch (err) {
                    console.error("Failed to copy content:", err);
                    new Notice("Failed to copy content.");
                }
            };

            const insertBtn = buttonContainer.createEl("button", { text: "Insert" });
            insertBtn.onclick = () => {
                if (this.editor) {
                    const startPos = this.editor.getCursor();
                    const insertedContent = msg.content;
                    this.editor.replaceRange(insertedContent, startPos);
                    const endOffset = this.editor.posToOffset(startPos) + insertedContent.length;
                    const endPos = this.editor.offsetToPos(endOffset);
                    this.undoStack.push({ from: startPos, to: endPos, text: '' });
                    new Notice("Message inserted at cursor position!");
                } else {
                    new Notice("No active editor found.");
                }
            };

            const undoBtn = buttonContainer.createEl("button", { text: "Undo" });
            undoBtn.onclick = () => {
                if (this.undoStack.length > 0 && this.editor) {
                    const lastAction = this.undoStack.pop();
                    if (lastAction) {
                        this.editor.replaceRange(lastAction.text, lastAction.from, lastAction.to);
                        new Notice("Undo applied to last insertion!");
                    }
                } else {
                    new Notice("Nothing to undo.");
                }
            };
        }
    }
}

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

        const textAreaHeight = '100px';

        new Setting(containerEl)
            .setName("Organize text prompt")
            .addTextArea((text) => text
                .setPlaceholder(DEFAULT_SETTINGS.promptOrganize)
                .setValue(this.plugin.settings.promptOrganize)
                .onChange(async (value) => {
                    this.plugin.settings.promptOrganize = value;
                    await this.plugin.saveSettings();
                })
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
            );

        new Setting(containerEl)
            .setName("Dialogue prompt")
            .setDesc("Prompt used for engaging in dialogue.")
            .addTextArea((text) => text
                .setPlaceholder(DEFAULT_SETTINGS.promptDialogue)
                .setValue(this.plugin.settings.promptDialogue)
                .onChange(async (value) => {
                    this.plugin.settings.promptDialogue = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Custom Prompt")
            .setDesc("Use the 'Custom Prompt' feature to define your own AI interactions on the fly.")
            .addText(text => text
                .setValue("This feature allows you to define and execute your own custom prompts.")
                .setDisabled(true)
            );
    }
}
