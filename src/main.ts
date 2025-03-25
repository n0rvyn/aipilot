// main.ts

// Add this at the top of the file, after the imports
// TypeScript declaration for diff_match_patch
declare global {
    interface Window {
        diff_match_patch?: DiffMatchPatch;
    }
}

// Add a proper type definition for DiffMatchPatch
interface DiffMatchPatch {
    diff_main(text1: string, text2: string): Array<[number, string]>;
    diff_cleanupSemantic(diffs: Array<[number, string]>): void;
    new(): DiffMatchPatch;
}

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
    requestUrl,
    Component,
    TFile,
    TFolder,
    WorkspaceLeaf,
    ViewCreator,
    setIcon,
    Editor,
    TextAreaComponent,
    addIcon,
    ItemView,
    View
} from "obsidian";

// Import styles for type-checking but actual CSS will be loaded via manifest.json
import './styles.css';
import { ChatView, VIEW_TYPE_CHAT } from './ChatView';
import { MarkdownRenderer as NewMarkdownRenderer } from './MarkdownRenderer';
import { ModelManager, ModelConfig as LLMModelConfig, ProxyConfig, EmbeddingConfig } from './models/ModelManager';
import { DebatePanel, DEBATE_VIEW_TYPE } from './debate/DebatePanel';
import { AgentDebateEngine, DebateConfig } from './debate/AgentDebateEngine';
import { ModelConfigModal } from './models/ModelConfigModal';
import { addAllIcons } from './icons';

const EMBEDDING_MODELS = {
    'embedding-2': { maxTokens: 512, dimensions: null as number | null },
    'embedding-3': { maxTokens: 3072, dimensions: 1024 }
} as const;

type EmbeddingModelKey = keyof typeof EMBEDDING_MODELS;

// Custom function type for user-defined functions
interface CustomFunction {
    name: string;
    icon: string;
    prompt: string;
    tooltip?: string;
    isBuiltIn?: boolean;
}

interface AIPilotPluginSettings {
    apiKey: string;
    model: string;
    provider: 'zhipuai' | 'openai' | 'groq';
    embeddingModel: EmbeddingModelKey; // Legacy field - kept for backward compatibility
    embeddingDimensions: number; // Legacy field - kept for backward compatibility
    knowledgeBasePath: string;
    promptOrganize: string; // Kept for backward compatibility
    promptCheckGrammar: string; // Kept for backward compatibility
    promptGenerateContent: string; // Kept for backward compatibility
    promptDialogue: string; // Kept for backward compatibility
    chatModel: keyof typeof ZHIPUAI_MODELS.CHAT;
    promptSummary: string; // Kept for backward compatibility
    customFunctions: CustomFunction[];
    functions: CustomFunction[]; // New unified functions array
    chatHistoryPath: string; // Path to store chat history files
    editorModeEnabled: boolean; // Whether functions apply to editor or chat
    models: LLMModelConfig[];
    embeddingConfig: EmbeddingConfig; // New field for separate embedding configuration
    proxyConfig: ProxyConfig;
    debateConfigs: DebateConfig[];
}

export const DEFAULT_SETTINGS: Partial<AIPilotPluginSettings> = {
    apiKey: '',
    model: 'gpt-4',
    provider: 'openai',
    embeddingModel: 'embedding-3', // Legacy field
    embeddingDimensions: 1024, // Legacy field
    knowledgeBasePath: 'AI_KnowledgeBase',
    promptOrganize: 'Please organize the content of the following article logically, following an introduction-body-conclusion structure. Use Markdown format, ensuring a smooth flow between sections. Output in the same language as the input text:\n1. Use `#` and `##` for main and secondary headings, marking primary sections and sub-sections, respectively.\n2. If appropriate, divide content into list form or use block quotes (`>`) to present specific points.\n3. Avoid repetitive content, highlight key information, and ensure the article structure is clearer and easier to read.\n4. Summarize the core points of the article in the conclusion.\n5. Do not include any lines that start with "=".\nHere is the content that needs to be organized:',
    promptCheckGrammar: 'Please check the grammar, typos, and punctuation in the following text. Never delete any content, and provide the corrected text in the same language. For any errors in the original text, please list them at the end of the corrected version:',
    promptGenerateContent: 'Generate content based on the following prompt, maintaining the same language as the prompt: ',
    promptDialogue: 'Engage in a Socratic dialogue based on the following text, using the same language as the input: ',
    chatModel: 'glm-4-air',
    promptSummary: `Analyze and summarize the following documents in the same language as the source documents:

1. Concise Summary: Synthesize the main content and key information
2. Document Insights: List key insights and important information from each document
3. Document Connections: Analyze logical relationships and connections between documents
4. References: Use numbers [n] to cite sources, using Obsidian link syntax [[filename]]

Guidelines:
- Maintain professionalism and logical flow
- Highlight important information and key concepts
- Ensure accurate citations and correct link format
- Use clear hierarchical structure for content presentation
- Use proper Markdown formatting for better readability`,
    customFunctions: [],
    models: [], // Add default empty array for models
    debateConfigs: [], // Add default empty array for debate configs
    functions: [
        {
            name: "Organize",
            icon: "file-text",
            prompt: 'Please organize the content of the following article logically, following an introduction-body-conclusion structure. Use Markdown format, ensuring a smooth flow between sections. Output in the same language as the input text:\n1. Use `#` and `##` for main and secondary headings, marking primary sections and sub-sections, respectively.\n2. If appropriate, divide content into list form or use block quotes (`>`) to present specific points.\n3. Avoid repetitive content, highlight key information, and ensure the article structure is clearer and easier to read.\n4. Summarize the core points of the article in the conclusion.\n5. Do not include any lines that start with "=".\nHere is the content that needs to be organized:',
            tooltip: "Organize text structure",
            isBuiltIn: true
        },
        {
            name: "Grammar",
            icon: "check-square",
            prompt: 'Please check the grammar, typos, and punctuation in the following text. Never delete any content, and provide the corrected text in the same language. For any errors in the original text, please list them at the end of the corrected version:',
            tooltip: "Check grammar and spelling",
            isBuiltIn: true
        },
        {
            name: "Generate",
            icon: "sparkles",
            prompt: 'Generate content based on the following prompt, maintaining the same language as the prompt: ',
            tooltip: "Generate content",
            isBuiltIn: true
        },
        {
            name: "Dialogue",
            icon: "message-circle",
            prompt: 'Engage in a Socratic dialogue based on the following text, using the same language as the input: ',
            tooltip: "Start a dialogue",
            isBuiltIn: true
        },
        {
            name: "Summarize",
            icon: "bookmark",
            prompt: `Analyze and summarize the following documents in the same language as the source documents:

1. Concise Summary: Synthesize the main content and key information
2. Document Insights: List key insights and important information from each document
3. Document Connections: Analyze logical relationships and connections between documents
4. References: Use numbers [n] to cite sources, using Obsidian link syntax [[filename]]

Guidelines:
- Maintain professionalism and logical flow
- Highlight important information and key concepts
- Ensure accurate citations and correct link format
- Use clear hierarchical structure for content presentation
- Use proper Markdown formatting for better readability`,
            tooltip: "Summarize content",
            isBuiltIn: true
        },
        {
            name: "Polish",
            icon: "bird",
            prompt: `Please polish and refine the following text to improve clarity, flow, and style while preserving the original meaning and language. Enhance the expression, eliminate redundancies, and make it more engaging. Return the polished version only, without explanations:`,
            tooltip: "Polish and refine text",
            isBuiltIn: true
        }
    ],
    chatHistoryPath: 'AI_ChatHistory',
    editorModeEnabled: true,
    embeddingConfig: {
        modelName: "text-embedding-3-small", // Default OpenAI embedding model
        provider: "openai",
        dimensions: 1536
    },
    proxyConfig: {
        enabled: false,
        address: "",
        port: "",
        type: "http",
        requiresAuth: false
    },
};

const MODEL_TOKEN_LIMITS: { [key: string]: number } = {
    'gpt-3.5-turbo': 4096,
    'gpt-4': 8192,
    'gpt-4-turbo': 8192,
    'text-davinci-003': 4096,
    'GLM-3-Turbo': 8192,
    'GLM-4': 32768,
    'GLM-4-Air': 8192,
    'GLM-4-Long': 32768,
};

function encryptString(text: string, salt: string): string {
    try {
        const textToChars = (text: string): number[] => text.split('').map(c => c.charCodeAt(0));
        const byteHex = (n: number): string => ("0" + Number(n).toString(16)).substr(-2);
        const applySaltToChar = (code: number): number => textToChars(salt).reduce((a, b) => a ^ b, code);

        return text
            .split('')
            .map(c => c.charCodeAt(0))
            .map(applySaltToChar)
            .map(byteHex)
            .join('');
    } catch (e) {
        console.error('Encryption error:', e);
        return '';
    }
}

function decryptString(encoded: string, salt: string): string {
    try {
        const textToChars = (text: string) => text.split('').map(c => c.charCodeAt(0));
        const applySaltToChar = (code: number) => textToChars(salt).reduce((a, b) => a ^ b, code);
        
        return encoded
            .match(/.{1,2}/g)
            ?.map(hex => parseInt(hex, 16))
            .map(applySaltToChar)
            .map(charCode => String.fromCharCode(charCode))
            .join('') || encoded;
    } catch (e) {
        console.error('Decryption failed:', e);
        return encoded;
    }
}

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface ModelConfig {
    maxTokens: number;
    description: string;
    isAIR?: boolean;
}

const ZHIPUAI_MODELS = {
    CHAT: {
        'GLM-3-Turbo': { maxTokens: 32000, description: "Fast, efficient for general tasks" },
        'GLM-4': { maxTokens: 128000, description: "Advanced reasoning and analysis" },
        'GLM-4-Air': { maxTokens: 128000, description: "Advanced reasoning and analysis", isAIR: true },
        'GLM-4-Long': { maxTokens: 128000, description: "Long context support" }
    } as Record<string, ModelConfig>,
    EMBEDDING: {
        'embedding-2': { maxTokens: 512, dimensions: null as number | null },
        'embedding-3': { maxTokens: 3072, dimensions: 1024 }
    }
} as const;

// Add a new interface for search results with content
interface SearchResultWithContent {
    file: TFile;
    similarity: number;
    content: string;
}

export default class AIPilotPlugin extends Plugin {
    app: App;
    settings: AIPilotPluginSettings;
    requestId: string | null = null;
    private salt: string = 'AIPilot-v1';
    private lastApiCall: number = 0;
    private readonly MIN_API_INTERVAL = 100; // 100ms between calls
    private embeddingCache: Map<string, {
        vector: number[],
        timestamp: number
    }> = new Map();
    private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour
    public currentInput: HTMLTextAreaElement | null = null;
    modelManager: ModelManager;
    public diffMatchPatchLib: any = null;

    constructor(app: App, manifest: any) {
        super(app, manifest);
        this.app = app;
    }

    async onload() {
        // Load settings first
        await this.loadSettings();
        
        // Migrate legacy API key to models system if needed
        this.migrateLegacyAPIKey();
        
        // Migrate legacy embedding configuration
        this.migrateEmbeddingConfig();
        
        // Now initialize ModelManager with settings that are loaded
        this.modelManager = new ModelManager(
            this,
            this.settings.models || [], // Ensure we have a default empty array if models is undefined
            this.settings.embeddingConfig || {
                modelName: "text-embedding-3-small",
                provider: "openai",
                dimensions: 1536
            },
            this.settings.proxyConfig,
            async () => {
                await this.saveSettings();
            }
        );

        // Load the diff-match-patch library if needed
        await this.loadDiffMatchPatchLibrary();
        
        // Load icons
        addAllIcons();
        
        // Register the debate view
        this.registerView(
            DEBATE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new DebatePanel(leaf, this.modelManager)
        );
        
        // Register a command to open the debate panel
        this.addCommand({
            id: 'open-debate-panel',
            name: 'Open Agent Debate Panel',
            callback: () => this.activateDebateView()
        });
        
        // Styles are now loaded via manifest.json
        
        this.addSettingTab(new AIPilotSettingTab(this.app, this));

        // Register Chat View
        this.registerView(
            VIEW_TYPE_CHAT,
            (leaf: WorkspaceLeaf) => new ChatView(leaf, this, this.modelManager)
        );

        // Add command to open chat view
        this.addCommand({
            id: 'open-chat-view',
            name: 'Open AI Chat',
            callback: () => {
                this.activateView();
            },
        });

        // Add ribbon icon for chat
        this.addRibbonIcon("message-square", "Open AI Chat", () => {
            this.activateView();
        });

        // Add ribbon icon for Polish function
        this.addRibbonIcon("bird", "Polish Text", (evt: MouseEvent) => {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                this.polishText(mdView.editor);
            } else {
                new Notice("No active editor found.");
            }
        });

