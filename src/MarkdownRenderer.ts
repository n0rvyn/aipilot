import { marked } from 'marked';
import { Component, MarkdownView, Notice, App, Plugin, TFile } from 'obsidian';

export class MarkdownRenderer extends Component {
    private container: HTMLElement;
    private content: string;
    private app: App;

    constructor(container: HTMLElement, content: string, app: App) {
        super();
        this.container = container;
        this.content = content;
        this.app = app;
    }

    static async renderMarkdown(content: string, container: HTMLElement, sourcePath: string, component: Plugin) {
        const renderer = new MarkdownRenderer(container, content, component.app);
        await renderer.render();
    }

    async render(): Promise<void> {
        try {
            // Clear container
            this.container.empty();
            
            // Add markdown-rendered class for styling
            this.container.addClass('markdown-rendered');
            
            // Parse markdown using marked.js
            const rendered = await marked.parse(this.content, { async: true });
            
            // Create a temporary div to parse the HTML content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rendered;
            
            // Safely append content using Obsidian's DOM API
            const fragment = document.createDocumentFragment();
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
            this.container.appendChild(fragment);
            
            // No action buttons will be added here - they'll be handled by ChatView
        } catch (error) {
            console.error("Error rendering markdown:", error);
            this.container.setText("Error rendering content: " + error.message);
        }
    }

    /**
     * Get content from the current editor
     */
    static getCurrentFileContent(app: App): string | null {
        try {
            const activeLeaf = app.workspace.activeLeaf;
            if (!activeLeaf) return null;
            
            const view = activeLeaf.view;
            if (!view || !('editor' in view)) return null;
            
            // @ts-ignore
            return view.editor.getValue();
        } catch (error) {
            console.error("Error getting file content:", error);
            return null;
        }
    }
} 