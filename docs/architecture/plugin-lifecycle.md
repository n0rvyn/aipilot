# 插件生命周期

本文档详细说明 AIPilot 插件的生命周期，包括初始化、运行和销毁过程。

## 📖 概述

Obsidian 插件遵循特定的生命周期，理解这个流程对于开发和调试至关重要。

## 🔄 完整生命周期

```
用户启用插件
      ↓
  onload()
      ↓
  ┌─────────────────┐
  │  初始化阶段      │
  │  ・加载设置      │
  │  ・注册视图      │
  │  ・注册命令      │
  │  ・初始化服务    │
  └─────────────────┘
      ↓
  ┌─────────────────┐
  │  运行阶段        │
  │  ・监听事件      │
  │  ・处理用户交互  │
  │  ・执行命令      │
  └─────────────────┘
      ↓
用户禁用/重载插件
      ↓
  onunload()
      ↓
  ┌─────────────────┐
  │  清理阶段        │
  │  ・注销视图      │
  │  ・清理监听器    │
  │  ・释放资源      │
  └─────────────────┘
      ↓
    结束
```

## 🚀 初始化阶段 (onload)

### 完整流程

```typescript
async onload() {
  console.log('[AIPilot] Loading plugin...');
  
  // 1. 加载设置
  await this.loadSettings();
  
  // 2. 添加图标
  addAllIcons();
  
  // 3. 初始化核心服务
  this.modelManager = new ModelManager(
    this.settings.models,
    this.settings.proxy
  );
  
  // 4. 初始化 RAG 服务
  if (this.settings.enableRAG) {
    this.ragService = createRAGService(
      this.app,
      this.settings.apiKey,
      this.settings.modelProvider,
      this.settings.modelName,
      this.settings.embeddingModel
    );
  }
  
  // 5. 注册视图
  this.registerView(
    VIEW_TYPE_CHAT,
    (leaf) => new ChatView(leaf, this)
  );
  
  this.registerView(
    KNOWLEDGE_BASE_VIEW_TYPE,
    (leaf) => new KnowledgeBaseView(leaf, this)
  );
  
  this.registerView(
    DEBATE_VIEW_TYPE,
    (leaf) => new DebatePanel(leaf, this)
  );
  
  // 6. 注册命令
  this.addCommand({
    id: 'open-chat',
    name: 'Open Chat',
    callback: () => {
      this.activateView(VIEW_TYPE_CHAT);
    }
  });
  
  this.addCommand({
    id: 'polish-text',
    name: 'Polish Text',
    editorCallback: (editor, view) => {
      const selection = editor.getSelection();
      if (selection) {
        this.polishText(selection);
      }
    }
  });
  
  // 7. 注册 Ribbon 图标
  this.addRibbonIcon('bot', 'AIPilot', () => {
    this.activateView(VIEW_TYPE_CHAT);
  });
  
  // 8. 添加设置面板
  this.addSettingTab(new AIPilotSettingTab(this.app, this));
  
  // 9. 注册事件监听
  this.registerEvent(
    this.app.workspace.on('file-open', (file) => {
      if (file) {
        this.onFileOpen(file);
      }
    })
  );
  
  // 10. 注册定时任务
  this.registerInterval(
    window.setInterval(() => {
      this.cleanupCache();
    }, 3600000) // 每小时清理一次缓存
  );
  
  // 11. 初始化 UI
  this.app.workspace.onLayoutReady(() => {
    this.onLayoutReady();
  });
  
  console.log('[AIPilot] Plugin loaded successfully');
}
```

### 关键步骤详解

#### 1. 加载设置 (loadSettings)

```typescript
async loadSettings() {
  // 合并默认设置和保存的设置
  this.settings = Object.assign(
    {},
    DEFAULT_SETTINGS,
    await this.loadData()
  );
  
  // 解密 API 密钥
  if (this.settings.apiKey) {
    this.settings.apiKey = this.decrypt(this.settings.apiKey);
  }
  
  // 迁移旧版设置（如果需要）
  if (this.settings.version < CURRENT_VERSION) {
    this.migrateSettings();
  }
}
```

**注意事项**:
- 使用 `Object.assign()` 确保新增的设置项有默认值
- 敏感信息（API 密钥）需要加密存储
- 版本升级时可能需要迁移设置格式

#### 2. 注册视图 (registerView)

```typescript
this.registerView(
  VIEW_TYPE_CHAT,  // 唯一标识符
  (leaf) => new ChatView(leaf, this)  // 工厂函数
);
```

**视图类型**:
- `VIEW_TYPE_CHAT` - 聊天界面
- `KNOWLEDGE_BASE_VIEW_TYPE` - 知识库管理
- `DEBATE_VIEW_TYPE` - 辩论面板

**视图生命周期**:
```
注册视图
    ↓
用户打开视图
    ↓
调用工厂函数创建实例
    ↓
调用视图的 onOpen()
    ↓
渲染 UI
    ↓
用户关闭视图
    ↓
调用视图的 onClose()
    ↓
销毁实例
```

