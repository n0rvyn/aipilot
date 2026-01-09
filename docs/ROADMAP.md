# AIPilot RAG 系统升级路线图

> **项目目标**：将 AIPilot 的 RAG 系统从"基础可用"提升到"专业级知识库"，性能提升 2-3 倍，准确率提升 40-50%。

## 📅 总体时间规划

```
┌─────────────────────────────────────────────────────────────┐
│  第1周      第2周      第3周      第4周      第5-6周        │
│  ─────      ─────      ─────      ─────      ──────        │
│  阶段1      阶段2      阶段3      测试       阶段4         │
│  BM25       混合       图谱       优化       (可选)        │
│  检索       检索       增强       迭代       高级功能      │
└─────────────────────────────────────────────────────────────┘

核心功能：3周
可选功能：2-3周
总计：3-6周（取决于需求）
```

## 🎯 项目愿景

### 当前状态（Baseline）

⚠️ **重要说明**：以下指标为估算值，需要实际测试验证！

```
性能指标（需实测）：
├─ 检索时间: 1.5-3s
├─ 准确率: 估算 70-75%（需建立测试集验证）
├─ 召回率: 估算 70-75%（需建立测试集验证）
└─ 用户体验: 中等

技术栈：
├─ 检索方式: 纯向量（余弦相似度）
├─ Embedding: 云端 API（OpenAI/智谱）
├─ 存储: 内存缓存
└─ 增强: HyDE、QueryRewriter、MMR
```

### 目标状态（Target）

⚠️ **重要说明**：以下为基于业界经验的预期目标，实际效果需测试验证！

```
预期指标（基于混合检索的典型提升）：
├─ 检索时间: 0.5-1s (预期提升 2-3x)
├─ 准确率: 85-90% (预期提升 +15-20%，参考学术论文数据)
├─ 召回率: 85-90% (预期提升 +15-20%，参考学术论文数据)
└─ 用户体验: 优秀

📊 数据来源：
- 混合检索论文通常报告 10-20% 准确率提升
- 图谱增强在知识库场景的典型提升范围
- 需要建立您自己的测试集来验证实际效果！

技术栈：
├─ 检索方式: 混合（BM25 + Vector + Graph）
├─ Embedding: 云端 API（默认，成本 < $0.01）
├─ 存储: 内存（默认，文档多时可选 SQLite）
└─ 增强: Obsidian 图谱 + 智能过滤 + 多阶段检索

💡 技术决策详见: docs/architecture/tech-decisions.md
```

---

## 🗓️ 详细实施计划

### 阶段 0：准备工作（1 天）

**目标**：搭建基础架构，准备开发环境

#### 任务清单

- [ ] **0.1 创建新分支**
  ```bash
  git checkout -b feature/hybrid-rag-system
  ```

- [ ] **0.2 安装依赖**
  ```bash
  # 必需（阶段 1-3）
  npm install minisearch  # BM25 搜索，~20KB
  
  # 可选（阶段 4-5，暂不安装）
  # npm install better-sqlite3  # SQLite 持久化（如果需要）
  # npm install @xenova/transformers  # 本地 embedding（如果需要）
  ```
  
  💡 默认方案：minisearch + 内存存储 + 云端 embedding

- [ ] **0.3 创建新目录结构**
  ```
  src/rag/
  ├── retrieval/
  │   ├── VectorRetriever.ts (已存在)
  │   ├── BM25Retriever.ts (新增)
  │   └── HybridRetriever.ts (新增)
  ├── graph/
  │   ├── GraphAnalyzer.ts (新增)
  │   └── MetadataExtractor.ts (新增)
  └── fusion/
      └── RankFusion.ts (新增)
  ```

- [ ] **0.4 设置基准测试**
  ```
  创建 tests/rag-benchmark.ts
  准备 20-30 个测试查询
  记录当前性能数据
  ```

#### 验收标准
- ✅ 依赖安装完成，无错误
- ✅ 目录结构创建完成
- ✅ 基准测试可运行
- ✅ 当前性能数据已记录

#### 时间估算：4-6 小时

---

### 阶段 1：BM25 关键词检索（2-3 天）

**目标**：添加基于关键词的 BM25 检索，作为向量检索的补充

#### 1.1 实现 BM25Retriever（第 1 天上午）

**文件**：`src/rag/retrieval/BM25Retriever.ts`

**任务**：
- [ ] 创建 `BM25Retriever` 类
- [ ] 实现 `buildIndex()` 方法
- [ ] 实现 `search()` 方法
- [ ] 实现 `addDocument()` 和 `removeDocument()`

