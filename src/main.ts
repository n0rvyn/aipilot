// main.ts

// Import styles directly to ensure they're included in the build
import './styles.css';

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
    View,
    Vault
} from "obsidian";

// CSS styles are loaded via manifest.json
import { ChatView, VIEW_TYPE_CHAT } from './ChatView';
import { MarkdownRenderer as NewMarkdownRenderer } from './MarkdownRenderer';
import { ModelManager, ModelConfig as LLMModelConfig, ProxyConfig, EmbeddingModelConfig } from './models/ModelManager';
import { DebatePanel, DEBATE_VIEW_TYPE } from './debate/DebatePanel';
import { AgentDebateEngine, DebateConfig } from './debate/AgentDebateEngine';
import { ModelConfigModal } from './models/ModelConfigModal';
import { EmbeddingModelConfigModal } from './models/EmbeddingModelConfigModal';
import { addAllIcons } from './icons';

// Import RAG service
import { createRAGService, RAGService } from './rag';
import { KnowledgeBaseView, KNOWLEDGE_BASE_VIEW_TYPE } from './KnowledgeBaseView';

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

// Type for messages in chat
interface Message {
    role: "user" | "assistant";
    content: string;
}

// Model configuration interface
interface ModelConfig {
    maxTokens: number;
    description: string;
    isAIR?: boolean;
}

// Search result with content
interface SearchResultWithContent {
    file: TFile;
    similarity: number;
    content: string;
}

// ZhipuAI models configuration
const ZHIPUAI_MODELS = {
    CHAT: {
        'GLM-3-Turbo': { maxTokens: 8192, description: "Fast, efficient for general tasks" },
        'GLM-4': { maxTokens: 32768, description: "Advanced reasoning and analysis" },
        'GLM-4-Air': { maxTokens: 8192, description: "Advanced reasoning and analysis", isAIR: true },
        'GLM-4-Long': { maxTokens: 32768, description: "Long context support" }
    } as Record<string, ModelConfig>,
    EMBEDDING: {
        'embedding-2': { maxTokens: 512, dimensions: null as number | null },
        'embedding-3': { maxTokens: 3072, dimensions: 1024 }
    }
};

// Plugin settings interface
interface AIPilotPluginSettings {
    apiKey: string;
    model: string;
    provider: 'zhipuai' | 'openai' | 'custom' | 'ollama' | 'claude' | 'zhipu' | 'baidu';
    knowledgeBasePath: string;
    promptOrganize: string;
    promptCheckGrammar: string;
    promptGenerateContent: string;
    promptDialogue: string;
    chatModel: keyof typeof ZHIPUAI_MODELS.CHAT;
    promptSummary: string;
    customFunctions: CustomFunction[];
    functions: CustomFunction[];
    chatHistoryPath: string;
    editorModeEnabled: boolean;
    models: LLMModelConfig[];
    embeddingModels: EmbeddingModelConfig[]; // New field for embedding models
    proxyConfig: ProxyConfig;
    debateConfigs: DebateConfig[];
    requestId?: string;
    secretKey?: string;
    saveMemory?: boolean;
    embeddingsInChunks?: boolean;
    embeddingChunkSize?: number;
    embeddingChunkOverlap?: number;
}

// Default settings
export const DEFAULT_SETTINGS: AIPilotPluginSettings = {
    apiKey: '',
    model: 'gpt-4',
    provider: 'openai',
    knowledgeBasePath: 'AI_KnowledgeBase',
    promptOrganize: 'Please organize the content of the following article logically, following an introduction-body-conclusion structure. Use Markdown format, ensuring a smooth flow between sections. Output in the same language as the input text:\n1. Use `#` and `##` for main and secondary headings, marking primary sections and sub-sections, respectively.\n2. If appropriate, divide content into list form or use block quotes (`>`) to present specific points.\n3. Avoid repetitive content, highlight key information, and ensure the article structure is clearer and easier to read.\n4. Summarize the core points of the article in the conclusion.\n5. Do not include any lines that start with "=".\nHere is the content that needs to be organized:',
    promptCheckGrammar: 'Please check the grammar, typos, and punctuation in the following text. Never delete any content, and provide the corrected text in the same language. For any errors in the original text, please list them at the end of the corrected version:',
    promptGenerateContent: 'Generate content based on the following prompt, maintaining the same language as the prompt: ',
    promptDialogue: 'Engage in a Socratic dialogue based on the following text, using the same language as the input: ',
    chatModel: 'GLM-4',
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
    embeddingModels: [
        {
            id: 'default-openai-embedding',
            name: 'OpenAI Embedding 3',
            type: 'openai',
            modelName: 'text-embedding-3-small',
            active: true,
            description: 'Default OpenAI embedding model'
        }
    ],
    proxyConfig: {
        enabled: false,
        address: "",
        port: "",
        type: "http",
        requiresAuth: false
    },
    debateConfigs: [],
    models: [],
    requestId: '',
    secretKey: '',
    saveMemory: false,
    embeddingsInChunks: true,
    embeddingChunkSize: 1000,
    embeddingChunkOverlap: 200
};

// Token limits for different models
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

// Utility functions for encryption/decryption
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

// Add getIcon helper function at the top of the file where other utility functions are defined
// This extracts the SVG content from an icon
function getIcon(iconName: string): string | null {
    try {
        const tempEl = document.createElement('div');
        
        // Use Obsidian's setIcon on the temp element
        setIcon(tempEl, iconName);
        
        // Instead of returning innerHTML, create a properly cloned DOM element
        const svgElement = tempEl.firstElementChild;
        return svgElement ? svgElement.outerHTML : null;
    } catch (e) {
        console.error(`Failed to get icon: ${iconName}`, e);
        return null;
    }
}

