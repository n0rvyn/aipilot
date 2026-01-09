# RAG 系统设计

本文档详细介绍 AIPilot 的 RAG（Retrieval-Augmented Generation，检索增强生成）系统的设计与实现。

## 📖 什么是 RAG？

RAG 是一种结合了信息检索和文本生成的 AI 技术：

1. **检索（Retrieval）**: 从知识库中找到相关信息
2. **增强（Augmentation）**: 将检索到的信息作为上下文
3. **生成（Generation）**: 基于增强的上下文生成答案

**优势**:
- ✅ 减少 AI 幻觉（hallucination）
- ✅ 提供可追溯的信息来源
- ✅ 利用本地知识库
- ✅ 无需重新训练模型

## 🏗️ 系统架构

### 整体流程

```
┌─────────────────────────────────────────────────────────────┐
│                      RAG Pipeline                           │
│                                                             │
│  用户查询                                                     │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │  1. Query Enhancement (查询增强)                │        │
│  │     ├─ QueryRewriter: 重写和优化查询             │        │
│  │     └─ HyDE: 生成假设文档                       │        │
│  └─────────────────────────────────────────────────┘        │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │  2. Retrieval (检索)                            │        │
│  │     └─ VectorRetriever: 向量相似度检索           │        │
│  └─────────────────────────────────────────────────┘        │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │  3. Reranking (重排序)                          │        │
│  │     ├─ SemanticChunker: 语义分块                │        │
│  │     └─ MMR: 多样性优化                          │        │
│  └─────────────────────────────────────────────────┘        │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │  4. Generation (生成)                           │        │
│  │     └─ AIService: 基于上下文生成答案             │        │
│  └─────────────────────────────────────────────────┘        │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │  5. Reflection (反思)                           │        │
│  │     └─ Reflector: 评估质量并迭代               │        │
│  └─────────────────────────────────────────────────┘        │
│      ↓                                                       │
│  最终答案 + 来源                                              │
└─────────────────────────────────────────────────────────────┘
```

## 🔍 核心组件

### 1. Query Enhancement（查询增强）

#### QueryRewriter

**目的**: 将用户的自然语言查询转换为更适合检索的形式。

**实现** (`src/rag/enhancement/QueryRewriter.ts`):

```typescript
class QueryRewriter {
  async rewrite(query: string): Promise<string[]> {
    // 使用 AI 生成多个查询变体
    // 例如：
    // 原始: "如何提高写作水平？"
    // 重写: 
    //   - "写作技巧提升方法"
    //   - "提高文章质量的策略"
    //   - "写作能力培养指南"
  }
}
```

**策略**:
- 生成同义查询
- 扩展关键词
- 拆分复杂查询
- 添加领域术语

#### HyDE (Hypothetical Document Embeddings)

**目的**: 生成一个"假设的理想答案"，用它的 embedding 来检索。

**原理**:
1. 让 AI 基于问题生成一个假设的文档
2. 对假设文档进行 embedding
3. 用这个 embedding 去检索（而不是用问题本身）

**优势**:
- 问题和答案在语义空间的距离可能很远
- 假设文档更接近真实答案的语义表示

**实现** (`src/rag/enhancement/HyDE.ts`):

```typescript
class HyDE {
  async generateHypotheticalDoc(query: string): Promise<string> {
    const prompt = `基于以下问题，生成一个假设的、理想的答案：\n\n${query}`;
    return await this.aiService.generate(prompt);
  }
}
```

**示例**:

| 类型 | 内容 |
|------|------|
| 用户问题 | "什么是量子计算？" |
| 假设文档 | "量子计算是一种利用量子力学原理（如叠加和纠缠）进行信息处理的计算方式。与传统计算机使用比特不同，量子计算机使用量子比特（qubit）..." |
| 检索目标 | 使用假设文档的 embedding 检索相关笔记 |

### 2. Retrieval（检索）

#### VectorRetriever

**目的**: 从知识库中检索语义相关的文档。

**实现** (`src/rag/retrieval/VectorRetriever.ts`):

```typescript
class VectorRetriever {
  private embeddingCache: Map<string, EmbeddingData>;

  async retrieve(query: string, options: RetrievalOptions) {
    // 1. 获取查询的 embedding
    const queryEmbedding = await this.getEmbedding(query);
    
    // 2. 遍历知识库计算相似度
    const results = [];
    for (const file of vaultFiles) {
      const docEmbedding = await this.getFileEmbedding(file);
      const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
      results.push({ file, similarity, content });
    }
    
    // 3. 排序并返回 top-k
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, options.limit);
  }
}
```

**关键技术**:

##### Embedding（嵌入）
将文本转换为高维向量：

```
"量子计算" → [0.23, -0.45, 0.67, ..., 0.12] (1024 维)
```