**代码骨架**：
```typescript
import MiniSearch from 'minisearch';
import { TFile } from 'obsidian';

export interface BM25Document {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  headings: string[];
}

export interface BM25SearchResult {
  id: string;
  path: string;
  score: number;
  match: any;
}

export class BM25Retriever {
  private index: MiniSearch<BM25Document>;
  
  constructor() {
    this.index = new MiniSearch({
      fields: ['title', 'content', 'tags', 'headings'],
      storeFields: ['id', 'path', 'title'],
      searchOptions: {
        boost: { 
          title: 2.0,      // 标题权重最高
          tags: 1.5,       // 标签次之
          headings: 1.2,   // 标题结构
          content: 1.0     // 正文基础权重
        },
        fuzzy: 0.2,        // 模糊匹配容错
        prefix: true       // 支持前缀匹配
      }
    });
  }
  
  buildIndex(documents: BM25Document[]) {
    this.index.removeAll();
    this.index.addAll(documents);
  }
  
  addDocument(doc: BM25Document) {
    this.index.add(doc);
  }
  
  removeDocument(docId: string) {
    this.index.discard(docId);
  }
  
  search(query: string, limit: number = 10): BM25SearchResult[] {
    const results = this.index.search(query, { limit });
    
    return results.map(result => ({
      id: result.id,
      path: result.path,
      score: result.score,
      match: result.match
    }));
  }
  
  getStats() {
    return {
      documentCount: this.index.documentCount,
      termCount: this.index.termCount
    };
  }
}
```

**测试**：
```typescript
// tests/bm25-retriever.test.ts
describe('BM25Retriever', () => {
  it('should find exact keyword matches', () => {
    const retriever = new BM25Retriever();
    retriever.addDocument({
      id: '1',
      path: 'test.md',
      title: 'Git 使用指南',
      content: 'git rebase 是一个强大的命令',
      tags: ['git', 'tutorial'],
      headings: ['基础用法', '高级技巧']
    });
    
    const results = retriever.search('git rebase');
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });
});
```

#### 1.2 集成到 RAGService（第 1 天下午）

**文件**：`src/rag/RAGService.ts`

**任务**：
- [ ] 在 `RAGService` 中初始化 `BM25Retriever`
- [ ] 添加文档时同步更新 BM25 索引
- [ ] 实现索引重建方法

**代码修改**：
```typescript
export class RAGService {
  private vectorRetriever: VectorRetriever;
  private bm25Retriever: BM25Retriever; // 新增
  
  constructor(...) {
    this.vectorRetriever = new VectorRetriever(...);
    this.bm25Retriever = new BM25Retriever(); // 新增
  }
  
  async initialize() {
    // 构建初始索引
    const files = this.app.vault.getMarkdownFiles();
    await this.rebuildBM25Index(files);
  }
  
  private async rebuildBM25Index(files: TFile[]) {
    const documents: BM25Document[] = [];
    
    for (const file of files) {
      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      
      documents.push({
        id: file.path,
        path: file.path,
        title: file.basename,
        content: content,
        tags: cache?.tags?.map(t => t.tag) || [],
        headings: cache?.headings?.map(h => h.heading) || []
      });
    }
    
    this.bm25Retriever.buildIndex(documents);
  }
  
  // 监听文件变化，增量更新
  onFileModified(file: TFile, content: string) {
    const cache = this.app.metadataCache.getFileCache(file);
    
    this.bm25Retriever.removeDocument(file.path);
    this.bm25Retriever.addDocument({
      id: file.path,
      path: file.path,
      title: file.basename,
      content: content,
      tags: cache?.tags?.map(t => t.tag) || [],
      headings: cache?.headings?.map(h => h.heading) || []
    });
  }
}
```

#### 1.3 实现 RankFusion（第 2 天）

**文件**：`src/rag/fusion/RankFusion.ts`

**任务**：
- [ ] 实现 Reciprocal Rank Fusion (RRF)
- [ ] 实现归一化和合并逻辑

**代码骨架**：
```typescript
export interface SearchResult {
  id: string;
  path: string;
  score: number;
  source?: string; // 'bm25' | 'vector' | 'graph'
}

export class RankFusion {
  /**
   * Reciprocal Rank Fusion
   * 公式: RRF(d) = Σ 1 / (k + rank(d))
   * 
   * @param rankings 多个排序列表
   * @param k 常数，通常为 60
   */
  static reciprocalRankFusion(
    rankings: SearchResult[][],
    limit: number,
    k: number = 60
  ): SearchResult[] {
    const scoreMap = new Map<string, { doc: SearchResult, score: number }>();
    
    for (const ranking of rankings) {
      ranking.forEach((doc, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        
        const existing = scoreMap.get(doc.id);
        if (existing) {
          existing.score += rrfScore;
        } else {
          scoreMap.set(doc.id, {
            doc: { ...doc },
            score: rrfScore
          });
        }
      });
    }
    
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.doc,
        score: item.score
      }));
  }
  
  /**
   * 加权线性融合
   */
  static weightedFusion(
    results: { list: SearchResult[], weight: number }[],
    limit: number
  ): SearchResult[] {
    // 先归一化每个列表的分数
    const normalized = results.map(({ list, weight }) => ({
      list: this.normalizeScores(list),
      weight
    }));
    
    const scoreMap = new Map<string, { doc: SearchResult, score: number }>();
    
    for (const { list, weight } of normalized) {
      for (const doc of list) {
        const existing = scoreMap.get(doc.id);
        const weightedScore = doc.score * weight;
        
        if (existing) {
          existing.score += weightedScore;
        } else {
          scoreMap.set(doc.id, {
            doc: { ...doc },
            score: weightedScore
          });
        }
      }
    }
    
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.doc,
        score: item.score
      }));
  }
  
  private static normalizeScores(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) return [];
    
    const scores = results.map(r => r.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const range = max - min || 1;
    
    return results.map(r => ({
      ...r,
      score: (r.score - min) / range
    }));
  }
}
```

