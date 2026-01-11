# Main Plugin API 文档

`AIPilot` 主插件类的 API 文档。

## 类定义

```typescript
class AIPilot extends Plugin {
  settings: AIPilotSettings;
  modelManager: ModelManager;
  ragService: RAGService | null;
  
  async onload(): Promise<void>
  onunload(): void
  
  async loadSettings(): Promise<void>
  async saveSettings(): Promise<void>
  
  activateView(viewType: string): Promise<void>
}
```

## 属性

### `settings: AIPilotSettings`

插件的所有配置设置。

```typescript
interface AIPilotSettings {
  // 模型配置
  apiKey: string;
  modelProvider: string;
  modelName: string;
  embeddingModel: string;
  
  // 自定义模型
  customModels: ModelConfig[];
  
  // 代理配置
  proxy: ProxyConfig | null;
  
  // RAG 配置
  ragEnabled: boolean;
  ragLimit: number;
  ragSimilarityThreshold: number;
  ragLambda: number;
  
  // 自定义功能
  functions: CustomFunction[];
  
  // 聊天历史
  chatHistoryPath: string;
  autoSaveHistory: boolean;
  
  // 其他设置
  [key: string]: any;
}
```

### `modelManager: ModelManager`

模型配置管理器实例。

```typescript
const config = this.plugin.modelManager.getCurrentConfig();
```

### `ragService: RAGService | null`

RAG 服务实例，如果 RAG 启用则存在。

```typescript
if (this.plugin.ragService) {
  const result = await this.plugin.ragService.query(query);
}
```

## 生命周期方法

### `onload()`

插件加载时调用。

```typescript
async onload() {
  // 1. 加载设置
  await this.loadSettings();
  
  // 2. 初始化服务
  this.modelManager = new ModelManager(/*...*/);
  
  // 3. 注册视图
  this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
  
  // 4. 注册命令
  this.addCommand({/*...*/});
  
  // 5. 其他初始化
}
```

### `onunload()`

插件卸载时调用。

```typescript
onunload() {
  // 清理资源
  this.cancelAllRequests();
  this.ragService?.clearCache();
}
```

## 设置管理

### `loadSettings()`

从磁盘加载设置。

```typescript
async loadSettings() {
  this.settings = Object.assign(
    {},
    DEFAULT_SETTINGS,
    await this.loadData()
  );
}
```

### `saveSettings()`

保存设置到磁盘。

```typescript
async saveSettings() {
  await this.saveData(this.settings);
}
```

**使用示例**:
```typescript
// 修改设置
this.plugin.settings.apiKey = newApiKey;

// 保存
await this.plugin.saveSettings();
```

## 视图管理

### `activateView(viewType)`

打开或激活指定类型的视图。

**参数**:
- `viewType: string` - 视图类型标识符

**返回值**: `Promise<void>`

**示例**:
```typescript
// 打开聊天视图
await this.plugin.activateView(VIEW_TYPE_CHAT);

// 打开知识库视图
await this.plugin.activateView(KNOWLEDGE_BASE_VIEW_TYPE);

// 打开辩论面板
await this.plugin.activateView(DEBATE_VIEW_TYPE);
```

**实现**:
```typescript
async activateView(viewType: string) {
  const { workspace } = this.app;
  
  let leaf: WorkspaceLeaf | null = null;
  const leaves = workspace.getLeavesOfType(viewType);
  
  if (leaves.length > 0) {
    // 视图已存在，激活它
    leaf = leaves[0];
  } else {
    // 创建新视图
    leaf = workspace.getRightLeaf(false);
    await leaf.setViewState({ type: viewType, active: true });
  }
  
  workspace.revealLeaf(leaf);
}
```

## 命令

插件注册的所有命令。

### `aipilot:open-chat`

打开 AI 聊天界面。

```typescript
this.addCommand({
  id: 'open-chat',
  name: 'Open Chat',
  callback: () => {
    this.activateView(VIEW_TYPE_CHAT);
  }
});
```

### `aipilot:polish-text`

润色选中的文本。

```typescript
this.addCommand({
  id: 'polish-text',
  name: 'Polish Text',
  editorCallback: (editor, view) => {
    const selection = editor.getSelection();
    if (selection) {
      new PolishModal(this.app, this, selection).open();
    } else {
      new Notice('Please select text first');
    }
  }
});
```

### `aipilot:open-knowledge-base`

打开知识库管理界面。

```typescript
this.addCommand({
  id: 'open-knowledge-base',
  name: 'Open Knowledge Base',
  callback: () => {
    this.activateView(KNOWLEDGE_BASE_VIEW_TYPE);
  }
});
```

