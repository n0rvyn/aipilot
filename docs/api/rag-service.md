# RAGService API 文档

`RAGService` 是 AIPilot 插件的核心服务，提供检索增强生成（RAG）功能。

## 类概览

```typescript
class RAGService {
  constructor(
    app: App,
    aiService: AIService,
    embeddingModel: string,
    modelProvider: ModelManager
  )
  
  // 主要方法
  async query(query: string, options?: RAGOptions): Promise<RAGResult>
  async search(query: string, options?: SearchOptions): Promise<Source[]>
  async clearCache(): Promise<void>
  getCacheStats(): CacheStats
}
```

## 构造函数

### `constructor(app, aiService, embeddingModel, modelProvider)`

创建 RAGService 实例。

**参数**:
- `app: App` - Obsidian App 实例
- `aiService: AIService` - AI 服务实例
- `embeddingModel: string` - 嵌入模型名称（如 "embedding-3"）
- `modelProvider: ModelManager` - 模型管理器实例

**示例**:
```typescript
const ragService = new RAGService(
  this.app,
  aiService,
  'embedding-3',
  modelManager
);
```

## 核心方法

### `query(query, options?)`

执行完整的 RAG 查询流程：查询增强 → 检索 → 重排序 → 生成 → 反思。

**签名**:
```typescript
async query(query: string, options?: RAGOptions): Promise<RAGResult>
```

**参数**:

#### `query: string`
用户的查询问题。

#### `options?: RAGOptions`
可选的配置选项。

```typescript
interface RAGOptions {
  // 检索参数
  limit?: number;                    // 检索文档数量（默认：5）
  similarityThreshold?: number;      // 相似度阈值（默认：0.6）
  directory?: string;                // 限制检索目录
  
  // MMR 参数
  lambda?: number;                   // 相关性/多样性权重（默认：0.7）
  
  // 增强策略
  enableQueryRewriting?: boolean;    // 启用查询重写（默认：true）
  enableHyDE?: boolean;              // 启用 HyDE（默认：false）
  
  // 反思参数
  enableReflection?: boolean;        // 启用反思（默认：false）
  maxReflectionRounds?: number;      // 最大反思轮数（默认：3）
  
  // 上下文管理
  maxContextTokens?: number;         // 最大上下文 token 数
  
  // 流式输出
  streaming?: boolean;               // 启用流式输出（默认：false）
  onChunk?: (chunk: string) => void; // 流式输出回调
  
  // 进度反馈
  showProgress?: boolean;            // 显示进度（默认：false）
  onProgress?: (stage: string, percent: number) => void;  // 进度回调
}
```

**返回值**:

```typescript
interface RAGResult {
  answer: string;           // AI 生成的答案
  sources: Source[];        // 参考来源
  reflectionRounds: number; // 反思轮数
}

interface Source {
  file: TFile;             // Obsidian 文件对象
  similarity: number;      // 相似度分数（0-1）
  content: string;         // 相关内容片段
}
```

**示例**:

```typescript
// 基础查询
const result = await ragService.query("什么是量子计算？");
console.log(result.answer);
console.log(result.sources);

// 带选项的查询
const result = await ragService.query("如何使用 React Hooks？", {
  limit: 3,
  lambda: 0.8,
  enableReflection: true,
  directory: "技术笔记",
  streaming: true,
  onChunk: (chunk) => {
    console.log("Received:", chunk);
  },
  onProgress: (stage, percent) => {
    console.log(`${stage}: ${percent}%`);
  }
});

// 使用 HyDE 增强
const result = await ragService.query("解释神经网络", {
  enableHyDE: true,
  limit: 5
});
```

**进度阶段**:
- `"Rewriting query"` (10%) - 查询重写
- `"Generating hypothetical document"` (20%) - 生成假设文档
- `"Retrieving documents"` (40%) - 检索文档
- `"Reranking results"` (60%) - 重排序
- `"Generating answer"` (80%) - 生成答案
- `"Reflecting on quality"` (90%) - 质量评估
- `"Completed"` (100%) - 完成

**错误处理**:

```typescript
try {
  const result = await ragService.query("问题");
} catch (error) {
  if (error.message.includes('API')) {
    // API 错误
    console.error('API 调用失败:', error);
  } else if (error.message.includes('embedding')) {
    // 嵌入错误
    console.error('嵌入模型错误:', error);
  } else {
    // 其他错误
    console.error('未知错误:', error);
  }
}
```

### `search(query, options?)`