        // Add ribbon icon for cleaning Polish markup
        this.addRibbonIcon("eraser", "Clean Polish Markup", (evt: MouseEvent) => {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                this.cleanPolishMarkup(mdView.editor);
            } else {
                new Notice("No active editor found.");
            }
        });

        this.addCommands();
        this.initializeRequestId();

        // Add a separate ribbon icon for knowledge base search
        this.addRibbonIcon("search", "Search Knowledge Base", () => {
            this.searchKnowledgeBase();
        });

        // Add a ribbon icon for the debate panel
        const debateRibbonIcon = this.addRibbonIcon(
            'brain-cog', // Replace with your actual icon
            'AI Agent Debate',
            () => this.activateDebateView()
        );
    }

    onunload() {
        // Clean up resources when plugin is unloaded
    }

    async saveSettings() {
        // Create a copy of settings and encrypt the API key
        const dataToSave = { ...this.settings };
        
        // Encrypt the main API key if it exists
        if (dataToSave.apiKey) {
            dataToSave.apiKey = encryptString(dataToSave.apiKey, this.salt);
        }
        
        // Encrypt API keys in models
        if (dataToSave.models && dataToSave.models.length > 0) {
            dataToSave.models = dataToSave.models.map(model => {
                const modelCopy = { ...model };
                if (modelCopy.apiKey) {
                    modelCopy.apiKey = encryptString(modelCopy.apiKey, this.salt);
                }
                return modelCopy;
            });
        }
        
        await this.saveData(dataToSave);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        
        // Ensure essential arrays and objects are initialized
        if (!this.settings.models) this.settings.models = [];
        if (!this.settings.functions) this.settings.functions = [];
        if (!this.settings.customFunctions) this.settings.customFunctions = [];
        if (!this.settings.debateConfigs) this.settings.debateConfigs = [];
        if (!this.settings.proxyConfig) {
            this.settings.proxyConfig = {
                enabled: false,
                address: "",
                port: "",
                type: "http",
                requiresAuth: false
            };
        }
        
        // Decrypt API key if it exists and validate it
        if (this.settings.apiKey) {
            try {
                const decrypted = decryptString(this.settings.apiKey, this.salt);
                
                // Basic validation - check if it looks like a valid API key
                // OpenAI keys start with "sk-" and should only contain alphanumeric chars
                const isValidFormat = 
                    (decrypted.startsWith('sk-') && /^[a-zA-Z0-9_-]+$/.test(decrypted)) || 
                    // For other providers, just make sure it's alphanumeric
                    /^[a-zA-Z0-9_-]+$/.test(decrypted);
                
                this.settings.apiKey = isValidFormat ? decrypted : '';
                
                if (!isValidFormat) {
                    console.log("Invalid API key format detected, resetting key");
                    // Could show a notice here if wanted
                }
            } catch (e) {
                console.error("Error decrypting API key, resetting it", e);
                this.settings.apiKey = '';
            }
        }
        
        // Decrypt API keys in models
        if (this.settings.models && this.settings.models.length > 0) {
            this.settings.models = this.settings.models.map(model => {
                const modelCopy = { ...model };
                if (modelCopy.apiKey) {
                    try {
                        const decrypted = decryptString(modelCopy.apiKey, this.salt);
                        // Simple validation - non-empty and mostly alphanumeric
                        if (decrypted && /^[a-zA-Z0-9_\-\.]+$/.test(decrypted)) {
                            modelCopy.apiKey = decrypted;
                        } else {
                            modelCopy.apiKey = ''; // Reset invalid key
                            console.log(`Invalid API key format detected for model ${model.name}, resetting key`);
                        }
                    } catch (e) {
                        console.error(`Error decrypting API key for model ${model.name}, resetting it`, e);
                        modelCopy.apiKey = '';
                    }
                }
                return modelCopy;
            });
        }
        
        // Ensure at least one model has isDefault set
        const hasDefaultModel = this.settings.models.some(m => m.isDefault);
        if (!hasDefaultModel && this.settings.models.length > 0) {
            // Set the first active model as default
            const firstActive = this.settings.models.find(m => m.active);
            if (firstActive) {
                firstActive.isDefault = true;
            } else if (this.settings.models.length > 0) {
                // If no active models, set the first one as default and active
                this.settings.models[0].isDefault = true;
                this.settings.models[0].active = true;
            }
        }
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
            editorCallback: async (editor: Editor) => {
                const content = editor.getValue();
                const result = await this.generateAIContent(content);
                if (result) {
                    editor.setValue(result);
                }
            },
        });

        this.addCommand({
            id: "engage-in-dialogue",
            name: "Engage in Dialogue",
            editorCallback: (editor, view) => this.engageInDialogue(editor),
        });

        this.addCommand({
            id: "polish-text",
            name: "Polish Text",
            editorCallback: (editor, view) => this.polishText(editor),
        });

        this.addCommand({
            id: "clean-polish-markup",
            name: "Clean Polish Markup",
            editorCallback: (editor, view) => this.cleanPolishMarkup(editor),
        });

        this.addCommand({
            id: "custom-prompt",
            name: "Custom Prompt",
            editorCallback: (editor, view) => this.handleCustomPrompt(editor),
        });

        this.addCommand({
            id: "search-knowledge-base",
            name: "Search Knowledge Base",
            callback: async () => {
                const modal = new SearchPromptModal(this.app);
                const query = await modal.openAndGetValue();
                if (!query) return;

                const loadingModal = new LoadingModal(this.app, true, "Searching...");
                loadingModal.open();

                try {
                    const files = await this.getKnowledgeBaseNotes();
                    const results = [];
                    let processed = 0;

                    for (const file of files) {
                        const content = await this.app.vault.read(file);
                        const similarity = this.calculateSimilarity(query, content);
                        results.push({ file, similarity });
                        
                        processed++;
                        loadingModal.setProgress(processed / files.length, processed, files.length);
                    }

                    const topResults = results
                        .sort((a, b) => b.similarity - a.similarity)
                        .slice(0, 5);

                    loadingModal.close();
                    
                    if (topResults.length === 0) {
                        new Notice("No relevant documents found for your query.", 3000);
                        return;
                    }
                    
                    new SearchResultsModal(this.app, topResults, query).open();
                } catch (error) {
                    new Notice("Error searching knowledge base: " + error.message);
                    loadingModal.close();
                }
            }
        });

        this.addCommand({
            id: 'knowledge-base-qa',
            name: 'Knowledge Base Q&A',
            callback: () => {
                this.activateKnowledgeBaseQA();
            }
        });
    }

    // Approximate token estimation function
    estimateTokenCount(text: string): number {
        // Rough estimation: ~4 chars per token for English text
        return Math.ceil(text.length / 4);
    }

    async callAI(content: string, promptPrefix: string = ''): Promise<string> {
        // Get the default model from the model manager
        const defaultModel = this.modelManager.getDefaultModel();
        if (!defaultModel) {
            new Notice("No active model found. Please configure a model in settings.");
            return "Error: No active model configured";
        }
        
        // Estimate max tokens based on model name or use a safe default
        const maxTokens = 4096; // Safe default
        
        let maxTokensForContent = maxTokens - this.estimateTokenCount(promptPrefix);
        const MIN_TOKENS_FOR_CONTENT = 500; // Adjust based on model capability
        
        if (maxTokensForContent < MIN_TOKENS_FOR_CONTENT) {
            maxTokensForContent = MIN_TOKENS_FOR_CONTENT;
        }
        
        const tokenCount = this.estimateTokenCount(content);
        
        if (tokenCount > maxTokensForContent) {
            // Split the content into chunks
            const chunks = this.chunkContent(content, maxTokensForContent);
            const results = [];
            
            new Notice(`The text is too long and will be processed in ${chunks.length} parts.`);
            
            for (const chunk of chunks) {
                try {
                    const prompt = `${promptPrefix}${chunk}\n\nNote: This is part of a larger text. Ensure continuity with the previous sections.`;
                    const result = await this.modelManager.callModel(
                        defaultModel.id, 
                        prompt, 
                        { maxTokens: maxTokens }
                    );
                    results.push(result.trim());
                } catch (error) {
                    console.error("Error processing chunk:", error);
                    new Notice(`Error processing chunk: ${error.message || "Unknown error"}`);
                }
            }
            
            return results.join('\n\n');
        } else {
            const prompt = `${promptPrefix}${content}`;
            try {
                return await this.modelManager.callModel(
                    defaultModel.id, 
                    prompt, 
                    { maxTokens: maxTokens }
                );
            } catch (error) {
                console.error("Error calling AI:", error);
                new Notice(`Error calling AI: ${error.message || "Unknown error"}`);
                return 'Error fetching AI response';
            }
        }
    }

    chunkContent(content: string, maxTokens: number): string[] {
        const paragraphs = content.split(/\n\s*\n/); // Split by paragraphs
        const chunks = [];
        let currentChunk = '';
        let currentTokens = 0;

        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];
            const paragraphTokens = this.estimateTokenCount(paragraph);

            if (currentTokens + paragraphTokens > maxTokens) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                    currentTokens = 0;
                }
            }

            currentChunk += paragraph + '\n\n';
            currentTokens += paragraphTokens;
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    async callAIChat(messages: { role: 'user' | 'assistant', content: string }[], 
                   onUpdate?: (chunk: string) => void): Promise<string> {
        // Get the default model from the model manager
        const defaultModel = this.modelManager.getDefaultModel();
        if (!defaultModel) {
            new Notice("No active model found. Please configure a model in settings.");
            return "Error: No active model configured";
        }
        
        // Estimate total tokens in the conversation
        let totalTokens = 0;
        for (const msg of messages) {
            totalTokens += this.estimateTokenCount(msg.content);
        }
        
        // Combine messages into a single prompt
        // This is a simplified approach - ideally we would structure this based on model type
        const lastMessage = messages[messages.length - 1];
        let systemPrompt = defaultModel.systemPrompt || "You are a helpful assistant.";
        
        try {
            // Use the ModelManager for AI calls
            return await this.modelManager.callModel(
                defaultModel.id,
                lastMessage.content,
                { 
                    maxTokens: 4096, // Safe default 
                    conversation: messages,
                    streaming: !!onUpdate,
                    onChunk: onUpdate
                }
            );
        } catch (error) {
            console.error("Error calling AI chat:", error);
            new Notice(`Error calling AI chat: ${error.message || "Unknown error"}`);
            return 'Error fetching AI response';
        }
    }

    async callAIChunk(content: string, promptPrefix: string): Promise<string> {
        // This method is kept for backward compatibility
        // but now uses the ModelManager for actual API calls
        
        // Get the default model from the model manager
        const defaultModel = this.modelManager.getDefaultModel();
        if (!defaultModel) {
            new Notice("No active model found. Please configure a model in settings.");
            return "Error: No active model configured";
        }
        
        const prompt = `${promptPrefix}${content}\n\nNote: This is part of a larger text. Ensure continuity with the previous sections.`;
        
        try {
            return await this.modelManager.callModel(
                defaultModel.id,
                prompt,
                { maxTokens: 4096 } // Safe default
            );
        } catch (error) {
            console.error("Error calling AI:", error);
            new Notice(`Error calling AI: ${error.message || "Unknown error"}`);
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
        const loadingModal = new LoadingModal(this.app, true, "Organizing...");
        loadingModal.open();

        // const prompt = `${this.settings.promptOrganize}${content}`;
        const prompt = `${this.settings.promptOrganize}${content}\n\nNote: This is part of a larger text. Ensure continuity with the previous sections.`;
        // TODO replace this.settings.promptOrganize with the prompt???
        // const organizedText = await this.callAI(content, this.settings.promptOrganize);
        const organizedText = await this.callAI(content, prompt)

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
        const loadingModal = new LoadingModal(this.app, true, "Checking grammar...");
        loadingModal.open();

        const grammarCheckedText = await this.callAI(content, this.settings.promptCheckGrammar);

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

    async generateAIContent(prompt?: string): Promise<string> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            throw new Error('No active markdown file');
        }

        const editor = activeView.editor;
        let selectedText = editor.getSelection();  // This line causes the error
        
        // Fix: Check if there's no selection and handle custom prompt
        if (!selectedText && !prompt) {
            throw new Error('No text selected and no prompt provided');
        }

        const textToProcess = prompt || selectedText;
        
        try {
            const response = await this.getAIResponse(textToProcess);
            return response;
        } catch (error) {
            console.error('Error generating AI content:', error);
            throw error;
        }
    }

    public async getAIResponse(message: string, history?: Array<{role: "user" | "assistant", content: string}>): Promise<string> {
        if (history) {
            // Use history for chat context if provided
            return this.callAIChat([...history, { role: "user", content: message }]);
        }
        // Otherwise use single message mode
        return this.callAI(message);
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
        const loadingModal = new LoadingModal(this.app, true, "Creating dialogue...");
        loadingModal.open();

        const dialoguePrompt = `${this.settings.promptDialogue}${content}`;
        const aiResponse = await this.callAI(dialoguePrompt);

        loadingModal.close();

        const history: Message[] = [
            { role: "user", content: content },
            { role: "assistant", content: aiResponse }
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
                new Notice("No prompt entered.", 2000);
                return;
            }
            if (selectedText) {
                contentToProcess = `${inputPrompt} ${selectedText}`;
            } else {
                // contentToProcess = inputPrompt;
                // TODO add the prompt to the content and read whole page
                new ConfirmModal(this.app, "No text selected. Apply organization to the entire document?", async () => {
                    contentToProcess = editor.getValue();
                }).open();
            }
            await this.processCustomPrompt(contentToProcess, editor);
        }).open();
    }

    async processCustomPrompt(content: string, editor: any) {
        const loadingModal = new LoadingModal(this.app, true, "Processing...");
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

    // 获取知识库文件
    async getKnowledgeBaseNotes(selectedDir?: string): Promise<TFile[]> {
        const path = this.settings.knowledgeBasePath;
        let files: TFile[] = [];
        
        // If no knowledge base path is set, get all files recursively
        if (!path) {
            const getAllFiles = (folder: TFolder) => {
                for (const child of folder.children) {
                    if (child instanceof TFile && child.extension === 'md') {
                        files.push(child);
                    } else if (child instanceof TFolder) {
                        getAllFiles(child);
                    }
                }
            };
            
            // Start from root folder
            const rootFolder = this.app.vault.getRoot();
            getAllFiles(rootFolder);
        } else {
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder || !(folder instanceof TFolder)) {
            console.log('Knowledge base folder not found:', path);
            return [];
        }

        const searchFolder = (folder: TFolder) => {
            for (const child of folder.children) {
                if (child instanceof TFile && child.extension === 'md') {
                    files.push(child);
                } else if (child instanceof TFolder) {
                    searchFolder(child);
                }
            }
        };

        searchFolder(folder);
        }

        // Filter by selected directory if provided
        if (selectedDir) {
            files = files.filter(file => {
                // More lenient path matching - consider a file to be in the directory if:
                // 1. It exactly matches the selected directory
                // 2. The path starts with selectedDir followed by a path separator (/)
                // 3. The path is in a subdirectory of selectedDir
                return file.path === selectedDir || 
                       file.path.startsWith(selectedDir + '/') ||
                       file.parent && file.parent.path.startsWith(selectedDir);
            });
            console.log(`Filtered to ${files.length} files in directory: ${selectedDir}`);
        }

        return files;
    }

    // 计算文本相似度
    public calculateSimilarity(query: string, content: string): number {
        // Handle Chinese text differently than languages that use spaces
        // Check if contains Chinese characters
        const containsChinese = /[\u4e00-\u9fa5]/.test(query);
        
        if (containsChinese) {
            // For Chinese text, don't split by spaces but use character-by-character matching
            // and also do direct substring matching
            const lowerQuery = query.toLowerCase();
            const lowerContent = content.toLowerCase();
            
            // Direct match gives high score
            if (lowerContent.includes(lowerQuery)) {
                return 0.9; // Strong match
            }
            
            // For partial matches, score by character overlap
            let matches = 0;
            for (let i = 0; i < query.length; i++) {
                const char = query.charAt(i);
                if (content.includes(char)) {
                    matches++;
                }
            }
            
            return matches / query.length;
        } else {
            // For non-Chinese text, use the original word-based approach
            const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(word => word.length > 2));
            const contentWords = new Set(content.toLowerCase().split(/\s+/).filter(word => word.length > 2));

            // Count matching words
            let matches = 0;
            for (const word of queryWords) {
                if (contentWords.has(word)) matches++;
            }

            // Calculate similarity score
            return matches / Math.max(queryWords.size, 1);
        }
    }

    // Getting text embedding vector
    async getEmbedding(text: string): Promise<number[]> {
        try {
            // Use the ModelManager to get embeddings from the default model
            return await this.modelManager.getEmbedding(text);
        } catch (error) {
            console.error("Error getting embedding:", error);
            
            // Fallback to legacy implementation if ModelManager fails
            console.log("Falling back to legacy embedding implementation");
            return this.getLegacyEmbedding(text);
        }
    }
    
    // Legacy implementation for backward compatibility
    private async getLegacyEmbedding(text: string): Promise<number[]> {
        const { provider, apiKey, embeddingModel } = this.settings;
        
        try {
            if (provider === 'zhipuai') {
                if (!text?.trim()) {
                    throw new Error('Empty text cannot be embedded');
                }

                // Add text chunking for large texts
                const MAX_CHARS = 3000; // Safe limit for embedding
                if (text.length > MAX_CHARS) {
                    // Take the first part of the text up to MAX_CHARS, trying to break at a sentence
                    const truncated = text.substring(0, MAX_CHARS);
                    const lastPeriod = truncated.lastIndexOf('.');
                    const lastNewline = truncated.lastIndexOf('\n');
                    const breakPoint = Math.max(lastPeriod, lastNewline);
                    text = breakPoint > 0 ? truncated.substring(0, breakPoint + 1) : truncated;
                }

                // Log request details
                const requestBody = {
                    model: embeddingModel,
                    input: text,
                    dimensions: embeddingModel === 'embedding-3' ? 1024 : undefined
                };

                console.log('ZhipuAI Embedding Request:', {
                    url: 'https://open.bigmodel.cn/api/paas/v4/embeddings',
                    model: embeddingModel,
                    textLength: text.length,
                    requestBody
                });

                const response = await requestUrl({
                    url: 'https://open.bigmodel.cn/api/paas/v4/embeddings',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                // Log response for debugging
                console.log('ZhipuAI Embedding Response:', {
                    status: response.status,
                    statusText: response.status,
                    responseBody: response.json
                });

                if (response.status !== 200) {
                    const errorMessage = response.json?.error?.message || response.text;
                    throw new Error(`API returned status ${response.status}: ${errorMessage}`);
                }

                if (!response.json?.data?.[0]?.embedding) {
                    console.error('Invalid API response:', response.json);
                    throw new Error('Invalid embedding response from ZhipuAI');
                }

                return response.json.data[0].embedding;
            } else if (provider === 'openai') {
                const response = await this.rateLimitedRequest(async () => await requestUrl({
                    url: 'https://api.openai.com/v1/embeddings',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: embeddingModel,
                        input: text,
                    }),
                }));
                
                if (!response.json.data?.[0]?.embedding) {
                    throw new Error('Invalid embedding response from OpenAI');
                }
                return response.json.data[0].embedding;
            } else if (provider === 'groq') {
                const response = await this.rateLimitedRequest(async () => await requestUrl({
                    url: 'https://api.groq.com/openai/v1/embeddings',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: embeddingModel,
                        input: text,
                    }),
                }));
                
                if (!response.json.data?.[0]?.embedding) {
                    throw new Error('Invalid embedding response from Groq');
                }
                return response.json.data[0].embedding;
            }
            throw new Error('Unsupported provider for embeddings');
        } catch (error) {
            console.error("Error getting legacy embedding:", error);
            throw error;
        }
    }

    private async rateLimitedRequest(requestFn: () => Promise<any>): Promise<any> {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;
        
        if (timeSinceLastCall < this.MIN_API_INTERVAL) {
            await new Promise(resolve => setTimeout(resolve, this.MIN_API_INTERVAL - timeSinceLastCall));
        }
        
        this.lastApiCall = Date.now();
        return requestFn();
    }

    private async getCachedEmbedding(text: string): Promise<number[]> {
        const cached = this.embeddingCache.get(text);
        const now = Date.now();
        
        if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
            return cached.vector;
        }
        
        const vector = await this.getEmbedding(text);
        this.embeddingCache.set(text, {
            vector,
            timestamp: now
        });
        
        return vector;
    }

    async activateView() {
        const workspace = this.app.workspace;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
        
        if (!leaf) {
            // Create new leaf in right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (!rightLeaf) return;
            
            leaf = rightLeaf;
            await leaf.setViewState({
                type: VIEW_TYPE_CHAT,
                active: true,
            });
        }

        workspace.revealLeaf(leaf);
    }

    async searchKnowledgeBase() {
        const modal = new SearchPromptModal(this.app);
        const query = await modal.openAndGetValue();
        if (!query) return;

        const loadingModal = new LoadingModal(this.app, true, "Searching with advanced RAG...");
        loadingModal.open();

        try {
            // Use the shared advanced search method
            const results = await this.advancedSearch(query, 10, loadingModal);
            
            loadingModal.close();
            
            if (results.length === 0) {
                new Notice("No relevant documents found for your query.", 3000);
                return;
            }
            
            new SearchResultsModal(this.app, results, query).open();
        } catch (error) {
            console.error("Error searching knowledge base:", error);
            new Notice("Error searching knowledge base: " + error.message);
            loadingModal.close();
        }
    }

    // Vector-based semantic search using embeddings
    private async vectorSearch(query: string): Promise<Array<{ file: TFile; similarity: number; content: string }>> {
        try {
            console.log("Attempting vector search for:", query);
            const files = await this.getKnowledgeBaseNotes();
            const results = [];
            
            // Get query embedding
            const queryEmbedding = await this.getEmbedding(query);
            
            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    
                    // Get content embedding
                    const contentEmbedding = await this.getCachedEmbedding(content);
                    
                    // Calculate cosine similarity
                    const similarity = this.calculateCosineSimilarity(queryEmbedding, contentEmbedding);
                    
                    if (similarity > 0.5) { // Set a reasonable threshold
                        console.log(`High vector similarity (${similarity.toFixed(2)}) for file: ${file.path}`);
                        const snippet = this.getRelevantSnippet(content, query, 1000);
                        results.push({ file, similarity, content: snippet });
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.path} for vector search:`, error);
                }
            }
            
            return results;
        } catch (error) {
            console.error("Vector search failed:", error);
            return []; // Return empty array to trigger fallback
        }
    }

    // Calculate cosine similarity between two vectors
    private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
        if (vec1.length !== vec2.length) {
            throw new Error("Vectors must have the same dimensions");
        }
        
        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            mag1 += vec1[i] * vec1[i];
            mag2 += vec2[i] * vec2[i];
        }
        
        mag1 = Math.sqrt(mag1);
        mag2 = Math.sqrt(mag2);
        
        if (mag1 === 0 || mag2 === 0) return 0;
        
        return dotProduct / (mag1 * mag2);
    }

    // Search using Obsidian's native search capabilities
    private async obsidianSearch(query: string): Promise<Array<{ file: TFile; similarity: number; content: string }>> {
        try {
            console.log("Attempting Obsidian native search for:", query);
            const results = [];
            
            // Try to get Obsidian's search plugin
            // Use any type for accessing internal APIs
            const searchPlugin = (this.app as any).internalPlugins?.getPluginById('global-search');
            
            if (!searchPlugin || !searchPlugin.enabled) {
                console.log("Obsidian search plugin not available");
                return [];
            }
            
            // Execute search using Obsidian's search API
            const searchResults = await new Promise<any[]>((resolve) => {
                // Use the Obsidian search API
                const searchLeaf = this.app.workspace.getLeavesOfType('search')[0];
                if (!searchLeaf) {
                    resolve([]);
                    return;
                }
                
                // Access the search view with type assertion
                const searchView = searchLeaf.view as any;
                
                // Execute the search
                if (searchView && typeof searchView.search === 'function') {
                    searchView.searchQuery = query;
                    searchView.search();
                    
                    // Wait a bit for results (this is a hack, ideally we'd hook into an event)
                    setTimeout(() => {
                        const matches = searchView.dom?.resultDomLookup;
                        const results = [];
                        
                        // Convert results to our format
                        if (matches) {
                            for (const [path, match] of Object.entries(matches)) {
                                const file = this.app.vault.getAbstractFileByPath(path);
                                if (file instanceof TFile) {
                                    results.push(file);
                                }
                            }
                        }
                        
                        resolve(results);
                    }, 500);
                } else {
                    console.log("Search view doesn't have expected methods");
                    resolve([]);
                }
            });
            
            // Convert Obsidian search results to our format
            for (const file of searchResults) {
                if (file instanceof TFile) {
                    try {
                        const content = await this.app.vault.read(file);
                        const snippet = this.getRelevantSnippet(content, query, 1000);
                        
                        // Assign a high similarity score to Obsidian's results
                        results.push({ 
                            file, 
                            similarity: 0.85, // High score since Obsidian found it relevant
                            content: snippet 
                        });
                    } catch (error) {
                        console.error(`Error processing file ${file.path} for Obsidian search:`, error);
                    }
                }
            }
            
            return results;
        } catch (error) {
            console.error("Obsidian search failed:", error);
            return []; // Return empty array to trigger fallback
        }
    }

    // Fallback text-matching search
    private async textMatchingSearch(query: string): Promise<Array<{ file: TFile; similarity: number; content: string }>> {
        console.log("Using text matching search for:", query);
        const files = await this.getKnowledgeBaseNotes();
        const results = [];
        
        // Determine if the query contains Chinese characters
        const containsChinese = /[\u4e00-\u9fa5]/.test(query);
        
        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                // Calculate similarity
                const similarity = this.calculateSimilarity(query, content);
                
                // For Chinese queries, use a lower threshold to include more results
                const threshold = containsChinese ? 0.05 : 0.1;
                
                // Log high similarity matches for debugging
                if (similarity > 0.5) {
                    console.log(`High text similarity (${similarity.toFixed(2)}) for file: ${file.path}`);
                }
                
                // Only include if there's some relevance
                if (similarity > threshold) {
                    // Get a relevant snippet with our enhanced extraction
                    const snippet = this.getRelevantSnippet(content, query, 1000);
                    results.push({ file, similarity, content: snippet });
                }
            } catch (error) {
                console.error(`Error processing file ${file.path} for text matching:`, error);
            }
        }

        // For Chinese queries, prioritize exact filename matches as well
        if (containsChinese) {
            for (const file of files) {
                // Boost score for files whose name contains the query
                if (file.basename.includes(query)) {
                    console.log(`Boosting score for filename match: ${file.basename}`);
                    
                    // Check if we already added this file
                    const existingResult = results.find(r => r.file.path === file.path);
                    if (existingResult) {
                        existingResult.similarity = Math.max(existingResult.similarity, 0.8);
                    } else {
                        try {
                            const content = await this.app.vault.read(file);
                            const snippet = this.getRelevantSnippet(content, query, 1000);
                            results.push({ file, similarity: 0.8, content: snippet });
                        } catch (error) {
                            console.error(`Error processing file ${file.path} for filename match:`, error);
                        }
                    }
                }
            }
        }
        
        return results;
    }

    async handleSelection(editor: Editor) {
        const selectedText = editor.getSelection();
        if (!selectedText) return;

        const history: Message[] = [
            { role: "user", content: selectedText },
            { role: "assistant", content: "I'll help you with that." }
        ];

        new ChatModal(this.app, this, history, editor).open();
    }

    public async processFileReferences(message: string): Promise<string> {
        // Match @[[filename]] pattern
        const matches = message.match(/@\[\[(.*?)\]\]/g);
        if (!matches) return message;
        
        let processedMessage = message;
        for (const match of matches) {
            const filePath = match.slice(3, -2); // Remove @[[ and ]]
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                try {
                    const content = await this.app.vault.read(file);
                    // Replace the file reference with actual content and add a clear separator
                    processedMessage = processedMessage.replace(match, `\n\n=== Content from ${filePath} ===\n${content}\n=== End of ${filePath} ===\n\n`);
                } catch (error) {
                    console.error(`Error reading file ${filePath}:`, error);
                    new Notice(`Failed to read file ${filePath}`);
                }
            }
        }
        
        return processedMessage;
    }

    public async getTopRelevantNotes(query: string, limit: number = 5): Promise<Array<{ file: TFile; similarity: number; content: string }>> {
        console.log(`Advanced search: Finding relevant notes for "${query}"`);
        return this.advancedSearch(query, limit);
    }

    // Enhanced getRelevantSnippet with improved extraction techniques
    private getRelevantSnippet(content: string, query: string, snippetLength: number = 300): string {
        // Implementation of paragraph-based extraction and multiple relevant sections
        // Detect paragraphs by looking for double line breaks
        const paragraphs = content.split(/\n\s*\n/);
        const lowerQuery = query.toLowerCase();
        const queryTerms = lowerQuery.split(/\s+/).filter(term => term.length > 2);
        
        // Calculate relevance score for each paragraph
        const scoredParagraphs = paragraphs.map((para, index) => {
            const lowerPara = para.toLowerCase();
            let score = 0;
            
            // Check exact match first
            if (lowerPara.includes(lowerQuery)) {
                score += 100;
            }
            
            // Count matching query terms
            queryTerms.forEach(term => {
                if (lowerPara.includes(term)) {
                    score += 10;
                }
            });
            
            // Give higher score to paragraphs containing more distinct query terms
            const uniqueTermsCount = queryTerms.filter(term => lowerPara.includes(term)).length;
            score += uniqueTermsCount * 5;
            
            // Check if paragraph is a header (for header-aware context)
            const isHeader = /^#+\s+.+$/.test(para);
            if (isHeader) {
                score += 5;
            }
            
            return { paragraph: para, score, index, isHeader };
        });
        
        // Sort paragraphs by relevance score
        const relevantParagraphs = scoredParagraphs
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score);
        
        // No relevant paragraphs found, return beginning of document
        if (relevantParagraphs.length === 0) {
            return this.extractSnippet(content, 0, snippetLength);
        }
        
        // Take top 3 most relevant paragraphs
        const topParagraphs = relevantParagraphs.slice(0, 3);
        
        // Sort by original order to maintain document flow
        topParagraphs.sort((a, b) => a.index - b.index);
        
        // Add headers above relevant paragraphs to provide context
        const result = [];
        let lastHeaderIndex = -1;
        
        for (const para of topParagraphs) {
            // Try to find the nearest header above this paragraph
            let headerText = "";
            for (let i = para.index - 1; i > lastHeaderIndex; i--) {
                if (i < 0) break;
                const potentialHeader = paragraphs[i];
                if (/^#+\s+.+$/.test(potentialHeader)) {
                    headerText = potentialHeader;
                    break;
                }
            }
            
            // Add position marker showing approximate location in document
            const position = Math.floor((para.index / paragraphs.length) * 100);
            const positionMarker = `[${position}% into document]`;
            
            // Add header if found, then the paragraph
            if (headerText) {
                result.push(`${positionMarker} ${headerText}`);
            }
            result.push(para.paragraph);
            
            // Update last header index to avoid duplicate headers
            lastHeaderIndex = para.index;
        }
        
        // Join the selected paragraphs with separators
        return result.join('\n\n...\n\n');
    }

    private extractSnippet(content: string, index: number, snippetLength: number): string {
        // Improved snippet extraction with contextual boundaries
        // Try to find sentence or paragraph boundaries
        
        // Determine the start of the snippet
        let start = Math.max(0, index - snippetLength / 2);
        
        // Try to start at a sentence boundary
        if (start > 0) {
            // Look backward for the start of a sentence (period followed by space or newline)
            const textBefore = content.substring(0, start);
            const sentenceBoundary = Math.max(
                textBefore.lastIndexOf('. '),
                textBefore.lastIndexOf('.\n'),
                textBefore.lastIndexOf('? '),
                textBefore.lastIndexOf('?\n'),
                textBefore.lastIndexOf('! '),
                textBefore.lastIndexOf('!\n')
            );
            
            if (sentenceBoundary !== -1) {
                start = sentenceBoundary + 2; // Move past the period and space
            } else {
                // If no sentence boundary, try paragraph boundary
                const paragraphBoundary = textBefore.lastIndexOf('\n\n');
                if (paragraphBoundary !== -1) {
                    start = paragraphBoundary + 2;
                }
            }
        }
        
        // Determine end of the snippet
        let end = Math.min(content.length, index + snippetLength / 2);
        
        // Try to end at a sentence boundary
        if (end < content.length) {
            // Look forward for the end of a sentence
            const textAfter = content.substring(end);
            let sentenceEnd = -1;
            
            const endMatch = textAfter.match(/[.!?](?:\s|$)/);
            if (endMatch && endMatch.index !== undefined) {
                sentenceEnd = endMatch.index + 1;
            }
            
            if (sentenceEnd !== -1) {
                end += sentenceEnd + 1; // Include the punctuation and the space
            } else {
                // If no sentence boundary, try paragraph boundary
                const paragraphEnd = textAfter.indexOf('\n\n');
                if (paragraphEnd !== -1) {
                    end += paragraphEnd;
                }
            }
        }
        
        // Extract the snippet
        let snippet = content.slice(start, end);
        
        // Detect special content structure like code blocks, lists, tables
        // If we're in the middle of a code block or table, try to include the whole block
        if (snippet.includes('```') && snippet.split('```').length % 2 === 0) {
            // We're in the middle of a code block, try to find the end
            const textAfter = content.substring(end);
            const codeBlockEnd = textAfter.indexOf('```');
            if (codeBlockEnd !== -1) {
                end += codeBlockEnd + 3; // Include the closing backticks
                snippet = content.slice(start, end);
            }
        }
        
        // Add ellipsis if we're not at the start/end of document
        if (start > 0) snippet = "..." + snippet;
        if (end < content.length) snippet = snippet + "...";
        
        return snippet;
    }

    async renderMarkdown(content: string, container: HTMLElement) {
        await MarkdownRenderer.renderMarkdown(content, container, '', this);
    }

    async polishText(editor?: any) {
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
            new ConfirmModal(this.app, "No text selected. Apply polishing to the entire document?", async () => {
                const content = editor.getValue();
                await this.processPolish(content, editor);
            }).open();
        } else {
            await this.processPolish(selectedText, editor);
        }
    }

    async processPolish(content: string, editor: any) {
        const loadingModal = new LoadingModal(this.app, true, "Polishing...");
        loadingModal.open();

        // Find the Polish function in the functions array
        const polishFunc = this.settings.functions.find(f => f.isBuiltIn && f.name === "Polish");
        const polishPrompt = polishFunc ? polishFunc.prompt : "Please polish and refine the following text:";

        const polishedText = await this.callAI(content, polishPrompt);

        loadingModal.close();

        // Check if user has selected text - if not, show results directly in editor
        if (!editor.somethingSelected()) {
            // If no selection, show results directly in the editor with diff markers
            const diffResult = this.generateDiffHtml(content, polishedText);
            editor.setValue(diffResult);
            new Notice("Polish results applied with diff markers. Use Ctrl+Shift+P (or Cmd+Shift+P) to remove all markup.", 7000);
        } else {
            // If text is selected, show the modal with the diff
            new PolishResultModal(
                this.app,
                content,
                polishedText,
                (updatedContent) => {
                    // Handle apply changes
                    editor.replaceSelection(updatedContent);
                },
                this
            ).open();
        }
    }
    
    // Method to generate diff DOM elements with highlighting
    private generateDiffElements(original: string, modified: string): DocumentFragment {
        try {
            // Use the plugin's diff library if available
            if (this.diffMatchPatchLib) {
                return this.generateWordLevelDiffElements(original, modified);
            }
        } catch (e) {
            console.error("Error using diff-match-patch library:", e);
        }

        // Fallback to a more basic paragraph-level diff
        return this.generateParagraphLevelDiffElements(original, modified);
    }

    // Advanced word-level diff implementation that returns DOM elements
    private generateWordLevelDiffElements(original: string, modified: string): DocumentFragment {
        try {
            // Use the plugin's diff library
            const dmp = new this.diffMatchPatchLib();
            const diffs = dmp.diff_main(original, modified);
            dmp.diff_cleanupSemantic(diffs);
            
            const fragment = document.createDocumentFragment();
            
            for (const [operation, text] of diffs) {
                const escText = this.escapeHtml(text);
                
                if (operation === -1) {
                    // Deletion
                    const deletedSpan = document.createElement('span');
                    deletedSpan.className = "polish-deleted";
                    deletedSpan.textContent = text;
                    fragment.appendChild(deletedSpan);
                } else if (operation === 1) {
                    // Addition
                    const addedSpan = document.createElement('span');
                    addedSpan.className = "polish-highlight";
                    addedSpan.textContent = text;
                    fragment.appendChild(addedSpan);
                } else {
                    // Unchanged text
                    fragment.appendChild(document.createTextNode(text));
                }
            }
            
            return fragment;
        } catch (e) {
            console.error("Error in word-level diff:", e);
            return this.generateParagraphLevelDiffElements(original, modified);
        }
    }

    // Basic paragraph-level diff that returns DOM elements
    private generateParagraphLevelDiffElements(original: string, modified: string): DocumentFragment {
        // Split into paragraphs
        const originalParagraphs = original.split('\n');
        const modifiedParagraphs = modified.split('\n');
        
        const fragment = document.createDocumentFragment();
        
        // If extremely different lengths, don't try to diff - just return the modified content
        if (Math.abs(originalParagraphs.length - modifiedParagraphs.length) > originalParagraphs.length * 0.5) {
            fragment.appendChild(document.createTextNode(modified));
            return fragment;
        }
        
        // Use the longer array length to ensure we process all paragraphs
        const maxLength = Math.max(originalParagraphs.length, modifiedParagraphs.length);
        
        for (let i = 0; i < maxLength; i++) {
            const origPara = i < originalParagraphs.length ? originalParagraphs[i] : '';
            const modPara = i < modifiedParagraphs.length ? modifiedParagraphs[i] : '';
            
            if (origPara === modPara) {
                // Identical paragraph
                fragment.appendChild(document.createTextNode(modPara));
            } else if (origPara && !modPara) {
                // Paragraph was deleted
                const deletedSpan = document.createElement('span');
                deletedSpan.className = "polish-deleted";
                deletedSpan.textContent = origPara;
                fragment.appendChild(deletedSpan);
            } else if (!origPara && modPara) {
                // New paragraph was added
                const addedSpan = document.createElement('span');
                addedSpan.className = "polish-highlight";
                addedSpan.textContent = modPara;
                fragment.appendChild(addedSpan);
            } else {
                // Paragraph was modified
                // Show both the deleted and added versions
                const deletedSpan = document.createElement('span');
                deletedSpan.className = "polish-deleted";
                deletedSpan.textContent = origPara;
                fragment.appendChild(deletedSpan);
                
                // Add a line break
                fragment.appendChild(document.createElement('br'));
                
                const addedSpan = document.createElement('span');
                addedSpan.className = "polish-highlight";
                addedSpan.textContent = modPara;
                fragment.appendChild(addedSpan);
            }
            
            // Add a line break between paragraphs (except the last one)
            if (i < maxLength - 1) {
                fragment.appendChild(document.createElement('br'));
            }
        }
        
        return fragment;
    }

    // Keep the existing methods for backward compatibility but update them to use the new methods
    private generateDiffHtml(original: string, modified: string): DocumentFragment {
        return this.generateDiffElements(original, modified);
    }
    
    private generateWordLevelDiff(original: string, modified: string): DocumentFragment {
        return this.generateWordLevelDiffElements(original, modified);
    }
    
    private generateParagraphLevelDiff(original: string, modified: string): DocumentFragment {
        return this.generateParagraphLevelDiffElements(original, modified);
    }

    // Add this new method to clean Polish markup
    async cleanPolishMarkup(editor: Editor) {
        if (!editor) return;
        
        const content = editor.getValue();
        
        // Remove all strikethrough text (~~deleted content~~)
        // Use a workaround for the 's' flag by matching newlines explicitly
        let cleanedContent = content.replace(/~~([^~]*?)~~(\n)?/g, '');
        
        // Remove bold markup but keep the content (convert **added text** to added text)
        cleanedContent = cleanedContent.replace(/\*\*([^*]*?)\*\*/g, '$1');
        
        // Remove any double newlines that might have been created
        cleanedContent = cleanedContent.replace(/\n\n+/g, '\n\n');
        
        // Update the editor
        editor.setValue(cleanedContent);
        
        new Notice("Polish markup removed");
    }

    async activateDebateView() {
        const { workspace } = this.app;
        
        // Check if view already exists and is open
        let leaf = workspace.getLeavesOfType(DEBATE_VIEW_TYPE)[0];
        
        if (!leaf) {
            // Create a new leaf in the right sidebar for the debate view
            const rightLeaf = workspace.getRightLeaf(false);
            
            if (!rightLeaf) {
                new Notice("Could not create debate view");
                return;
            }
            
            // Set the rightLeaf to leaf (now we know it's not null)
            leaf = rightLeaf;
            await leaf.setViewState({ type: DEBATE_VIEW_TYPE });
        }
        
        // Reveal the leaf in the right sidebar
        workspace.revealLeaf(leaf);
    }

    private migrateLegacyAPIKey(): void {
        // Check if we have a legacy API key but no models configured
        if (this.settings.apiKey && (!this.settings.models || this.settings.models.length === 0)) {
            console.log('Migrating legacy API key to models system');
            
            // Create a new model using the legacy API key
            const newModel: LLMModelConfig = {
                id: `model_${Date.now()}`,
                name: `${this.settings.provider || 'openai'} (Migrated)`,
                type: (this.settings.provider || 'openai') as LLMModelConfig['type'],
                apiKey: this.settings.apiKey,
                systemPrompt: 'You are a helpful assistant.',
                active: true,
                isDefault: true,
                modelName: this.settings.model || this.settings.chatModel || this.getDefaultModelName(this.settings.provider)
            };
            
            // Add the model to the models array
            if (!this.settings.models) {
                this.settings.models = [];
            }
            this.settings.models.push(newModel);
            
            // Clear the legacy API key
            this.settings.apiKey = '';
            
            // Save settings
            this.saveSettings().catch(e => {
                console.error('Failed to save settings after API key migration', e);
            });
        }
    }
    
    private getDefaultModelName(provider: string | undefined): string {
        switch (provider) {
            case 'openai':
                return 'gpt-3.5-turbo';
            case 'zhipuai':
                return 'glm-4';
            case 'groq':
                return 'llama2-70b-4096';
            default:
                return 'gpt-3.5-turbo';
        }
    }

    private async loadDiffMatchPatchLibrary(): Promise<void> {
        try {
            // Import the diff-match-patch library
            const diffMatchPatchScript = document.createElement('script');
            diffMatchPatchScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/diff-match-patch/1.0.0/diff-match-patch.min.js';
            diffMatchPatchScript.onload = () => {
                this.diffMatchPatchLib = window.diff_match_patch;
            };
            document.head.appendChild(diffMatchPatchScript);
        } catch (error) {
            console.error('Failed to load diff-match-patch library:', error);
        }
    }

    // Add the escapeHtml method to the main plugin class
    public escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Add after the migrateLegacyAPIKey method
    private migrateEmbeddingConfig(): void {
        // Check if we need to migrate embedding configuration
        if (!this.settings.embeddingConfig && this.settings.embeddingModel) {
            console.log('Migrating legacy embedding configuration');
            
            // Initialize embeddingConfig using legacy settings
            this.settings.embeddingConfig = {
                modelName: this.settings.embeddingModel === 'embedding-3' ? 'text-embedding-3-small' : 'text-embedding-ada-002',
                provider: this.settings.provider === 'zhipuai' ? 'zhipuai' : 'openai',
                dimensions: this.settings.embeddingDimensions || 
                    (this.settings.embeddingModel === 'embedding-3' ? 1024 : 1536)
            };
            
            // Save the migrated settings
            this.saveSettings();
        }
    }

    // Core shared advanced search functionality
    private async advancedSearch(query: string, limit: number = 10, loadingModal?: LoadingModal): Promise<Array<{ file: TFile; similarity: number; content: string }>> {
        try {
            // Report progress if a loading modal was provided
            const updateStatus = (status: string) => {
                if (loadingModal) loadingModal.setStatus(status);
                else console.log(status);
            };

            // 1. Query Rewriting - Optimize the original query
            updateStatus("Optimizing query...");
            const optimizedQuery = await this.rewriteQuery(query);
            console.log(`Original query: "${query}"\nOptimized query: "${optimizedQuery}"`);
            
            // 2. HyDE - Generate a hypothetical document answer
            updateStatus("Generating hypothetical answer...");
            const { hypotheticalDoc, hydeResults } = await this.hydeSearch(query);
            
            // 3. Standard search using optimized query
            updateStatus("Searching knowledge base...");
            const standardResults = await this.getTopRelevantNotesLegacy(optimizedQuery, limit);
            
            // Combine results from different search strategies
            let allResults = [...standardResults];
            if (hydeResults && hydeResults.length > 0) {
                // Add HyDE results that aren't already included
                hydeResults.forEach(hydeResult => {
                    if (!allResults.some(r => r.file.path === hydeResult.file.path)) {
                        allResults.push(hydeResult);
                    }
                });
            }
            
            if (allResults.length === 0) {
                return [];
            }
            
            // 4. Maximal Marginal Relevance reranking
            updateStatus("Optimizing document selection...");
            const rerankedResults = this.maximalMarginalRelevance(allResults, query);
            
            // 5. Semantic chunking to get better context
            updateStatus("Preparing knowledge context...");
            const enhancedResults: Array<{ file: TFile; similarity: number; content: string }> = [];
            
            // Process each document to create semantic chunks
            for (const result of rerankedResults.slice(0, Math.min(8, rerankedResults.length))) {
                try {
                    const fullContent = await this.app.vault.read(result.file);
                    const semanticChunks = this.createSemanticChunks(fullContent, query);
                    
                    // Only include the most relevant chunks
                    for (const [i, chunk] of semanticChunks.slice(0, 2).entries()) {
                        enhancedResults.push({
                            file: result.file,
                            similarity: result.similarity,
                            content: chunk
                        });
                    }
                } catch (error) {
                    console.error(`Error processing file ${result.file.path}:`, error);
                }
            }
            
            // Sort by similarity and return results
            return enhancedResults
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit);
        } catch (error) {
            console.error("Error in advanced search:", error);
            // Fallback to legacy search if advanced search fails
            return this.getTopRelevantNotesLegacy(query, limit);
        }
    }

    // Rename the original method to avoid naming conflicts
    private async getTopRelevantNotesLegacy(query: string, limit: number = 5): Promise<Array<{ file: TFile; similarity: number; content: string }>> {
        console.log(`Legacy search: Finding relevant notes for "${query}"`);
        
        // Try vector search first
        try {
            console.log("Attempting vector-based search for related notes");
            const vectorResults = await this.vectorSearch(query);
            
            if (vectorResults && vectorResults.length > 0) {
                console.log(`Found ${vectorResults.length} relevant notes using vector search`);
                return vectorResults
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, limit);
            }
        } catch (error) {
            console.error("Vector search for related notes failed:", error);
        }
        
        // Try Obsidian search next
        try {
            console.log("Attempting Obsidian search for related notes");
            const obsidianResults = await this.obsidianSearch(query);
            
            if (obsidianResults && obsidianResults.length > 0) {
                console.log(`Found ${obsidianResults.length} relevant notes using Obsidian search`);
                return obsidianResults
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, limit);
            }
        } catch (error) {
            console.error("Obsidian search for related notes failed:", error);
        }
        
        // Fall back to text matching
        console.log("Falling back to text matching for related notes");
        const textResults = await this.textMatchingSearch(query);
        
        return textResults
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    // Update the public method to use the advanced search
    public async getTopRelevantNotes(query: string, limit: number = 5): Promise<Array<{ file: TFile; similarity: number; content: string }>> {
        console.log(`Advanced search: Finding relevant notes for "${query}"`);
        return this.advancedSearch(query, limit);
    }

    // Update the searchKnowledgeBase method to use advanced search
    async searchKnowledgeBase() {
        const modal = new SearchPromptModal(this.app);
        const query = await modal.openAndGetValue();
        if (!query) return;

        const loadingModal = new LoadingModal(this.app, true, "Searching with advanced RAG...");
        loadingModal.open();

        try {
            // Use the shared advanced search method
            const results = await this.advancedSearch(query, 10, loadingModal);
            
            loadingModal.close();
            
            if (results.length === 0) {
                new Notice("No relevant documents found for your query.", 3000);
                return;
            }
            
            new SearchResultsModal(this.app, results, query).open();
        } catch (error) {
            console.error("Error searching knowledge base:", error);
            new Notice("Error searching knowledge base: " + error.message);
            loadingModal.close();
        }
    }

    // ENHANCEMENT 1: Query rewriting for better search
    private async rewriteQuery(originalQuery: string): Promise<string> {
        try {
            // Don't rewrite short queries or waste tokens on simple queries
            if (originalQuery.length < 10 || originalQuery.split(' ').length < 3) {
                return originalQuery;
            }
            
            const messages = [
                { role: "system", content: "You are a search query optimization expert. Your task is to rewrite search queries to make them more effective for semantic search. Return ONLY the rewritten query without explanation or additional text." },
                { role: "user", content: `Original query: "${originalQuery}"\n\nRewrite this query to be more effective for semantic search in a personal knowledge base. Add relevant keywords and context. Return ONLY the rewritten query, without any explanation.` }
            ];
            
            const rewrittenQuery = await this.callAIChat(messages as any);
            
            // Clean up the response (remove quotes, newlines, etc.)
            let cleanedQuery = rewrittenQuery.trim()
                .replace(/^["']|["']$/g, '') // Remove surrounding quotes
                .replace(/^Rewritten query: /i, '') // Remove potential prefixes
                .replace(/\.$/, ''); // Remove trailing period
                
            // Don't return empty queries or overly long ones
            if (!cleanedQuery || cleanedQuery.length < 3 || cleanedQuery.length > 200) {
                return originalQuery;
            }
            
            return cleanedQuery;
        } catch (error) {
            console.error("Error rewriting query:", error);
            // Fallback to original query
            return originalQuery;
        }
    }

    // ENHANCEMENT 2: HyDE (Hypothetical Document Embeddings) search
    private async hydeSearch(query: string): Promise<{ hypotheticalDoc: string, hydeResults: Array<{ file: TFile; similarity: number; content: string }> }> {
        try {
            // Generate a hypothetical answer to use as a search document
            const messages = [
                { role: "system", content: "Generate a detailed, factual passage that directly answers the user's question. Write as if you're a knowledgeable expert providing an ideal answer based on verified information. Include specific details, examples, and explanations. Do not include phrases like 'According to my knowledge' or 'As an AI'. Write in a natural, informative style." },
                { role: "user", content: query }
            ];
            
            const hypotheticalDoc = await this.callAIChat(messages as any);
            
            // Use this hypothetical document to search the knowledge base
            // We're using it directly as a query for semantic search
            const hydeResults = await this.vectorSearch(hypotheticalDoc);
            
            return { hypotheticalDoc, hydeResults };
        } catch (error) {
            console.error("Error in HyDE search:", error);
            // Return empty results in case of error
            return { hypotheticalDoc: "", hydeResults: [] };
        }
    }

    // ENHANCEMENT 3: Maximal Marginal Relevance for result diversity
    private maximalMarginalRelevance(docs: Array<{ file: TFile; similarity: number; content: string }>, 
                                      query: string, 
                                      lambda: number = 0.5, 
                                      k: number = 10): Array<{ file: TFile; similarity: number; content: string }> {
        // If we have too few docs, just return them all
        if (docs.length <= k) return docs;
        
        try {
            // Sort by similarity first
            const sortedDocs = [...docs].sort((a, b) => b.similarity - a.similarity);
            
            // Start with the most relevant document
            const selected = [sortedDocs[0]];
            const remainingCandidates = sortedDocs.slice(1);
            
            // Select k-1 more documents
            while (selected.length < k && remainingCandidates.length > 0) {
                let nextBestScore = -Infinity;
                let nextBestIndex = -1;
                
                // For each remaining document
                for (let i = 0; i < remainingCandidates.length; i++) {
                    const candidate = remainingCandidates[i];
                    
                    // Calculate similarity term (relevance to query)
                    const similarityTerm = candidate.similarity;
                    
                    // Calculate diversity term (distance from already selected docs)
                    let maxSimilarityToSelected = -Infinity;
                    for (const selectedDoc of selected) {
                        // Calculate text similarity between candidate and selected doc
                        // Simple approach: shared words/terms
                        const similarity = this.calculateTextSimilarity(
                            candidate.content, 
                            selectedDoc.content
                        );
                        maxSimilarityToSelected = Math.max(maxSimilarityToSelected, similarity);
                    }
                    
                    // MMR score: balance between relevance and diversity
                    const mmrScore = lambda * similarityTerm - (1 - lambda) * maxSimilarityToSelected;
                    
                    if (mmrScore > nextBestScore) {
                        nextBestScore = mmrScore;
                        nextBestIndex = i;
                    }
                }
                
                // Add the best candidate to selected and remove from candidates
                if (nextBestIndex !== -1) {
                    selected.push(remainingCandidates[nextBestIndex]);
                    remainingCandidates.splice(nextBestIndex, 1);
                } else {
                    break; // No more suitable candidates
                }
            }
            
            return selected;
        } catch (error) {
            console.error("Error applying MMR:", error);
            // Fallback to simple similarity-based ranking
            return docs.sort((a, b) => b.similarity - a.similarity).slice(0, k);
        }
    }

    // Helper for MMR: calculate text similarity between two content strings
    private calculateTextSimilarity(text1: string, text2: string): number {
        // Simple word-based Jaccard similarity
        const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(word => word.length > 3));
        const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(word => word.length > 3));
        
        if (words1.size === 0 || words2.size === 0) return 0;
        
        // Calculate intersection
        let intersection = 0;
        for (const word of words1) {
            if (words2.has(word)) intersection++;
        }
        
        // Jaccard similarity: intersection / union
        const union = words1.size + words2.size - intersection;
        return intersection / union;
    }

    // ENHANCEMENT 4: Semantic chunking
    private createSemanticChunks(text: string, query: string, maxChunkSize: number = 1000): string[] {
        try {
            // 1. First, divide by natural document structure
            // Look for headings, section breaks, etc.
            const structuralDividers = /\n#{1,6}\s+|\n---+|\n\*\*\*+|\n={3,}/g;
            let sections = text.split(structuralDividers).filter(s => s.trim().length > 0);
            
            // 2. For each large section, further divide by paragraphs
            const result: string[] = [];
            for (const section of sections) {
                if (section.length <= maxChunkSize) {
                    result.push(section);
                    continue;
                }
                
                // Split by paragraphs
                const paragraphs = section.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                
                // Create chunks of paragraphs, respecting the max size
                let currentChunk = "";
                for (const paragraph of paragraphs) {
                    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
                        // Current chunk is full, save it and start a new one
                        result.push(currentChunk);
                        currentChunk = paragraph;
                    } else {
                        // Add to current chunk
                        if (currentChunk.length > 0) {
                            currentChunk += "\n\n" + paragraph;
                        } else {
                            currentChunk = paragraph;
                        }
                    }
                }
                
                // Add the last chunk if not empty
                if (currentChunk.length > 0) {
                    result.push(currentChunk);
                }
            }
            
            // 3. Score and sort chunks by relevance to query
            const scoredChunks = result.map(chunk => {
                let score = 0;
                
                // Match query terms
                const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
                const lowerChunk = chunk.toLowerCase();
                
                // Score based on query term presence
                for (const term of queryTerms) {
                    if (lowerChunk.includes(term)) {
                        score += 10;
                        // Bonus for term in headings (starts with # in Markdown)
                        const lines = lowerChunk.split("\n");
                        for (const line of lines) {
                            if (line.startsWith("#") && line.toLowerCase().includes(term)) {
                                score += 5;
                            }
                        }
                    }
                }
                
                // Penalty for very short chunks
                if (chunk.length < 100) score -= 5;
                
                return { chunk, score };
            });
            
            // Sort by score and return the chunks
            return scoredChunks
                .sort((a, b) => b.score - a.score)
                .map(item => item.chunk);
            
        } catch (error) {
            console.error("Error creating semantic chunks:", error);
            // Fallback to simple splitting
            return [text.substring(0, Math.min(text.length, maxChunkSize))];
        }
    }

    // Function to prompt for a question and show the answer
    async activateKnowledgeBaseQA() {
        const modal = new SearchPromptModal(this.app);
        const query = await modal.openAndGetValue();
        
        if (!query) return;
        
        try {
            const loadingModal = new LoadingModal(this.app, true, "Processing your question...");
            loadingModal.open();
            
            const answer = await this.knowledgeBaseQA(query);
            
            loadingModal.close();
            
            // Create a modal to display the answer
            const qaModal = new Modal(this.app);
            qaModal.titleEl.setText(`Q&A: ${query.length > 50 ? query.substring(0, 50) + '...' : query}`);
            
            // Add content to the modal
            const contentEl = qaModal.contentEl;
            contentEl.addClass('ai-pilot-qa-modal');
            
            // Create container for the answer
            const answerContainer = contentEl.createDiv({ cls: 'ai-pilot-qa-answer' });
            await this.renderMarkdown(answer, answerContainer);
            
            // Add button to insert into current note
            const buttonContainer = contentEl.createDiv({ cls: 'ai-pilot-qa-buttons' });
            const insertButton = buttonContainer.createEl('button', { text: 'Insert into current note' });
            
            insertButton.addEventListener('click', () => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                    const editor = activeView.editor;
                    const cursor = editor.getCursor();
                    
                    // Format for insertion
                    const formattedAnswer = `## ${query}\n\n${answer}`;
                    
                    editor.replaceRange(formattedAnswer, cursor);
                    new Notice('Answer inserted into current note', 2000);
                } else {
                    new Notice('No active markdown editor found', 2000);
                }
            });
            
            // Open the modal
            qaModal.open();
            
        } catch (error) {
            console.error("Knowledge Base Q&A error:", error);
            new Notice(`Error in Knowledge Base Q&A: ${error.message}`, 3000);
        }
    }

    // Knowledge Base Q&A with advanced RAG
    async knowledgeBaseQA(query: string): Promise<string> {
        const loadingModal = new LoadingModal(this.app, true, "Preparing knowledge base Q&A...");
        loadingModal.open();
        
        try {
            // 1. Use shared advanced search
            loadingModal.setStatus("Searching knowledge base...");
            const relevantNotes = await this.advancedSearch(query, 15, loadingModal);
            
            if (relevantNotes.length === 0) {
                loadingModal.close();
                return "I couldn't find any relevant information in your knowledge base to answer this question.";
            }
            
            // 2. Construct context from search results
            loadingModal.setStatus("Building knowledge context...");
            let context = `Answer the question based on the following information from my knowledge base:\n\n`;
            relevantNotes.forEach((note, index) => {
                context += `Source [${index + 1}]: ${note.file.basename}\n`;
                context += `${note.content}\n\n`;
            });
            
            // Initial system prompts for reflection, including uncertainty assessment
            const systemMessages = [
                { role: "system", content: "You are a helpful assistant with access to a personal knowledge base." },
                { role: "system", content: "Answer questions based only on the provided knowledge base extracts." },
                { role: "system", content: "If the information to answer the question is not in the provided extracts, say so clearly." },
                { role: "system", content: "When citing information, reference the source number in brackets, e.g., [1]." },
                // 5. ENHANCEMENT: Uncertainty assessment prompt
                { role: "system", content: "For each major part of your answer, indicate your confidence level as [High], [Medium], or [Low]." }
            ];
            
            // Start reflection loop
            let currentAnswer = "";
            let reflectionCount = 0;
            let shouldContinueReflection = true;
            
            loadingModal.setStatus("Generating initial answer...");
            
            // Continue reflection until satisfied
            while (shouldContinueReflection) {
                reflectionCount++;
                loadingModal.setStatus(`Reflection round ${reflectionCount}...`);
                
                // Generate answer based on current context
                const messages = [
                    ...systemMessages,
                    { role: "user", content: `${context}\n\nQuestion: ${query}\n\nProvide a comprehensive answer with confidence levels ([High]/[Medium]/[Low]) for each main point. Cite sources as [1], [2], etc.` }
                ];
                
                if (currentAnswer) {
                    // Include prior answer in subsequent iterations
                    messages.push({ role: "assistant", content: currentAnswer });
                    messages.push({ 
                        role: "user", 
                        content: "Reflect on your previous answer. Identify gaps, missing information, or areas where your confidence is low. What additional information would help provide a better answer?" 
                    });
                }
                
                // Generate new answer or reflection
                const response = await this.callAIChat(messages as any);
                
                if (!currentAnswer) {
                    // First iteration - this is our initial answer
                    currentAnswer = response;
                } else {
                    // Subsequent iterations - this is a reflection
                    // Parse reflection to identify gaps
                    const reflectionMessages = [
                        { role: "system", content: "You are analyzing a reflection on an answer to identify specific information gaps." },
                        { role: "user", content: `This is a reflection on an answer to the question: "${query}"\n\nReflection: ${response}\n\nBased on this reflection, extract 1-3 specific search queries that would help address the information gaps. Format them as a numbered list of search queries only, without any explanation or additional text.` }
                    ];
                    
                    const searchQueries = await this.callAIChat(reflectionMessages as any);
                    
                    // Check if reflection indicates we need more information
                    if (searchQueries.toLowerCase().includes("no additional") || 
                        searchQueries.toLowerCase().includes("sufficient information") ||
                        reflectionCount > 5) { // Safety limit
                        
                        // Reflection indicates we have enough information or reached limit
                        shouldContinueReflection = false;
                        
                        // Final answer generation with all gathered context
                        const finalMessages = [
                            ...systemMessages,
                            { role: "user", content: `${context}\n\nQuestion: ${query}\n\nProvide a comprehensive answer based on all available information. For each main point, indicate your confidence level as [High], [Medium], or [Low]. Cite sources as [1], [2], etc.` }
                        ];
                        
                        currentAnswer = await this.callAIChat(finalMessages as any);
                    } else {
                        // Extract search queries from the reflection
                        const queryMatches = searchQueries.match(/\d+\.\s*(.*?)(?=\d+\.|$)/g) || [];
                        const newQueries = queryMatches.map(m => m.replace(/^\d+\.\s*/, '').trim());
                        
                        if (newQueries.length > 0) {
                            loadingModal.setStatus(`Searching for additional information...`);
                            
                            // For each identified gap, perform targeted searches
                            for (const newQuery of newQueries) {
                                // Get more context with the advanced search
                                const additionalNotes = await this.advancedSearch(newQuery, 3);
                                
                                if (additionalNotes.length > 0) {
                                    // Add new information to context
                                    context += `\n\nAdditional information for: "${newQuery}"\n\n`;
                                    additionalNotes.forEach((note, index) => {
                                        const sourceIndex = relevantNotes.length + index + 1;
                                        context += `Source [${sourceIndex}]: ${note.file.basename}\n`;
                                        context += `${note.content}\n\n`;
                                        
                                        // Add to main relevantNotes array
                                        relevantNotes.push(note);
                                    });
                                }
                            }
                            
                            // Generate improved answer with enhanced context
                            const improvedMessages = [
                                ...systemMessages,
                                { role: "user", content: `${context}\n\nQuestion: ${query}\n\nPlease answer this question based on ALL the information provided, including the additional context. For each main point, indicate your confidence level as [High], [Medium], or [Low]. Cite sources as [1], [2], etc.` }
                            ];
                            
                            loadingModal.setStatus(`Generating improved answer...`);
                            currentAnswer = await this.callAIChat(improvedMessages as any);
                        } else {
                            // No clear new queries found, end reflection
                            shouldContinueReflection = false;
                        }
                    }
                }
            }
            
            loadingModal.close();
            
            // Format the answer with source links
            let formattedAnswer = currentAnswer;
            
            // Add footnotes with source information
            formattedAnswer += "\n\n---\n**Sources:**\n";
            const usedSources = new Set<string>();
            
            // Find all source references [1], [2], etc.
            const sourceRefs = currentAnswer.match(/\[\d+\]/g) || [];
            const usedRefs = new Set<string>();
            
            sourceRefs.forEach(ref => {
                usedRefs.add(ref);
            });
            
            // Add all used sources
            Array.from(usedRefs).forEach(ref => {
                const sourceNum = parseInt(ref.replace(/[\[\]]/g, '')) - 1;
                if (sourceNum >= 0 && sourceNum < relevantNotes.length) {
                    const source = relevantNotes[sourceNum];
                    if (!usedSources.has(source.file.path)) {
                        usedSources.add(source.file.path);
                        formattedAnswer += `\n${ref}: [[${source.file.path}|${source.file.basename}]]`;
                    }
                }
            });
            
            // If no sources were explicitly cited, add the most relevant ones
            if (usedSources.size === 0 && relevantNotes.length > 0) {
                formattedAnswer += "\n*Based on:*\n";
                relevantNotes.slice(0, 3).forEach((note, i) => {
                    formattedAnswer += `\n[${i + 1}]: [[${note.file.path}|${note.file.basename}]]`;
                });
            }
            
            // Add metadata about the search process
            formattedAnswer += "\n\n---\n*Query processing: ";
            formattedAnswer += `${reflectionCount} reflection rounds performed.*`;
            
            return formattedAnswer;
            
        } catch (error) {
            console.error("Error in Knowledge Base Q&A:", error);
            loadingModal.close();
            return `Sorry, I encountered an error while searching your knowledge base: ${error.message}`;
        }
    }
}