#### 3. 注册命令 (addCommand)

```typescript
this.addCommand({
  id: 'unique-command-id',      // 唯一标识符
  name: 'Display Name',         // 显示名称
  hotkeys: [{ modifiers: ['Mod'], key: 'k' }],  // 可选快捷键
  callback: () => {
    // 命令执行逻辑
  },
  editorCallback: (editor, view) => {
    // 编辑器相关命令
  }
});
```

**命令类型**:

| 回调类型 | 使用场景 | 参数 |
|---------|---------|------|
| `callback` | 通用命令 | 无 |
| `editorCallback` | 编辑器操作 | `editor`, `view` |
| `checkCallback` | 条件命令 | 返回 `boolean` |

**示例 - 条件命令**:
```typescript
this.addCommand({
  id: 'insert-ai-response',
  name: 'Insert AI Response',
  checkCallback: (checking) => {
    // 只在有活动编辑器时显示
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      if (!checking) {
        // 执行命令
        this.insertResponse();
      }
      return true;  // 显示命令
    }
    return false;  // 隐藏命令
  }
});
```

#### 4. 事件监听 (registerEvent)

```typescript
// 文件打开事件
this.registerEvent(
  this.app.workspace.on('file-open', (file) => {
    console.log('File opened:', file.path);
  })
);

// 编辑器变化事件
this.registerEvent(
  this.app.workspace.on('editor-change', (editor) => {
    console.log('Editor changed');
  })
);

// 布局变化事件
this.registerEvent(
  this.app.workspace.on('layout-change', () => {
    console.log('Layout changed');
  })
);
```

**常用事件**:
- `file-open` - 文件打开
- `file-menu` - 文件菜单打开
- `editor-change` - 编辑器内容变化
- `layout-change` - 布局变化
- `active-leaf-change` - 活动页面变化

**注意**: 使用 `registerEvent()` 注册的事件会在插件卸载时自动清理。

#### 5. 定时任务 (registerInterval)

```typescript
this.registerInterval(
  window.setInterval(() => {
    // 定时执行的任务
    this.cleanupCache();
  }, 60000)  // 每分钟
);
```

**典型用途**:
- 缓存清理
- 自动保存
- 后台同步
- 状态轮询

#### 6. 布局就绪回调 (onLayoutReady)

```typescript
this.app.workspace.onLayoutReady(() => {
  // 此时 Obsidian 的 UI 已完全加载
  
  // 恢复上次打开的视图
  if (this.settings.autoOpenChat) {
    this.activateView(VIEW_TYPE_CHAT);
  }
  
  // 初始化需要 DOM 的功能
  this.initializeUI();
});
```

**注意**: 某些操作必须等待布局就绪后才能执行，例如打开视图、操作 DOM 等。

## 🏃 运行阶段

插件加载后，进入运行阶段，响应用户交互和系统事件。

### 用户交互流程

#### 1. 命令执行

```
用户触发命令（快捷键/命令面板/菜单）
    ↓
Obsidian 调用命令的 callback
    ↓
执行业务逻辑
    ↓
更新 UI/显示结果
```

#### 2. 视图交互

```
用户在视图中操作（点击按钮/输入文本等）
    ↓
视图组件的事件处理器
    ↓
调用插件方法
    ↓
调用服务层 API
    ↓
更新视图显示
```

#### 3. 设置修改

```
用户在设置面板修改配置
    ↓
触发 onChange 回调
    ↓
调用 saveSettings()
    ↓
重新初始化相关服务
```

### 异步操作管理

```typescript
class AIPilot extends Plugin {
  private activeRequests: Map<string, AbortController> = new Map();
  
  async makeAPICall(requestId: string) {
    // 创建可取消的请求
    const controller = new AbortController();
    this.activeRequests.set(requestId, controller);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal
      });
      return response;
    } finally {
      this.activeRequests.delete(requestId);
    }
  }
  
  cancelRequest(requestId: string) {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
    }
  }
}
```

## 🧹 清理阶段 (onunload)

### 完整流程

```typescript
onunload() {
  console.log('[AIPilot] Unloading plugin...');
  
  // 1. 取消所有进行中的 API 请求
  this.cancelAllRequests();
  
  // 2. 保存当前状态（如果需要）
  if (this.settings.autoSave) {
    this.saveSettings();
  }
  
  // 3. 清理缓存
  if (this.ragService) {
    this.ragService.clearCache();
  }
  
  // 4. 注销视图（自动完成，但可以做额外清理）
  // Obsidian 会自动调用所有视图的 onClose()
  
  // 5. 移除 DOM 元素（如果有手动添加的）
  this.statusBarItem?.remove();
  
  // 6. 清理全局状态
  delete window.aipilotPlugin;
  
  console.log('[AIPilot] Plugin unloaded');
}
```

### 自动清理项

