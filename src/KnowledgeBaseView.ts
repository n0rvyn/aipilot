import { ItemView, WorkspaceLeaf, TFile, TFolder, setIcon, Notice } from "obsidian";
import type AIPilotPlugin from "./main";
import { LoadingModal, SearchResultsModal } from './modals';
import { MarkdownRenderer as NewMarkdownRenderer } from './MarkdownRenderer';
import { RAGService } from './rag';
import { Source } from './rag/RAGService';

export const KNOWLEDGE_BASE_VIEW_TYPE = "aipilot-kb-view";

export class KnowledgeBaseView extends ItemView {
    private plugin: AIPilotPlugin;
    public containerEl: HTMLElement;
    private inputContainer: HTMLElement;
    private resultsContainer: HTMLElement;
    private progressContainer: HTMLElement;
    private progressBar: HTMLElement;
    private progressText: HTMLElement;
    private countText: HTMLElement;
    private dirSelector: HTMLSelectElement;
    private searchInput: HTMLInputElement;
    
    // Cache for search results to improve performance
    private knowledgeBaseCache: Map<string, { 
        similarity: number, 
        content: string, 
        timestamp: number,
        hash: string 
    }> = new Map();

    constructor(leaf: WorkspaceLeaf, plugin: AIPilotPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return KNOWLEDGE_BASE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Knowledge Base Search';
    }

    async onOpen(): Promise<void> {
        // Add container class for styling
        this.contentEl.addClass('kb-view-container');
        
        // Create main container
        this.containerEl = this.contentEl.createDiv({ cls: "kb-container" });
        
        // Create header
        this.createHeader();
        
        // Create search interface
        this.createSearchInterface();
        
        // Create results area
        this.resultsContainer = this.containerEl.createDiv({ cls: "kb-results" });
        
        // Add initial welcome message
        this.showWelcomeMessage();
    }

    private createHeader(): void {
        const headerEl = this.containerEl.createDiv({ cls: 'kb-header' });
        
        headerEl.createEl('h2', { text: 'Knowledge Base Search' });
        
        const descriptionEl = headerEl.createEl('p', { 
            text: 'Search your notes and documents using semantic search and AI analysis.'
        });
    }