// Add the PolishResultModal class
export class PolishResultModal extends Modal {
    private originalContent: string;
    private polishedContent: string;
    private onApply: (content: string) => void;
    private plugin: AIPilotPlugin;

    constructor(
        app: App,
        originalContent: string,
        polishedContent: string,
        onApply: (content: string) => void,
        plugin: AIPilotPlugin
    ) {
        super(app);
        this.originalContent = originalContent;
        this.polishedContent = polishedContent;
        this.onApply = onApply;
        this.plugin = plugin;
    }
    
    // Method to generate diff DOM elements with highlighting
    private generateDiffElements(original: string, modified: string): DocumentFragment {
        try {
            // Use the plugin's diff library if available
            if (this.plugin.diffMatchPatchLib) {
                return this.generateWordLevelDiffElements(original, modified);
            }
        } catch (e) {
            console.error("Error using diff-match-patch library:", e);
        }

        // Fallback to a more basic paragraph-level diff
        return this.generateParagraphLevelDiffElements(original, modified);
    }

    // Advanced word-level diff implementation that returns DOM elements
    private generateWordLevelDiffElements(original: string, modified: string): DocumentFragment {
        try {
            // Use the plugin's diff library
            const dmp = new this.plugin.diffMatchPatchLib();
            const diffs = dmp.diff_main(original, modified);
            dmp.diff_cleanupSemantic(diffs);
            
            const fragment = document.createDocumentFragment();
            
            for (const [operation, text] of diffs) {
                const escText = this.plugin.escapeHtml(text);
                
                if (operation === -1) {
                    // Deletion
                    const deletedSpan = document.createElement('span');
                    deletedSpan.className = "polish-deleted";
                    deletedSpan.textContent = text;
                    fragment.appendChild(deletedSpan);
                } else if (operation === 1) {
                    // Addition
                    const addedSpan = document.createElement('span');
                    addedSpan.className = "polish-highlight";
                    addedSpan.textContent = text;
                    fragment.appendChild(addedSpan);
                } else {
                    // Unchanged text
                    fragment.appendChild(document.createTextNode(text));
                }
            }
            
            return fragment;
        } catch (e) {
            console.error("Error in word-level diff:", e);
            return this.generateParagraphLevelDiffElements(original, modified);
        }
    }