以下内容会由 Obsidian 自动清理，无需手动处理：
- ✅ 通过 `registerView()` 注册的视图
- ✅ 通过 `addCommand()` 添加的命令
- ✅ 通过 `registerEvent()` 注册的事件监听
- ✅ 通过 `registerInterval()` 注册的定时任务
- ✅ 通过 `addRibbonIcon()` 添加的图标
- ✅ 通过 `addSettingTab()` 添加的设置面板

### 需要手动清理的项

以下内容需要在 `onunload()` 中手动清理：
- ❌ 进行中的异步操作（API 请求、定时器等）
- ❌ 全局变量和 window 对象上的引用
- ❌ 事件监听（非 Obsidian 事件）
- ❌ 内存缓存
- ❌ 手动创建的 DOM 元素

## 🔄 视图生命周期

### ItemView 生命周期

```typescript
class ChatView extends ItemView {
  async onOpen() {
    // 视图打开时调用
    console.log('[ChatView] Opening...');
    
    // 初始化 UI
    const container = this.containerEl.children[1];
    container.empty();
    
    // 创建 DOM 结构
    this.chatContainer = container.createDiv('chat-container');
    this.inputEl = container.createEl('textarea');
    
    // 绑定事件
    this.inputEl.addEventListener('keydown', this.onKeyDown.bind(this));
    
    // 加载数据
    await this.loadHistory();
    
    console.log('[ChatView] Opened successfully');
  }
  
  async onClose() {
    // 视图关闭时调用
    console.log('[ChatView] Closing...');
    
    // 保存状态
    await this.saveHistory();
    
    // 清理资源
    this.inputEl?.removeEventListener('keydown', this.onKeyDown);
    
    // 清空 DOM（可选，Obsidian 会自动清理）
    this.containerEl.empty();
    
    console.log('[ChatView] Closed');
  }
  
  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }
  
  getDisplayText(): string {
    return "AI Chat";
  }
  
  getIcon(): string {
    return "bot";
  }
}
```

### 视图状态管理

```typescript
// 保存视图状态
async getState(): Promise<any> {
  return {
    messages: this.messages,
    scrollPosition: this.chatContainer.scrollTop
  };
}

// 恢复视图状态
async setState(state: any, result: ViewStateResult): Promise<void> {
  if (state.messages) {
    this.messages = state.messages;
    this.render();
  }
  
  if (state.scrollPosition) {
    this.chatContainer.scrollTop = state.scrollPosition;
  }
}
```

## 🐛 调试技巧

### 1. 生命周期日志

在关键方法中添加日志：

```typescript
async onload() {
  console.log('[AIPilot] onload START');
  
  try {
    await this.loadSettings();
    console.log('[AIPilot] Settings loaded');
    
    this.initializeServices();
    console.log('[AIPilot] Services initialized');
    
    // ... 其他初始化
    
    console.log('[AIPilot] onload SUCCESS');
  } catch (error) {
    console.error('[AIPilot] onload FAILED:', error);
  }
}
```

### 2. 检查插件状态

在开发者工具中：

```javascript
// 获取插件实例
const aipilot = app.plugins.plugins['aipilot'];

// 检查设置
console.log(aipilot.settings);

// 检查服务
console.log(aipilot.ragService);

// 测试方法
await aipilot.ragService.query("测试");
```

### 3. 监控内存泄漏

```typescript
// 在 onload 中
this.memoryMonitor = setInterval(() => {
  if (performance.memory) {
    console.log('[AIPilot] Memory:', {
      used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
      total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB'
    });
  }
}, 30000);

// 在 onunload 中
clearInterval(this.memoryMonitor);
```

## ⚠️ 常见陷阱

### 1. 在 onload 前使用 this.app

```typescript
// ❌ 错误：constructor 中 this.app 可能未初始化
constructor(app: App, manifest: PluginManifest) {
  super(app, manifest);
  this.doSomething();  // 此时 this.app 可能为 undefined
}

// ✅ 正确：在 onload 中初始化
async onload() {
  this.doSomething();  // this.app 已经可用
}
```

### 2. 忘记等待异步初始化

```typescript
// ❌ 错误：未等待 loadSettings
async onload() {
  this.loadSettings();  // 忘记 await
  console.log(this.settings);  // 可能还是默认值
}

// ✅ 正确
async onload() {
  await this.loadSettings();
  console.log(this.settings);  // 已加载完成
}
```

### 3. 在 onunload 后执行异步操作

```typescript
// ❌ 错误：onunload 后仍然执行
async someMethod() {
  await delay(5000);
  this.app.workspace.openFile(file);  // 插件可能已卸载
}

// ✅ 正确：检查插件状态
async someMethod() {
  await delay(5000);
  if (this.app) {  // 检查插件是否仍然加载
    this.app.workspace.openFile(file);
  }
}
```

## 📚 相关文档

- [架构总览](overview.md)
- [开发环境搭建](../development/setup.md)
- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)

---

**提示**: 理解生命周期是开发稳定插件的关键。始终确保资源正确初始化和清理！