// Main plugin class
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
    ragService: RAGService;

    constructor(app: App, manifest: any) {
        super(app, manifest);
        this.app = app;
    }

    async onload() {
        console.log('Loading AIPilot plugin');
        
        // Remove the manual styles loading as we're now properly importing CSS
        // and extracting it to a separate file
        // this.loadStyles();
        
        await this.loadSettings();
        
        // Migrate legacy API key to models system if needed
        this.migrateLegacyAPIKey();
        
        // Migrate legacy embedding configuration
        this.migrateEmbeddingConfig();
        
        // Now initialize ModelManager with settings that are loaded
        this.modelManager = new ModelManager(
            this,
            this.settings.models || [],
            this.settings.embeddingModels || [
                {
                    id: 'default-openai-embedding',
                    name: 'OpenAI Embedding 3',
                    type: 'openai',
                    modelName: 'text-embedding-3-small',
                    active: true,
                    description: 'Default OpenAI embedding model'
                }
            ],
            this.settings.proxyConfig,
            async () => {
                await this.saveSettings();
            }
        );

        // Load the diff-match-patch library if needed
        await this.loadDiffMatchPatchLibrary();
        
        // Load icons
        addAllIcons();
        
        // Register all three main views
        // 1. Register Chat View
        this.registerView(
            VIEW_TYPE_CHAT,
            (leaf: WorkspaceLeaf) => new ChatView(leaf, this, this.modelManager)
        );

        // 2. Register Knowledge Base View
        this.registerView(
            KNOWLEDGE_BASE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new KnowledgeBaseView(leaf, this)
        );
        
        // 3. Register the Debate view
        this.registerView(
            DEBATE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new DebatePanel(leaf, this.modelManager)
        );
        
        // Add ribbon icons for each feature with descriptive labels
        // 1. Chat feature ribbon icon
        this.addRibbonIcon("message-square", "AI Chat & Writing Assistant", () => {
            this.activateView();
        });

        // 2. Knowledge Base feature ribbon icon
        this.addRibbonIcon("search", "AI Knowledge Base", () => {
            this.activateKnowledgeBaseView();
        });

        // 3. Debate feature ribbon icon
        this.addRibbonIcon("brain-cog", "AI Agent Debate", () => {
            this.activateDebateView();
        });
        
        // Add commands for each feature
        this.addCommand({
            id: 'open-chat-view',
            name: 'Open AI Chat & Writing Assistant',
            callback: () => this.activateView()
        });

        this.addCommand({
            id: 'open-kb-view',
            name: 'Open AI Knowledge Base',
            callback: () => this.activateKnowledgeBaseView()
        });
        
        this.addCommand({
            id: 'open-debate-panel',
            name: 'Open AI Agent Debate',
            callback: () => this.activateDebateView()
        });

        // Add editor commands
        this.addCommands();
        
        // Add settings tab
        this.addSettingTab(new AIPilotSettingTab(this.app, this));
        
        // Initialize request ID
        this.initializeRequestId();

        // Initialize the RAG service
        this.ragService = createRAGService(this.app, this, this.settings);
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

    migrateLegacyAPIKey(): void {
        // If we have an API key but no models, create a default model
        if (this.settings.apiKey && this.settings.model && 
            (!this.settings.models || this.settings.models.length === 0)) {
            
            console.log("Migrating legacy API key to models system");
            this.settings.models.push({
                name: "Default Model",
                modelName: this.settings.model,
                apiKey: this.settings.apiKey,
                active: true,
                id: "default-model",
                isDefault: true,
                type: this.settings.provider || "openai"
            });
        }
    }
    
    migrateEmbeddingConfig(): void {
        // If we have legacy embedding settings but no embedding config
        if (this.settings.embeddingModels && 
            (!this.settings.embeddingModels || !this.settings.embeddingModels.length)) {
            
            console.log("Migrating legacy embedding configuration");
            this.settings.embeddingModels = [
                {
                    id: 'default-openai-embedding',
                    name: 'OpenAI Embedding 3',
                    type: 'openai',
                    modelName: 'text-embedding-3-small',
                    active: true,
                    description: 'Default OpenAI embedding model'
                }
            ];
        }
    }
    
    async loadDiffMatchPatchLibrary(): Promise<void> {
        try {
            if (!window.diff_match_patch) {
                // Load the library
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/diff_match_patch/20121119/diff_match_patch.js';
                script.async = true;
                script.onload = () => {
                    if (window.diff_match_patch) {
                        this.diffMatchPatchLib = new window.diff_match_patch();
                    }
                };
                document.head.appendChild(script);
            } else {
                this.diffMatchPatchLib = new window.diff_match_patch();
            }
        } catch (e) {
            console.error("Error loading diff_match_patch library:", e);
        }
    }
    
    async activateDebateView(): Promise<void> {
        const workspace = this.app.workspace;
        let leaf = workspace.getLeavesOfType(DEBATE_VIEW_TYPE)[0];
        
        if (!leaf) {
            // Create new leaf in right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (!rightLeaf) return;
            
            leaf = rightLeaf;
            await leaf.setViewState({
                type: DEBATE_VIEW_TYPE,
                active: true,
            });
        }

        workspace.revealLeaf(leaf);
    }
    
    async activateView(): Promise<void> {
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
    
    async activateKnowledgeBaseView(): Promise<void> {
        const workspace = this.app.workspace;
        let leaf = workspace.getLeavesOfType(KNOWLEDGE_BASE_VIEW_TYPE)[0];
        
        if (!leaf) {
            // Create new leaf in right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (!rightLeaf) return;
            
            leaf = rightLeaf;
            await leaf.setViewState({
                type: KNOWLEDGE_BASE_VIEW_TYPE,
                active: true,
            });
        }

        workspace.revealLeaf(leaf);
    }

    async polishText(editor: Editor): Promise<void> {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        
        const selectedText = editor.getSelection();
        
        if (!selectedText) {
            new Notice("Please select text to polish.");
            return;
        }
        
        const loadingModal = new Notice("Polishing text...", 0);
        
        try {
            // Find the Polish function in functions array
            const polishFunc = this.settings.functions.find(f => f.name === "Polish Text" || f.name === "Polish");
            const polishPrompt = polishFunc ? polishFunc.prompt : "Polish and refine the following text:";
            
            // Call AI
            const polishedText = await this.callAI(selectedText, polishPrompt);
            
            // Apply the polish
            editor.replaceSelection(polishedText);
            
            loadingModal.hide();
            new Notice("Text polished successfully.", 2000);
        } catch (error) {
            console.error("Error polishing text:", error);
            loadingModal.hide();
            new Notice("Error polishing text: " + (error.message || "Unknown error"));
        }
    }
    
    async cleanPolishMarkup(editor: Editor): Promise<void> {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        
        const content = editor.getValue();
        // Simple regex to remove common AI markup artifacts
        const cleaned = content
            .replace(/\[\d+% into document\]/g, '')  // Position markers
            .replace(/\[\[ORIGINAL\]\]([\s\S]*?)\[\[\/ORIGINAL\]\]/g, '')  // Original markers
            .replace(/\[\[POLISHED\]\]([\s\S]*?)\[\[\/POLISHED\]\]/g, '$1')  // Keep polished content
            .replace(/\n\s*\.\.\.\s*\n/g, '\n\n')  // Ellipsis separators
            .replace(/^---\s*\n(Polish(ed)? version:?)?/gmi, '');  // Section headers
        
        editor.setValue(cleaned);
        new Notice("Polish markup cleaned.");
    }
    
    addCommands() {
        this.addCommand({
            id: "organize-text",
            name: "Organize text",
            editorCallback: (editor: Editor) => this.organizeText(editor),
        });

        this.addCommand({
            id: "check-grammar",
            name: "Check grammar",
            editorCallback: (editor: Editor) => this.checkGrammar(editor),
        });

        this.addCommand({
            id: "generate-content",
            name: "Generate content",
            editorCallback: (editor: Editor) => this.generateAIContent(editor),
        });

        this.addCommand({
            id: "engage-in-dialogue",
            name: "Engage in Dialogue",
            editorCallback: (editor: Editor) => this.engageInDialogue(editor),
        });

        this.addCommand({
            id: "summarize-content",
            name: "Summarize Content",
            editorCallback: (editor: Editor) => this.summarizeContent(editor),
        });

        this.addCommand({
            id: "polish-text",
            name: "Polish Text",
            editorCallback: (editor: Editor) => this.polishText(editor),
        });

        this.addCommand({
            id: "clean-polish-markup",
            name: "Clean Polish Markup",
            editorCallback: (editor: Editor) => this.cleanPolishMarkup(editor),
        });

        this.addCommand({
            id: "custom-prompt",
            name: "Custom Prompt",
            editorCallback: (editor: Editor) => this.handleCustomPrompt(editor),
        });
    }

    // Most important core methods
    async callAI(content: string, promptPrefix: string = ''): Promise<string> {
        if (!this.modelManager) {
            throw new Error("Model manager not initialized");
        }
        
        // Get the default model
        const defaultModel = this.modelManager.getDefaultModel();
        if (!defaultModel) {
            throw new Error("No default model configured");
        }
        
        try {
            // Combine prompt and content
            const prompt = `${promptPrefix}${content}`;
            
            // Call the model
            return await this.modelManager.callModel(
                defaultModel.id,
                prompt,
                { maxTokens: 8192 } // Default max tokens
            );
        } catch (error) {
            console.error("Error calling AI:", error);
            throw error;
        }
    }

    async organizeText(editor: Editor): Promise<void> {
        // Implementation for organize text
        // This can be implemented later
    }

    async checkGrammar(editor: Editor): Promise<void> {
        // Implementation for check grammar
        // This can be implemented later
    }

    async generateAIContent(editor: Editor): Promise<void> {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        
        const selectedText = editor.getSelection();
        if (!selectedText) {
            new Notice("Please select text or provide a prompt for content generation.");
            return;
        }
        
        const loadingModal = new Notice("Generating content...", 0);
        
        try {
            // Find the Generate function in functions array
            const generateFunc = this.settings.functions.find(f => f.name === "Generate");
            const generatePrompt = generateFunc ? generateFunc.prompt : "Generate content based on the following prompt: ";
            
            // Call AI
            const generatedContent = await this.callAI(selectedText, generatePrompt);
            
            // Replace the selection with generated content
            editor.replaceSelection(generatedContent);
            
            loadingModal.hide();
            new Notice("Content generated successfully.", 2000);
        } catch (error) {
            console.error("Error generating content:", error);
            loadingModal.hide();
            new Notice("Error generating content: " + (error.message || "Unknown error"));
        }
    }

    async engageInDialogue(editor: Editor): Promise<void> {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        
        const selectedText = editor.getSelection();
        if (!selectedText) {
            new Notice("Please select text to start a dialogue.");
            return;
        }
        
        const loadingModal = new Notice("Starting dialogue...", 0);
        
        try {
            // Find the Dialogue function in functions array
            const dialogueFunc = this.settings.functions.find(f => f.name === "Dialogue");
            const dialoguePrompt = dialogueFunc ? dialogueFunc.prompt : "Engage in a Socratic dialogue based on the following text: ";
            
            // Call AI
            const dialogueContent = await this.callAI(selectedText, dialoguePrompt);
            
            // Insert the dialogue after the selected text
            const from = editor.getCursor("from");
            const to = editor.getCursor("to");
            editor.replaceRange("\n\n" + dialogueContent, to);
            
            loadingModal.hide();
            new Notice("Dialogue generated successfully.", 2000);
        } catch (error) {
            console.error("Error generating dialogue:", error);
            loadingModal.hide();
            new Notice("Error generating dialogue: " + (error.message || "Unknown error"));
        }
    }

    async summarizeContent(editor: Editor): Promise<void> {
        if (!editor) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                editor = mdView.editor;
            } else {
                new Notice("No active editor found.");
                return;
            }
        }
        
        // Get either selected text or entire file content
        let textToSummarize = editor.getSelection();
        if (!textToSummarize) {
            textToSummarize = editor.getValue();
        }
        
        if (!textToSummarize) {
            new Notice("No content to summarize.");
            return;
        }
        
        const loadingModal = new Notice("Summarizing content...", 0);
        
        try {
            // Find the Summarize function in functions array
            const summarizeFunc = this.settings.functions.find(f => f.name === "Summarize");
            const summarizePrompt = summarizeFunc ? summarizeFunc.prompt : `Analyze and summarize the following content:`;
            
            // Call AI
            const summary = await this.callAI(textToSummarize, summarizePrompt);
            
            // If there was a selection, replace it; otherwise append the summary
            if (editor.somethingSelected()) {
                editor.replaceSelection(summary);
            } else {
                // Add summary at the end of the file with a separator
                editor.replaceRange("\n\n---\n### Summary\n" + summary, { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
            }
            
            loadingModal.hide();
            new Notice("Content summarized successfully.", 2000);
        } catch (error) {
            console.error("Error summarizing content:", error);
            loadingModal.hide();
            new Notice("Error summarizing content: " + (error.message || "Unknown error"));
        }
    }

    async handleCustomPrompt(editor: Editor): Promise<void> {
        // Implementation for handle custom prompt
        // This can be implemented later
    }

    /**
     * Advanced search using embeddings
     * @param query Search query
     * @param limit Maximum number of results
     * @param loadingModal Loading modal for progress updates
     * @returns Array of search results
     */
    async advancedSearch(query: string, limit: number = 10, loadingModal?: any): Promise<Array<{
        file: TFile;
        similarity: number;
        content: string;
    }>> {
        try {
            if (!this.ragService) {
                throw new Error("RAG service not initialized");
            }

            // Get retriever from RAG service
            const retriever = this.ragService.getRetrievers()[0];
            if (!retriever) {
                throw new Error("No retriever available");
            }

            // Update loading modal if provided
            if (loadingModal) {
                loadingModal.setMessage("Searching knowledge base...");
            }

            // Retrieve results
            const results = await retriever.retrieve(query, limit);

            // Sort by similarity
            results.sort((a, b) => b.similarity - a.similarity);

            return results;
        } catch (error) {
            console.error("Error in advanced search:", error);
            throw error;
        }
    }
}

// Settings tab class
class AIPilotSettingTab extends PluginSettingTab {
    plugin: AIPilotPlugin;

    constructor(app: App, plugin: AIPilotPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        
        containerEl.createEl('h2', {text: 'AI Pilot Settings'});
        
        // AI Model Configuration
        containerEl.createEl('h3', {text: 'AI Model Configuration'});
        const modelsContainer = containerEl.createDiv();

        const models = this.plugin.modelManager.getModels();
        
        if (models.length === 0) {
            modelsContainer.createEl('p', { text: 'No AI models configured yet. Add a model to get started.' });
        } else {
            // Show all configured models
            for (const model of models) {
                this.createModelCard(modelsContainer, model);
            }
        }

        // Add model button
        const addModelContainer = containerEl.createDiv({ cls: 'add-model-container' });
        const addModelBtn = addModelContainer.createEl('button', {
            cls: 'add-model-button',
            text: 'Add New AI Model'
        });
        addModelBtn.addEventListener('click', () => {
            const configModal = new ModelConfigModal(
                this.app,
                null,
                (newModel) => {
                    this.plugin.modelManager.addModel(newModel);
                    this.display();
                    new Notice(`Added new model: ${newModel.name}`);
                }
            );
            configModal.open();
        });
        
        // Embedding Models section
        containerEl.createEl('h3', {text: 'Embedding Models'});
        
        // Embedding models container
        const embeddingModelsContainer = containerEl.createDiv({ cls: 'model-list-container' });
        
        const embeddingModels = this.plugin.modelManager.getEmbeddingModels();
        
        if (embeddingModels.length === 0) {
            embeddingModelsContainer.createEl('p', { text: 'No embedding models configured yet. Add a model to get started.' });
        } else {
            // Show all configured embedding models
            for (const model of embeddingModels) {
                this.createEmbeddingModelCard(embeddingModelsContainer, model);
            }
        }
        
        // Add embedding model button
        const addEmbeddingModelContainer = containerEl.createDiv({ cls: 'add-model-container' });
        const addEmbeddingModelBtn = addEmbeddingModelContainer.createEl('button', {
            cls: 'add-model-button',
            text: 'Add New Embedding Model'
        });
        addEmbeddingModelBtn.addEventListener('click', () => {
            const configModal = new EmbeddingModelConfigModal(
                this.app, 
                null,
                (newModel) => {
                    this.plugin.modelManager.addEmbeddingModel(newModel);
                    this.display();
                    new Notice(`Added new embedding model: ${newModel.name}`);
                }
            );
            configModal.open();
        });
        
        // Knowledge Base Configuration
        containerEl.createEl('h3', {text: 'Knowledge Base Configuration'});
        
        // Knowledge Base Path
        new Setting(containerEl)
            .setName('Knowledge Base Path')
            .setDesc('Path to your knowledge base folder')
            .addText(text => text
                .setPlaceholder('e.g., Knowledge Base')
                .setValue(this.plugin.settings.knowledgeBasePath)
                .onChange(async (value) => {
                    this.plugin.settings.knowledgeBasePath = value;
                    await this.plugin.saveSettings();
                }));
        
        // Embedding chunking option
        new Setting(containerEl)
            .setName('Use Chunking for Embeddings')
            .setDesc('Split documents into chunks for more precise retrieval')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.embeddingsInChunks || false)
                .onChange(async (value) => {
                    this.plugin.settings.embeddingsInChunks = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));
        
        // Show chunk settings if chunking is enabled
        if (this.plugin.settings.embeddingsInChunks) {
            // Chunk size
            new Setting(containerEl)
                .setName('Chunk Size')
                .setDesc('Number of characters per chunk')
                .addText(text => text
                    .setPlaceholder('1000')
                    .setValue(String(this.plugin.settings.embeddingChunkSize || 1000))
                    .onChange(async (value) => {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue > 0) {
                            this.plugin.settings.embeddingChunkSize = numValue;
                            await this.plugin.saveSettings();
                        }
                    }));
            
            // Chunk overlap
            new Setting(containerEl)
                .setName('Chunk Overlap')
                .setDesc('Number of characters to overlap between chunks')
                .addText(text => text
                    .setPlaceholder('200')
                    .setValue(String(this.plugin.settings.embeddingChunkOverlap || 200))
                    .onChange(async (value) => {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                            this.plugin.settings.embeddingChunkOverlap = numValue;
                            await this.plugin.saveSettings();
                        }
                    }));
        }
        
        // Chat History settings
        containerEl.createEl('h3', {text: 'Chat History Configuration'});
        
        // Chat history path
        new Setting(containerEl)
            .setName('Chat History Path')
            .setDesc('Path to store chat history files')
            .addText(text => text
                .setPlaceholder('e.g., Chat History')
                .setValue(this.plugin.settings.chatHistoryPath)
                .onChange(async (value) => {
                    this.plugin.settings.chatHistoryPath = value;
                    await this.plugin.saveSettings();
                }));
        
        // Save chat history option
        new Setting(containerEl)
            .setName('Save Chat History')
            .setDesc('Save chat history to files')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.saveMemory || false)
                .onChange(async (value) => {
                    this.plugin.settings.saveMemory = value;
                    await this.plugin.saveSettings();
                }));
        
        // Function settings
        containerEl.createEl('h3', {text: 'Function Configuration'});
        
        // Mode toggle
        new Setting(containerEl)
            .setName('Editor Mode')
            .setDesc('Toggle between Editor and Chat modes for functions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.editorModeEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.editorModeEnabled = value;
                    await this.plugin.saveSettings();
                }));
        
        // Display and allow editing of built-in functions
        const functions = this.plugin.settings.functions.filter(f => f.isBuiltIn);
        
        for (const func of functions) {
            const funcSetting = new Setting(containerEl)
                .setName(func.name)
                .setDesc(`Built-in function: ${func.tooltip}`)
                .addButton(button => button
                    .setButtonText('Edit Prompt')
                    .onClick(() => {
                        const modal = new PromptEditModal(this.app, this.plugin, func);
                        modal.open();
                    }));
                
            // Add icon if available
            if (func.icon) {
                funcSetting.nameEl.createSpan({cls: 'setting-function-icon'}, span => {
                    setIcon(span, func.icon);
                });
            }
        }
        
        // Custom functions
        containerEl.createEl('h3', {text: 'Custom Functions'});
        
        const customFunctions = this.plugin.settings.functions.filter(f => !f.isBuiltIn);
        
        if (customFunctions.length === 0) {
            containerEl.createEl('p', {text: 'No custom functions defined.'});
        } else {
            for (const func of customFunctions) {
                const funcSetting = new Setting(containerEl)
                    .setName(func.name)
                    .setDesc(func.tooltip || 'Custom function')
                    .addButton(button => button
                        .setButtonText('Edit')
                        .onClick(() => {
                            const modal = new CustomFunctionModal(this.app, this.plugin, func);
                            modal.open();
                        }))
                    .addButton(button => button
                        .setButtonText('Delete')
                        .setWarning()
                        .onClick(async () => {
                            this.plugin.settings.functions = this.plugin.settings.functions.filter(f => f !== func);
                            await this.plugin.saveSettings();
                            this.display();
                        }));
                    
                // Add icon if available
                if (func.icon) {
                    funcSetting.nameEl.createSpan({cls: 'setting-function-icon'}, span => {
                        setIcon(span, func.icon);
                    });
                }
            }
        }
        
        // Add button for new custom function
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('+ Add Custom Function')
                .setCta()
                .onClick(() => {
                    const modal = new CustomFunctionModal(this.app, this.plugin);
                    modal.open();
                }));
        
        // Proxy Configuration
        containerEl.createEl('h3', {text: 'Proxy Configuration'});
        
        // Enable proxy
        new Setting(containerEl)
            .setName('Enable Proxy')
            .setDesc('Use a proxy for API calls')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.proxyConfig?.enabled || false)
                .onChange(async (value) => {
                    if (!this.plugin.settings.proxyConfig) {
                        this.plugin.settings.proxyConfig = {
                            enabled: value,
                            address: "",
                            port: "",
                            type: "http",
                            requiresAuth: false
                        };
                    } else {
                        this.plugin.settings.proxyConfig.enabled = value;
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));
        
        // Show proxy settings if enabled
        if (this.plugin.settings.proxyConfig?.enabled) {
            // Proxy type
            new Setting(containerEl)
                .setName('Proxy Type')
                .setDesc('Type of proxy to use')
                .addDropdown(dropdown => dropdown
                    .addOption('http', 'HTTP')
                    .addOption('https', 'HTTPS')
                    .addOption('socks5', 'SOCKS')
                    .setValue(this.plugin.settings.proxyConfig.type || 'http')
                    .onChange(async (value: 'http' | 'https' | 'socks5') => {
                        this.plugin.settings.proxyConfig.type = value;
                        await this.plugin.saveSettings();
                    }));
            
            // Proxy address
            new Setting(containerEl)
                .setName('Proxy Address')
                .setDesc('Hostname or IP of the proxy server')
                .addText(text => text
                    .setPlaceholder('e.g., proxy.example.com')
                    .setValue(this.plugin.settings.proxyConfig.address || '')
                    .onChange(async (value) => {
                        this.plugin.settings.proxyConfig.address = value;
                        await this.plugin.saveSettings();
                    }));
            
            // Proxy port
            new Setting(containerEl)
                .setName('Proxy Port')
                .setDesc('Port number for the proxy server')
                .addText(text => text
                    .setPlaceholder('e.g., 8080')
                    .setValue(this.plugin.settings.proxyConfig.port || '')
                    .onChange(async (value) => {
                        this.plugin.settings.proxyConfig.port = value;
                        await this.plugin.saveSettings();
                    }));
        }
    }
    
    // Helper to get a friendly name for model providers
    private getProviderDisplayName(type: string): string {
        const providers: {[key: string]: string} = {
            'openai': 'OpenAI',
            'zhipuai': 'ZhipuAI',
            'claude': 'Anthropic Claude',
            'ollama': 'Ollama',
            'custom': 'Custom API',
            'zhipu': 'Zhipu AI',
            'baidu': 'Baidu'
        };
        
        return providers[type] || type;
    }

    // Add helper method to create embedding model cards
    private createEmbeddingModelCard(container: HTMLElement, model: EmbeddingModelConfig) {
        const modelItem = container.createDiv({ cls: 'model-list-item' });
        
        // Status indicator
        const statusIndicator = modelItem.createDiv({ 
            cls: `model-status-indicator ${model.active ? 'active' : 'inactive'}` 
        });
        
        // Model info
        const modelInfo = modelItem.createDiv({ cls: 'model-info' });
        
        // Title row with status
        const titleRow = modelInfo.createDiv({ cls: 'model-title-row' });
        titleRow.createEl('h4', { 
            text: model.name,
            cls: 'model-name'
        });
        titleRow.createSpan({ 
            text: model.active ? 'Active' : 'Inactive',
            cls: `model-status-text ${model.active ? 'active' : 'inactive'}`
        });
        
        // Provider and model name
        modelInfo.createDiv({ 
            text: `${this.getProviderDisplayName(model.type)} - ${model.modelName}`,
            cls: 'model-provider'
        });
        
        // Description if available
        if (model.description) {
            modelInfo.createDiv({ 
                text: model.description,
                cls: 'model-details'
            });
        }
        
        // Model actions
        const modelActions = modelItem.createDiv({ cls: 'model-actions' });
        
        // Edit button
        const editBtn = modelActions.createEl('button', {
            cls: 'model-action-button edit-button',
            text: 'Edit'
        });
        editBtn.addEventListener('click', () => {
            const configModal = new EmbeddingModelConfigModal(
                this.app, 
                model,
                (updatedModel) => {
                    this.plugin.modelManager.updateEmbeddingModel(model.id, updatedModel);
                    this.display();
                }
            );
            configModal.open();
        });
        
        // Delete button
        const deleteBtn = modelActions.createEl('button', {
            cls: 'model-action-button delete-button',
            text: 'Delete'
        });
        deleteBtn.addEventListener('click', () => {
            new ConfirmModal(
                this.app,
                `Are you sure you want to delete the embedding model "${model.name}"?`,
                async () => {
                    this.plugin.modelManager.removeEmbeddingModel(model.id);
                    this.display();
                    new Notice(`Deleted embedding model: ${model.name}`);
                }
            ).open();
        });
    }

    // Add the missing createModelCard method
    private createModelCard(container: HTMLElement, model: LLMModelConfig) {
        const card = container.createDiv({ cls: 'model-card' });
        
        const header = card.createDiv({ cls: 'header' });
        
        // Title section with status dot and model info
        const titleSection = header.createDiv({ cls: 'title-section' });
        const statusDot = titleSection.createDiv({ 
            cls: `status-dot ${model.active ? 'active' : ''}` 
        });
        
        const modelInfo = titleSection.createDiv({ cls: 'model-info' });
        const nameRow = modelInfo.createDiv({ cls: 'model-name' });
        nameRow.createSpan({ text: model.name });
        
        // Show both active and default badges if applicable
        if (model.active) {
            nameRow.createSpan({ cls: 'active-badge', text: 'ACTIVE' });
        }
        if (model.isDefault) {
            nameRow.createSpan({ cls: 'default-badge', text: 'DEFAULT' });
        }
        
        modelInfo.createDiv({ 
            cls: 'model-type',
            text: model.type.charAt(0).toUpperCase() + model.type.slice(1)
        });

        // Actions
        const actions = header.createDiv({ cls: 'actions' });
        const editBtn = actions.createEl('button', { text: 'Edit' });
        editBtn.addEventListener('click', () => {
            const configModal = new ModelConfigModal(
                this.app,
                model,
                (updatedModel) => {
                    this.plugin.modelManager.updateModel(model.id, updatedModel);
                    this.display();
                    new Notice(`Updated model: ${updatedModel.name}`);
                }
            );
            configModal.open();
        });

        const deleteBtn = actions.createEl('button', { 
            text: 'Delete',
            cls: 'delete-button'
        });
        deleteBtn.addEventListener('click', () => {
            const confirm = new Notice(
                `Delete model ${model.name}?`,
                0
            );
            confirm.noticeEl.createEl('button', {
                text: 'Delete',
                cls: 'mod-warning'
            }).addEventListener('click', () => {
                this.plugin.modelManager.removeModel(model.id);
                this.display();
                confirm.hide();
                new Notice(`Deleted model: ${model.name}`);
            });
        });

        // Description if available
        if (model.description) {
            card.createDiv({ 
                cls: 'description',
                text: model.description
            });
        }
    }
}

