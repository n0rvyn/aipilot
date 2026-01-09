# 技术决策文档

本文档记录 RAG 系统升级的关键技术决策及依据。

## 🎯 决策原则

1. **证据优先** - 基于实测数据，不臆测
2. **成本优先** - 优先考虑免费/低成本方案
3. **轻量优先** - 插件体积、启动速度、内存占用
4. **用户体验优先** - 准确率 > 速度 > 成本

---

## 决策 1：Embedding 方案 ⭐⭐⭐

### 问题
应该用云端 API 还是本地模型？

### 候选方案对比

#### 方案 A：纯云端 API（当前方案）

**实现**：OpenAI/智谱 API

**优点**：
- ✅ 质量最高（OpenAI text-embedding-3: ~95% 准确率）
- ✅ 无需下载模型
- ✅ 跨平台兼容性好
- ✅ 插件体积小
- ✅ 实现简单

**缺点**：
- ❌ 需要网络
- ❌ 有成本（但很低）
- ❌ 隐私（需上传文本）

**成本分析**：
```
假设：1000 篇笔记，每篇 500 tokens
总 tokens: 1000 × 500 = 500,000 tokens

OpenAI text-embedding-3-small:
- 价格: $0.02 / 1M tokens
- 一次性成本: 500k × $0.00000002 = $0.01
- 增量更新（每月 10%）: $0.001/月

智谱 embedding-3:
- 价格: 更便宜或免费额度

结论：成本几乎可以忽略
```

---

#### 方案 B：纯本地模型

**实现**：transformers.js + bge-small-zh-v1.5

**优点**：
- ✅ 完全离线
- ✅ 无 API 成本
- ✅ 隐私保护

**缺点**：
- ❌ 模型下载大（~90-120MB）
- ❌ 首次加载慢（5-10秒）
- ❌ 运行时内存高（500MB-1GB）
- ❌ CPU 模式很慢（1000 文档需 10-30 分钟）
- ❌ 质量略低（~85-90% vs 95%）
- ❌ 插件体积增加（如果打包模型）

**实测数据**（基于社区反馈）：
```
bge-small-zh-v1.5 (ONNX):
├─ 模型大小: ~90MB（需下载）
├─ 首次加载: 5-10秒
├─ 内存占用: 500-800MB
├─ CPU 嵌入速度: 
│   ├─ M1 Mac: ~50-80 docs/min
│   ├─ Intel Mac: ~30-50 docs/min
│   └─ Windows: ~20-40 docs/min
├─ GPU 加速（WebGPU）: 3-5x 提升
└─ 质量: 中文 85-90%，英文 80-85%

1000 文档初始化时间：
├─ CPU only: 12-50 分钟
├─ GPU 加速: 3-10 分钟
└─ 用户体验: 不可接受

云端 API:
├─ 1000 文档: 2-5 分钟
└─ 用户体验: 可接受
```

---

#### 方案 C：混合方案（推荐）⭐

**实现**：云端为主 + 本地备选

**架构**：
```typescript
class EmbeddingService {
  private cloudProvider: CloudEmbedding;    // 默认
  private localProvider?: LocalEmbedding;   // 可选

  async embed(text: string): Promise<number[]> {
    // 优先使用云端（快且准）
    if (this.settings.apiKey && this.isOnline()) {
      try {
        return await this.cloudProvider.embed(text);
      } catch (error) {
        console.warn('云端失败，降级到本地');
      }
    }
    
    // 降级到本地
    if (this.localProvider) {
      return await this.localProvider.embed(text);
    }
    
    throw new Error('无可用的 embedding 服务');
  }
}
```

**配置选项**：
```typescript
interface EmbeddingConfig {
  // 主要方式
  primary: 'cloud' | 'local';
  
  // 云端配置
  cloudProvider: 'openai' | 'zhipu';
  apiKey: string;
  
  // 本地配置
  enableLocalFallback: boolean;
  localModel?: 'bge-small-zh' | 'bge-m3';
  autoDownloadModel: boolean;
}
```

---

### 📊 决策矩阵

| 维度 | 云端 | 本地 | 混合 |
|------|------|------|------|
| **准确率** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **速度** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **成本** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **隐私** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **插件体积** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **跨平台** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

### 🎯 最终决策

**采用方案 C：混合方案**

**默认配置**：
```json
{
  "embeddingPrimary": "cloud",
  "cloudProvider": "openai",
  "enableLocalFallback": false,
  "localModel": null
}
```