#### 1.4 测试和调优（第 2-3 天）

**任务**：
- [ ] 创建测试查询集
- [ ] 对比纯向量 vs BM25 vs 混合
- [ ] 调整 BM25 权重参数
- [ ] 记录性能数据

**测试脚本**：
```typescript
// tests/rag-comparison.ts
const testQueries = [
  "如何使用 git rebase",          // 精确关键词
  "项目管理的最佳实践",            // 概念性
  "python 装饰器的使用方法",       // 技术术语
  "提高工作效率的方法",            // 语义理解
  // ... 更多测试查询
];

async function benchmark() {
  for (const query of testQueries) {
    console.log(`\n查询: ${query}`);
    
    // 纯向量
    const vectorResults = await vectorRetriever.retrieve(query);
    console.log('纯向量:', vectorResults.length);
    
    // 纯 BM25
    const bm25Results = await bm25Retriever.search(query);
    console.log('纯 BM25:', bm25Results.length);
    
    // RRF 融合
    const fusedResults = RankFusion.reciprocalRankFusion([
      vectorResults,
      bm25Results
    ], 10);
    console.log('RRF 融合:', fusedResults.length);
    
    // 手动评估相关性...
  }
}
```

#### 验收标准
- ✅ BM25 检索可以独立运行
- ✅ 索引可以增量更新
- ✅ RRF 融合逻辑正确
- ✅ 性能提升 > 10%

#### 时间估算：16-20 小时

---

### 阶段 2：混合检索实现（2-3 天）

**目标**：实现 HybridRetriever，整合 BM25 和向量检索

#### 2.1 实现 HybridRetriever（第 1 天）

**文件**：`src/rag/retrieval/HybridRetriever.ts`

**任务**：
- [ ] 创建 `HybridRetriever` 类
- [ ] 实现并行检索
- [ ] 集成 RRF 融合

**代码骨架**：
```typescript
import { BM25Retriever } from './BM25Retriever';
import { VectorRetriever } from './VectorRetriever';
import { RankFusion, SearchResult } from '../fusion/RankFusion';

export interface HybridRetrievalOptions {
  limit: number;
  bm25Weight?: number;      // BM25 权重（0-1），默认 0.3
  vectorWeight?: number;    // Vector 权重（0-1），默认 0.7
  fusionMethod?: 'rrf' | 'weighted';  // 融合方法
  rrfK?: number;            // RRF 的 k 参数
}

export class HybridRetriever {
  constructor(
    private bm25Retriever: BM25Retriever,
    private vectorRetriever: VectorRetriever
  ) {}
  
  async retrieve(
    query: string,
    options: HybridRetrievalOptions
  ): Promise<SearchResult[]> {
    const {
      limit,
      bm25Weight = 0.3,
      vectorWeight = 0.7,
      fusionMethod = 'rrf',
      rrfK = 60
    } = options;
    
    // 1. 并行执行两种检索（取 2-3 倍的候选）
    const candidateLimit = limit * 3;
    
    const [bm25Results, vectorResults] = await Promise.all([
      Promise.resolve(this.bm25Retriever.search(query, candidateLimit)),
      this.vectorRetriever.retrieve(query, { limit: candidateLimit })
    ]);
    
    // 2. 融合结果
    let fused: SearchResult[];
    
    if (fusionMethod === 'rrf') {
      fused = RankFusion.reciprocalRankFusion(
        [bm25Results, vectorResults],
        limit,
        rrfK
      );
    } else {
      fused = RankFusion.weightedFusion([
        { list: bm25Results, weight: bm25Weight },
        { list: vectorResults, weight: vectorWeight }
      ], limit);
    }
    
    return fused;
  }
  
  async retrieveWithDebug(query: string, options: HybridRetrievalOptions) {
    const candidateLimit = options.limit * 3;
    
    const [bm25Results, vectorResults] = await Promise.all([
      Promise.resolve(this.bm25Retriever.search(query, candidateLimit)),
      this.vectorRetriever.retrieve(query, { limit: candidateLimit })
    ]);
    
    const fused = await this.retrieve(query, options);
    
    // 返回调试信息
    return {
      query,
      bm25: {
        count: bm25Results.length,
        topResults: bm25Results.slice(0, 3)
      },
      vector: {
        count: vectorResults.length,
        topResults: vectorResults.slice(0, 3)
      },
      fused: {
        count: fused.length,
        results: fused
      },
      // 分析哪些结果来自哪个检索器
      sourceAnalysis: this.analyzeSource(bm25Results, vectorResults, fused)
    };
  }
  
  private analyzeSource(bm25: any[], vector: any[], fused: any[]) {
    const bm25Only = fused.filter(f => 
      bm25.some(b => b.id === f.id) && !vector.some(v => v.id === f.id)
    ).length;
    
    const vectorOnly = fused.filter(f => 
      vector.some(v => v.id === f.id) && !bm25.some(b => b.id === f.id)
    ).length;
    
    const both = fused.filter(f => 
      bm25.some(b => b.id === f.id) && vector.some(v => v.id === f.id)
    ).length;
    
    return { bm25Only, vectorOnly, both };
  }
}
```