仅执行检索，不生成答案。适用于只需要找到相关文档的场景。

**签名**:
```typescript
async search(query: string, options?: SearchOptions): Promise<Source[]>
```

**参数**:

```typescript
interface SearchOptions {
  limit?: number;                // 返回结果数量（默认：5）
  similarityThreshold?: number;  // 相似度阈值（默认：0.6）
  directory?: string;            // 限制检索目录
  lambda?: number;               // MMR 参数（默认：0.7）
}
```

**返回值**:
```typescript
Source[]  // 按相似度排序的来源列表
```

**示例**:

```typescript
// 基础搜索
const sources = await ragService.search("机器学习");
sources.forEach(source => {
  console.log(`${source.file.basename}: ${source.similarity}`);
});

// 限制目录
const sources = await ragService.search("项目管理", {
  directory: "工作笔记",
  limit: 3,
  similarityThreshold: 0.7
});

// 更注重多样性
const sources = await ragService.search("编程语言对比", {
  lambda: 0.5  // 降低 lambda，增加多样性
});
```

### `clearCache()`

清空嵌入缓存。当知识库有大量更新时使用。

**签名**:
```typescript
async clearCache(): Promise<void>
```

**示例**:
```typescript
await ragService.clearCache();
new Notice('缓存已清空');
```

### `getCacheStats()`

获取缓存统计信息。

**签名**:
```typescript
getCacheStats(): CacheStats
```

**返回值**:
```typescript
interface CacheStats {
  totalFiles: number;      // 已缓存的文件数
  cacheSize: number;       // 缓存大小（字节）
  hitRate: number;         // 缓存命中率
  lastCleared: Date;       // 上次清空时间
}
```

**示例**:
```typescript
const stats = ragService.getCacheStats();
console.log(`已缓存 ${stats.totalFiles} 个文件`);
console.log(`缓存命中率: ${(stats.hitRate * 100).toFixed(2)}%`);
```

## 子组件 API

### QueryRewriter

查询重写器。

```typescript
class QueryRewriter {
  async rewrite(query: string): Promise<string[]>
}
```

**示例**:
```typescript
const rewriter = new QueryRewriter(aiService);
const queries = await rewriter.rewrite("如何提高效率？");
// 返回: ["效率提升方法", "时间管理技巧", "生产力工具"]
```

### HyDE

假设文档嵌入。

```typescript
class HyDE {
  async generateHypotheticalDoc(query: string): Promise<string>
}
```

**示例**:
```typescript
const hyde = new HyDE(aiService);
const doc = await hyde.generateHypotheticalDoc("什么是机器学习？");
// 返回一个假设的理想答案文档
```

### VectorRetriever

向量检索器。

```typescript
class VectorRetriever {
  async retrieve(
    query: string | number[],  // 查询文本或嵌入向量
    options: RetrievalOptions
  ): Promise<RetrievalResult[]>
  
  async getEmbedding(text: string): Promise<number[]>
}
```

**示例**:
```typescript
const retriever = new VectorRetriever(app, aiService, embeddingModel);

// 使用查询文本
const results = await retriever.retrieve("量子计算", {
  limit: 5,
  directory: "技术"
});

// 使用嵌入向量
const embedding = await retriever.getEmbedding("量子计算");
const results = await retriever.retrieve(embedding, { limit: 5 });
```

### MMRReranker

最大边际相关性重排序。

```typescript
class MMRReranker {
  rerank(
    queryEmbedding: number[],
    documents: Document[],
    lambda: number,
    limit: number
  ): Document[]
}
```

**示例**:
```typescript
const mmr = new MMRReranker();
const reranked = mmr.rerank(
  queryEmbedding,
  documents,
  0.7,  // lambda: 70% 相关性, 30% 多样性
  5     // 返回前 5 个
);
```

### SemanticChunker

语义分块器。

```typescript
class SemanticChunker {
  async chunk(
    text: string,
    maxTokens: number
  ): Promise<string[]>
}
```

**示例**:
```typescript
const chunker = new SemanticChunker(aiService);
const chunks = await chunker.chunk(longText, 500);
// 返回语义完整的文本块数组
```

### Reflector

反思器。

```typescript
class Reflector {
  async reflect(
    query: string,
    answer: string,
    sources: Source[]
  ): Promise<ReflectionResult>
}

interface ReflectionResult {
  score: number;              // 质量分数（1-10）
  needsImprovement: boolean;  // 是否需要改进
  suggestions: string | null; // 改进建议
}
```