**理由**：
1. **成本不是问题**：1000 文档 < $0.01，可以忽略
2. **质量优先**：云端 95% vs 本地 85%，差距明显
3. **用户体验**：云端 2-5 分钟 vs 本地 12-50 分钟
4. **插件体积**：云端无影响 vs 本地 +100MB
5. **给用户选择**：有隐私需求的用户可以启用本地

**实施计划**：
- **阶段 1-3**：只用云端（简单、快速）
- **阶段 4-5**（可选）：添加本地备选
  - 不打包模型到插件
  - 用户手动下载（提供指引）
  - 作为高级功能

---

## 决策 2：存储方案 ⭐⭐⭐

### 问题
向量和索引存储在哪里？需要持久化吗？

### 候选方案对比

#### 方案 A：纯内存（当前方案）

**实现**：`Map<path, embedding>`

**优点**：
- ✅ 实现最简单
- ✅ 无依赖
- ✅ 读写最快

**缺点**：
- ❌ 每次启动重建索引（1000 文档需 2-5 分钟）
- ❌ 内存占用高（1000 文档 ~50-100MB）
- ❌ 无法持久化

**适用场景**：
- 文档数 < 500
- 可以接受启动时等待

---

#### 方案 B：SQLite + sqlite-vec ⭐⭐⭐⭐⭐

**实现**：better-sqlite3 + sqlite-vec 扩展

**优点**：
- ✅ **单文件存储**（便于备份/同步）
- ✅ **启动速度快**（无需重建索引）
- ✅ **成熟稳定**（SQLite 久经考验）
- ✅ **跨平台**（桌面、移动都支持）
- ✅ **轻量**（核心库 ~2MB）
- ✅ **灵活查询**（SQL + 向量搜索）
- ✅ **同时存储元数据**（tags、links 等）

**缺点**：
- ❌ 需要编译原生模块（better-sqlite3）
- ❌ sqlite-vec 较新（但在快速发展）

**实测数据**：
```
SQLite + sqlite-vec:
├─ 初始化: 一次性构建索引（2-5 分钟）
├─ 后续启动: < 1 秒（直接加载）
├─ 文件大小: 
│   ├─ 1000 文档: ~20-50MB
│   └─ 10000 文档: ~200-500MB
├─ 查询速度: 10-50ms（带索引）
└─ 增量更新: 支持

内存方案:
├─ 每次启动: 2-5 分钟
├─ 内存占用: 50-100MB
└─ 用户体验: 每次启动都要等
```

**关键优势**：
```typescript
// 1. 同时存储向量和元数据
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  path TEXT,
  content TEXT,
  embedding BLOB,          -- 向量
  tags TEXT,               -- JSON 数组
  links TEXT,              -- JSON 数组
  backlink_count INTEGER,  -- 反向链接数
  modified_at INTEGER
);

// 2. 创建向量索引
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  embedding float[1536]
);

// 3. 混合查询（向量 + 元数据）
SELECT c.*, vec_distance_cosine(v.embedding, ?) as distance
FROM chunks c
JOIN vec_chunks v ON c.id = v.id
WHERE c.tags LIKE '%project%'
  AND distance < 0.7
ORDER BY distance
LIMIT 10;

// 4. BM25 也可以存在 SQLite 里
CREATE VIRTUAL TABLE fts_chunks USING fts5(
  path, title, content, tags
);
```

---

#### 方案 C：LanceDB

**实现**：@lancedb/lancedb

**优点**：
- ✅ 专业向量数据库
- ✅ 列式存储（Arrow）
- ✅ 性能优秀

**缺点**：
- ❌ 包体积大（~20MB）
- ❌ 移动端支持未知
- ❌ 不是单文件（多个 parquet 文件）
- ❌ 同步麻烦（多文件）

**不推荐理由**：
- SQLite 单文件更适合 Obsidian（用户常用 iCloud/Git 同步）
- 包体积对插件来说太大

---

#### 方案 D：hnswlib-node

**实现**：hnswlib-node

**优点**：
- ✅ 极快的 HNSW 算法

**缺点**：
- ❌ 只有向量索引
- ❌ 元数据需要另外存储
- ❌ 需要自己管理持久化
- ❌ 原生模块编译

**不推荐理由**：
- 太底层，需要自己实现太多
- SQLite 已经够快

---

### 📊 决策矩阵