#### 2.2 集成到 RAGService（第 1-2 天）

**文件**：`src/rag/RAGService.ts`

**任务**：
- [ ] 替换原有的单一检索为混合检索
- [ ] 添加配置选项
- [ ] 保持向后兼容

**代码修改**：
```typescript
export interface RAGOptions {
  // ... 现有选项
  
  // 新增：检索策略
  retrievalStrategy?: 'vector' | 'bm25' | 'hybrid';
  
  // 新增：混合检索参数
  hybridOptions?: {
    bm25Weight?: number;
    vectorWeight?: number;
    fusionMethod?: 'rrf' | 'weighted';
  };
}

export class RAGService {
  private vectorRetriever: VectorRetriever;
  private bm25Retriever: BM25Retriever;
  private hybridRetriever: HybridRetriever; // 新增
  
  constructor(...) {
    // ... 初始化
    this.hybridRetriever = new HybridRetriever(
      this.bm25Retriever,
      this.vectorRetriever
    );
  }
  
  async query(query: string, options?: RAGOptions): Promise<RAGResult> {
    const strategy = options?.retrievalStrategy || 'hybrid'; // 默认混合
    
    // 1. 查询增强（可选）
    let enhancedQuery = query;
    if (options?.enableQueryRewriting) {
      enhancedQuery = await this.queryRewriter.rewrite(query);
    }
    
    // 2. 检索
    let sources: Source[];
    
    switch (strategy) {
      case 'bm25':
        sources = await this.bm25Retriever.search(enhancedQuery, options?.limit || 5);
        break;
        
      case 'vector':
        sources = await this.vectorRetriever.retrieve(enhancedQuery, options);
        break;
        
      case 'hybrid':
      default:
        sources = await this.hybridRetriever.retrieve(enhancedQuery, {
          limit: options?.limit || 5,
          ...options?.hybridOptions
        });
        break;
    }
    
    // 3. 后续处理（重排序、生成等）
    // ... 原有逻辑
  }
}
```

#### 2.3 添加配置界面（第 2 天）

**文件**：`src/main.ts` (设置面板部分)

**任务**：
- [ ] 添加检索策略选择
- [ ] 添加混合检索权重调节
- [ ] 添加性能统计显示

**UI 代码**：
```typescript
class AIPilotSettingTab extends PluginSettingTab {
  display(): void {
    // ... 现有设置
    
    // 检索策略
    new Setting(containerEl)
      .setName('检索策略')
      .setDesc('选择文档检索方式')
      .addDropdown(dropdown => dropdown
        .addOption('hybrid', '混合检索（推荐）')
        .addOption('vector', '纯向量检索')
        .addOption('bm25', '纯关键词检索')
        .setValue(this.plugin.settings.retrievalStrategy || 'hybrid')
        .onChange(async (value) => {
          this.plugin.settings.retrievalStrategy = value;
          await this.plugin.saveSettings();
        }));
    
    // 混合检索权重
    new Setting(containerEl)
      .setName('BM25 权重')
      .setDesc('关键词检索的权重（0-1），剩余为向量检索权重')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.bm25Weight || 0.3)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.bm25Weight = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

#### 2.4 性能测试和优化（第 3 天）

**任务**：
- [ ] 运行完整基准测试
- [ ] 调优权重参数
- [ ] 优化并行查询性能
- [ ] 记录性能数据

#### 验收标准
- ✅ 混合检索可正常工作
- ✅ 三种策略都可选择
- ✅ 性能提升 > 15%
- ✅ 准确率提升 > 10%

#### 时间估算：16-24 小时

---

### 阶段 3：Obsidian 图谱增强（3-4 天）⭐⭐⭐

**目标**：利用 Obsidian 的 tags、links、backlinks 等元数据增强检索

#### 3.1 实现 MetadataExtractor（第 1 天上午）

**文件**：`src/rag/graph/MetadataExtractor.ts`

**任务**：
- [ ] 提取文件元数据
- [ ] 解析 frontmatter
- [ ] 提取链接关系

**代码骨架**：
```typescript
import { App, TFile, MetadataCache, CachedMetadata } from 'obsidian';