**示例**:
```typescript
const reflector = new Reflector(aiService);
const reflection = await reflector.reflect(query, answer, sources);

if (reflection.needsImprovement) {
  console.log('需要改进:', reflection.suggestions);
}
```

## 工厂函数

### `createRAGService()`

便捷的工厂函数，用于创建 RAGService 实例。

**签名**:
```typescript
function createRAGService(
  app: App,
  apiKey: string,
  modelProvider: string,
  modelName: string,
  embeddingModel: string
): RAGService
```

**示例**:
```typescript
import { createRAGService } from './rag';

const ragService = createRAGService(
  this.app,
  this.settings.apiKey,
  this.settings.modelProvider,
  this.settings.modelName,
  this.settings.embeddingModel
);
```

## 最佳实践

### 1. 缓存管理

定期清理缓存以节省内存：

```typescript
// 在插件 onload 时
this.registerInterval(
  window.setInterval(() => {
    const stats = ragService.getCacheStats();
    if (stats.totalFiles > 1000) {
      ragService.clearCache();
    }
  }, 3600000)  // 每小时检查一次
);
```

### 2. 错误恢复

实现降级策略：

```typescript
async function queryWithFallback(query: string) {
  try {
    // 尝试使用 RAG
    return await ragService.query(query, {
      enableReflection: true,
      enableHyDE: true
    });
  } catch (error) {
    console.warn('RAG 失败，尝试简化查询', error);
    
    // 降级：不使用增强功能
    return await ragService.query(query, {
      enableReflection: false,
      enableHyDE: false
    });
  }
}
```

### 3. 进度反馈

为长时间操作提供用户反馈：

```typescript
const modal = new LoadingModal(this.app);
modal.open();

try {
  const result = await ragService.query(query, {
    showProgress: true,
    onProgress: (stage, percent) => {
      modal.updateProgress(stage, percent);
    }
  });
  modal.close();
  // 显示结果
} catch (error) {
  modal.close();
  new Notice('查询失败: ' + error.message);
}
```

### 4. 参数调优

根据使用场景调整参数：

```typescript
// 场景 1: 精确匹配（写作参考）
const result = await ragService.query(query, {
  limit: 3,
  lambda: 0.9,  // 更注重相关性
  similarityThreshold: 0.8  // 高相似度阈值
});

// 场景 2: 广泛探索（头脑风暴）
const result = await ragService.query(query, {
  limit: 10,
  lambda: 0.5,  // 更注重多样性
  similarityThreshold: 0.5  // 低相似度阈值
});

// 场景 3: 深度分析（研究）
const result = await ragService.query(query, {
  limit: 5,
  enableReflection: true,
  maxReflectionRounds: 5,
  enableHyDE: true
});
```

## 性能优化

### 1. 批量操作

批量处理多个查询：

```typescript
const queries = ["问题1", "问题2", "问题3"];
const results = await Promise.all(
  queries.map(q => ragService.search(q, { limit: 3 }))
);
```

### 2. 流式输出

使用流式输出改善用户体验：

```typescript
let fullAnswer = '';

await ragService.query(query, {
  streaming: true,
  onChunk: (chunk) => {
    fullAnswer += chunk;
    // 实时更新 UI
    displayElement.textContent = fullAnswer;
  }
});
```

### 3. 限制检索范围

在特定目录检索以提高速度：

```typescript
const result = await ragService.query(query, {
  directory: "当前项目",  // 只在这个文件夹搜索
  limit: 3
});
```

## 故障排除

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Embedding model not found` | 嵌入模型未配置 | 在设置中配置嵌入模型 |
| `API rate limit exceeded` | API 调用超限 | 降低请求频率或升级套餐 |
| `Context length exceeded` | 上下文过长 | 减少 `limit` 或 `maxContextTokens` |
| `No relevant documents found` | 相似度阈值太高 | 降低 `similarityThreshold` |

### 调试技巧

启用详细日志：

```typescript
// 在 RAGService 构造函数中
this.debug = true;  // 启用调试模式

// 查看检索过程
const result = await ragService.query(query);
// 控制台会输出详细的检索和排序信息
```

## 相关文档

- [RAG 系统设计](../architecture/rag-system.md)
- [知识库使用指南](../guides/knowledge-base.md)
- [AI Service API](ai-service.md)

---

**提示**: RAG 的效果很大程度上取决于知识库的质量。建议定期整理和更新笔记。