**支持的模型**:
- `text-embedding-ada-002` (OpenAI)
- `text-embedding-3-small/large` (OpenAI)
- `embedding-2/3` (Zhipu AI)

##### 相似度计算
使用余弦相似度：

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}
```

**值范围**: -1 到 1（1 表示完全相同，0 表示无关，-1 表示完全相反）

##### 缓存机制
避免重复计算 embedding：

```typescript
interface EmbeddingData {
  embedding: number[];
  mtime: number;      // 文件修改时间
  hash: string;       // 内容哈希
}
```

**缓存策略**:
1. 文件未修改 → 使用缓存
2. 文件已修改 → 重新计算
3. LRU 淘汰策略（TODO）

### 3. Reranking（重排序）

#### SemanticChunker

**目的**: 将长文档智能分块，提高检索精度。

**挑战**:
- 固定长度分块可能切断语义完整的段落
- 需要在 chunk 大小和语义完整性之间平衡

**实现** (`src/rag/ranking/SemanticChunker.ts`):

```typescript
class SemanticChunker {
  async chunk(text: string, maxTokens: number): Promise<string[]> {
    // 1. 按段落分割
    const paragraphs = text.split('\n\n');
    
    // 2. 计算段落间的语义相似度
    const similarities = await this.calculateSimilarities(paragraphs);
    
    // 3. 在相似度低的地方切分
    const chunks = this.splitBySimilarity(paragraphs, similarities, maxTokens);
    
    return chunks;
  }
}
```

**策略**:
- 保持段落完整性
- 在主题转换处切分
- 控制 chunk 大小在 token 限制内

#### MMR (Maximal Marginal Relevance)

**目的**: 在相关性和多样性之间平衡。

**问题**:
- 简单的相似度排序可能返回多个内容重复的文档
- 需要在相关性和多样性之间权衡

**公式**:

```
MMR = λ × Sim(Q, D) - (1 - λ) × max(Sim(D, Dᵢ))
```

- `Sim(Q, D)`: 文档 D 与查询 Q 的相似度（相关性）
- `max(Sim(D, Dᵢ))`: 文档 D 与已选文档的最大相似度（重复度）
- `λ`: 平衡参数（0-1，默认 0.7）

**实现** (`src/rag/ranking/MMR.ts`):

```typescript
class MMRReranker {
  rerank(query: number[], documents: Document[], lambda: number = 0.7) {
    const selected: Document[] = [];
    const remaining = [...documents];
    
    while (remaining.length > 0 && selected.length < limit) {
      let bestDoc = null;
      let bestScore = -Infinity;
      
      for (const doc of remaining) {
        // 相关性得分
        const relevance = cosineSimilarity(query, doc.embedding);
        
        // 多样性惩罚
        const maxSimilarity = selected.length > 0
          ? Math.max(...selected.map(s => cosineSimilarity(doc.embedding, s.embedding)))
          : 0;
        
        // MMR 得分
        const score = lambda * relevance - (1 - lambda) * maxSimilarity;
        
        if (score > bestScore) {
          bestScore = score;
          bestDoc = doc;
        }
      }
      
      selected.push(bestDoc);
      remaining.splice(remaining.indexOf(bestDoc), 1);
    }
    
    return selected;
  }
}
```

**效果**:

| λ 值 | 行为 |
|------|------|
| 1.0 | 只考虑相关性（可能重复） |
| 0.7 | 平衡相关性和多样性（推荐） |
| 0.0 | 只考虑多样性（可能不相关） |

### 4. Generation（生成）

#### 上下文组装

将检索到的文档组装成 prompt：

```typescript
function buildPrompt(query: string, sources: Source[]): string {
  const context = sources
    .map((s, i) => `[来源 ${i + 1}: ${s.file.basename}]\n${s.content}`)
    .join('\n\n---\n\n');
  
  return `
基于以下参考资料回答问题。如果资料中没有答案，请明确说明。

## 参考资料

${context}

## 问题

${query}

## 回答

请基于上述参考资料回答问题，并在回答中标注来源。
`;
}
```

#### Token 管理

防止超出模型上下文限制：

```typescript
function fitContext(sources: Source[], maxTokens: number): Source[] {
  let totalTokens = 0;
  const fitted: Source[] = [];
  
  for (const source of sources) {
    const tokens = estimateTokens(source.content);
    if (totalTokens + tokens <= maxTokens) {
      fitted.push(source);
      totalTokens += tokens;
    } else {
      break;
    }
  }
  
  return fitted;
}
```

### 5. Reflection（反思）

#### Reflector

**目的**: 评估生成答案的质量，必要时触发重试。

**实现** (`src/rag/reflection/Reflector.ts`):

```typescript
class Reflector {
  async reflect(query: string, answer: string, sources: Source[]): Promise<ReflectionResult> {
    const prompt = `
评估以下 AI 回答的质量：

问题: ${query}
回答: ${answer}

评估标准:
1. 准确性：答案是否准确回答了问题？
2. 完整性：答案是否全面？
3. 相关性：答案是否与参考资料一致？
4. 可信度：答案是否有充分的依据？

请给出 1-10 的评分，并说明理由。
如果评分低于 7，请提出改进建议。
`;
    
    const evaluation = await this.aiService.generate(prompt);
    const score = this.extractScore(evaluation);
    
    return {
      score,
      needsImprovement: score < 7,
      suggestions: score < 7 ? this.extractSuggestions(evaluation) : null
    };
  }
}
```

**反思循环**:

```
生成答案
    ↓