export interface FileMetadata {
  path: string;
  title: string;
  
  // Obsidian 特有
  tags: string[];
  aliases: string[];
  outlinks: string[];        // 出链
  backlinks: string[];       // 反向链接
  backlinkCount: number;
  
  // 结构信息
  headings: string[];
  folder: string;
  depth: number;             // 文件夹深度
  
  // 时间信息
  created: number;
  modified: number;
  
  // Frontmatter
  frontmatter: Record<string, any>;
  priority?: number;
  status?: string;
}

export class MetadataExtractor {
  constructor(
    private app: App,
    private metadataCache: MetadataCache
  ) {}
  
  extract(file: TFile): FileMetadata {
    const cache = this.metadataCache.getFileCache(file);
    const backlinks = this.getBacklinks(file);
    
    return {
      path: file.path,
      title: file.basename,
      
      tags: this.extractTags(cache),
      aliases: cache?.frontmatter?.aliases || [],
      outlinks: cache?.links?.map(l => l.link) || [],
      backlinks: Array.from(backlinks),
      backlinkCount: backlinks.size,
      
      headings: cache?.headings?.map(h => h.heading) || [],
      folder: file.parent?.path || '',
      depth: file.path.split('/').length - 1,
      
      created: file.stat.ctime,
      modified: file.stat.mtime,
      
      frontmatter: cache?.frontmatter || {},
      priority: cache?.frontmatter?.priority,
      status: cache?.frontmatter?.status
    };
  }
  
  private extractTags(cache: CachedMetadata | null): string[] {
    if (!cache) return [];
    
    const tags = new Set<string>();
    
    // 内联标签
    cache.tags?.forEach(t => tags.add(t.tag));
    
    // Frontmatter 标签
    const fmTags = cache.frontmatter?.tags;
    if (Array.isArray(fmTags)) {
      fmTags.forEach(t => tags.add(t));
    } else if (typeof fmTags === 'string') {
      tags.add(fmTags);
    }
    
    return Array.from(tags);
  }
  
  private getBacklinks(file: TFile): Set<string> {
    const backlinks = new Set<string>();
    
    // 使用 Obsidian 的反向链接 API
    const backlinkData = this.app.metadataCache.getBacklinksForFile(file);
    
    if (backlinkData) {
      for (const [sourcePath, links] of backlinkData.data) {
        if (links.length > 0) {
          backlinks.add(sourcePath);
        }
      }
    }
    
    return backlinks;
  }
  
  extractBatch(files: TFile[]): Map<string, FileMetadata> {
    const metadata = new Map<string, FileMetadata>();
    
    for (const file of files) {
      metadata.set(file.path, this.extract(file));
    }
    
    return metadata;
  }
}
```

#### 3.2 实现 GraphAnalyzer（第 1 天下午 + 第 2 天上午）

**文件**：`src/rag/graph/GraphAnalyzer.ts`

**任务**：
- [ ] 构建链接图谱
- [ ] 计算节点权重
- [ ] 实现图谱增强算法

**代码骨架**：
```typescript
import { FileMetadata } from './MetadataExtractor';

export interface GraphWeights {
  authorityScore: number;    // 权威性（被引用数）
  hubScore: number;          // 枢纽性（引用数）
  recencyScore: number;      // 新鲜度
  structureScore: number;    // 结构相关性
  tagScore: number;          // 标签匹配度
  totalScore: number;        // 综合得分
}

export class GraphAnalyzer {
  private metadata: Map<string, FileMetadata>;
  private linkGraph: Map<string, Set<string>>; // path -> outlinks
  private backlinkGraph: Map<string, Set<string>>; // path -> backlinks
  
  constructor() {
    this.metadata = new Map();
    this.linkGraph = new Map();
    this.backlinkGraph = new Map();
  }
  
  buildGraph(metadata: Map<string, FileMetadata>) {
    this.metadata = metadata;
    this.linkGraph.clear();
    this.backlinkGraph.clear();
    
    // 构建图谱
    for (const [path, meta] of metadata) {
      this.linkGraph.set(path, new Set(meta.outlinks));
      
      // 构建反向链接
      for (const outlink of meta.outlinks) {
        if (!this.backlinkGraph.has(outlink)) {
          this.backlinkGraph.set(outlink, new Set());
        }
        this.backlinkGraph.get(outlink)!.add(path);
      }
    }
  }
  