// Feature selection modal
class FeatureSelectionModal extends Modal {
    plugin: AIPilotPlugin;
    
    constructor(app: App, plugin: AIPilotPlugin) {
        super(app);
        this.plugin = plugin;
    }
    
    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        contentEl.createEl('h2', {text: 'Select AI Feature'});
        
        // Create buttons for each feature
        const functions = this.plugin.settings.functions;
        
        if (!functions || functions.length === 0) {
            contentEl.createEl('p', {text: 'No features configured. Please add features in settings.'});
            return;
        }
        
        const buttonsContainer = contentEl.createDiv({cls: 'feature-buttons'});
        
        functions.forEach(func => {
            const button = buttonsContainer.createEl('button', {
                text: func.name,
                cls: 'feature-button'
            });
            
            // Set icon if available
            if (func.icon) {
                setIcon(button, func.icon);
            }
            
            // Handle click
            button.addEventListener('click', () => {
                this.close();
                
                // Get active editor
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView) {
                    new Notice('No active editor found.');
                    return;
                }
                
                const editor = activeView.editor;
                const selectedText = editor.getSelection();
                
                if (!selectedText) {
                    new Notice('Please select text to process.');
                    return;
                }
                
                // Process based on function name
                this.processFeature(func, editor, selectedText);
            });
        });
    }
    
    async processFeature(func: CustomFunction, editor: Editor, selectedText: string) {
        const loadingNotice = new Notice(`Processing with ${func.name}...`, 0);
        
        try {
            const result = await this.plugin.callAI(selectedText, func.prompt);
            editor.replaceSelection(result);
            loadingNotice.hide();
            new Notice(`${func.name} completed successfully.`, 2000);
        } catch (error) {
            console.error(`Error in ${func.name}:`, error);
            loadingNotice.hide();
            new Notice(`Error in ${func.name}: ${error.message || 'Unknown error'}`);
        }
    }
    
    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// Loading modal for async operations
