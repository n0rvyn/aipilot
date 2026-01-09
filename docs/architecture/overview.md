# 架构总览

本文档概述 AIPilot 插件的整体架构设计。

## 🎯 设计目标

1. **模块化** - 清晰的职责分离，便于维护和扩展
2. **可扩展** - 支持多种 AI 提供商和模型
3. **用户友好** - 直观的界面和流畅的交互体验
4. **高性能** - 优化的向量检索和缓存机制
5. **可靠性** - 完善的错误处理和降级策略

## 🏗️ 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                       Obsidian App                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              AIPilot Plugin (main.ts)                 │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │   Settings  │  │   Commands   │  │    Views    │ │  │
│  │  │   Manager   │  │   Registry   │  │   Manager   │ │  │
│  │  └─────────────┘  └──────────────┘  └─────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│           │                   │                   │          │
│           ▼                   ▼                   ▼          │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐   │
│  │  ChatView   │    │ DebatePanel  │    │ KnowledgeBase│   │
│  │             │    │              │    │    View     │   │
│  └─────────────┘    └──────────────┘    └─────────────┘   │
│           │                   │                   │          │
└───────────┼───────────────────┼───────────────────┼──────────┘
            │                   │                   │
            ▼                   ▼                   ▼
┌───────────────────────────────────────────────────────────┐
│                     Service Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ ModelManager │  │  RAGService  │  │ DebateEngine   │  │
│  └──────────────┘  └──────────────┘  └────────────────┘  │
│         │                   │                   │          │
│         │                   ▼                   │          │
│         │          ┌─────────────────┐          │          │
│         │          │   AIService     │          │          │
│         │          └─────────────────┘          │          │
│         │                   │                   │          │
│         └───────────────────┼───────────────────┘          │
└─────────────────────────────┼──────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  External APIs   │
                    │  ───────────────  │
                    │  • OpenAI        │
                    │  • Zhipu AI      │
                    │  • Groq          │
                    │  • Custom APIs   │
                    └──────────────────┘
```

## 📦 核心模块

### 1. 插件核心 (main.ts)

**职责**:
- 插件生命周期管理（onload/onunload）
- 设置管理和持久化
- 命令注册
- 视图注册
- 全局状态管理

**关键类**:
- `AIPilot extends Plugin` - 主插件类
- `AIPilotSettingTab` - 设置面板
- 各种 Modal 类 - 对话框组件

### 2. 视图层

#### ChatView (ChatView.ts)
聊天界面的核心组件。

**功能**:
- 消息渲染（支持 Markdown、代码高亮）
- 流式响应处理
- 自定义功能按钮
- 聊天历史管理
- 上下文管理（引用笔记内容）

**特点**:
- 支持多种对话模式（普通、润色、生成等）
- 集成 diff 显示（文本修改对比）
- 支持插入内容到编辑器

#### KnowledgeBaseView (KnowledgeBaseView.ts)
知识库管理侧边栏。

**功能**:
- 显示知识库统计
- 管理向量数据库
- 配置 RAG 参数

#### DebatePanel (debate/DebatePanel.ts)
多代理辩论界面。

**功能**:
- 选择辩论模式（正反方、六顶思考帽等）
- 显示辩论进程
- 导出辩论结果

### 3. 服务层

#### ModelManager (models/ModelManager.ts)
统一的模型配置管理。

**职责**:
- 管理多个 AI 提供商的配置
- 模型切换和选择
- 代理配置
- API 密钥管理（加密存储）

**支持的提供商**:
- OpenAI (GPT-3.5, GPT-4, etc.)
- Zhipu AI (GLM-3, GLM-4, etc.)
- Groq (Llama, Mixtral, etc.)
- 自定义 API 端点

#### RAGService (rag/RAGService.ts)
检索增强生成核心服务。

**完整 RAG 流程**:
```
用户查询
    ↓
[Query Enhancement]
    ├─ QueryRewriter: 优化查询语句
    └─ HyDE: 生成假设文档
    ↓
[Retrieval]
    └─ VectorRetriever: 向量相似度检索
    ↓
[Reranking]
    ├─ SemanticChunker: 智能分块
    └─ MMR: 最大边际相关性排序
    ↓
[Generation]
    └─ AIService: 基于上下文生成答案
    ↓
[Reflection]
    └─ Reflector: 评估质量，必要时重试
    ↓