  calculateWeights(path: string, query: string): GraphWeights {
    const meta = this.metadata.get(path);
    if (!meta) {
      return this.getDefaultWeights();
    }
    
    // 1. 权威性得分（基于反向链接）
    const authorityScore = this.calculateAuthorityScore(meta);
    
    // 2. 枢纽性得分（基于出链）
    const hubScore = this.calculateHubScore(meta);
    
    // 3. 新鲜度得分
    const recencyScore = this.calculateRecencyScore(meta);
    
    // 4. 结构相关性（文件夹、深度）
    const structureScore = this.calculateStructureScore(meta, query);
    
    // 5. 标签匹配度
    const tagScore = this.calculateTagScore(meta, query);
    
    // 6. 综合得分（加权求和）
    const totalScore = 
      authorityScore * 0.3 +
      hubScore * 0.1 +
      recencyScore * 0.1 +
      structureScore * 0.2 +
      tagScore * 0.3;
    
    return {
      authorityScore,
      hubScore,
      recencyScore,
      structureScore,
      tagScore,
      totalScore
    };
  }
  
  private calculateAuthorityScore(meta: FileMetadata): number {
    // 使用对数函数避免极端值
    // 0 个反向链接 → 0 分
    // 1 个 → 0.3
    // 10 个 → 1.0
    // 100 个 → 1.7
    return Math.min(1.0, Math.log(meta.backlinkCount + 1) / Math.log(11));
  }
  
  private calculateHubScore(meta: FileMetadata): number {
    const outlinks = meta.outlinks.length;
    // 引用 5-20 个文档的是好的枢纽
    if (outlinks < 5) return outlinks * 0.1;
    if (outlinks <= 20) return 0.5 + (outlinks - 5) * 0.03;
    return Math.max(0, 1.0 - (outlinks - 20) * 0.01); // 太多可能是垃圾
  }
  
  private calculateRecencyScore(meta: FileMetadata): number {
    const now = Date.now();
    const daysSinceModified = (now - meta.modified) / (1000 * 60 * 60 * 24);
    
    // 近7天内修改的最高分
    if (daysSinceModified < 7) return 1.0;
    if (daysSinceModified < 30) return 0.8;
    if (daysSinceModified < 90) return 0.6;
    if (daysSinceModified < 365) return 0.4;
    return 0.2;
  }
  