export class LoadingModal extends Modal {
    message: string;
    loadingEl: HTMLElement;
    
    constructor(app: App, message: string) {
        super(app);
        this.message = message;
    }
    
    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        contentEl.addClass('loading-modal');
        this.loadingEl = contentEl.createDiv({cls: 'loading-spinner'});
        this.loadingEl.createSpan({text: this.message});
        
        const spinner = this.loadingEl.createDiv({cls: 'spinner'});
        for (let i = 0; i < 4; i++) {
            spinner.createDiv({cls: 'spin-segment'});
        }
    }
    
    setMessage(message: string) {
        this.message = message;
        if (this.loadingEl) {
            const spanElement = this.loadingEl.querySelector('span');
            if (spanElement) {
                spanElement.textContent = message;
            }
        }
    }
    
    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// Modal to display polish result
export class PolishResultModal extends Modal {
    original: string;
    polished: string;
    plugin: AIPilotPlugin;
    
    constructor(app: App, original: string, polished: string) {
        super(app);
        this.original = original;
        this.polished = polished;
        
        // 此处留空，不尝试直接访问插件实例
        // 实际使用时，创建此模态框的代码应该传入正确的插件实例
    }
    
    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        contentEl.addClass('polish-result-modal');
        contentEl.createEl('h2', {text: 'Polish Result'});
        