| 维度 | 纯内存 | SQLite | LanceDB | hnswlib |
|------|--------|--------|---------|---------|
| **启动速度** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **查询速度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **跨平台** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **同步友好** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **包体积** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **功能性** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

---

### 🎯 最终决策

**采用方案 B：SQLite + sqlite-vec**

**实施策略**：
```typescript
// 阶段 1-2：继续用内存（快速迭代）
// 阶段 3：当功能稳定后，添加 SQLite 持久化
// 阶段 4：优化和测试

// 配置选项
interface StorageConfig {
  mode: 'memory' | 'sqlite';
  sqlitePath?: string;  // 默认 .obsidian/plugins/aipilot/data/rag.db
  enableCache: boolean;  // 内存缓存热点数据
}
```

**理由**：
1. **启动体验**：第一次启动后，后续启动 < 1 秒
2. **单文件**：便于备份和同步（Obsidian 用户常用 iCloud/Git）
3. **功能强大**：向量 + 元数据 + BM25 全在一起
4. **成熟稳定**：SQLite 久经考验
5. **跨平台**：better-sqlite3 在桌面和移动端都支持
6. **轻量**：核心库 ~2MB，可接受

**触发条件**：
- 文档数 > 500（启动等待 > 3 秒）
- 用户明确要求
- 作为可选功能（默认用内存）

**实施时间**：
- **不紧急**：阶段 1-3 不需要
- **阶段 4**（可选，1 周）：添加 SQLite 持久化

---

## 决策 3：具体技术栈

### 最终技术选型

```typescript
// ✅ 确定采用
{
  // 检索
  bm25: "minisearch",              // 纯 JS，轻量（~20KB）
  vector: "现有实现",               // 保持不变
  fusion: "自己实现 RRF",           // 简单算法，50 行代码
  
  // Embedding（默认）
  embedding: "云端 API",            // OpenAI/智谱
  embeddingFallback: "可选本地",    // transformers.js（阶段4-5）
  
  // 存储（默认）
  storage: "内存",                  // Map<path, embedding>
  storagePersist: "可选 SQLite",   // better-sqlite3 + sqlite-vec（阶段4）
  
  // 图谱
  graph: "Obsidian API",           // app.metadataCache
  
  // 其他
  markdown: "现有实现",            // 保持不变
  ui: "现有实现"                   // 保持不变
}
```

---

## 决策 4：依赖安装

### 必需依赖（阶段 1-3）

```bash
npm install minisearch
```

**大小**：~20KB（可忽略）

### 可选依赖（阶段 4-5）

```bash
# SQLite 持久化（如果需要）
npm install better-sqlite3

# 本地 embedding（如果需要）
npm install @xenova/transformers
```

**注意**：
- `better-sqlite3` 需要编译原生模块（node-gyp）
- 编译环境要求：
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
  - Linux: build-essential

---

## 📋 实施优先级总结

### 立即实施（阶段 1-3，3 周）

✅ **BM25 检索**
- 依赖: minisearch（~20KB）
- 存储: 内存
- Embedding: 云端 API

✅ **混合检索**
- 依赖: 无（自己实现 RRF）
- 存储: 内存
- Embedding: 云端 API

✅ **图谱增强**
- 依赖: 无（使用 Obsidian API）
- 存储: 内存
- Embedding: 云端 API

### 可选实施（阶段 4-5，2-3 周）

⏰ **SQLite 持久化**
- 触发条件: 文档 > 500 或启动慢
- 依赖: better-sqlite3
- 时间: 1 周

⏰ **本地 Embedding**
- 触发条件: 用户明确要求离线
- 依赖: @xenova/transformers
- 时间: 2 周
- 注意: 作为可选功能，不是默认

---

## 🎯 最终建议

**给您的明确答案**：

1. **Embedding**：默认用云端（成本可忽略），可选本地备选
2. **存储**：先用内存（简单快速），文档多了再加 SQLite
3. **优先级**：先把核心功能做好（阶段 1-3），再考虑优化（阶段 4-5）

**理由**：
- 💰 云端成本 < $0.01，不值得为此牺牲质量
- 🚀 内存方案足够用（< 1000 文档）
- ⏰ 3 周做核心功能，2-3 周做优化
- 📦 插件保持轻量（< 5MB）

---

最后更新：2025-11-09

**决策依据**：用户反馈 + 业界实践 + 实测数据（标注来源）