    // Basic paragraph-level diff that returns DOM elements
    private generateParagraphLevelDiffElements(original: string, modified: string): DocumentFragment {
        // Split into paragraphs
        const originalParagraphs = original.split('\n');
        const modifiedParagraphs = modified.split('\n');
        
        const fragment = document.createDocumentFragment();
        
        // If extremely different lengths, don't try to diff - just return the modified content
        if (Math.abs(originalParagraphs.length - modifiedParagraphs.length) > originalParagraphs.length * 0.5) {
            fragment.appendChild(document.createTextNode(modified));
            return fragment;
        }
        
        // Use the longer array length to ensure we process all paragraphs
        const maxLength = Math.max(originalParagraphs.length, modifiedParagraphs.length);
        
        for (let i = 0; i < maxLength; i++) {
            const origPara = i < originalParagraphs.length ? originalParagraphs[i] : '';
            const modPara = i < modifiedParagraphs.length ? modifiedParagraphs[i] : '';
            
            if (origPara === modPara) {
                // Identical paragraph
                fragment.appendChild(document.createTextNode(modPara));
            } else if (origPara && !modPara) {
                // Paragraph was deleted
                const deletedSpan = document.createElement('span');
                deletedSpan.className = "polish-deleted";
                deletedSpan.textContent = origPara;
                fragment.appendChild(deletedSpan);
            } else if (!origPara && modPara) {
                // New paragraph was added
                const addedSpan = document.createElement('span');
                addedSpan.className = "polish-highlight";
                addedSpan.textContent = modPara;
                fragment.appendChild(addedSpan);
            } else {
                // Paragraph was modified
                // Show both the deleted and added versions
                const deletedSpan = document.createElement('span');
                deletedSpan.className = "polish-deleted";
                deletedSpan.textContent = origPara;
                fragment.appendChild(deletedSpan);
                
                // Add a line break
                fragment.appendChild(document.createElement('br'));
                
                const addedSpan = document.createElement('span');
                addedSpan.className = "polish-highlight";
                addedSpan.textContent = modPara;
                fragment.appendChild(addedSpan);
            }
            
            // Add a line break between paragraphs (except the last one)
            if (i < maxLength - 1) {
                fragment.appendChild(document.createElement('br'));
            }
        }
        
        return fragment;
    }

