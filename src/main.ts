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
    requestUrl,
    Component,
    TFile,
    TFolder,
    WorkspaceLeaf,
    ViewCreator,
    setIcon,
    Editor,
    TextAreaComponent
} from "obsidian";

import styles from './styles.css';
import { ChatView, VIEW_TYPE_CHAT } from './ChatView';
import { MarkdownRenderer as NewMarkdownRenderer } from './MarkdownRenderer';

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

interface AIPilotSettings {
    apiKey: string;
    model: string;
    provider: 'zhipuai' | 'openai' | 'groq';
    embeddingModel: EmbeddingModelKey;
    embeddingDimensions: number;
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
}

export const DEFAULT_SETTINGS: AIPilotSettings = {
    apiKey: '',
    model: 'gpt-4',
    provider: 'openai',
    embeddingModel: 'embedding-3',
    embeddingDimensions: 1024,
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
    editorModeEnabled: true
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

export default class AIPilot extends Plugin {
    app: App;
    settings: AIPilotSettings;
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

    constructor(app: App, manifest: any) {
        super(app, manifest);
        this.app = app;
    }

    async onload() {
        await this.loadSettings();
        
        // Load styles properly
        this.loadStyles();
        
        this.addSettingTab(new AITextSettingTab(this.app, this));

        // Register Chat View
        this.registerView(
            VIEW_TYPE_CHAT,
            (leaf: WorkspaceLeaf) => new ChatView(leaf, this)
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
    }

    private loadStyles() {
        // Add styles to the document
        const styleEl = document.createElement('style');
        styleEl.id = 'aipilot-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    onunload() {
        // Remove the style element
        const styleEl = document.getElementById('aipilot-styles');
        if (styleEl) styleEl.remove();
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        
        // Decrypt API key if it exists
        if (this.settings.apiKey) {
            this.settings.apiKey = decryptString(this.settings.apiKey, this.salt);
        }
    }

    async saveSettings() {
        // Create a copy of settings and encrypt the API key
        const dataToSave = { ...this.settings };
        if (dataToSave.apiKey) {
            dataToSave.apiKey = encryptString(dataToSave.apiKey, this.salt);
        }
        await this.saveData(dataToSave);
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
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "p" }]
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

                const loadingModal = new LoadingModal(this.app, true);
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
                    new SearchResultsModal(this.app, topResults).open();
                } catch (error) {
                    new Notice("Error searching knowledge base: " + error.message);
                    loadingModal.close();
                }
            }
        });
    }

    // Approximate token estimation function
    estimateTokenCount(text: string): number {
        // Rough estimation: 1 token ≈ 4 characters for English, 2 characters for Chinese
        const englishLength = text.replace(/[\u4e00-\u9fff]/g, '').length;
        const chineseLength = text.length - englishLength;
        return Math.ceil(englishLength / 4 + chineseLength / 2);
    }

    async callAI(content: string, promptPrefix: string = ''): Promise<string> {
        const { model } = this.settings;
        const maxTokens = MODEL_TOKEN_LIMITS[model] || 4096;

        let maxTokensForContent = maxTokens - this.estimateTokenCount(promptPrefix);
        const MIN_TOKENS_FOR_CONTENT = 500; // Adjust based on model capability

        if (maxTokensForContent < MIN_TOKENS_FOR_CONTENT) {
            maxTokensForContent = MIN_TOKENS_FOR_CONTENT;
        }

        const tokenCount = this.estimateTokenCount(content);

        // if (tokenCount > maxTokens) {
        if (tokenCount > maxTokensForContent) {
            // Split the content into chunks
            // const chunks = this.chunkContent(content, maxTokens - this.estimateTokenCount(promptPrefix));
            const chunks = this.chunkContent(content, maxTokensForContent);
            const results = [];

            new Notice(`The text is too long and will be processed in ${chunks.length} parts.`);

            for (const chunk of chunks) {
                const result = await this.callAIChunk(chunk, promptPrefix);
                results.push(result.trim());
            }

            return results.join('\n\n');
        } else {
            return await this.callAIChunk(content, promptPrefix);
        }
    }

    async callAIChunk(content: string, promptPrefix: string): Promise<string> {
        const { apiKey, model, provider } = this.settings;
        let url = '';
        let data: any = {};

        // const prompt = `${promptPrefix}${content}`;
        const prompt = `${promptPrefix}${content}\n\nNote: This is part of a larger text. Ensure continuity with the previous sections.`;
        const chatModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'GLM-3-Turbo', 'GLM-4', 'GLM-4-Air', 'GLM-4-Long'];

        if (provider === 'openai') {
            if (chatModels.includes(model)) {
                url = 'https://api.openai.com/v1/chat/completions';
                data = {
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    request_id: this.requestId,
                };
            } else {
                url = 'https://api.openai.com/v1/completions';
                data = {
                    model: model,
                    prompt: prompt,
                    max_tokens: 1000,
                    request_id: this.requestId,
                };
            }
        } else if (provider === 'zhipuai') {
            url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            data = {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                request_id: this.requestId,
            };
        } else if (provider === 'groq') {
            url = 'https://api.groq.com/openai/v1/chat/completions';
            data = {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                request_id: this.requestId,
            }
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
            } else {  // TODO add try...catch for groq
                return responseData.choices[0]?.message?.content || 'No response';
            }
        } catch (error) {
            console.error("Error calling AI:", error);
            if (error.response?.status === 401) {
                new Notice("Invalid API key. Please check your settings.");
            } else if (error.response?.status === 429) {
                new Notice("Rate limit exceeded. Please try again later.");
            } else {
                new Notice("Error: " + (error.message || "Unknown error occurred"));
            }
            return 'Error fetching AI response';
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
        const { apiKey, model, provider } = this.settings;
        const maxTokens = MODEL_TOKEN_LIMITS[model] || 4096;
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 1000; // 1 second

        // Estimate total tokens in the conversation
        let totalTokens = 0;
        for (const msg of messages) {
            totalTokens += this.estimateTokenCount(msg.content);
        }

        if (totalTokens > maxTokens) {
            messages = this.trimMessages(messages, maxTokens);
        }

        let url = '';
        let data: any = {};

        if (provider === 'openai') {
            url = 'https://api.openai.com/v1/chat/completions';
            data = {
                model: model,
                messages: messages,
                request_id: this.requestId,
                stream: true
            };
        } else if (provider === 'zhipuai') {
            url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            data = {
                model: model,
                messages: messages,
                stream: true,
                request_id: this.requestId,
            };
        } else if (provider === 'groq') {
            url = 'https://api.groq.com/openai/v1/chat/completions';
            data = {
                model: model,
                messages: messages,
                request_id: this.requestId,
                stream: true
            }
        }

        let retryCount = 0;
        while (retryCount < MAX_RETRIES) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    // Get more information about the error for better diagnostics
                    const errorDetails = await response.text().catch(() => '');
                    const errorStatus = response.status;
                    
                    // Special case for 400 errors that might be caused by images
                    if (errorStatus === 400) {
                        // Check if the message content contains image markers
                        const hasImageContent = messages.some(msg => {
                            const content = msg.content || '';
                            return content.includes('![') || 
                                   content.includes('<img') || 
                                   content.includes('data:image/') ||
                                   content.includes('http://') && (
                                     content.includes('.png') || 
                                     content.includes('.jpg') || 
                                     content.includes('.jpeg') || 
                                     content.includes('.gif')
                                   );
                        });
                        
                        if (hasImageContent) {
                            throw new Error(`The request contains images or unsupported content. Please remove images and try again.`);
                        }
                    }
                    
                    throw new Error(`HTTP error! status: ${errorStatus} ${errorDetails ? '- ' + errorDetails.substring(0, 100) : ''}`);
                }

                if (!response.body) {
                    throw new Error('Response body is null');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';
                let buffer = '';
                let lastChunkTime = Date.now();
                const TIMEOUT = 30000; // 30 seconds timeout

                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;

                        // Check for timeout
                        const now = Date.now();
                        if (now - lastChunkTime > TIMEOUT) {
                            throw new Error('Stream timeout');
                        }
                        lastChunkTime = now;

                        // Decode the chunk and add it to the buffer
                        buffer += decoder.decode(value, { stream: true });

                        // Process complete lines from the buffer
                        const lines = buffer.split('\n');
                        // Keep the last (potentially incomplete) line in the buffer
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmedLine = line.trim();
                            if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

                            if (trimmedLine.startsWith('data: ')) {
                                try {
                                    const data = trimmedLine.slice(6);
                                    if (data === '[DONE]') continue;

                                    const json = JSON.parse(data);
                                    let content = '';

                                    if (provider === 'openai') {
                                        content = json.choices?.[0]?.delta?.content || '';
                                    } else if (provider === 'zhipuai') {
                                        content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
                                    } else if (provider === 'groq') {
                                        content = json.choices?.[0]?.delta?.content || '';
                                    }

                                    if (content) {
                                        fullContent += content;
                                        if (onUpdate) {
                                            try {
                                                await onUpdate(content);
                                            } catch (e) {
                                                console.warn('Error in onUpdate callback:', e);
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.warn('Error parsing streaming response:', e, trimmedLine);
                                }
                            }
                        }
                    }

                    // Process any remaining data in the buffer
                    if (buffer) {
                        const trimmedBuffer = buffer.trim();
                        if (trimmedBuffer && trimmedBuffer !== 'data: [DONE]' && trimmedBuffer.startsWith('data: ')) {
                            try {
                                const data = trimmedBuffer.slice(6);
                                if (data !== '[DONE]') {
                                    const json = JSON.parse(data);
                                    let content = '';

                                    if (provider === 'openai') {
                                        content = json.choices?.[0]?.delta?.content || '';
                                    } else if (provider === 'zhipuai') {
                                        content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
                                    } else if (provider === 'groq') {
                                        content = json.choices?.[0]?.delta?.content || '';
                                    }

                                    if (content) {
                                        fullContent += content;
                                        if (onUpdate) {
                                            try {
                                                await onUpdate(content);
                                            } catch (e) {
                                                console.warn('Error in onUpdate callback:', e);
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('Error parsing final buffer:', e);
                            }
                        }
                    }

                    return fullContent || 'No response';
                } finally {
                    reader.releaseLock();
                }
            } catch (error) {
                console.error(`Error calling AI (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
                
                if (retryCount === MAX_RETRIES - 1) {
                    // Last retry failed
                    if (error.status === 401) {
                        new Notice("Invalid API key. Please check your settings.");
                    } else if (error.status === 429) {
                        new Notice("Rate limit exceeded. Please try again later.");
                    } else {
                        new Notice("Error: " + (error.message || "Unknown error occurred"));
                    }
                    throw error;
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                retryCount++;
            }
        }

        throw new Error('Max retries exceeded');
    }

    trimMessages(messages: { role: 'user' | 'assistant', content: string }[], maxTokens: number) {
        // Remove messages from the beginning until under the token limit
        while (this.estimateTokenCount(JSON.stringify(messages)) > maxTokens) {
            messages.shift();
        }
        return messages;
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
        const loadingModal = new LoadingModal(this.app, true);
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
        const loadingModal = new LoadingModal(this.app, true);
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
        const loadingModal = new LoadingModal(this.app, true);
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
        const loadingModal = new LoadingModal(this.app, true);
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
            files = files.filter(file => file.path.startsWith(selectedDir));
        }

        return files;
    }

    // 计算文本相似度
    public calculateSimilarity(query: string, content: string): number {
        // Simple keyword matching
        const queryWords = new Set(query.split(/\s+/).filter(word => word.length > 2));
        const contentWords = new Set(content.split(/\s+/).filter(word => word.length > 2));

        // Count matching words
        let matches = 0;
        for (const word of queryWords) {
            if (contentWords.has(word)) matches++;
        }

        // Calculate similarity score
        return matches / Math.max(queryWords.size, 1);
    }

    // 获取文本向量
    async getEmbedding(text: string): Promise<number[]> {
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
            console.error("Error getting embedding:", error);
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

        const loadingModal = new LoadingModal(this.app, true);
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
            new SearchResultsModal(this.app, topResults).open();
            } catch (error) {
            new Notice("Error searching knowledge base: " + error.message);
                loadingModal.close();
        }
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
        const files = await this.getKnowledgeBaseNotes();
        const results: Array<{ file: TFile; similarity: number; content: string }> = [];

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                // Use the synchronous calculateSimilarity method
                const similarity = this.calculateSimilarity(query.toLowerCase(), content.toLowerCase());
                
                if (similarity > 0) {
                    // Get a relevant snippet of the content
                    const snippet = this.getRelevantSnippet(content, query);
                    results.push({ file, similarity, content: snippet });
                }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
            }
        }

        // Sort by similarity and return top results
        return results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    private getRelevantSnippet(content: string, query: string, snippetLength: number = 300): string {
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        
        // Find the best matching position
        const index = lowerContent.indexOf(lowerQuery);
        if (index === -1) {
            // If exact match not found, try to find any query word
            const queryWords = query.toLowerCase().split(/\s+/);
            for (const word of queryWords) {
                const wordIndex = lowerContent.indexOf(word);
                if (wordIndex !== -1) {
                    return this.extractSnippet(content, wordIndex, snippetLength);
                }
            }
            // If no matches found, return start of document
            return content.slice(0, snippetLength) + "...";
        }

        return this.extractSnippet(content, index, snippetLength);
    }

    private extractSnippet(content: string, index: number, snippetLength: number): string {
        const start = Math.max(0, index - snippetLength / 2);
        const end = Math.min(content.length, index + snippetLength / 2);
        let snippet = content.slice(start, end);

        // Add ellipsis if we're not at the start/end
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
        const loadingModal = new LoadingModal(this.app, true);
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
            new PolishResultModal(this.app, this, content, polishedText, (updatedContent) => {
                // Handle apply changes
                editor.replaceSelection(updatedContent);
            }).open();
        }
    }
    
    // Helper method to generate text with diff markers for direct editing
    private generateDiffHtml(original: string, polished: string): string {
        // Simple diff implementation that marks deletions and additions
        // For direct editing in the editor, we'll use markdown-compatible syntax
        // Deletions will use ~~strikethrough~~ and additions will use **bold**
        
        // Split into lines for line-by-line comparison
        const originalLines = original.split('\n');
        const polishedLines = polished.split('\n');
        
        // Simple line-by-line diff (can be enhanced with a proper diff algorithm)
        const result: string[] = [];
        
        // Find the shorter and longer arrays
        const maxLength = Math.max(originalLines.length, polishedLines.length);
        
        for (let i = 0; i < maxLength; i++) {
            const originalLine = i < originalLines.length ? originalLines[i] : '';
            const polishedLine = i < polishedLines.length ? polishedLines[i] : '';
            
            if (originalLine === polishedLine) {
                // No change
                result.push(polishedLine);
            } else if (originalLine.trim() === '') {
                // Line added
                result.push(`**${polishedLine}**`);
            } else if (polishedLine.trim() === '') {
                // Line deleted
                result.push(`~~${originalLine}~~`);
            } else {
                // Line changed - show both with markers
                result.push(`~~${originalLine}~~\n**${polishedLine}**`);
            }
        }
        
        return result.join('\n');
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

    constructor(app: App, isProgress: boolean = false) {
        super(app);
        this.isProgress = isProgress;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        if (this.isProgress) {
            // Progress-style modal (used for batch operations)
            contentEl.addClass('loading-modal');
        contentEl.createEl("h2", { text: "Searching..." });
        this.statusEl = contentEl.createEl("p", { text: "Initializing..." });
        this.countEl = contentEl.createEl("p", { cls: "count-text" });
        this.progressEl = contentEl.createEl("p", { cls: "progress-text" });
        } else {
            // Simple spinner-style modal (used for single operations)
            contentEl.createEl("h2", { text: "Processing..." });
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
    plugin: AIPilot;
    editor: Editor;
    undoStack: { from: EditorPosition, to: EditorPosition, text: string }[] = [];

    constructor(app: App, plugin: AIPilot, content: string, editor: Editor, onApply: (content: string) => void) {
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
    private plugin: AIPilot;
    private editor: Editor | null;

    constructor(app: App, plugin: AIPilot, initialHistory: Message[] = [], editor: Editor | null = null) {
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
    constructor(app: App, private results: { file: TFile; similarity: number }[]) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('search-results-modal');
        
        contentEl.createEl('h2', { text: 'Search Results' });
        
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

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class AITextSettingTab extends PluginSettingTab {
    plugin: AIPilot;

    constructor(app: App, plugin: AIPilot) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        
        // API Settings
        containerEl.createEl('h2', { text: 'API Settings' });
        
        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));
                
        // Provider Settings
        new Setting(containerEl)
            .setName('API Provider')
            .setDesc('Select your AI provider')
            .addDropdown(dropdown => dropdown
                .addOption('openai', 'OpenAI')
                .addOption('zhipuai', 'ZhipuAI')
                .addOption('groq', 'Groq')
                .setValue(this.plugin.settings.provider)
                .onChange(async (value: 'openai' | 'zhipuai' | 'groq') => {
                    this.plugin.settings.provider = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to update model options
                }));
        
        // Model Settings
        if (this.plugin.settings.provider === 'openai') {
            new Setting(containerEl)
                .setName('Model')
                .setDesc('Select OpenAI model')
                .addDropdown(dropdown => dropdown
                    .addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo')
                    .addOption('gpt-4', 'GPT-4')
                    .addOption('gpt-4-turbo', 'GPT-4 Turbo')
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    }));
        } else if (this.plugin.settings.provider === 'zhipuai') {
            new Setting(containerEl)
                .setName('Chat Model')
                .setDesc('Select ZhipuAI model')
                .addDropdown(dropdown => {
                    Object.keys(ZHIPUAI_MODELS.CHAT).forEach(modelName => {
                        dropdown.addOption(modelName, modelName);
                    });
                    return dropdown
                        .setValue(this.plugin.settings.chatModel)
                        .onChange(async (value) => {
                            this.plugin.settings.chatModel = value as keyof typeof ZHIPUAI_MODELS.CHAT;
                            this.plugin.settings.model = value;
                            await this.plugin.saveSettings();
                        });
                });
        } else if (this.plugin.settings.provider === 'groq') {
            new Setting(containerEl)
                .setName('Model')
                .setDesc('Select Groq model')
                .addDropdown(dropdown => dropdown
                    .addOption('llama2-70b-4096', 'Llama-2 70B')
                    .addOption('mixtral-8x7b-32768', 'Mixtral 8x7B')
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                }));
    }
        
        // Embedding Model Settings
        new Setting(containerEl)
            .setName('Embedding Model')
            .setDesc('Select embedding model')
            .addDropdown(dropdown => {
                Object.keys(EMBEDDING_MODELS).forEach(modelName => {
                    dropdown.addOption(modelName, modelName);
                });
                return dropdown
                    .setValue(this.plugin.settings.embeddingModel)
                    .onChange(async (value) => {
                        this.plugin.settings.embeddingModel = value as EmbeddingModelKey;
                        const dimensions = EMBEDDING_MODELS[value as EmbeddingModelKey].dimensions;
                        if (dimensions) {
                            this.plugin.settings.embeddingDimensions = dimensions;
                        }
                        await this.plugin.saveSettings();
                    });
            });
        
        // Knowledge Base Setting
        new Setting(containerEl)
            .setName('Knowledge Base Path')
            .setDesc('Enter the path to your knowledge base folder')
            .addText(text => text
                .setPlaceholder('AI_KnowledgeBase')
                .setValue(this.plugin.settings.knowledgeBasePath)
                .onChange(async (value) => {
                    this.plugin.settings.knowledgeBasePath = value;
                    await this.plugin.saveSettings();
                }));
        
        // Chat History Path Setting
        new Setting(containerEl)
            .setName('Chat History Path')
            .setDesc('Enter the path to store your chat history files')
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
        if (!this.plugin.settings.functions || this.plugin.settings.functions.length === 0) {
            this.plugin.settings.functions = [...DEFAULT_SETTINGS.functions];
            
            // Copy any custom functions
            if (this.plugin.settings.customFunctions && this.plugin.settings.customFunctions.length > 0) {
                this.plugin.settings.functions.push(...this.plugin.settings.customFunctions);
            }
        }
        
        // Migrate prompts to functions for backward compatibility
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
                    new CustomFunctionModal(this.app, null, async (customFunc) => {
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
    }
    
    // Migrate old prompt templates to the new functions array for backward compatibility
    private migratePromptsToFunctions() {
        // Handle potential migration from old settings structure
        // Update built-in functions with values from legacy prompt fields
        if (this.plugin.settings.functions) {
            const organizeFunc = this.plugin.settings.functions.find(f => f.isBuiltIn && f.name === "Organize");
            if (organizeFunc && this.plugin.settings.promptOrganize) {
                organizeFunc.prompt = this.plugin.settings.promptOrganize;
            }
            
            const grammarFunc = this.plugin.settings.functions.find(f => f.isBuiltIn && f.name === "Grammar");
            if (grammarFunc && this.plugin.settings.promptCheckGrammar) {
                grammarFunc.prompt = this.plugin.settings.promptCheckGrammar;
            }
            
            const generateFunc = this.plugin.settings.functions.find(f => f.isBuiltIn && f.name === "Generate");
            if (generateFunc && this.plugin.settings.promptGenerateContent) {
                generateFunc.prompt = this.plugin.settings.promptGenerateContent;
            }
            
            const dialogueFunc = this.plugin.settings.functions.find(f => f.isBuiltIn && f.name === "Dialogue");
            if (dialogueFunc && this.plugin.settings.promptDialogue) {
                dialogueFunc.prompt = this.plugin.settings.promptDialogue;
            }
            
            const summaryFunc = this.plugin.settings.functions.find(f => f.isBuiltIn && f.name === "Summarize");
            if (summaryFunc && this.plugin.settings.promptSummary) {
                summaryFunc.prompt = this.plugin.settings.promptSummary;
            }
        }
    }
    
    displayFunctions(container: HTMLElement): void {
        container.empty();
        
        if (!this.plugin.settings.functions || this.plugin.settings.functions.length === 0) {
            container.createEl('p', { 
                text: 'No functions configured yet.',
                cls: 'no-functions'
            });
            return;
        }
        
        // Group functions by type
        const builtInFunctions = this.plugin.settings.functions.filter(f => f.isBuiltIn);
        const customFunctions = this.plugin.settings.functions.filter(f => !f.isBuiltIn);
        
        // Create section for built-in functions
        if (builtInFunctions.length > 0) {
            const builtInSection = container.createDiv({ cls: 'function-section' });
            builtInSection.createEl('h3', { text: 'Built-in Functions' });
            
            builtInFunctions.forEach((func, index) => {
                this.createFunctionItem(builtInSection, func, index, true);
            });
        }
        
        // Create section for custom functions
        if (customFunctions.length > 0) {
            const customSection = container.createDiv({ cls: 'function-section' });
            customSection.createEl('h3', { text: 'Custom Functions' });
            
            customFunctions.forEach((func, index) => {
                this.createFunctionItem(customSection, func, builtInFunctions.length + index, false);
            });
        }
    }
    
    createFunctionItem(container: HTMLElement, func: CustomFunction, index: number, isBuiltIn: boolean): void {
        const funcDiv = container.createDiv({ cls: `function-item ${isBuiltIn ? 'built-in' : 'custom'}` });
        
        // Function preview
        const previewDiv = funcDiv.createDiv({ cls: 'function-preview' });
        const iconContainer = previewDiv.createDiv({ cls: 'function-icon' });
        try {
            setIcon(iconContainer, func.icon);
        } catch (e) {
            setIcon(iconContainer, 'bot'); // Fallback icon
        }
        
        previewDiv.createEl('span', { text: func.name, cls: 'function-name' });
        
        if (func.tooltip) {
            previewDiv.createEl('span', { text: func.tooltip, cls: 'function-tooltip' });
        }
        
        // Function actions
        const actionsDiv = funcDiv.createDiv({ cls: 'function-actions' });
        
        const editButton = actionsDiv.createEl('button', { 
            cls: 'function-edit',
            attr: {
                'aria-label': 'Edit function',
                'title': 'Edit function'
            }
        });
        setIcon(editButton, 'edit');
        editButton.addEventListener('click', () => {
            new CustomFunctionModal(this.app, func, async (updatedFunc) => {
                // Preserve built-in status
                updatedFunc.isBuiltIn = isBuiltIn;
                
                // Update in unified functions array
                this.plugin.settings.functions[index] = updatedFunc;
                
                // Also update legacy fields for backward compatibility
                if (isBuiltIn) {
                    if (func.name === "Organize") this.plugin.settings.promptOrganize = updatedFunc.prompt;
                    else if (func.name === "Grammar") this.plugin.settings.promptCheckGrammar = updatedFunc.prompt;
                    else if (func.name === "Generate") this.plugin.settings.promptGenerateContent = updatedFunc.prompt;
                    else if (func.name === "Dialogue") this.plugin.settings.promptDialogue = updatedFunc.prompt;
                    else if (func.name === "Summarize") this.plugin.settings.promptSummary = updatedFunc.prompt;
                } else {
                    // Update in customFunctions array for backward compatibility
                    // Find the function by name and icon only (not prompt)
                    const customIndex = this.plugin.settings.customFunctions.findIndex(f => 
                        f.name === func.name && f.icon === func.icon);
                    
                    if (customIndex >= 0) {
                        this.plugin.settings.customFunctions[customIndex] = updatedFunc;
                    }
                }
                
                await this.plugin.saveSettings();
                this.display(); // Refresh display
            }).open();
        });
        
        // Only allow deleting custom functions
        if (!isBuiltIn) {
            const deleteButton = actionsDiv.createEl('button', { 
                cls: 'function-delete',
                attr: {
                    'aria-label': 'Delete function',
                    'title': 'Delete function'
                }
            });
            setIcon(deleteButton, 'trash');
            deleteButton.addEventListener('click', async () => {
                // Remove from unified functions array
                this.plugin.settings.functions.splice(index, 1);
                
                // Also remove from customFunctions array for backward compatibility
                const customIndex = this.plugin.settings.customFunctions.findIndex(f => 
                    f.name === func.name && f.icon === func.icon);
                
                if (customIndex >= 0) {
                    this.plugin.settings.customFunctions.splice(customIndex, 1);
                }
                
                await this.plugin.saveSettings();
                this.display(); // Refresh display
            });
        }
    }
}

class CustomFunctionModal extends Modal {
    private customFunc: CustomFunction | null;
    private onSubmit: (customFunc: CustomFunction) => void;
    private nameInput: HTMLInputElement;
    private iconInput: HTMLInputElement;
    private tooltipInput: HTMLInputElement;
    private promptInput: HTMLTextAreaElement;
    private iconPreview: HTMLElement;

    constructor(app: App, customFunc: CustomFunction | null, onSubmit: (customFunc: CustomFunction) => void) {
        super(app);
        this.customFunc = customFunc;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('custom-function-modal');

        contentEl.createEl('h2', { text: this.customFunc ? 'Edit Custom Function' : 'Add Custom Function' });

        // Name field
        const nameDiv = contentEl.createDiv({ cls: 'setting-item' });
        nameDiv.createEl('label', { text: 'Function Name', cls: 'setting-item-name' });
        this.nameInput = nameDiv.createEl('input', { 
            type: 'text',
            cls: 'setting-item-input',
            value: this.customFunc?.name || '',
            attr: { placeholder: 'Enter function name' }
        });

        // Icon field with preview
        const iconDiv = contentEl.createDiv({ cls: 'setting-item' });
        const iconLabel = iconDiv.createEl('label', { text: 'Icon', cls: 'setting-item-name' });
        
        // Add help text about Lucide icons
        const iconHelp = iconDiv.createEl('div', { cls: 'setting-item-description' });
        iconHelp.innerHTML = 'Enter an icon name from <a href="https://lucide.dev/icons/" target="_blank">Lucide Icons</a> (e.g., "book", "pen", "code")';
        
        const iconRow = iconDiv.createDiv({ cls: 'icon-row' });
        this.iconInput = iconRow.createEl('input', {
            type: 'text',
            cls: 'setting-item-input',
            value: this.customFunc?.icon || '',
            attr: { placeholder: 'Enter icon name' }
        });
        
        this.iconPreview = iconRow.createDiv({ cls: 'icon-preview' });
        if (this.customFunc?.icon) {
            try {
                setIcon(this.iconPreview, this.customFunc.icon);
            } catch (e) {
                this.iconPreview.setText('Invalid icon');
            }
        }
        
        // Update preview when icon input changes
        this.iconInput.addEventListener('input', () => {
            this.iconPreview.empty();
            if (this.iconInput.value) {
                try {
                    setIcon(this.iconPreview, this.iconInput.value);
                } catch (e) {
                    this.iconPreview.setText('Invalid icon');
                }
            }
        });

        // Tooltip field
        const tooltipDiv = contentEl.createDiv({ cls: 'setting-item' });
        tooltipDiv.createEl('label', { text: 'Tooltip (Optional)', cls: 'setting-item-name' });
        this.tooltipInput = tooltipDiv.createEl('input', {
            type: 'text',
            cls: 'setting-item-input',
            value: this.customFunc?.tooltip || '',
            attr: { placeholder: 'Enter tooltip text' }
        });

        // Prompt field
        const promptDiv = contentEl.createDiv({ cls: 'setting-item' });
        promptDiv.createEl('label', { text: 'Prompt Template', cls: 'setting-item-name' });
        promptDiv.createEl('div', { 
            text: 'Enter the prompt to send to the AI. The selected text will be appended to this prompt.',
            cls: 'setting-item-description'
        });
        
        // Ensure the prompt value is properly handled 
        const promptValue = this.customFunc?.prompt || '';
        
        this.promptInput = promptDiv.createEl('textarea', {
            cls: 'setting-item-input prompt-input',
            value: promptValue,
            attr: { 
                placeholder: 'Enter prompt template...',
                rows: '6'
            }
        });

        // Button container
        const buttonDiv = contentEl.createDiv({ cls: 'custom-function-button-container' });
        
        const cancelButton = buttonDiv.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => {
            this.close();
        });
        
        const submitButton = buttonDiv.createEl('button', { text: this.customFunc ? 'Update' : 'Create', cls: 'mod-cta' });
        submitButton.addEventListener('click', () => {
            const name = this.nameInput.value.trim();
            const icon = this.iconInput.value.trim();
            const prompt = this.promptInput.value; // Preserve whitespace in prompt
            
            if (!name) {
                new Notice('Please enter a function name');
                return;
            }
            
            if (!icon) {
                new Notice('Please enter an icon name');
                return;
            }
            
            if (!prompt) {
                new Notice('Please enter a prompt template');
                return;
            }
            
            // Create a well-formed function object with all required properties
            const functionData: CustomFunction = {
                name,
                icon,
                prompt: String(prompt), // Cast to string to ensure proper storage
                tooltip: this.tooltipInput.value.trim() || undefined
            };
            
            this.onSubmit(functionData);
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class PolishResultModal extends Modal {
    private originalText: string;
    private polishedText: string;
    private onApply: (text: string) => void;
    private plugin: AIPilot;
    private resultEl: HTMLElement;

    constructor(app: App, plugin: AIPilot, originalText: string, polishedText: string, onApply: (text: string) => void) {
        super(app);
        this.plugin = plugin;
        this.originalText = originalText;
        this.polishedText = polishedText;
        this.onApply = onApply;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("polish-result-modal");
        
        // Title
        const headerContainer = contentEl.createDiv({ cls: "polish-header" });
        headerContainer.createEl("h2", { text: "Polish Result" });
        
        // Add a legend for the diff indicators
        const legendContainer = contentEl.createDiv({ cls: "polish-legend" });
        
        // Description with legend
        const descriptionEl = legendContainer.createEl("p", {
            cls: "polish-description"
        });
        descriptionEl.setText("Review the proposed changes:");
        
        const legendItemsContainer = legendContainer.createDiv({ cls: "polish-legend-items" });
        
        // Deleted text legend
        const deletedLegend = legendItemsContainer.createDiv({ cls: "polish-legend-item" });
        const deletedSample = deletedLegend.createSpan({ cls: "polish-deleted polish-sample" });
        deletedSample.setText("deleted text");
        deletedLegend.createSpan({ text: " = removed content" });
        
        // Added text legend
        const addedLegend = legendItemsContainer.createDiv({ cls: "polish-legend-item" });
        const addedSample = addedLegend.createSpan({ cls: "polish-highlight polish-sample" });
        addedSample.setText("highlighted text");
        addedLegend.createSpan({ text: " = added content" });
        
        // Result container with highlighted changes
        this.resultEl = contentEl.createDiv({ cls: "polish-result-container" });
        this.highlightChanges();
        
        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: "polish-button-container" });
        
        // Apply button
        const applyButton = buttonContainer.createEl("button", {
            text: "Apply Changes",
            cls: "mod-cta"
        });
        applyButton.addEventListener("click", () => {
            this.onApply(this.polishedText);
            this.close();
        });
        
        // Cancel button
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            this.close();
        });
    }
    
    // Method to highlight the differences between original and polished text
    private highlightChanges() {
        // Improved diff implementation to highlight changes
        const diffHtml = this.generateInlineDiff(this.originalText, this.polishedText);
        
        // Ensure HTML is properly rendered by setting innerHTML
        this.resultEl.empty();
        this.resultEl.innerHTML = diffHtml;
        
        // Make sure styles are applied by forcing a reflow
        setTimeout(() => {
            // Add a small class toggle to force style recalculation
            this.resultEl.addClass('diff-rendered');
        }, 10);
    }
    
    // Generate a more accurate inline diff with strikethrough for deletions and highlighting for additions
    private generateInlineDiff(original: string, polished: string): string {
        // First try to identify paragraph-level changes
        const originalParagraphs = original.split('\n\n');
        const polishedParagraphs = polished.split('\n\n');
        
        // Check if we're dealing with a multi-paragraph text
        if (originalParagraphs.length > 1 || polishedParagraphs.length > 1) {
            return this.generateParagraphDiff(originalParagraphs, polishedParagraphs);
        }

        // For single paragraphs, use word-level diff
        const originalWords = this.tokenize(original);
        const polishedWords = this.tokenize(polished);
        
        // Find the longest common subsequence
        const lcs = this.findLongestCommonSubsequence(originalWords, polishedWords);
        
        // Generate HTML with diff markup
        let html = '';
        let i = 0, j = 0;
        
        for (const common of lcs) {
            // Add deleted words (in original but not in LCS)
            while (i < originalWords.length && originalWords[i] !== common) {
                html += `<span class="polish-deleted">${this.escapeHtml(originalWords[i])}</span> `;
                i++;
            }
            
            // Add added words (in polished but not in LCS)
            while (j < polishedWords.length && polishedWords[j] !== common) {
                html += `<span class="polish-highlight">${this.escapeHtml(polishedWords[j])}</span> `;
                j++;
            }
            
            // Add common word
            html += this.escapeHtml(common) + ' ';
            i++;
            j++;
        }
        
        // Add any remaining deleted words
        while (i < originalWords.length) {
            html += `<span class="polish-deleted">${this.escapeHtml(originalWords[i])}</span> `;
            i++;
        }
        
        // Add any remaining added words
        while (j < polishedWords.length) {
            html += `<span class="polish-highlight">${this.escapeHtml(polishedWords[j])}</span> `;
            j++;
        }
        
        return html;
    }
    
    // Generate paragraph-level diff
    private generateParagraphDiff(originalParagraphs: string[], polishedParagraphs: string[]): string {
        let html = '';
        const maxParagraphs = Math.max(originalParagraphs.length, polishedParagraphs.length);
        
        for (let i = 0; i < maxParagraphs; i++) {
            const originalPara = i < originalParagraphs.length ? originalParagraphs[i] : '';
            const polishedPara = i < polishedParagraphs.length ? polishedParagraphs[i] : '';
            
            if (originalPara === polishedPara) {
                // No change in this paragraph
                html += `<p>${this.escapeHtml(originalPara)}</p>`;
            } else if (originalPara && !polishedPara) {
                // Paragraph was deleted
                html += `<p><span class="polish-deleted">${this.escapeHtml(originalPara)}</span></p>`;
            } else if (!originalPara && polishedPara) {
                // Paragraph was added
                html += `<p><span class="polish-highlight">${this.escapeHtml(polishedPara)}</span></p>`;
            } else {
                // Paragraph was modified, show word-level diff
                const originalWords = this.tokenize(originalPara);
                const polishedWords = this.tokenize(polishedPara);
                const lcs = this.findLongestCommonSubsequence(originalWords, polishedWords);
                
                let paraHtml = '<p>';
                let i = 0, j = 0;
                
                for (const common of lcs) {
                    // Add deleted words
                    while (i < originalWords.length && originalWords[i] !== common) {
                        paraHtml += `<span class="polish-deleted">${this.escapeHtml(originalWords[i])}</span> `;
                        i++;
                    }
                    
                    // Add added words
                    while (j < polishedWords.length && polishedWords[j] !== common) {
                        paraHtml += `<span class="polish-highlight">${this.escapeHtml(polishedWords[j])}</span> `;
                        j++;
                    }
                    
                    // Add common word
                    paraHtml += this.escapeHtml(common) + ' ';
                    i++;
                    j++;
                }
                
                // Add remaining deleted words
                while (i < originalWords.length) {
                    paraHtml += `<span class="polish-deleted">${this.escapeHtml(originalWords[i])}</span> `;
                    i++;
                }
                
                // Add remaining added words
                while (j < polishedWords.length) {
                    paraHtml += `<span class="polish-highlight">${this.escapeHtml(polishedWords[j])}</span> `;
                    j++;
                }
                
                paraHtml += '</p>';
                html += paraHtml;
            }
        }
        
        return html;
    }
    
    // Split text into words for diffing while preserving newlines
    private tokenize(text: string): string[] {
        // First normalize line endings
        const normalizedText = text.replace(/\r\n/g, '\n');
        
        // Process text to preserve important whitespace
        return normalizedText
            .replace(/\n/g, ' \n ')  // Add spaces around newlines to preserve them
            .replace(/\t/g, ' \t ')  // Add spaces around tabs to preserve them
            .split(/\s+/)            // Split by whitespace
            .filter(word => word.length > 0);  // Remove empty tokens
    }
    
    // A simple longest common subsequence algorithm
    private findLongestCommonSubsequence(a: string[], b: string[]): string[] {
        const table: number[][] = Array(a.length + 1).fill(0).map(() => Array(b.length + 1).fill(0));
        
        // Fill the LCS table
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                if (a[i-1] === b[j-1]) {
                    table[i][j] = table[i-1][j-1] + 1;
                } else {
                    table[i][j] = Math.max(table[i][j-1], table[i-1][j]);
                }
            }
        }
        
        // Reconstruct the LCS
        const result: string[] = [];
        let i = a.length, j = b.length;
        
        while (i > 0 && j > 0) {
            if (a[i-1] === b[j-1]) {
                result.unshift(a[i-1]);
                i--;
                j--;
            } else if (table[i][j-1] > table[i-1][j]) {
                j--;
            } else {
                i--;
            }
        }
        
        return result;
    }
    
    // Escape HTML special characters to prevent XSS
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