    private createSearchInterface(): void {
        this.inputContainer = this.containerEl.createDiv({ cls: "kb-input-container" });
        
        // Create directory selector
        const dirSelectorContainer = this.inputContainer.createDiv({ cls: "kb-dir-selector-container" });
        dirSelectorContainer.createEl("label", { 
            text: "Search in:", 
            attr: { for: "kb-dir-selector" } 
        });
        
        this.dirSelector = dirSelectorContainer.createEl("select", {
            cls: "kb-dir-selector",
            attr: {
                id: "kb-dir-selector",
                'aria-label': 'Select directory to search in'
            }
        });
        
        // Add "All Files" option
        this.dirSelector.createEl("option", {
            text: "All Files",
            value: ""
        });
        
        // Get and add first-level directories
        const rootFolder = this.app.vault.getRoot();
        const folders = rootFolder.children
            .filter(child => child instanceof TFolder)
            .sort((a, b) => a.name.localeCompare(b.name));
            
        folders.forEach(folder => {
            this.dirSelector.createEl("option", {
                text: folder.name,
                value: folder.path
            });
        });

        // Create search input row
        const searchInputRow = this.inputContainer.createDiv({ cls: "kb-search-input-row" });
        this.searchInput = searchInputRow.createEl("input", {
            cls: "kb-search-input",
            attr: {
                placeholder: "Search your knowledge base...",
                'aria-label': 'Search query',
                type: 'search'
            }
        });
        
        const searchButton = searchInputRow.createEl("button", {
            cls: "kb-search-button",
            text: "Search"
        });
        
        // Add Q&A button
        const qaButton = this.inputContainer.createDiv({ cls: "kb-qa-button" });
        qaButton.createEl("button", {
            text: "Ask Question (Q&A)",
            cls: "kb-qa-button-inner"
        });
        
        // Add progress indicator with enhanced styling
        this.progressContainer = this.inputContainer.createDiv({ cls: "kb-progress" });
        this.progressBar = this.progressContainer.createDiv({ cls: "kb-progress-bar" });
        this.progressText = this.progressContainer.createDiv({ cls: "kb-progress-text" });
        this.countText = this.progressContainer.createDiv({ cls: "kb-count-text" });
        this.progressContainer.style.display = 'none';

        // Add event listeners
        searchButton.addEventListener("click", () => this.handleSearch());
        this.searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this.handleSearch();
            }
        });
        
        qaButton.addEventListener("click", () => this.handleQA());
    }

    private showWelcomeMessage(): void {
        this.resultsContainer.empty();
        
        const welcomeEl = this.resultsContainer.createDiv({ cls: "kb-welcome" });
        const iconEl = welcomeEl.createDiv({ cls: "kb-welcome-icon" });
        setIcon(iconEl, "search");
        
        welcomeEl.createEl("h3", { text: "Search Your Knowledge Base" });
        welcomeEl.createEl("p", { 
            text: "Enter a search query above to find relevant information in your notes." 
        });
        
        // Add feature description
        const featuresEl = this.resultsContainer.createDiv({ cls: "kb-features" });
        
        featuresEl.createEl("h4", { text: "Available Features:" });
        
        const featuresList = featuresEl.createEl("ul", { cls: "kb-features-list" });
        
        featuresList.createEl("li", { 
            text: "Semantic Search: Find information based on meaning, not just keywords." 
        });
        
        featuresList.createEl("li", { 
            text: "AI Analysis: Get AI-generated answers based on your documents." 
        });
        
        featuresList.createEl("li", { 
            text: "Knowledge Q&A: Ask questions about your knowledge base." 
        });
    }

    // Enhanced search handler using RAG service
    private async handleSearch(): Promise<void> {
        const query = this.searchInput.value.trim();
        if (!query) {
            this.resultsContainer.empty();
            this.resultsContainer.createDiv({ 
                cls: "kb-error-message", 
                text: "Please enter a search query." 
            });
            return;
        }

        this.progressContainer.style.display = 'block';
        this.progressText.textContent = 'Initializing search...';
        this.progressBar.style.width = '0%';
        this.countText.textContent = '';
        this.resultsContainer.empty();

        try {
            const selectedDir = this.dirSelector.value;
            
            // Use RAG service if available
            if (this.plugin.ragService) {
                // Setup progress callback
                const updateProgress = (stage: string, percent: number) => {
                    this.progressText.textContent = stage;
                    this.progressBar.style.width = `${percent}%`;
                    this.countText.textContent = `Processing ${stage}`;
                };
                
                // Setup streaming handler for real-time updates
                let streamedAnswer = '';
                const handleStream = (chunk: string) => {
                    if (!chunk) return;
                    
                    streamedAnswer += chunk;
                    
                    // Clear current results and show streaming content
                    this.resultsContainer.empty();
                    const streamingContainer = this.resultsContainer.createDiv({ cls: "kb-rag-results-container streaming" });
                    const answerDiv = streamingContainer.createDiv({ cls: "kb-rag-answer" });
                    
                    // Render the streamed content as markdown
                    try {
                        NewMarkdownRenderer.renderMarkdown(
                            streamedAnswer,
                            answerDiv,
                            '',
                            this.plugin
                        );
                    } catch (error) {
                        console.warn("Error rendering streaming markdown:", error);
                        answerDiv.setText(streamedAnswer);
                    }
                    
                    // Gradually fade out progress indicator once content starts streaming
                    if (this.progressContainer.style.display !== 'none' && streamedAnswer.length > 50) {
                        this.progressContainer.style.opacity = '0.7';
                    }
                };
                
                // Call RAG service with progress updates and streaming
                const result = await this.plugin.ragService.performCompleteRAG(query, {
                    showProgress: true,
                    onProgress: updateProgress,
                    streaming: true,
                    onChunk: handleStream,
                    limit: 10,
                    directory: selectedDir || undefined
                });
                
                // Display final RAG results with sources
                this.progressContainer.style.display = 'none';
                await this.displayRAGResults({
                    ...result,
                    answer: streamedAnswer || result.answer,
                    query: query
                });
            } else {
                // Fallback to legacy search
                const loadingModal = new LoadingModal(this.app, true, "Searching your knowledge base...");
                loadingModal.open();
                
                const results = await this.plugin.advancedSearch(query, 10, loadingModal);
                
                loadingModal.close();
                this.progressContainer.style.display = 'none';
                
                if (results.length === 0) {
                    this.resultsContainer.createDiv({ 
                        cls: "kb-error-message", 
                        text: "No relevant documents found for your query." 
                    });
                    return;
                }
                
                // Use the plugin's SearchResultsModal to display results
                new SearchResultsModal(this.app, results, query).open();
            }
        } catch (error) {
            console.error("Error searching knowledge base:", error);
            this.progressContainer.style.display = 'none';
            this.resultsContainer.empty();
            this.resultsContainer.createDiv({ 
                cls: "kb-error-message", 
                text: `Error searching knowledge base: ${error.message}` 
            });
        }
    }

    private async displayRAGResults(result: { 
        answer: string, 
        sources: Array<{ file: TFile; similarity: number; content: string }>,
        query: string,
        reflectionRounds?: number
    }): Promise<void> {
        this.resultsContainer.empty();
        
        // Create answer container
        const answerContainer = this.resultsContainer.createDiv({ cls: "kb-answer-container" });
        
        // Add question
        const questionDiv = answerContainer.createDiv({ cls: "kb-question" });
        questionDiv.createEl('h3', { text: 'Your Query' });
        questionDiv.createEl('p', { text: result.query });
        
        // Add answer with markdown rendering
        const answerDiv = answerContainer.createDiv({ cls: "kb-answer" });
        answerDiv.createEl('h3', { text: 'Answer' });
        
        const answerContent = answerDiv.createDiv({ cls: "markdown-rendered" });
        NewMarkdownRenderer.renderMarkdown(result.answer, answerContent, '', this.plugin);
        
        // Show reflection badge if available
        if (result.reflectionRounds && result.reflectionRounds > 0) {
            const reflectionBadge = answerDiv.createDiv({ cls: "reflection-badge" });
            reflectionBadge.setText(`AI Reflection: ${result.reflectionRounds} rounds`);
        }
        
        // Add sources if available
        if (result.sources && result.sources.length > 0) {
            const sourcesContainer = this.resultsContainer.createDiv({ cls: "kb-sources-container" });
            sourcesContainer.createEl('h3', { text: 'Sources' });
            
            result.sources.forEach((source, index) => {
                const sourceItem = sourcesContainer.createDiv({ cls: "kb-source-item" });
                
                // Create source header with file info and controls
                const sourceHeader = sourceItem.createDiv({ cls: "kb-source-header" });
                
                const sourceTitle = sourceHeader.createDiv({ cls: "kb-source-title" });
                sourceTitle.createEl('span', { text: `[${index + 1}] ` });
                
                const sourceLink = sourceTitle.createEl('a', { 
                    text: source.file.basename,
                    cls: "kb-source-link"
                });
                
                sourceLink.addEventListener('click', () => {
                    this.app.workspace.getLeaf().openFile(source.file);
                });
                
                // Add file metadata
                const sourceInfo = sourceHeader.createDiv({ cls: "kb-source-info" });
                sourceInfo.createEl('span', { 
                    text: `${source.file.path} • Relevance: ${(source.similarity * 100).toFixed(1)}%` 
                });
                
                // Add preview of content
                if (source.content) {
                    const previewContainer = sourceItem.createDiv({ cls: "kb-source-preview" });
                    previewContainer.setText(source.content.length > 200 
                        ? source.content.substring(0, 200) + "..." 
                        : source.content);
                    
                    // Add "View More" button if content is long
                    if (source.content.length > 200) {
                        const viewMoreBtn = sourceItem.createDiv({ cls: "kb-view-more-btn" });
                        viewMoreBtn.setText("View More");
                        
                        let expanded = false;
                        viewMoreBtn.addEventListener('click', () => {
                            if (expanded) {
                                previewContainer.setText(source.content.substring(0, 200) + "...");
                                viewMoreBtn.setText("View More");
                            } else {
                                previewContainer.setText(source.content);
                                viewMoreBtn.setText("View Less");
                            }
                            expanded = !expanded;
                        });
                    }
                }
            });
        }
    }

    private async handleQA(): Promise<void> {
        // Get input value
        const query = this.searchInput.value.trim();
        if (!query) {
            this.resultsContainer.empty();
            this.resultsContainer.createDiv({ 
                cls: "kb-error-message", 
                text: "Please enter a question." 
            });
            return;
        }

        this.progressContainer.style.display = 'block';
        this.progressText.textContent = 'Processing your question...';
        this.progressBar.style.width = '0%';
        this.countText.textContent = '';
        this.resultsContainer.empty();

        try {
            const selectedDir = this.dirSelector.value;
            
            // Use RAG service if available
            if (this.plugin.ragService) {
                // Setup progress callback
                const updateProgress = (stage: string, percent: number) => {
                    this.progressText.textContent = stage;
                    this.progressBar.style.width = `${percent}%`;
                    this.countText.textContent = `Processing ${stage}`;
                };
                
                // Setup streaming handler for real-time updates
                let streamedAnswer = '';
                const handleStream = (chunk: string) => {
                    if (!chunk) return;
                    
                    streamedAnswer += chunk;
                    
                    // Clear current results and show streaming content
                    this.resultsContainer.empty();
                    const streamingContainer = this.resultsContainer.createDiv({ cls: "kb-rag-results-container streaming" });
                    const answerDiv = streamingContainer.createDiv({ cls: "kb-rag-answer" });
                    
                    // Render the streamed content as markdown
                    try {
                        NewMarkdownRenderer.renderMarkdown(
                            streamedAnswer,
                            answerDiv,
                            '',
                            this.plugin
                        );
                    } catch (error) {
                        console.warn("Error rendering streaming markdown:", error);
                        answerDiv.setText(streamedAnswer);
                    }
                    
                    // Gradually fade out progress indicator once content starts streaming
                    if (this.progressContainer.style.display !== 'none' && streamedAnswer.length > 50) {
                        this.progressContainer.style.opacity = '0.7';
                    }
                };
                
                // Call RAG service with progress updates and streaming
                const result = await this.plugin.ragService.performCompleteRAG(query, {
                    showProgress: true,
                    onProgress: updateProgress,
                    streaming: true,
                    onChunk: handleStream,
                    limit: 10,
                    directory: selectedDir || undefined
                });
                
                // Display final RAG results with sources
                this.progressContainer.style.display = 'none';
                await this.displayRAGResults({
                    ...result,
                    answer: streamedAnswer || result.answer,
                    query: query
                });
            } else {
                new Notice("RAG service not available. Please check your configuration.");
            }
        } catch (error) {
            console.error("Error in Q&A:", error);
            this.progressContainer.style.display = 'none';
            this.resultsContainer.empty();
            this.resultsContainer.createDiv({ 
                cls: "kb-error-message", 
                text: `Error processing your question: ${error.message}` 
            });
        }
    }

    // Helper method to calculate file hash for caching
    private async calculateFileHash(content: string): Promise<string> {
        // Simple hashing function for cache keys
        // In a production app, you'd want to use a more robust hashing algorithm
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }

    async onClose(): Promise<void> {
        // Clean up
        this.contentEl.empty();
    }
} 