    onOpen() {
        const { contentEl } = this;
        
        // Add polish-result-modal class for styling
        contentEl.addClass('polish-result-modal');
        
        // Modal title
        contentEl.createEl("h2", { text: "Polished Result", cls: "polish-header" });
        
        // Description
        contentEl.createEl("p", { 
            text: "The AI has polished your content. You can apply these changes or dismiss them.",
            cls: "polish-description"
        });
        
        // Add legend for diff colors
        const legendContainer = contentEl.createDiv({ cls: "polish-legend" });
        legendContainer.createEl("h3", { text: "Changes Legend:" });
        
        const legendItems = legendContainer.createDiv({ cls: "polish-legend-items" });
        
        const deletedItem = legendItems.createDiv({ cls: "polish-legend-item" });
        const deletedSample = deletedItem.createSpan({ cls: "polish-sample polish-deleted", text: "Deleted text" });
        deletedItem.createSpan({ text: " - Content that has been removed" });
        
        const addedItem = legendItems.createDiv({ cls: "polish-legend-item" });
        const addedSample = addedItem.createSpan({ cls: "polish-sample polish-highlight", text: "Added text" });
        addedItem.createSpan({ text: " - New or modified content" });
        
        // Generate diff between original and polished content
        const diffHtml = this.generateDiffHtml(this.originalContent, this.polishedContent);
        
        // Content display with diff
        const contentContainer = contentEl.createDiv({ cls: "polish-result-container diff-rendered" });
        
        // Use obsidian's dom API instead of innerHTML
        this.renderDiffContent(contentContainer, diffHtml);
        
        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: "polish-button-container" });
        
        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.addEventListener("click", () => {
            this.close();
        });
        
        const applyButton = buttonContainer.createEl("button", { 
            text: "Apply Changes",
            cls: "mod-cta"
        });
        applyButton.addEventListener("click", () => {
            // Clean up the diff markers when applying
            const cleanContent = this.cleanDiffMarkers(this.polishedContent);
            this.onApply(cleanContent);
            this.close();
        });
    }
    
    // Method to clean diff markers from content
    private cleanDiffMarkers(content: string): string {
        // Remove HTML tags from content
        return content
            .replace(/<span class="polish-deleted">.*?<\/span>/g, '')
            .replace(/<span class="polish-highlight">(.*?)<\/span>/g, '$1')
            .replace(/\n\n+/g, '\n\n');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    // Add a new method to render diff content safely
    private renderDiffContent(container: HTMLElement, htmlContent: DocumentFragment) {
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(htmlContent);
        
        // Safely transfer the content
        const fragment = document.createDocumentFragment();
        
        // Process the nodes and create them using Obsidian's API
        Array.from(tempDiv.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                // Text node
                fragment.appendChild(document.createTextNode(node.textContent || ''));
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const elem = node as HTMLElement;
                if (elem.tagName === 'SPAN') {
                    // Handle span elements with classes
                    const span = document.createElement('span');
                    span.className = elem.className;
                    span.textContent = elem.textContent || '';
                    fragment.appendChild(span);
                } else if (elem.tagName === 'BR') {
                    // Handle line breaks
                    fragment.appendChild(document.createElement('br'));
                }
            }
        });
        
        container.appendChild(fragment);
    }

    // Add escapeHtml to the PolishResultModal class
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Add the generateDiffHtml method to PolishResultModal
    private generateDiffHtml(original: string, modified: string): DocumentFragment {
        return this.generateDiffElements(original, modified);
    }
}

