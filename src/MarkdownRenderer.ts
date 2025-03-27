import { Component, MarkdownView, App, Plugin, TFile, Editor, MarkdownRenderer as ObsidianMarkdownRenderer } from 'obsidian';

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
        await ObsidianMarkdownRenderer.renderMarkdown(content, container, sourcePath, component);
    }

    async render(): Promise<void> {
        try {
            // Clear container
            this.container.empty();
            
            // Add markdown-rendered class for styling
            this.container.addClass('markdown-rendered');
            
            // Use Obsidian's native MarkdownRenderer to safely render content
            // This avoids security risks from using innerHTML
            await ObsidianMarkdownRenderer.renderMarkdown(
                this.content,
                this.container,
                '',  // sourcePath (empty since this is dynamic content)
                this  // component
            );
            
            // No action buttons will be added here - they'll be handled by ChatView
        } catch (error) {
            console.error("Error rendering markdown:", error);
            this.container.setText("Error rendering content: " + (error as Error).message);
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