### `aipilot:start-debate`

启动多代理辩论。

```typescript
this.addCommand({
  id: 'start-debate',
  name: 'Start Agent Debate',
  callback: () => {
    this.activateView(DEBATE_VIEW_TYPE);
  }
});
```

### `aipilot:save-chat-history`

保存当前对话历史。

```typescript
this.addCommand({
  id: 'save-chat-history',
  name: 'Save Chat History',
  callback: async () => {
    const chatView = this.getChatView();
    if (chatView) {
      await chatView.saveHistory();
      new Notice('Chat history saved');
    }
  }
});
```

## 辅助方法

### `getChatView()`

获取当前的聊天视图实例。

```typescript
getChatView(): ChatView | null {
  const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
  if (leaves.length > 0) {
    return leaves[0].view as ChatView;
  }
  return null;
}
```

### `encrypt(text)` / `decrypt(text)`

加密和解密文本（用于 API 密钥）。

```typescript
private encrypt(text: string): string {
  // 简单的 base64 编码（应该使用更安全的方法）
  return btoa(text);
}

private decrypt(text: string): string {
  return atob(text);
}
```

**注意**: 当前实现较简单，未来应使用更安全的加密方法。

## 事件

插件监听的事件。

### `file-open`

文件打开事件。

```typescript
this.registerEvent(
  this.app.workspace.on('file-open', (file) => {
    if (file) {
      this.onFileOpen(file);
    }
  })
);
```

### `layout-change`

布局变化事件。

```typescript
this.registerEvent(
  this.app.workspace.on('layout-change', () => {
    this.onLayoutChange();
  })
);
```

## 模态框

插件提供的模态框组件。

### PolishModal

文本润色对话框。

```typescript
new PolishModal(app, plugin, selectedText).open();
```

### HistoryModal

聊天历史对话框。

```typescript
new HistoryModal(app, plugin).open();
```

### CustomFunctionModal

自定义功能编辑对话框。

```typescript
new CustomFunctionModal(app, plugin, function).open();
```

### LoadingModal

加载提示对话框。

```typescript
const modal = new LoadingModal(app);
modal.open();
modal.updateProgress('Processing...', 50);
modal.close();
```

## 使用示例

### 示例 1: 从其他插件调用 AIPilot

```typescript
class MyPlugin extends Plugin {
  async onload() {
    // 获取 AIPilot 实例
    const aipilot = this.app.plugins.plugins['aipilot'] as AIPilot;
    
    if (aipilot) {
      // 使用 RAG 服务
      if (aipilot.ragService) {
        const result = await aipilot.ragService.query('问题');
        console.log(result.answer);
      }
      
      // 打开聊天界面
      await aipilot.activateView(VIEW_TYPE_CHAT);
    }
  }
}
```

### 示例 2: 监听设置变化

```typescript
// 在插件中
const originalSave = this.saveSettings.bind(this);
this.saveSettings = async function() {
  await originalSave();
  // 设置已保存，执行额外操作
  this.onSettingsChanged();
};
```

### 示例 3: 自定义命令调用 AI

```typescript
this.addCommand({
  id: 'my-custom-ai-command',
  name: 'My Custom AI Command',
  editorCallback: async (editor, view) => {
    const selection = editor.getSelection();
    
    // 使用 modelManager 获取 AI 响应
    const response = await this.callAI(selection);
    
    // 插入到编辑器
    editor.replaceSelection(response);
  }
});
```

## 调试

### 启用调试模式

```typescript
// 在控制台
const aipilot = app.plugins.plugins['aipilot'];
aipilot.settings.debug = true;
```

### 查看内部状态

```typescript
// 查看设置
console.log(aipilot.settings);

// 查看模型配置
console.log(aipilot.modelManager.getCurrentConfig());

// 查看 RAG 缓存
console.log(aipilot.ragService?.getCacheStats());
```

## 类型定义

完整的类型定义参考：

- [types.d.ts](../../types.d.ts) - 全局类型
- [models/ModelManager.ts](../../src/models/ModelManager.ts) - 模型相关类型
- [rag/index.ts](../../src/rag/index.ts) - RAG 相关类型

## 相关文档

- [ChatView API](chat-view.md)
- [RAGService API](rag-service.md)
- [ModelManager API](model-manager.md)
- [插件生命周期](../architecture/plugin-lifecycle.md)

---

**提示**: 这是插件的核心 API，理解它有助于扩展和集成功能。