class CustomPromptInputModal extends Modal {
    contentEl: HTMLElement;
    onSubmit: (inputPrompt: string) => void;

    constructor(app: App, onSubmit: (inputPrompt: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('modal-content');
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
        const { contentEl } = this;
        contentEl.empty();
    }
}

class FeatureSelectionModal extends Modal {
    plugin: AIPilotPlugin;

    constructor(app: App, plugin: AIPilotPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Select AI Function" });

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        // Create all buttons with consistent styling
        const buttons = [
            { text: "Organize Text", action: () => this.plugin.organizeText() },
            { text: "Check Grammar", action: () => this.plugin.checkGrammar() },
            { text: "Generate Content", action: () => this.plugin.generateAIContent() },
            { text: "Engage in Dialogue", action: () => this.plugin.engageInDialogue() },
            { text: "Search Knowledge Base", action: async () => await this.plugin.searchKnowledgeBase() },
            { text: "Custom Prompt", action: () => this.plugin.handleCustomPrompt() }
        ];

        buttons.forEach(({ text, action }) => {
            const btn = buttonContainer.createEl("button", { 
                text: text,
                cls: 'feature-button'
            });
            btn.onclick = async () => {  // Make onclick async
            this.close();
                await action();  // Await the action
            };
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class LoadingModal extends Modal {
    private progressEl: HTMLElement;
    private statusEl: HTMLElement;
    private countEl: HTMLElement;
    private spinnerEl: HTMLElement;
    private isProgress: boolean;
    private modalTitle: string;

    constructor(app: App, isProgress: boolean = false, modalTitle: string = "") {
        super(app);
        this.isProgress = isProgress;
        this.modalTitle = modalTitle || (isProgress ? "Processing..." : "Processing...");
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        if (this.isProgress) {
            // Progress-style modal (used for batch operations)
            contentEl.addClass('loading-modal');
            contentEl.createEl("h2", { text: this.modalTitle });
            this.statusEl = contentEl.createEl("p", { text: "Initializing..." });
            this.countEl = contentEl.createEl("p", { cls: "count-text" });
            this.progressEl = contentEl.createEl("p", { cls: "progress-text" });
        } else {
            // Simple spinner-style modal (used for single operations)
            contentEl.createEl("h2", { text: this.modalTitle });
            contentEl.createEl("div", { text: "Please wait while the AI processes your text.", cls: "loading-text" });
            this.spinnerEl = contentEl.createDiv({ cls: "spinner" });
            for (let i = 0; i < 3; i++) {
                this.spinnerEl.createDiv({ cls: "bounce" + (i + 1) });
            }
        }
    }

    setProgress(progress: number, current: number, total: number) {
        if (!this.isProgress) return;
        
        const percentage = Math.round(progress * 100);
        this.progressEl.setText(`Progress: ${percentage}%`);
        this.countEl.setText(`Processing file ${current} of ${total}`);
    }

    setStatus(status: string) {
        if (!this.isProgress) return;
        this.statusEl.setText(status);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class AIContentModal extends Modal {
    content: string;
    onApply: (content: string) => void;
    plugin: AIPilotPlugin;
    editor: Editor;
    undoStack: { from: EditorPosition, to: EditorPosition, text: string }[] = [];

    constructor(app: App, plugin: AIPilotPlugin, content: string, editor: Editor, onApply: (content: string) => void) {
        super(app);
        this.plugin = plugin;
        this.content = content;
        this.editor = editor;
        this.onApply = onApply;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "AI Generated Content" });

        const messageContainer = contentEl.createDiv({ cls: 'message-container' });
        const msgDiv = messageContainer.createDiv({ cls: 'ai-message' });
        const sanitizedContent = this.sanitizeContent(this.content);

        await NewMarkdownRenderer.renderMarkdown(sanitizedContent, msgDiv, '', this.plugin);

        // Add hover-only action buttons
        const actionContainer = msgDiv.createDiv({ cls: 'message-actions hover-only' });
        
        // Add copy button as icon only
        const copyBtn = actionContainer.createEl("button", { 
            cls: 'message-action-button copy-button',
            attr: { 'aria-label': 'Copy content' }
        });
        setIcon(copyBtn, 'copy');
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(this.content);
                new Notice("Content copied to clipboard!", 2000);
            } catch (err) {
                console.error("Failed to copy content:", err);
                new Notice("Failed to copy content");
            }
        };

        // Add insert button as icon only
        const insertBtn = actionContainer.createEl("button", { 
            cls: 'message-action-button insert-button',
            attr: { 'aria-label': 'Insert content' }
        });
        setIcon(insertBtn, 'plus');
        insertBtn.onclick = () => {
            if (this.editor) {
                const startPos = this.editor.getCursor();
                const insertedContent = this.content;
                this.editor.replaceRange(insertedContent, startPos);
                const endOffset = this.editor.posToOffset(startPos) + insertedContent.length;
                const endPos = this.editor.offsetToPos(endOffset);
                this.undoStack.push({ from: startPos, to: endPos, text: '' });
                new Notice("Content inserted at cursor position!", 2000);
            } else {
                new Notice("No active editor found.", 2000);
            }
        };
    }

    onClose() {
        this.contentEl.empty();
    }

    // Add this new method to sanitize content
    sanitizeContent(content: string): string {
        return content.split('\n').map(line => {
            if (line.trimStart().startsWith('=')) {
                return '\\' + line;
            }
            return line;
        }).join('\n');
    }
}

class ChatModal extends Modal {
    private messageContainer: HTMLElement | null = null;
    private currentInput: HTMLTextAreaElement | null = null;
    private history: Message[] = [];
    private plugin: AIPilotPlugin;
    private editor: Editor | null;

    constructor(app: App, plugin: AIPilotPlugin, initialHistory: Message[] = [], editor: Editor | null = null) {
        super(app);
        this.plugin = plugin;
        this.history = initialHistory;
        this.editor = editor;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Create chat container
        const chatContainer = contentEl.createDiv({ cls: 'chat-container' });

        // Create message container
        const messageContainer = chatContainer.createDiv({ cls: 'message-container' });
        this.messageContainer = messageContainer;

        // Render chat history
        this.renderChatHistory(messageContainer);

        // Create input container
        const inputContainer = chatContainer.createDiv({ cls: 'input-container' });

        // Create textarea
        const textarea = inputContainer.createEl('textarea', {
            cls: 'chat-input',
            attr: { placeholder: 'Type your message...' }
        });
        this.currentInput = textarea;

        // Create send button
        const sendButton = inputContainer.createEl('button', { cls: 'send-button' });
        setIcon(sendButton, 'paper-plane');
        sendButton.onclick = () => this.handleSend();
    }

    private async handleSend() {
        if (!this.currentInput || !this.currentInput.value.trim()) return;

        const userMessage = this.currentInput.value.trim();
        this.currentInput.value = '';
        
        // Add and render user message
        this.history.push({ role: "user", content: userMessage });
        await this.renderMessage(userMessage, "user");

        try {
            // Create a temporary message element for streaming
            const messageEl = this.messageContainer?.createDiv({ cls: 'message assistant-message' });
            const contentDiv = messageEl?.createDiv({ cls: 'message-content' });
            const textDiv = contentDiv?.createDiv({ cls: 'message-text' });
            
            if (!messageEl || !contentDiv || !textDiv) {
                throw new Error('Failed to create message elements');
            }

            let streamedContent = '';
            
            // Get AI response with streaming updates
            const response = await this.plugin.callAIChat(this.history, async (chunk: string) => {
                streamedContent += chunk;
                await NewMarkdownRenderer.renderMarkdown(streamedContent, textDiv, '', this.plugin);
                
                // Scroll to bottom as content streams in
                if (this.messageContainer && this.messageContainer.scrollHeight) {
                    this.messageContainer.scrollTo({
                        top: this.messageContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            });

            // Add action buttons after streaming is complete
            const actionContainer = messageEl.createDiv({ cls: 'message-actions hover-only' });
            
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
                    new Notice("Failed to copy content", 2000);
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
                    new Notice('Please open a markdown file first', 2000);
                    return;
                }

                const view = activeLeaf.view;
                if (!(view instanceof MarkdownView)) {
                    new Notice('Please open a markdown file first', 2000);
                    return;
                }

                const editor = view.editor;
                const cursor = editor.getCursor();
                editor.replaceRange(response + '\n', cursor);
                editor.focus();
                new Notice('Content inserted into editor', 2000);
            };

            // Add the complete message to history
            this.history.push({ role: 'assistant', content: response });

        } catch (error) {
            console.error('Error in chat:', error);
            new Notice('Error getting AI response: ' + error.message, 2000);
        }
    }

    private async renderMessage(content: string, role: "user" | "assistant") {
        if (!this.messageContainer) return;
        
        const messageEl = this.messageContainer.createDiv({ cls: `message ${role}-message` });
        const contentDiv = messageEl.createDiv({ cls: 'message-content' });
        
        if (role === "assistant") {
            await NewMarkdownRenderer.renderMarkdown(content, contentDiv, '', this.plugin);
            
            // Create button container for message actions
            const actionContainer = messageEl.createDiv({ cls: 'message-actions hover-only' });
            
            // Create copy button with distinct styling
            const copyButton = actionContainer.createEl("button", { cls: 'message-action-button copy-button' });
            setIcon(copyButton, 'copy');
            copyButton.setAttribute('aria-label', 'Copy message');
            copyButton.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(content);
                    new Notice('Copied to clipboard', 2000);
                } catch (err) {
                    console.error("Failed to copy content:", err);
                    new Notice("Failed to copy content", 2000);
                }
            };
            
            // Create insert button with distinct styling
            const insertButton = actionContainer.createEl("button", { cls: 'message-action-button insert-button' });
            setIcon(insertButton, 'plus');
            insertButton.setAttribute('aria-label', 'Insert into editor');
            insertButton.onclick = () => {
                const activeLeaf = this.app.workspace.activeLeaf;
                if (!activeLeaf) {
                    new Notice('Please open a markdown file first', 2000);
                    return;
                }

                const view = activeLeaf.view;
                if (!(view instanceof MarkdownView)) {
                    new Notice('Please open a markdown file first', 2000);
                    return;
                }

                const editor = view.editor;
                const cursor = editor.getCursor();
                editor.replaceRange(content + '\n', cursor);
                editor.focus();
                new Notice('Content inserted into editor', 2000);
            };
        } else {
            contentDiv.setText(content);
        }
        
        // Handle scrolling
        const container = this.messageContainer;
        if (container && container.scrollHeight) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    private async renderChatHistory(container: HTMLElement) {
        container.empty(); // Clear previous messages
        this.messageContainer = container;
        for (const msg of this.history) {
            await this.renderMessage(msg.content, msg.role);
        }
    }
}

class SearchPromptModal extends Modal {
    private result: string | null = null;
    private resolvePromise: (value: string | null) => void = () => {};

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('search-prompt-modal');
        
        contentEl.createEl("h2", { text: "Search Knowledge Base" });
        
        const inputEl = contentEl.createEl("input", {
            type: "text",
            placeholder: "Enter your search query...",
            cls: "search-prompt-input"
        });
        
        const buttonContainer = contentEl.createDiv({ cls: "search-prompt-buttons" });
        
        const searchBtn = buttonContainer.createEl("button", { 
            text: "Search",
            cls: "search-button"
        });
        
        const cancelBtn = buttonContainer.createEl("button", { 
            text: "Cancel",
            cls: "cancel-button"
        });

        // Focus input when modal opens
        inputEl.focus();
        
        searchBtn.onclick = () => {
            this.result = inputEl.value;
            this.close();
        };
        
        cancelBtn.onclick = () => {
            this.result = null;
            this.close();
        };

        // Allow Enter key to submit
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                this.result = inputEl.value;
                this.close();
            }
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this.resolvePromise) {
            this.resolvePromise(this.result);
        }
    }