        const container = contentEl.createDiv({cls: 'polish-compare-container'});
        
        // Original text
        const originalDiv = container.createDiv({cls: 'polish-section original'});
        originalDiv.createEl('h3', {text: 'Original'});
        const originalContent = originalDiv.createDiv({cls: 'content'});
        originalContent.createEl('p', {text: this.original});
        
        // Polished text
        const polishedDiv = container.createDiv({cls: 'polish-section polished'});
        polishedDiv.createEl('h3', {text: 'Polished'});
        const polishedContent = polishedDiv.createDiv({cls: 'content'});
        
        // 简单呈现文本内容
        polishedContent.createEl('div', {
            cls: 'markdown-rendered',
            text: this.polished
        });
        
        // Buttons
        const buttonDiv = contentEl.createDiv({cls: 'polish-buttons'});
        
        const usePolishedBtn = buttonDiv.createEl('button', {text: 'Use Polished Version'});
        usePolishedBtn.addEventListener('click', () => {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                mdView.editor.replaceSelection(this.polished);
                this.close();
                new Notice('Applied polished text to editor');
            } else {
                new Notice('No active editor to apply text to');
            }
        });
        
        const closeBtn = buttonDiv.createEl('button', {text: 'Close'});
        closeBtn.addEventListener('click', () => {
            this.close();
        });
    }
    
    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// Modal for editing prompts
