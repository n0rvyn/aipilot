// Empty declaration to allow for css imports
declare module "*.css" {
    const content: string;
    export default content;
}

declare module "obsidian" {
    export class Component {
        registerEvent(evt: any): void;
    }

    export class Plugin extends Component {
        app: App;
        manifest: any;
        constructor(app: App, manifest: any);
        loadData(): Promise<any>;
        saveData(data: any): Promise<void>;
        addRibbonIcon(icon: string, title: string, callback: () => any): HTMLElement;
        addSettingTab(tab: PluginSettingTab): void;
        addCommand(command: Command): void;
        registerDomEvent(el: Element, type: string, callback: (evt: Event) => any): void;
    }

    export class App {
        workspace: Workspace;
        vault: Vault;
    }

    export class Modal {
        app: App;
        containerEl: HTMLElement;
        contentEl: HTMLElement;
        constructor(app: App);
        open(): void;
        close(): void;
        onOpen(): void;
        onClose(): void;
    }

    export class PluginSettingTab extends Component {
        app: App;
        containerEl: HTMLElement;
        constructor(app: App, plugin: Plugin);
        display(): void;
        hide(): void;
    }

    export class Setting {
        constructor(containerEl: HTMLElement);
        setName(name: string): this;
        setDesc(desc: string): this;
        setClass(cls: string): this;
        setHeading(): this;
        setTooltip(tooltip: string): this;
        addButton(cb: (button: ButtonComponent) => any): this;
        addText(cb: (text: TextComponent) => any): this;
        addTextArea(cb: (text: TextAreaComponent) => any): this;
        addDropdown(cb: (dropdown: DropdownComponent) => any): this;
    }

    export interface Command {
        id: string;
        name: string;
        callback?: () => any;
        hotkeys?: Hotkey[];
        editorCallback?: (editor: Editor, view: MarkdownView) => any;
        editorCheckCallback?: (checking: boolean, editor: Editor, view: MarkdownView) => any | boolean;
    }

    export interface Editor {
        getSelection(): string;
        replaceSelection(replacement: string): void;
        getValue(): string;
        setValue(value: string): void;
    }

    export interface MarkdownView {
        editor: Editor;
    }

    export interface Workspace {
        getActiveViewOfType<T>(type: any): T | null;
    }

    export interface HTMLElement {
        empty(): void;
        createEl<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: any): HTMLElementTagNameMap[K];
        createDiv(attrs?: any): HTMLDivElement;
        addClass(cls: string): void;
    }

    export class Notice {
        constructor(message: string, timeout?: number);
    }

    export class MarkdownRenderer {
        static renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void>;
    }

    // Add other necessary type declarations
}