    async openAndGetValue(): Promise<string | null> {
        this.open();
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }
}

class SummaryModal extends Modal {
    private summary: string;
    private references: Array<{file: TFile, link: string}>;

    constructor(app: App, summary: string, references: Array<{file: TFile, link: string}>) {
        super(app);
        this.summary = summary;
        this.references = references;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('summary-modal');

        // Add summary
        contentEl.createEl('h2', { text: 'Summary' });
        contentEl.createEl('div', { text: this.summary });

        // Add references
        contentEl.createEl('h3', { text: 'References' });
        const refsEl = contentEl.createEl('div', { cls: 'references' });
        
        this.references.forEach((ref, index) => {
            const refLink = refsEl.createEl('div');
            refLink.createEl('span', { text: `[${index + 1}] ` });
            
            const link = refLink.createEl('a', { 
                text: ref.file.basename,
                cls: 'reference-link' 
            });
            
            link.addEventListener('click', async () => {
                const leaf = this.app.workspace.getLeaf(false);
                if (leaf) {
                    await leaf.openFile(ref.file);
                } else {
                    new Notice('Could not open file', 2000);
                }
            });
        });

        // Add button container
        const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });

        const copyButton = buttonContainer.createEl('button', {
            text: 'Copy to clipboard',
            cls: 'mod-cta'
        });

        const insertButton = buttonContainer.createEl('button', { 
            text: 'Insert into current note',
            cls: 'mod-cta'
        });

        copyButton.onclick = async () => {
            try {
                await navigator.clipboard.writeText(this.summary);
                new Notice('Content copied to clipboard!', 2000);
            } catch (err) {
                new Notice('Failed to copy to clipboard', 2000);
                console.error('Copy failed:', err);
            }
        };

        insertButton.onclick = () => {
            this.insertIntoCurrentNote();
        };
    }

    async insertIntoCurrentNote() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('No active markdown file', 2000);
            return;
        }

        const editor = activeView.editor;
        const cursor = editor.getCursor();
        
        // Format the content with references
        let content = this.summary + '\n\n### References\n';
        this.references.forEach((ref, index) => {
            content += `[${index + 1}]: ${ref.link}\n`;
        });

        editor.replaceRange(content, cursor);
        new Notice('Summary inserted', 2000);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ResultModal extends Modal {
    result: string = "";
    
    onClose() {
        // Initialize empty string if result is null
        this.result = this.result || "";
    }
}