class PromptEditModal extends Modal {
    plugin: AIPilotPlugin;
    function: CustomFunction;
    
    constructor(app: App, plugin: AIPilotPlugin, func: CustomFunction) {
        super(app);
        this.plugin = plugin;
        this.function = func;
    }
    
    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        contentEl.createEl('h2', {text: `Edit ${this.function.name} Prompt`});
        
        const promptContainer = contentEl.createDiv({cls: 'prompt-edit-container'});
        
        // Create textarea for editing prompt
        const promptArea = promptContainer.createEl('textarea', {
            cls: 'prompt-edit-textarea',
            attr: {
                rows: '10'
            }
        });
        promptArea.value = this.function.prompt;
        
        // Create buttons
        const buttonContainer = contentEl.createDiv({cls: 'prompt-edit-buttons'});
        
        // Save button
        const saveButton = buttonContainer.createEl('button', {
            text: 'Save Changes',
            cls: 'prompt-edit-save'
        });
        
        // Cancel button
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel',
            cls: 'prompt-edit-cancel'
        });
        
        // Add event listeners
        saveButton.addEventListener('click', async () => {
            // Find and update the function in the settings
            const funcIndex = this.plugin.settings.functions.findIndex(f => 
                f.name === this.function.name && f.isBuiltIn === this.function.isBuiltIn);
            
            if (funcIndex !== -1) {
                this.plugin.settings.functions[funcIndex].prompt = promptArea.value;
                await this.plugin.saveSettings();
                new Notice(`Updated ${this.function.name} prompt`);
            }
            
            this.close();
        });
        
        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }
    
    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// Improve the CustomFunctionModal to add real-time icon preview
