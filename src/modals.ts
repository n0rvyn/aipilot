import { App, Modal, TFile, setIcon, Notice, MarkdownRenderer } from 'obsidian';
import { MarkdownRenderer as NewMarkdownRenderer } from './MarkdownRenderer';

export class LoadingModal extends Modal {
    private messageEl: HTMLDivElement;
    private progressEl: HTMLDivElement;
    private progressBarEl: HTMLDivElement;
    private percentageEl: HTMLSpanElement;
    private statusEl: HTMLDivElement;
    private isCancelled: boolean = false;
    private isProgress: boolean; // Maintain for backward compatibility

    constructor(app: App, isProgress: boolean = false, modalTitle: string = "") {
        super(app);
        this.isProgress = isProgress;
        // Set title from parameter or use default
        if (modalTitle) {
            this.titleEl.setText(modalTitle);
        } else {
            this.titleEl.setText(isProgress ? "Processing..." : "Loading...");
        }
    }

    onOpen() {
        const { contentEl } = this;
        
        // Create container
        const container = contentEl.createDiv({ cls: "loading-modal-container" });
        
        // Add spinner
        const spinnerContainer = container.createDiv({ cls: "loading-spinner-container" });
        const spinner = spinnerContainer.createDiv({ cls: "loading-spinner" });
        
        // Add message/status (support both)
        this.messageEl = container.createDiv({ cls: "loading-message" });
        this.statusEl = this.messageEl; // Use same element for both
        this.messageEl.setText("Please wait...");
        
        // Add progress bar
        const progressContainer = container.createDiv({ cls: "loading-progress-container" });
        
        // Create progress bar
        this.progressEl = progressContainer.createDiv({ cls: "loading-progress" });
        this.progressBarEl = this.progressEl.createDiv({ cls: "loading-progress-bar" });
        this.progressBarEl.style.width = "0%";
        
        // Add percentage
        this.percentageEl = progressContainer.createDiv({ cls: "loading-percentage" });
        this.percentageEl.setText("0%");
        
        // Add cancel button
        const buttonContainer = container.createDiv({ cls: "loading-button-container" });
        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        
        cancelButton.addEventListener("click", () => {
            this.isCancelled = true;
            this.close();
        });
    }

    // Support both new and old progress methods
    setProgress(progress: number, current?: number, total?: number) {
        // Update progress bar
        const percentage = Math.round(progress * 100);
        this.progressBarEl.style.width = `${percentage}%`;
        
        // Update percentage text
        if (current !== undefined && total !== undefined) {
            this.percentageEl.setText(`${current}/${total} (${percentage}%)`);
        } else {
            this.percentageEl.setText(`${percentage}%`);
        }
    }

    setTitle(title: string): this {
        this.titleEl.setText(title);
        return this;
    }
    
    // Support both message and status methods
    setMessage(message: string) {
        if (this.messageEl) {
            this.messageEl.setText(message);
        }
    }
    
    // Keep original method for backward compatibility
    setStatus(status: string) {
        this.setMessage(status);
    }

    isCanceled(): boolean {
        return this.isCancelled;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class SearchResultsModal extends Modal {
    private results: Array<{ file: TFile; similarity: number; content: string }>;
    private query: string;
    private answer?: string;
    private sources?: any[];
    private reflectionCount?: number;

    constructor(
        app: App, 
        resultsOrData: Array<{ file: TFile; similarity: number; content: string }> | { answer: string, sources: any[], reflectionCount?: number }, 
        query: string
    ) {
        super(app);
        
        // Handle both legacy and new format
        if (Array.isArray(resultsOrData)) {
            this.results = resultsOrData;
            this.answer = undefined;
            this.sources = undefined;
        } else {
            this.answer = resultsOrData.answer;
            this.sources = resultsOrData.sources;
            this.results = resultsOrData.sources || [];
            this.reflectionCount = resultsOrData.reflectionCount;
        }
        
        this.query = query;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("search-results-modal");
        
        // Add header with query
        contentEl.createEl("h2", { text: "Search Results" });
        contentEl.createEl("p", { 
            text: `Query: "${this.query}"`, 
            cls: "search-query" 
        });
        
        // If we have an answer (new format), display it
        if (this.answer) {
            const answerContainer = contentEl.createDiv({ cls: "search-answer-container" });
            
            // Create answer header
            answerContainer.createEl("h3", { text: "AI Answer", cls: "search-answer-header" });
            
            // Add reflection info if available
            if (this.reflectionCount !== undefined && this.reflectionCount > 0) {
                answerContainer.createEl("div", { 
                    text: `The AI performed ${this.reflectionCount} reflection ${this.reflectionCount === 1 ? 'round' : 'rounds'} to improve this answer.`,
                    cls: "search-reflection-info"
                });
            }
            
            // Create answer content
            const answerContent = answerContainer.createDiv({ cls: "search-answer-content markdown-rendered" });
            
            // Render answer as markdown
            MarkdownRenderer.renderMarkdown(
                this.answer,
                answerContent,
                '',
                null as any
            );
            
            // Add sources header
            contentEl.createEl("h3", { text: "Sources", cls: "search-sources-header" });
        }
        
        // Create results container
        const resultsContainer = contentEl.createDiv({ cls: "search-results-container" });
        
        // Add results
        this.results.forEach((result, index) => {
            const resultEl = resultsContainer.createDiv({ cls: "search-result" });
            
            // Add header with file name and similarity score
            const headerEl = resultEl.createDiv({ cls: "search-result-header" });
            
            // Create file link
            const fileLink = headerEl.createEl("a", { 
                cls: "search-result-file-link",
                text: result.file.name
            });
            
            fileLink.addEventListener("click", () => {
                // Open the file in a new pane
                this.app.workspace.getLeaf('tab').openFile(result.file);
                this.close();
            });
            
            // Add similarity score
            headerEl.createEl("span", { 
                cls: "search-result-similarity",
                text: `Relevance: ${Math.round(result.similarity * 100)}%`
            });
            
            // Add result content
            const contentEl = resultEl.createDiv({ cls: "search-result-content" });
            contentEl.setText(result.content);
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 