Reflector 评估
    ↓
得分 ≥ 7？ ─YES→ 返回答案
    │
   NO
    ↓
调整检索参数
    ↓
重新检索和生成
    ↓
轮数 < 最大轮数？ ─YES→ Reflector 评估
    │
   NO
    ↓
返回最佳答案
```

**配置**:
```typescript
interface ReflectionConfig {
  maxRounds: number;        // 最大反思轮数（默认 3）
  minScore: number;         // 最小可接受分数（默认 7）
  retryStrategy: 'expand' | 'rewrite' | 'both';
}
```

## 🔧 配置与优化

### RAG 参数

```typescript
interface RAGOptions {
  // 检索参数
  limit: number;              // 检索文档数量（默认 5）
  similarityThreshold: number; // 相似度阈值（默认 0.6）
  
  // MMR 参数
  lambda: number;             // 相关性/多样性权重（默认 0.7）
  
  // 分块参数
  chunkSize: number;          // Chunk 大小（tokens）
  chunkOverlap: number;       // Chunk 重叠（tokens）
  
  // 上下文管理
  maxContextTokens: number;   // 最大上下文长度
  
  // 反思参数
  enableReflection: boolean;  // 启用反思
  maxReflectionRounds: number; // 最大反思轮数
  
  // 增强策略
  enableQueryRewriting: boolean; // 启用查询重写
  enableHyDE: boolean;          // 启用 HyDE
  
  // 目录过滤
  directory: string | null;    // 限制检索范围
}
```

### 性能优化

#### 1. 批量 Embedding

```typescript
async batchEmbed(texts: string[]): Promise<number[][]> {
  // 批量处理减少 API 调用
  const batchSize = 100;
  const batches = chunk(texts, batchSize);
  
  const results = await Promise.all(
    batches.map(batch => this.apiClient.embed(batch))
  );
  
  return results.flat();
}
```

#### 2. 增量索引

```typescript
async updateIndex(changedFiles: TFile[]) {
  for (const file of changedFiles) {
    // 只重新计算修改过的文件
    if (this.hasChanged(file)) {
      const embedding = await this.embed(file.content);
      this.cache.set(file.path, embedding);
    }
  }
}
```

#### 3. 并行检索

```typescript
async parallelRetrieve(queries: string[]) {
  // 并行执行多个查询
  return await Promise.all(
    queries.map(q => this.retrieve(q))
  );
}
```

## 📊 评估指标

### 检索质量

**Recall@K**: 在前 K 个结果中找到相关文档的比例

```
Recall@5 = (找到的相关文档数) / (总相关文档数)
```

**MRR (Mean Reciprocal Rank)**: 第一个相关文档的排名倒数的平均值

```
MRR = 1 / (第一个相关文档的排名)
```

### 生成质量

**F1 Score**: 精确率和召回率的调和平均

**ROUGE**: 生成文本与参考文本的重叠度

**Human Evaluation**: 人工评估（准确性、相关性、流畅性）

## 🚀 未来改进

### 短期目标

- [ ] 支持混合检索（BM25 + Vector）
- [ ] 添加引用标注（自动在答案中标注来源）
- [ ] 优化 chunk 策略（滑动窗口、重叠）
- [ ] 持久化向量索引（避免每次重启重算）

### 长期目标

- [ ] 集成专业向量数据库（Qdrant、Weaviate）
- [ ] 支持多模态检索（图片、表格）
- [ ] 实现增量学习（用户反馈优化检索）
- [ ] 跨笔记关系图谱检索

## 🔗 相关文档

- [架构总览](overview.md)
- [RAG Service API](../api/rag-service.md)
- [知识库使用指南](../guides/knowledge-base.md)

## 📚 参考资料

- [RAG 论文](https://arxiv.org/abs/2005.11401)
- [HyDE 论文](https://arxiv.org/abs/2212.10496)
- [MMR 算法](https://www.cs.cmu.edu/~jgc/publication/The_Use_MMR_Diversity_Based_LTMIR_1998.pdf)

---

**提示**: RAG 系统的性能高度依赖于知识库的质量和组织方式。建议：
1. 使用清晰的标题和结构
2. 避免过短或过长的笔记
3. 定期整理和更新内容