class CustomFunctionModal extends Modal {
    plugin: AIPilotPlugin;
    function: CustomFunction | null;
    iconPreviewEl: HTMLElement | null = null;
    
    constructor(app: App, plugin: AIPilotPlugin, func?: CustomFunction) {
        super(app);
        this.plugin = plugin;
        this.function = func || null;
    }
    
    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        contentEl.addClass('custom-function-modal');
        
        contentEl.createEl('h2', {text: this.function ? 'Edit Custom Function' : 'Create Custom Function'});
        
        const formContainer = contentEl.createDiv({cls: 'custom-function-form'});
        
        // Function name
        const nameContainer = formContainer.createDiv({cls: 'form-group'});
        nameContainer.createEl('label', {text: 'Function Name'});
        const nameInput = nameContainer.createEl('input', {
            type: 'text',
            cls: 'function-name-input',
            attr: {
                placeholder: 'Enter function name'
            }
        });
        nameInput.value = this.function?.name || '';
        
        // Function icon with help link and live preview
        const iconContainer = formContainer.createDiv({cls: 'form-group'});
        const iconHeader = iconContainer.createDiv({cls: 'icon-header'});
        
        // Icon name label
        const iconLabelContainer = iconHeader.createDiv({cls: 'label-with-help'});
        iconLabelContainer.createEl('label', {text: 'Icon Name'});
        