最终答案 + 来源
```

**子模块**:
- **enhancement/**: 查询增强
  - `HyDE.ts`: 假设文档嵌入（Hypothetical Document Embeddings）
  - `QueryRewriter.ts`: 查询重写器
- **retrieval/**: 检索实现
  - `VectorRetriever.ts`: 向量检索器
- **ranking/**: 结果优化
  - `MMR.ts`: 最大边际相关性
  - `SemanticChunker.ts`: 语义分块
- **reflection/**: 质量控制
  - `Reflector.ts`: 自我反思和评估

#### AIService (rag/AIService.ts & services/AIService.ts)
AI API 调用的抽象层。

**职责**:
- 统一不同 AI 提供商的 API 接口
- 请求/响应处理
- 流式响应支持
- Token 计数和管理
- 错误处理和重试

#### AgentDebateEngine (debate/AgentDebateEngine.ts)
多代理辩论引擎。

**功能**:
- 管理多个 AI 代理
- 实现不同辩论模式
- 控制对话流程
- 汇总辩论结果

**支持的模式**:
- Pro vs Con (正反方)
- Six Thinking Hats (六顶思考帽)
- Roundtable (圆桌讨论)
- Expert Panel (专家小组)

## 🔄 数据流

### 1. 普通聊天流程

```
用户输入
    ↓
ChatView 捕获
    ↓
ModelManager 获取配置
    ↓
AIService 发送请求
    ↓
处理响应（流式/非流式）
    ↓
MarkdownRenderer 渲染
    ↓
显示在 ChatView
    ↓
保存历史（可选）
```

### 2. RAG 增强对话流程

```
用户输入 + 启用 RAG
    ↓
QueryRewriter 优化查询
    ↓
HyDE 生成假设文档（可选）
    ↓
VectorRetriever 检索相关笔记
    ↓
MMR 重排序（去重 + 多样性）
    ↓
SemanticChunker 智能分块
    ↓
组合上下文 + 用户问题
    ↓
AIService 生成答案
    ↓
Reflector 评估质量
    ↓ (如果质量不足)
重新检索和生成（最多 N 轮）
    ↓
返回最终答案 + 来源
```

### 3. 文本润色流程

```
用户选中文本
    ↓
执行 Polish 命令
    ↓
打开 Polish Modal
    ↓
AIService 处理文本
    ↓
diff-match-patch 生成差异
    ↓
可视化显示变更
    ↓
用户确认应用
    ↓
更新编辑器内容
```

### 4. 多代理辩论流程

```
用户选择主题 + 模式
    ↓
AgentDebateEngine 初始化
    ↓
创建多个 Agent
    ↓
循环 N 轮:
    ├─ Agent A 发言
    ├─ Agent B 响应
    └─ Agent C 补充
    ↓
汇总所有发言
    ↓
生成结论
    ↓
显示在 DebatePanel
    ↓
可选：导出到新笔记
```

## 🗃️ 数据存储

### 1. 插件设置

**存储位置**: `.obsidian/plugins/aipilot/data.json`

**内容**:
```json
{
  "apiKey": "encrypted_key",
  "modelProvider": "openai",
  "modelName": "gpt-4",
  "embeddingModel": "embedding-3",
  "customFunctions": [...],
  "chatHistoryPath": "AI Chats",
  "ragSettings": {...},
  ...
}
```

### 2. 聊天历史

**存储位置**: 用户指定目录（默认 "AI Chats/"）

**格式**: Markdown 文件
- 文件名: `YYYY-MM-DD-HH-mm-ss.md`
- 包含完整对话和元数据

### 3. 向量缓存

**存储位置**: 内存（运行时）+ 可选持久化

**结构**:
```typescript
{
  [filePath]: {
    embedding: number[],
    mtime: number,
    hash: string
  }
}
```

## 🔌 扩展点

### 1. 新增 AI 提供商

在 `ModelManager` 中添加新的提供商配置：

```typescript
{
  provider: 'new-provider',
  endpoint: 'https://api.example.com/v1',
  models: ['model-1', 'model-2'],
  // ...
}
```

### 2. 自定义功能

通过设置面板添加自定义功能：

```typescript
{
  name: "我的功能",
  icon: "star",
  prompt: "System prompt here",
  tooltip: "功能描述"
}
```

### 3. RAG 策略

在 `RAGService` 中可以自定义：
- 检索策略
- 排序算法
- 分块方法
- 反思轮数

## 🎨 UI/UX 设计原则

1. **一致性** - 遵循 Obsidian 原生界面风格
2. **响应式** - 支持流式输出和实时反馈
3. **可访问性** - 键盘快捷键和屏幕阅读器支持
4. **性能优化** - 虚拟滚动、懒加载
5. **错误友好** - 清晰的错误提示和恢复机制

## 🔒 安全考虑

1. **API 密钥加密** - 使用简单加密存储（可改进）
2. **请求验证** - 防止恶意输入
3. **内容过滤** - 防止敏感信息泄露
4. **权限控制** - 遵循 Obsidian 安全沙箱

## 📊 性能优化

1. **嵌入缓存** - 避免重复计算
2. **延迟加载** - 按需加载组件
3. **流式响应** - 改善用户体验
4. **并发控制** - 限制同时进行的 API 请求
5. **Token 管理** - 优化上下文长度

## 🔗 相关文档

- [插件生命周期](plugin-lifecycle.md)
- [RAG 系统设计](rag-system.md)
- [多代理辩论系统](debate-system.md)
- [数据流设计](data-flow.md)

---

**下一步**: 查看 [插件生命周期](plugin-lifecycle.md) 了解插件的初始化和销毁流程。

