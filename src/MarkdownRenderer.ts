import { marked } from 'marked';
import { Component, MarkdownView, Notice, App, Plugin, TFile, Editor } from 'obsidian';

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

    /**
     * Get the active editor and selected text
     * @returns Object containing the editor and selected text, or null if no editor is found
     */
    static getActiveEditorAndSelection(app: App): { editor: Editor; selectedText: string } | null {
        try {
            // Try to get all markdown views
            const markdownViews = app.workspace.getLeavesOfType('markdown')
                .map(leaf => leaf.view as MarkdownView)
                .filter(view => view instanceof MarkdownView);
            
            // First try the active view
            let activeView: MarkdownView | null = app.workspace.getActiveViewOfType(MarkdownView);
            
            // If no active markdown view or no selection, try to find one with selection
            if (!activeView || !activeView.editor.somethingSelected()) {
                const viewWithSelection = markdownViews.find(view => view.editor.somethingSelected());
                activeView = viewWithSelection || null;
            }
            
            // If we found a view with an editor
            if (activeView && activeView.editor) {
                const selection = activeView.editor.getSelection();
                if (selection && selection.trim().length > 0) {
                    return {
                        editor: activeView.editor,
                        selectedText: selection
                    };
                }
            }
            
            return null;
        } catch (error) {
            console.error("Error getting active editor and selection:", error);
            return null;
        }
    }

    /**
     * Get the selected text from the active editor
     * @returns The selected text, or empty string if no selection
     */
    static getSelectedText(app: App): string {
        const result = this.getActiveEditorAndSelection(app);
        return result?.selectedText || "";
    }

    /**
     * Get the active editor
     * @returns The active editor, or null if no editor is found
     */
    static getActiveEditor(app: App): Editor | null {
        const result = this.getActiveEditorAndSelection(app);
        return result?.editor || null;
    }
} 