        // Add help link for icons
        const iconHelpLink = iconLabelContainer.createEl('a', {
            cls: 'icon-help-link',
            href: 'https://lucide.dev/icons/',
            text: 'View available icons'
        });
        iconHelpLink.setAttribute('target', '_blank');
        iconHelpLink.setAttribute('rel', 'noopener noreferrer');
        
        // Icon preview element
        const iconPreviewContainer = iconHeader.createDiv({cls: 'icon-preview-container'});
        const iconPreviewLabel = iconPreviewContainer.createSpan({cls: 'icon-preview-label', text: 'Preview: '});
        this.iconPreviewEl = iconPreviewContainer.createDiv({cls: 'icon-preview'});
        
        // Icon input
        const iconInputContainer = iconContainer.createDiv({cls: 'icon-input-container'});
        const iconInput = iconInputContainer.createEl('input', {
            type: 'text',
            cls: 'function-icon-input',
            attr: {
                placeholder: 'e.g., sparkles, check, star, file-text'
            }
        });
        iconInput.value = this.function?.icon || '';
        
        // Initial icon preview
        this.updateIconPreview(iconInput.value);
        
        // Add input event for real-time preview
        iconInput.addEventListener('input', () => {
            this.updateIconPreview(iconInput.value);
        });
        
        // Add some example icons for quick selection
        const iconExamples = iconContainer.createDiv({cls: 'icon-examples'});
        iconExamples.createSpan({text: 'Examples: '});
        
        const commonIcons = [
            {name: 'file-text', display: 'Text'},
            {name: 'check-square', display: 'Check'},
            {name: 'sparkles', display: 'Sparkles'},
            {name: 'message-circle', display: 'Chat'},
            {name: 'bookmark', display: 'Bookmark'},
            {name: 'bird', display: 'Polish'},
            {name: 'star', display: 'Star'},
            {name: 'zap', display: 'Zap'}
        ];
        
        for (const icon of commonIcons) {
            const iconBtn = iconExamples.createEl('button', {
                cls: 'icon-example-button',
                attr: {'data-icon': icon.name, 'title': icon.name}
            });
            
            // Manually add the icon instead of using setIcon to ensure it's visible
            const svgIcon = getIcon(icon.name);
            if (svgIcon) {
                // Replace innerHTML with proper DOM manipulation
                const tempEl = document.createElement('div');
                tempEl.innerHTML = svgIcon; // Using innerHTML temporarily just to parse the SVG
                // Safely move the parsed SVG to the button
                while (tempEl.firstChild) {
                    iconBtn.appendChild(tempEl.firstChild);
                }
            } else {
                iconBtn.textContent = icon.name.charAt(0).toUpperCase();
            }
            
            // Add click handler to set the icon
            iconBtn.addEventListener('click', () => {
                iconInput.value = icon.name;
                this.updateIconPreview(icon.name);
            });
        }
        
        // Function tooltip
        const tooltipContainer = formContainer.createDiv({cls: 'form-group'});
        tooltipContainer.createEl('label', {text: 'Tooltip'});
        const tooltipInput = tooltipContainer.createEl('input', {
            type: 'text',
            cls: 'function-tooltip-input',
            attr: {
                placeholder: 'Brief description shown on hover'
            }
        });
        tooltipInput.value = this.function?.tooltip || '';
        
        // Function prompt
        const promptContainer = formContainer.createDiv({cls: 'form-group'});
        promptContainer.createEl('label', {text: 'Prompt Template'});
        const promptArea = promptContainer.createEl('textarea', {
            cls: 'function-prompt-textarea',
            attr: {
                rows: '8',
                placeholder: 'Enter the prompt template for this function'
            }
        });
        promptArea.value = this.function?.prompt || '';
        
        // Buttons
        const buttonContainer = contentEl.createDiv({cls: 'custom-function-buttons'});
        
        // Save button
        const saveButton = buttonContainer.createEl('button', {
            text: this.function ? 'Save Changes' : 'Create Function',
            cls: 'custom-function-save'
        });
        
        // Cancel button
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel',
            cls: 'custom-function-cancel'
        });
        
        // Add event listeners
        saveButton.addEventListener('click', async () => {
            // Validate inputs
            if (!nameInput.value.trim()) {
                new Notice('Function name cannot be empty');
                return;
            }
            
            if (!promptArea.value.trim()) {
                new Notice('Prompt template cannot be empty');
                return;
            }
            
            const functionData: CustomFunction = {
                name: nameInput.value.trim(),
                icon: iconInput.value.trim() || 'message-square',
                tooltip: tooltipInput.value.trim() || nameInput.value.trim(),
                prompt: promptArea.value.trim(),
                isBuiltIn: false
            };
            
            if (this.function) {
                // Edit existing function
                const funcIndex = this.plugin.settings.functions.findIndex(f => 
                    f.name === this.function?.name && !f.isBuiltIn);
                
                if (funcIndex !== -1) {
                    this.plugin.settings.functions[funcIndex] = functionData;
                }
            } else {
                // Add new function
                this.plugin.settings.functions.push(functionData);
            }
            
            await this.plugin.saveSettings();
            new Notice(`${this.function ? 'Updated' : 'Created'} custom function ${functionData.name}`);
            this.close();
        });
        
        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }
    
    // Helper method to update icon preview
    updateIconPreview(iconName: string) {
        if (!this.iconPreviewEl) return;
        
        this.iconPreviewEl.empty();
        
        if (!iconName) {
            this.iconPreviewEl.setText('No icon selected');
            return;
        }
        
        // Try to get the icon
        const svgIcon = getIcon(iconName);
        if (svgIcon) {
            // Replace innerHTML with proper DOM manipulation
            const tempEl = document.createElement('div');
            tempEl.innerHTML = svgIcon; // Using innerHTML temporarily just to parse the SVG
            // Safely move the parsed SVG to the preview element
            while (tempEl.firstChild) {
                this.iconPreviewEl.appendChild(tempEl.firstChild);
            }
        } else {
            this.iconPreviewEl.setText(`Icon not found: ${iconName}`);
        }
    }
    
    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// Add ConfirmModal class if it doesn't exist elsewhere in the file
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