  private calculateStructureScore(meta: FileMetadata, query: string): number {
    let score = 0.5; // 基础分
    
    // 文件夹匹配
    const queryLower = query.toLowerCase();
    const folderLower = meta.folder.toLowerCase();
    
    if (folderLower.includes(queryLower) || queryLower.includes(folderLower)) {
      score += 0.3;
    }
    
    // 深度惩罚（过深的文件夹可能不太重要）
    if (meta.depth <= 2) score += 0.2;
    else if (meta.depth >= 5) score -= 0.2;
    
    // Frontmatter 优先级
    if (meta.priority) {
      score += meta.priority * 0.1;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  private calculateTagScore(meta: FileMetadata, query: string): number {
    if (meta.tags.length === 0) return 0;
    
    const queryTokens = query.toLowerCase().split(/\s+/);
    let matches = 0;
    
    for (const tag of meta.tags) {
      const tagLower = tag.toLowerCase().replace('#', '');
      
      for (const token of queryTokens) {
        if (tagLower.includes(token) || token.includes(tagLower)) {
          matches++;
          break;
        }
      }
    }
    
    // 归一化
    return Math.min(1.0, matches / Math.max(queryTokens.length, meta.tags.length));
  }
  
  private getDefaultWeights(): GraphWeights {
    return {
      authorityScore: 0,
      hubScore: 0,
      recencyScore: 0.5,
      structureScore: 0.5,
      tagScore: 0,
      totalScore: 0.5
    };
  }
  
  boostResults(results: SearchResult[], query: string): SearchResult[] {
    return results.map(result => {
      const weights = this.calculateWeights(result.path, query);
      
      return {
        ...result,
        score: result.score * (1 + weights.totalScore),
        graphWeights: weights // 保存用于调试
      };
    }).sort((a, b) => b.score - a.score);
  }
}
```

#### 3.3 集成图谱增强（第 2 天下午）

**文件**：`src/rag/retrieval/HybridRetriever.ts`

**任务**：
- [ ] 在 HybridRetriever 中集成 GraphAnalyzer
- [ ] 添加图谱增强选项

**代码修改**：
```typescript
import { GraphAnalyzer } from '../graph/GraphAnalyzer';
import { MetadataExtractor } from '../graph/MetadataExtractor';

export interface HybridRetrievalOptions {
  // ... 现有选项
  
  enableGraphBoost?: boolean;   // 是否启用图谱增强
  graphWeight?: number;          // 图谱权重（0-1）
}

export class HybridRetriever {
  private graphAnalyzer: GraphAnalyzer;
  private metadataExtractor: MetadataExtractor;
  
  constructor(
    private bm25Retriever: BM25Retriever,
    private vectorRetriever: VectorRetriever,
    private app: App
  ) {
    this.metadataExtractor = new MetadataExtractor(
      app,
      app.metadataCache
    );
    this.graphAnalyzer = new GraphAnalyzer();
    
    // 初始化图谱
    this.rebuildGraph();
  }
  
  async rebuildGraph() {
    const files = this.app.vault.getMarkdownFiles();
    const metadata = this.metadataExtractor.extractBatch(files);
    this.graphAnalyzer.buildGraph(metadata);
  }
  
  async retrieve(
    query: string,
    options: HybridRetrievalOptions
  ): Promise<SearchResult[]> {
    // 1. 基础混合检索
    let results = await this.basicHybridRetrieve(query, options);
    
    // 2. 图谱增强（可选）
    if (options.enableGraphBoost !== false) {
      results = this.graphAnalyzer.boostResults(results, query);
    }
    
    return results.slice(0, options.limit);
  }
  
  private async basicHybridRetrieve(...) {
    // 原有的混合检索逻辑
  }
}
```

#### 3.4 测试和调优（第 3-4 天）

**任务**：
- [ ] 测试图谱增强效果
- [ ] 调优权重参数
- [ ] 对比不同配置的效果
- [ ] 添加可视化调试

**调试视图**：
```typescript
// 在 KnowledgeBaseView 中添加调试面板
class GraphDebugPanel {
  show(result: SearchResult) {
    // 显示:
    // - 文档基础信息
    // - 反向链接数
    // - 标签列表
    // - 各项得分
    // - 最终权重
  }
}
```

#### 验收标准
- ✅ 图谱权重计算正确
- ✅ 标签匹配准确
- ✅ 反向链接加权生效
- ✅ 性能提升 > 20%（累计）

#### 时间估算：24-32 小时

---

### 阶段 4：测试、优化和文档（3-5 天）

**目标**：全面测试、性能优化、编写文档

#### 4.1 完整测试（第 1-2 天）

**任务**：
- [ ] 单元测试覆盖率 > 70%
- [ ] 集成测试
- [ ] 性能基准测试
- [ ] 边界情况测试

**测试清单**：
```typescript
// 功能测试
- [ ] BM25 检索准确性
- [ ] 向量检索准确性
- [ ] 混合检索融合正确性
- [ ] 图谱权重计算正确性
- [ ] 增量索引更新
- [ ] 并发查询

// 性能测试
- [ ] 100 文档检索 < 500ms
- [ ] 1000 文档检索 < 1s
- [ ] 10000 文档检索 < 2s
- [ ] 索引重建时间合理

// 边界测试
- [ ] 空查询
- [ ] 超长查询
- [ ] 特殊字符
- [ ] 中英混合
- [ ] 无结果场景
```

#### 4.2 性能优化（第 2-3 天）

**优化点**：
- [ ] 缓存优化
- [ ] 批量处理
- [ ] 异步优化
- [ ] 内存优化

```typescript
// 示例：批量 embedding 优化
class BatchEmbedding {
  private queue: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  
  add(text: string) {
    this.queue.push(text);
    
    if (this.timer) clearTimeout(this.timer);
    
    this.timer = setTimeout(() => {
      this.flush();
    }, 1000); // 1秒后批量处理
  }
  
  async flush() {
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, 100); // 每批最多100个
    await this.embedBatch(batch);
  }
}
```

#### 4.3 用户文档（第 3-4 天）

**任务**：
- [ ] 更新用户指南
- [ ] 添加配置说明
- [ ] 创建 FAQ
- [ ] 录制演示视频（可选）

**文档清单**：
- [ ] 更新 `docs/guides/knowledge-base.md`
- [ ] 更新 `docs/guides/configuration.md`
- [ ] 创建 `docs/guides/hybrid-retrieval.md`
- [ ] 更新 `README.md`

#### 4.4 发布准备（第 4-5 天）

**任务**：
- [ ] 代码审查
- [ ] 性能数据整理
- [ ] Changelog 编写
- [ ] 版本号更新

#### 验收标准
- ✅ 所有测试通过
- ✅ 性能达标
- ✅ 文档完整
- ✅ 可以发布

#### 时间估算：24-40 小时

---

### 阶段 5：可选高级功能（2-3 周）

⚠️ **重要**：这些功能不是必需的，仅在满足触发条件时实施

#### 5.1 SQLite 持久化（1 周）

**触发条件**（满足任一即可）：
- 文档数 > 500（启动时间 > 3 秒）
- 用户明确要求快速启动

**理由**：
- ✅ 首次启动后，后续启动 < 1 秒
- ✅ 单文件存储，便于同步
- ✅ 可同时存储向量 + 元数据 + BM25 索引

**实施**：
```bash
npm install better-sqlite3
```
参考 `tech-decisions.md` 中的 SQLite 方案

**决策**：默认用内存，作为可选功能

---

#### 5.2 本地 Embedding 模型（1-2 周）

**触发条件**（满足任一即可）：
- 用户明确要求完全离线
- 隐私敏感场景（医疗、法律等）
- 用户愿意接受：
  - 质量降低（95% → 85%）
  - 首次加载慢（5-10 秒）
  - 初始化慢（1000 文档 12-50 分钟）
  - 内存占用高（+500MB）

**理由**：
- ❌ 云端成本可忽略（< $0.01）
- ❌ 质量明显降低
- ❌ 用户体验差（启动慢、初始化慢）
- ✅ 但对于有隐私需求的用户是必需的

**实施**：
```bash
npm install @xenova/transformers
```
参考 `tech-decisions.md` 中的混合方案

**决策**：作为可选功能，不是默认方案

---

💡 **推荐做法**：
1. **先完成阶段 1-3**（核心功能）
2. **根据实际使用情况**决定是否需要阶段 4-5
3. **大多数用户不需要**这些高级功能

#### 5.3 高级功能（可选）

- [ ] Cross-Encoder 重排序
- [ ] 查询意图识别
- [ ] 结果聚类展示
- [ ] 时间线检索
- [ ] 关系图谱可视化

---

## 📊 里程碑和验收标准

### 里程碑 1：BM25 检索（阶段 1 完成）

**验收标准**：
- ✅ BM25 检索可独立工作
- ✅ 索引可增量更新
- ✅ 关键词查询准确率 > 80%
- ✅ RRF 融合逻辑正确

**性能指标**：
- BM25 检索时间 < 100ms
- 索引构建时间 < 5s（1000 文档）

### 里程碑 2：混合检索（阶段 2 完成）

**验收标准**：
- ✅ 三种检索策略都可用
- ✅ 混合检索效果优于单一策略
- ✅ 配置界面完整
- ✅ 性能提升 > 15%

**性能指标**：
- 混合检索时间 < 1s
- 准确率提升 > 10%

### 里程碑 3：图谱增强（阶段 3 完成）⭐

**验收标准**：
- ✅ 图谱权重计算正确
- ✅ 标签/链接增强生效
- ✅ 性能提升 > 20%（累计）
- ✅ 可视化调试工具可用

**性能指标**：
- 图谱分析开销 < 100ms
- 整体准确率 > 85%

### 里程碑 4：生产就绪（阶段 4 完成）

**验收标准**：
- ✅ 测试覆盖率 > 70%
- ✅ 所有测试通过
- ✅ 文档完整
- ✅ 性能稳定

**性能指标**：
- 检索时间 < 1s
- 准确率 85-90%
- 内存占用合理

---

## ⚠️ 风险评估

### 技术风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| BM25 索引占用内存过大 | 中 | 中 | 使用 SQLite 持久化 |
| 图谱分析性能开销 | 中 | 低 | 缓存计算结果，增量更新 |
| 混合检索效果不理想 | 低 | 高 | 充分测试，可调参数 |
| 移动端兼容性问题 | 高 | 中 | 桌面端优先，移动端降级 |

### 时间风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| 开发时间超期 | 中 | 中 | 模块化开发，可分期交付 |
| 测试不充分 | 中 | 高 | 预留充足测试时间 |
| 性能优化耗时 | 中 | 低 | 设定性能底线即可 |

---

## 📝 开发检查清单

### 代码质量
- [ ] TypeScript 类型完整
- [ ] 无 linter 错误
- [ ] 代码有注释
- [ ] 关键逻辑有单元测试

### 性能
- [ ] 检索时间 < 1s
- [ ] 索引构建合理
- [ ] 内存占用可控
- [ ] 无内存泄漏

### 用户体验
- [ ] 加载提示清晰
- [ ] 错误处理友好
- [ ] 配置界面直观
- [ ] 文档易懂

### 兼容性
- [ ] 桌面端测试通过
- [ ] 移动端降级方案
- [ ] 向后兼容

---

## 📚 参考文档

- [RAG 改进建议](architecture/rag-improvements.md)
- [本地化方案对比](architecture/rag-local-optimization.md)
- [RAG 系统设计](architecture/rag-system.md)
- [RAG Service API](api/rag-service.md)

---

## 🎯 总结

**核心路径**（3周）：
```
第 1 周：BM25 检索 + 混合检索
第 2 周：图谱增强
第 3 周：测试优化 + 文档
```

**预期效果**：
- 🚀 检索速度：2-3 倍提升
- 📊 准确率：+15-20%
- 🎯 召回率：+15-20%
- ⭐ 用户体验：显著改善

**关键成功因素**：
1. ✅ 扎实的 BM25 实现
2. ✅ 智能的融合算法
3. ✅ 充分利用 Obsidian 图谱
4. ✅ 持续的测试和优化

**开始行动**：
```bash
git checkout -b feature/hybrid-rag-system
npm install minisearch
# 开始编码！
```

---

**让我们一步一步，把 AIPilot 打造成最强大的 Obsidian 知识库！** 🚀

最后更新：2025-11-09