class FileReferenceModal extends Modal {
    onOpen() {
        const { contentEl } = this;
        if (!contentEl) return;
        
        contentEl.empty();
        // ... rest of the method
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

class SearchResultsModal extends Modal {
    constructor(app: App, private results: { file: TFile; similarity: number, content?: string }[], private query?: string) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('search-results-modal');
        
        // Extract the query from the constructor or get it from the search input
        let query = this.query;
        if (!query) {
            const searchInput = document.querySelector('.search-prompt-input') as HTMLInputElement;
            query = searchInput ? searchInput.value.trim() : '';
        }
        
        contentEl.createEl('h2', { text: 'Search Results' });
        
        // Check if we have full content results or just similarity scores
        const hasContent = this.results.length > 0 && this.results[0].content !== undefined;
        
        if (hasContent) {
            // Create main results container
            const resultsContainer = contentEl.createDiv({ cls: 'search-full-results' });
            
            // Format content for display
            const contentItems = this.results.map((result, index) => {
                return {
                    file: result.file,
                    similarity: result.similarity,
                    content: result.content || ''
                };
            });
            
            // 1. Display the question
            const questionDiv = resultsContainer.createDiv({ cls: "search-question" });
            questionDiv.createEl('h3', { text: 'Question' });
            questionDiv.createEl('p', { text: query || 'Unknown query' });
            
            // 2. Display content in a simple format
            const contentDiv = resultsContainer.createDiv({ cls: "search-content" });
            
            // Simple language detection
            const detectLanguage = (text: string): string => {
                const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
                const totalChars = text.length;
                return chineseCharCount / totalChars > 0.15 ? 'chinese' : 'english';
            };
            
            // Primary language detection from all content
            let allContentText = '';
            contentItems.forEach((item, index) => {
                allContentText += item.content;
            });
            const primaryLanguage = detectLanguage(allContentText);
            
            // Display header
            contentDiv.createEl('h3', { text: primaryLanguage === 'chinese' ? '内容' : 'Content' });
            
            // Create content entries for each result
            contentItems.forEach((item, index) => {
                const docDiv = contentDiv.createDiv({ cls: 'search-result-document' });
                
                // Document header
                docDiv.createEl('h4', { 
                    text: `${primaryLanguage === 'chinese' ? '文档' : 'Document'} ${index + 1}: ${item.file.basename}`,
                    cls: 'search-result-document-title' 
                });
                
                // Document content in pre-formatted text
                const contentTextEl = docDiv.createEl('pre', { 
                    cls: 'search-result-document-content',
                    text: item.content 
                });
                
                // Add divider except for last item
                if (index < contentItems.length - 1) {
                    contentDiv.createEl('hr');
                }
            });
            
            // 3. Add references with more details
            const refsDiv = resultsContainer.createDiv({ cls: "search-references" });
            refsDiv.createEl('h3', { text: primaryLanguage === 'chinese' ? '参考资料' : 'References' });
            
            contentItems.forEach((result, index) => {
                const refDiv = refsDiv.createDiv({ cls: 'search-reference-item' });
                
                // Create clickable title
                const link = refDiv.createEl('a', {
                    text: `[${index + 1}] ${result.file.basename}`,
                    cls: 'search-reference-link'
                });
                
                // Add file metadata
                const metaDiv = refDiv.createDiv({ cls: 'search-reference-meta' });
                metaDiv.createEl('span', { 
                    text: `Path: ${result.file.path} • ${result.file.extension.toUpperCase()} • Relevance: ${(result.similarity * 100).toFixed(1)}%` 
                });
                
                // Add click handler to open the file
                link.addEventListener('click', async () => {
                    const leaf = this.app.workspace.getLeaf(false);
                    if (leaf && result.file) {
                        try {
                            await leaf.openFile(result.file);
                            this.close(); // Close the modal after opening the file
                        } catch (error) {
                            console.error('Error opening file:', error);
                            new Notice('Failed to open file', 2000);
                        }
                    } else {
                        new Notice('Could not open file', 2000);
                    }
                });
            });
        } else {
            // Display simple results list (legacy mode)
            const resultsContainer = contentEl.createDiv({ cls: 'results-container' });
            
            this.results.forEach((result) => {
                const resultEl = resultsContainer.createDiv({ cls: 'result-item' });
                resultEl.createEl('span', { text: `${result.file.basename} - Similarity: ${result.similarity.toFixed(2)}` });
                
                resultEl.addEventListener('click', async () => {
                    const leaf = this.app.workspace.getLeaf(false);
                    if (leaf && result.file) {
                        try {
                            await leaf.openFile(result.file);
                        } catch (error) {
                            console.error('Error opening file:', error);
                            new Notice('Failed to open file', 2000);
                        }
                    } else {
                        new Notice('Could not open file', 2000);
                    }
                });
            });
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class AIPilotSettingTab extends PluginSettingTab {
    plugin: AIPilotPlugin;

    constructor(app: App, plugin: AIPilotPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        
        // Model Configuration Section - Moved to top since it's now the primary configuration method
        containerEl.createEl('h2', { text: 'AI Model Configuration' });
        
        // Add explanation text
        containerEl.createEl('p', {
            text: 'Configure your AI models to use with the plugin. All API keys are now managed here.',
            cls: 'setting-item-description'
        });
        
        containerEl.createEl('div', {
            text: 'The plugin has migrated to a multi-model system. Add models below to use them with the plugin.',
            cls: 'model-migration-notice'
        });
        
        new Setting(containerEl)
          .setName('AI Models')
          .setDesc('Add, edit, or remove AI models')
          .addButton(button => button
            .setButtonText('Add Model')
            .setCta()
            .onClick(() => {
              this.openModelConfigModal();
            }));
        
        // Display existing models
        const modelsContainer = containerEl.createDiv({ cls: 'models-container' });
        this.renderModelsList(modelsContainer);
        
        // Embedding Configuration Section
        containerEl.createEl('h2', { text: 'Embedding Configuration' });
        containerEl.createEl('p', { 
            text: 'Configure the embedding model used for knowledge base search and similar content features.',
            cls: 'setting-item-description'
        });
        
        // Initialize embedding config if needed
        if (!this.plugin.settings.embeddingConfig) {
            this.plugin.settings.embeddingConfig = {
                modelName: "text-embedding-3-small",
                provider: "openai",
                dimensions: 1536
            };
        }
        
        const embeddingConfig = this.plugin.settings.embeddingConfig;
        
        new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Select the provider for embeddings')
            .addDropdown(dropdown => dropdown
                .addOption('openai', 'OpenAI')
                .addOption('zhipuai', 'Zhipu AI')
                .addOption('custom', 'Custom API')
                .setValue(embeddingConfig.provider)
                .onChange(async (value: 'openai' | 'zhipuai' | 'custom') => {
                    embeddingConfig.provider = value;
                    
                    // Set appropriate default model names based on provider
                    if (value === 'openai' && !embeddingConfig.modelName) {
                        embeddingConfig.modelName = 'text-embedding-3-small';
                    } else if (value === 'zhipuai' && !embeddingConfig.modelName) {
                        embeddingConfig.modelName = 'embedding-3';
                    }
                    
                    await this.plugin.saveSettings();
                    this.plugin.modelManager.updateEmbeddingConfig(embeddingConfig);
                    this.display(); // Refresh to show relevant fields
                }));
        
        new Setting(containerEl)
            .setName('Embedding Model')
            .setDesc('The model to use for generating embeddings')
            .addText(text => {
                const placeholder = embeddingConfig.provider === 'openai' 
                    ? 'e.g., text-embedding-3-small' 
                    : embeddingConfig.provider === 'zhipuai'
                        ? 'e.g., embedding-3'
                        : 'Embedding model name';
                
                text
                    .setPlaceholder(placeholder)
                    .setValue(embeddingConfig.modelName)
                    .onChange(async (value) => {
                        embeddingConfig.modelName = value;
                        await this.plugin.saveSettings();
                        this.plugin.modelManager.updateEmbeddingConfig(embeddingConfig);
                    });
            });
        
        // Only show dimensions for certain providers
        if (embeddingConfig.provider === 'zhipuai' || embeddingConfig.provider === 'custom') {
            new Setting(containerEl)
                .setName('Embedding Dimensions')
                .setDesc('Number of dimensions for the embedding vectors (leave empty to use default)')
                .addText(text => text
                    .setPlaceholder('e.g., 1024')
                    .setValue(embeddingConfig.dimensions?.toString() || '')
                    .onChange(async (value) => {
                        const dimensions = parseInt(value);
                        embeddingConfig.dimensions = isNaN(dimensions) ? undefined : dimensions;
                        await this.plugin.saveSettings();
                        this.plugin.modelManager.updateEmbeddingConfig(embeddingConfig);
                    })
                );
        }
        
        // Custom API settings
        if (embeddingConfig.provider === 'custom') {
            new Setting(containerEl)
                .setName('API Endpoint URL')
                .setDesc('The URL for the custom embedding API')
                .addText(text => text
                    .setPlaceholder('https://api.example.com/embeddings')
                    .setValue(embeddingConfig.baseUrl || '')
                    .onChange(async (value) => {
                        embeddingConfig.baseUrl = value;
                        await this.plugin.saveSettings();
                        this.plugin.modelManager.updateEmbeddingConfig(embeddingConfig);
                    })
                );
                
            new Setting(containerEl)
                .setName('API Key')
                .setDesc('Optional: Use a separate API key for embedding calls')
                .addText(text => text
                    .setPlaceholder('Enter API key')
                    .setValue(embeddingConfig.apiKey || '')
                    .onChange(async (value) => {
                        embeddingConfig.apiKey = value;
                        await this.plugin.saveSettings();
                        this.plugin.modelManager.updateEmbeddingConfig(embeddingConfig);
                    })
                    .inputEl.setAttribute('type', 'password')
                );
        }
        
        new Setting(containerEl)
            .setName('Use Proxy for Embeddings')
            .setDesc('Override global proxy settings for embedding requests')
            .addToggle(toggle => toggle
                .setValue(embeddingConfig.useProxy || false)
                .onChange(async (value) => {
                    embeddingConfig.useProxy = value;
                    await this.plugin.saveSettings();
                    this.plugin.modelManager.updateEmbeddingConfig(embeddingConfig);
                })
            );
        
        // Chat History Section
        containerEl.createEl('h2', { text: 'Chat History' });
        
        new Setting(containerEl)
            .setName('Chat History Path')
            .setDesc('Path to store chat history files (relative to vault)')
            .addText(text => text
                .setPlaceholder('AI_ChatHistory')
                .setValue(this.plugin.settings.chatHistoryPath)
                .onChange(async (value) => {
                    this.plugin.settings.chatHistoryPath = value;
                    await this.plugin.saveSettings();
                }));
        
        // Functions Section
        containerEl.createEl('h2', { text: 'Functions' });
        containerEl.createEl('p', { 
            text: 'Configure all available functions that appear as icons in the chat view.',
            cls: 'setting-item-description'
        });
        
        // Initialize functions array if needed
        if (!this.plugin.settings.functions) {
            this.plugin.settings.functions = [];
        }

        // Add default functions if array is empty
        if (this.plugin.settings.functions.length === 0 && DEFAULT_SETTINGS.functions) {
            this.plugin.settings.functions = [...DEFAULT_SETTINGS.functions];
            
            // Copy any custom functions
            if (this.plugin.settings.customFunctions && this.plugin.settings.customFunctions.length > 0) {
                this.plugin.settings.functions.push(...this.plugin.settings.customFunctions);
            }
        }
        
        // Migrate prompts to functions
        this.migratePromptsToFunctions();
        
        // Display all functions
        const functionsContainer = containerEl.createDiv({ cls: 'functions-container' });
        this.displayFunctions(functionsContainer);
        
        // Add a button to create a new custom function
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Add New Function')
                .setCta()
                .onClick(() => {
                    // Create a new default CustomFunction object instead of passing null
                    const newCustomFunc: CustomFunction = {
                        name: '',
                        icon: 'star',
                        prompt: '',
                        tooltip: '',
                        isBuiltIn: false
                    };
                    
                    new CustomFunctionModal(this.app, newCustomFunc, async (customFunc) => {
                        // Add to unified functions array
                        this.plugin.settings.functions.push(customFunc);
                        
                        // Also add to customFunctions for backward compatibility
                        if (!this.plugin.settings.customFunctions) {
                            this.plugin.settings.customFunctions = [];
                        }
                        this.plugin.settings.customFunctions.push(customFunc);
                        
                        await this.plugin.saveSettings();
                        this.display(); // Refresh display
                    }).open();
                }));
        
        // Proxy Configuration Section
        containerEl.createEl('h2', { text: 'Network Proxy Configuration' });
        
        const proxyConfig = this.plugin.settings.proxyConfig;
        
        new Setting(containerEl)
          .setName('Enable Proxy')
          .setDesc('Use a proxy for all API requests to LLM providers')
          .addToggle(toggle => toggle
            .setValue(proxyConfig.enabled)
            .onChange(async (value) => {
              proxyConfig.enabled = value;
              await this.plugin.saveSettings();
              this.plugin.modelManager.updateProxyConfig(proxyConfig);
            }));
        
        if (proxyConfig.enabled) {
          new Setting(containerEl)
            .setName('Proxy Type')
            .setDesc('Select the type of proxy to use')
            .addDropdown(dropdown => dropdown
              .addOption('http', 'HTTP')
              .addOption('https', 'HTTPS')
              .addOption('socks5', 'SOCKS5')
              .setValue(proxyConfig.type)
              .onChange(async (value: 'http' | 'https' | 'socks5') => {
                proxyConfig.type = value;
                await this.plugin.saveSettings();
                this.plugin.modelManager.updateProxyConfig(proxyConfig);
              }));
          
          new Setting(containerEl)
            .setName('Proxy Address')
            .setDesc('Enter the proxy server address')
            .addText(text => text
              .setPlaceholder('127.0.0.1')
              .setValue(proxyConfig.address)
              .onChange(async (value) => {
                proxyConfig.address = value;
                await this.plugin.saveSettings();
                this.plugin.modelManager.updateProxyConfig(proxyConfig);
              }));
          
          new Setting(containerEl)
            .setName('Proxy Port')
            .setDesc('Enter the proxy server port')
            .addText(text => text
              .setPlaceholder('8080')
              .setValue(proxyConfig.port)
              .onChange(async (value) => {
                proxyConfig.port = value;
                await this.plugin.saveSettings();
                this.plugin.modelManager.updateProxyConfig(proxyConfig);
              }));
          
          new Setting(containerEl)
            .setName('Requires Authentication')
            .setDesc('Does your proxy require username/password authentication?')
            .addToggle(toggle => toggle
              .setValue(proxyConfig.requiresAuth)
              .onChange(async (value) => {
                proxyConfig.requiresAuth = value;
                await this.plugin.saveSettings();
                this.plugin.modelManager.updateProxyConfig(proxyConfig);
                this.display(); // Refresh the display to show/hide auth fields
              }));
          
          if (proxyConfig.requiresAuth) {
            new Setting(containerEl)
              .setName('Proxy Username')
              .addText(text => text
                .setValue(proxyConfig.username || '')
                .onChange(async (value) => {
                  proxyConfig.username = value;
                  await this.plugin.saveSettings();
                  this.plugin.modelManager.updateProxyConfig(proxyConfig);
                }));
            
            new Setting(containerEl)
              .setName('Proxy Password')
              .addText(text => {
                const passwordInput = text
                  .setPlaceholder('password')
                  .setValue(proxyConfig.password || '')
                  .onChange(async (value) => {
                    proxyConfig.password = value;
                    await this.plugin.saveSettings();
                    this.plugin.modelManager.updateProxyConfig(proxyConfig);
                  });
                
                // Directly set the type attribute on the input element
                passwordInput.inputEl.setAttribute('type', 'password');
                
                return passwordInput;
              });
          }
        }
        
        // ... other settings ...
    }
    
    // Add to AIPilotSettingTab class
    
    private migratePromptsToFunctions() {
        // Legacy prompt migration - already handled when missing functions array is detected
        if (!this.plugin.settings.functions) {
            this.plugin.settings.functions = [];
        }
    }
    
    private displayFunctions(container: HTMLElement) {
        container.empty();
        
        if (!this.plugin.settings.functions || this.plugin.settings.functions.length === 0) {
            container.createEl('p', {
                text: 'No functions defined. Click "Add Custom Function" below to create one.',
                cls: 'no-functions'
            });
            return;
        }
        
        // Display built-in functions first
        const builtInFunctions = this.plugin.settings.functions.filter(f => f.isBuiltIn);
        const customFunctions = this.plugin.settings.functions.filter(f => !f.isBuiltIn);
        
        if (builtInFunctions.length > 0) {
            const builtInSection = container.createDiv({ cls: 'function-section' });
            builtInSection.createEl('h3', { text: 'Built-in Functions' });
            
            for (const func of builtInFunctions) {
                this.createFunctionItem(builtInSection, func, true);
            }
        }
        
        if (customFunctions.length > 0) {
            const customSection = container.createDiv({ cls: 'function-section' });
            customSection.createEl('h3', { text: 'Custom Functions' });
            
            for (const func of customFunctions) {
                this.createFunctionItem(customSection, func, false);
            }
        }
        
        // Add "Add Custom Function" button
        const addButtonContainer = container.createDiv({ cls: 'add-function-container' });
        const addButton = addButtonContainer.createEl('button', {
            text: 'Add Custom Function',
            cls: 'add-function-button'
        });
        
        addButton.addEventListener('click', () => {
            // Create a new function using the modal
            const newCustomFunc: CustomFunction = {
                name: '',
                icon: 'star',
                prompt: '',
                tooltip: '',
                isBuiltIn: false
            };
            
            new CustomFunctionModal(this.app, newCustomFunc, async (updatedFunc) => {
                // Add the new function
                this.plugin.settings.functions.push(updatedFunc);
                await this.plugin.saveSettings();
                this.displayFunctions(container); // Refresh the list
            }).open();
        });
    }
    
    private createFunctionItem(container: HTMLElement, func: CustomFunction, isBuiltIn: boolean) {
        const funcItem = container.createDiv({ 
            cls: `function-item ${isBuiltIn ? 'built-in' : 'custom'}`
        });
        
        const preview = funcItem.createDiv({ cls: 'function-preview' });
        const iconEl = preview.createDiv({ cls: 'function-icon' });
        setIcon(iconEl, func.icon || 'star');
        
        preview.createEl('span', { 
            text: func.name,
            cls: 'function-name'
        });
        
        if (func.tooltip) {
            preview.createEl('span', { 
                text: func.tooltip,
                cls: 'function-tooltip'
            });
        }
        
        const actions = funcItem.createDiv({ cls: 'function-actions' });
        
        // Edit button
        const editBtn = actions.createEl('button', { cls: 'function-edit' });
        setIcon(editBtn, 'edit');
        editBtn.onclick = () => {
            new CustomFunctionModal(this.app, func, async (updatedFunc) => {
                // Find and update the function
                const index = this.plugin.settings.functions.findIndex(f => 
                    f.name === func.name && f.isBuiltIn === isBuiltIn);
                
                if (index !== -1) {
                    this.plugin.settings.functions[index] = updatedFunc;
                    await this.plugin.saveSettings();
                    this.displayFunctions(container.parentElement as HTMLElement); // Ensure it's an HTMLElement
                }
            }).open();
        };
        
        // Only allow deleting custom functions
        if (!isBuiltIn) {
            const deleteBtn = actions.createEl('button', { cls: 'function-delete' });
            setIcon(deleteBtn, 'trash');
            deleteBtn.onclick = async () => {
                // Confirm deletion
                const confirmModal = new ConfirmModal(this.app, 
                    `Are you sure you want to delete the "${func.name}" function?`,
                    async () => {
                        // Remove the function
                        this.plugin.settings.functions = this.plugin.settings.functions
                            .filter(f => !(f.name === func.name && !f.isBuiltIn));
                        
                        await this.plugin.saveSettings();
                        this.displayFunctions(container.parentElement as HTMLElement); // Ensure it's an HTMLElement
                    }
                );
                confirmModal.open();
            };
        }
    }
    
    private openModelConfigModal(existingModel?: LLMModelConfig) {
        // Create a new ModelConfigModal with correct parameter types
        const modal = new ModelConfigModal(
            this.app,
            existingModel || null, // Use null when existingModel is undefined
            (updatedModel: LLMModelConfig) => {
                // Handle the updated model
                if (existingModel) {
                    // Find and update the existing model
                    const index = this.plugin.settings.models.findIndex(m => m.id === existingModel.id);
                    if (index !== -1) {
                        this.plugin.settings.models[index] = updatedModel;
                    }
                } else {
                    // Add the new model
                    this.plugin.settings.models.push(updatedModel);
                }
                
                // Save settings and update the models list
                this.plugin.saveSettings().then(() => {
                    const container = document.querySelector('.models-container');
                    if (container) {
                        this.renderModelsList(container);
                    }
                });
            }
        );
        
        modal.open();
    }
    
    private renderModelsList(container: Element | null) {
        if (!container) return;
        
        // Cast to HTMLElement since we know it's an HTMLElement
        const htmlContainer = container as HTMLElement;
        htmlContainer.empty();
        
        const models = this.plugin.settings.models || [];
        
        if (models.length === 0) {
            htmlContainer.createEl('div', {
                text: 'No models configured. Click "Add Model" to configure a new model.',
                cls: 'no-models-message'
            });
            return;
        }
        
        for (const model of models) {
            const modelItem = htmlContainer.createDiv({ cls: 'model-item' });
            
            const modelInfo = modelItem.createDiv({ cls: 'model-info' });
            const titleEl = modelInfo.createEl('h3');
            titleEl.createSpan({ text: model.name });
            
            if (model.isDefault) {
                titleEl.createSpan({ 
                    text: ' (Default)',
                    cls: 'model-default-tag'
                });
                modelItem.addClass('model-default');
            }
            
            const modelMeta = modelInfo.createDiv({ cls: 'model-meta' });
            modelMeta.createSpan({ text: `Type: ${model.type}` });
            
            if (model.modelName) {
                modelMeta.createSpan({ text: ` • Model: ${model.modelName}` });
            }
            
            if (model.active) {
                modelMeta.createSpan({ 
                    text: ' • Active',
                    cls: 'model-active-indicator'
                });
            }
            
            const modelActions = modelItem.createDiv({ cls: 'model-actions' });
            
            // Set as default button (only if not already default)
            if (!model.isDefault) {
                const defaultBtn = modelActions.createEl('button', {
                    text: 'Set Default',
                    cls: 'model-default-btn'
                });
                defaultBtn.onclick = async () => {
                    // Set this model as default and unset others
                    this.plugin.settings.models.forEach(m => {
                        m.isDefault = (m.id === model.id);
                    });
                    
                    await this.plugin.saveSettings();
                    this.renderModelsList(container); // Refresh the list
                };
            }
            
            // Edit button
            const editBtn = modelActions.createEl('button', {
                text: 'Edit',
                cls: 'model-edit'
            });
            editBtn.onclick = () => {
                this.openModelConfigModal(model);
            };
            
            // Delete button
            const deleteBtn = modelActions.createEl('button', {
                text: 'Delete',
                cls: 'model-delete'
            });
            deleteBtn.onclick = async () => {
                const confirmModal = new ConfirmModal(this.app, 
                    `Are you sure you want to delete the "${model.name}" model?`,
                    async () => {
                        // Remove the model
                        this.plugin.settings.models = this.plugin.settings.models
                            .filter(m => m.id !== model.id);
                        
                        await this.plugin.saveSettings();
                        this.renderModelsList(container); // Refresh the list
                    }
                );
                confirmModal.open();
            };
        }
    }
}

// Add this before the AIPilotSettingTab class definition
class CustomFunctionModal extends Modal {
    private plugin: AIPilotPlugin;
    private customFunc: CustomFunction;
    private onSubmit: (func: CustomFunction) => void;
    
    constructor(
        app: App,
        customFunc?: CustomFunction,
        onSubmit?: (func: CustomFunction) => void
    ) {
        super(app);
        // Get plugin from constructor instead of app.plugins
        this.plugin = (app as any).plugins?.getPlugin("ai-pilot") || null;
        this.customFunc = customFunc || {
            name: "",
            icon: "star",
            tooltip: "",
            prompt: "",
            isBuiltIn: false
        };
        this.onSubmit = onSubmit || (() => {});
    }
    
    onOpen() {
        const { contentEl } = this;
        
        // Modal title
        contentEl.createEl("h2", { text: this.customFunc.name ? "Edit Function" : "Create Function" });
        
        // Function name
        contentEl.createEl("label", { text: "Function Name (required)", cls: "setting-item-label" });
        const nameInput = contentEl.createEl("input", {
            type: "text",
            value: this.customFunc.name,
            cls: "setting-item-input"
        });
        
        // Function icon
        contentEl.createEl("label", { text: "Icon", cls: "setting-item-label" });
        const iconInput = contentEl.createEl("input", {
            type: "text",
            value: this.customFunc.icon || "star",
            cls: "setting-item-input",
            placeholder: "Obsidian icon name (e.g. star, brain, pencil)"
        });
        
        // Preview icon
        const iconPreview = contentEl.createDiv({ cls: "icon-preview" });
        const updateIconPreview = () => {
            iconPreview.empty();
            setIcon(iconPreview, iconInput.value || "star");
        };
        updateIconPreview();
        
        iconInput.addEventListener("input", updateIconPreview);
        
        // Function tooltip
        contentEl.createEl("label", { text: "Tooltip", cls: "setting-item-label" });
        const tooltipInput = contentEl.createEl("input", {
            type: "text",
            value: this.customFunc.tooltip || "",
            cls: "setting-item-input",
            placeholder: "Briefly describe what this function does"
        });
        
        // Prompt template
        contentEl.createEl("label", { text: "Prompt Template (required)", cls: "setting-item-label" });
        contentEl.createEl("p", { 
            text: "Use {{content}} to reference the selected text.",
            cls: "setting-item-description"
        });
        
        const promptInput = contentEl.createEl("textarea", {
            cls: "setting-item-textarea",
            value: this.customFunc.prompt || "",
            placeholder: "Enter your prompt template here. Use {{content}} to reference the selected text."
        });
        promptInput.style.height = "150px";
        
        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: "button-container" });
        
        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.addEventListener("click", () => {
            this.close();
        });
        
        const submitButton = buttonContainer.createEl("button", { 
            text: this.customFunc.name ? "Save" : "Create",
            cls: "mod-cta"
        });
        submitButton.addEventListener("click", () => {
            // Validate inputs
            if (!nameInput.value.trim()) {
                new Notice("Function name is required");
                return;
            }
            
            if (!promptInput.value.trim()) {
                new Notice("Prompt template is required");
                return;
            }
            
            // Update custom function
            const updatedFunc: CustomFunction = {
                name: nameInput.value.trim(),
                icon: iconInput.value.trim() || "star",
                prompt: promptInput.value.trim(),
                tooltip: tooltipInput.value.trim(),
                isBuiltIn: this.customFunc.isBuiltIn || false
            };
            
            this.onSubmit(updatedFunc);
            this.close();
        });
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
    
    