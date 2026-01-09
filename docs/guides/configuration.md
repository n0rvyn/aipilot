# 配置指南

本指南详细说明 AIPilot 插件的所有配置选项。

## ⚙️ 设置面板概览

打开方式：`设置` → `AIPilot`

设置面板包含以下部分：
1. **模型配置** - AI 提供商和模型选择
2. **嵌入模型** - 向量检索使用的嵌入模型
3. **代理设置** - 网络代理配置
4. **RAG 配置** - 知识库检索参数
5. **自定义功能** - 个性化 AI 功能
6. **高级选项** - 其他配置

## 🤖 模型配置

### AI 提供商

选择您使用的 AI 服务提供商。

#### OpenAI

**配置**:
- **API Key**: 在 [platform.openai.com](https://platform.openai.com/api-keys) 获取
- **Model**: 选择模型
  - `gpt-3.5-turbo`: 快速、经济
  - `gpt-4`: 强大、准确
  - `gpt-4-turbo`: 平衡性能和成本
- **Endpoint**: `https://api.openai.com/v1` (默认)

**提示**:
- GPT-3.5 适合日常任务
- GPT-4 适合复杂推理
- 注意 API 使用成本

#### 智谱 AI

**配置**:
- **API Key**: 在 [open.bigmodel.cn](https://open.bigmodel.cn) 获取
- **Model**: 选择模型
  - `GLM-3-Turbo`: 快速响应
  - `GLM-4`: 中文优化
  - `GLM-4-Air`: 轻量版本
- **Endpoint**: `https://open.bigmodel.cn/api/paas/v4` (默认)

**优势**:
- 中文理解优秀
- 价格相对优惠
- 国内访问稳定

#### Groq

**配置**:
- **API Key**: 在 [console.groq.com](https://console.groq.com) 获取
- **Model**: 选择模型
  - `llama3-70b`: 强大性能
  - `llama3-8b`: 快速响应
  - `mixtral-8x7b`: 混合专家模型
- **Endpoint**: `https://api.groq.com/openai/v1` (默认)

**优势**:
- 响应速度极快
- 提供免费额度
- 开源模型

#### 自定义 API

**配置**:
- **API Key**: 您的自定义 API 密钥
- **Endpoint**: 自定义 API 端点
- **Model**: 模型名称

**适用于**:
- 自建的 API 服务
- 兼容 OpenAI API 格式的服务
- 本地模型（如 Ollama + OpenAI 兼容层）

**示例 - 使用 Ollama**:
```
Endpoint: http://localhost:11434/v1
Model: llama3
API Key: 任意值（Ollama 不验证）
```

## 📊 嵌入模型配置

用于 RAG 知识库检索的模型。

### OpenAI Embedding Models

| 模型 | 维度 | 最大 Token | 说明 |
|------|------|-----------|------|
| `text-embedding-ada-002` | 1536 | 8191 | 标准模型 |
| `text-embedding-3-small` | 1536 | 8191 | 小型模型 |
| `text-embedding-3-large` | 3072 | 8191 | 大型模型 |

**推荐**:
- 日常使用: `text-embedding-3-small`
- 高精度需求: `text-embedding-3-large`

### 智谱 Embedding Models

| 模型 | 维度 | 最大 Token | 说明 |
|------|------|-----------|------|
| `embedding-2` | 1024 | 512 | 标准模型 |
| `embedding-3` | 1024 | 3072 | 长文本模型 |

**配置**:
```
Provider: 智谱 AI
Model: embedding-3
```

## 🌐 代理设置

如果您在需要代理的网络环境中使用。

### HTTP 代理

**配置**:
```
Enable Proxy: ✓
Host: 127.0.0.1
Port: 7890
Protocol: HTTP
```

### SOCKS 代理

**配置**:
```
Enable Proxy: ✓
Host: 127.0.0.1
Port: 1080
Protocol: SOCKS5
```

### 认证代理

**配置**:
```
Enable Proxy: ✓
Host: proxy.example.com
Port: 8080
Username: your-username
Password: your-password
```

**测试代理**:
保存设置后，在聊天中发送消息测试连接。

## 🔍 RAG 配置

检索增强生成的参数。

### 基础设置

**检索数量** (Retrieval Limit)
- 范围: 1-20
- 默认: 5
- 说明: 每次检索返回的文档数量
- 建议:
  - 简单问题: 3
  - 复杂问题: 5-7
  - 全面分析: 10+

**相似度阈值** (Similarity Threshold)
- 范围: 0.0-1.0
- 默认: 0.6
- 说明: 文档被认为相关的最低相似度
- 建议:
  - 精确匹配: 0.8
  - 标准使用: 0.6
  - 广泛探索: 0.4

**Lambda 参数** (MMR Lambda)
- 范围: 0.0-1.0
- 默认: 0.7
- 说明: 相关性 vs 多样性的权重
- 建议:
  - 注重相关性: 0.9
  - 平衡: 0.7
  - 注重多样性: 0.5

### 高级设置

**启用查询重写** (Query Rewriting)
- 默认: ✓ 开启
- 说明: 将用户查询改写为多个变体提高检索效果
- 优点: 提高检索准确率
- 缺点: 增加 API 调用

**启用 HyDE** (Hypothetical Document Embeddings)
- 默认: ✗ 关闭
- 说明: 生成假设答案来检索
- 优点: 对模糊查询效果好
- 缺点: 额外的 API 调用和时间

**启用反思** (Reflection)
- 默认: ✗ 关闭
- 说明: 评估答案质量并可能重试
- 优点: 提高答案质量
- 缺点: 显著增加响应时间

**最大反思轮数** (Max Reflection Rounds)
- 范围: 1-5
- 默认: 3
- 说明: 最多尝试改进答案的次数

**最大上下文 Token** (Max Context Tokens)
- 范围: 1000-8000
- 默认: 4000
- 说明: 传递给 AI 的最大上下文长度
- 建议: 根据使用的模型上下文限制调整

### 性能优化

**启用缓存** (Enable Caching)
- 默认: ✓ 开启
- 说明: 缓存文档的 embedding，避免重复计算
- 建议: 始终开启

**批量大小** (Batch Size)
- 范围: 10-200
- 默认: 100
- 说明: 批量处理 embedding 的文件数量
- 影响: 初始化速度

## 🎨 自定义功能

创建您自己的 AI 功能。

### 添加自定义功能

1. 点击 `添加功能`
2. 填写配置：

**名称** (Name)
- 功能的显示名称
- 示例: "代码审查"

**图标** (Icon)
- Lucide 图标名称
- 示例: "code", "star", "book"
- 参考: [lucide.dev](https://lucide.dev)

**提示词** (Prompt)
- 定义 AI 的行为
- 使用清晰、具体的指令
- 示例见下方

**工具提示** (Tooltip)
- 鼠标悬停时显示的说明
- 可选

### 提示词模板

#### 代码审查
```
你是一位资深的代码审查专家。请仔细审查用户提供的代码，并提供：

1. 代码质量评估
   - 可读性
   - 可维护性
   - 是否遵循最佳实践

2. 潜在问题
   - Bug 和错误
   - 性能问题
   - 安全隐患

3. 改进建议
   - 重构建议
   - 优化方案
   - 设计模式应用

请以友好、建设性的语气提供反馈。
```

#### 学术润色
```
你是一位学术写作专家。请帮助改进用户的学术文本，确保：

1. 语言正式、学术化
2. 逻辑清晰、论证严密
3. 表达简洁、无冗余
4. 符合学术规范和惯例

请只输出改进后的文本，不要添加解释或评论。
```

#### 创意写作
```
你是一位富有创造力的作家。基于用户提供的主题或开头，继续创作故事。

要求：
- 情节引人入胜
- 人物生动立体
- 语言优美流畅
- 适当使用修辞手法

风格：现代文学，略带诗意。
```

#### 翻译助手
```
你是一位专业翻译。请将用户提供的文本翻译成高质量的中文（或其他语言）。

要求：
1. 准确传达原文含义
2. 符合目标语言习惯
3. 保持原文风格和语气
4. 专业术语准确翻译

不要添加解释，只输出译文。
```

### 管理自定义功能

**编辑**: 点击功能旁的编辑按钮
**删除**: 点击删除按钮（内置功能不可删除）
**排序**: 拖拽功能卡片调整顺序

## 🗂️ 聊天历史

**保存路径** (Chat History Path)
- 默认: `AI Chats/`
- 说明: 聊天历史保存的文件夹
- 支持: 相对路径和绝对路径

**自动保存** (Auto Save)
- 默认: ✗ 关闭
- 说明: 结束对话时自动保存

**保存格式** (Save Format)
- Markdown: 标准 Markdown 格式
- JSON: 结构化数据格式

## 🔒 安全与隐私

### API 密钥安全

- API 密钥经过加密存储
- 仅在本地存储，不会上传
- 建议使用限制权限的 API 密钥

### 数据隐私

- 所有对话都通过您的 API 密钥
- 不经过插件服务器
- 您对数据有完全控制权

### 最佳实践

1. **不要分享 API 密钥**
2. **定期轮换密钥**
3. **监控 API 使用量**
4. **避免在提示词中包含敏感信息**
5. **定期备份重要对话**

## 🎛️ 高级选项

### 请求设置

**超时时间** (Timeout)
- 范围: 10-120 秒
- 默认: 60 秒
- 说明: API 请求超时时间

**重试次数** (Retry Count)
- 范围: 0-5
- 默认: 3
- 说明: 失败后重试次数

**重试延迟** (Retry Delay)
- 范围: 1-10 秒
- 默认: 2 秒
- 说明: 重试前等待时间

### 日志设置

**启用调试日志** (Debug Logging)
- 默认: ✗ 关闭
- 说明: 在控制台输出详细日志
- 用途: 问题排查

**日志级别** (Log Level)
- `error`: 仅错误
- `warn`: 警告及以上
- `info`: 信息及以上
- `debug`: 所有日志

### 实验性功能

**启用实验性功能** (Enable Experimental Features)
- 默认: ✗ 关闭
- 说明: 启用尚在测试的新功能
- 警告: 可能不稳定

## 📊 监控与统计

### API 使用统计

在设置面板可以查看：
- 总请求次数
- Token 使用量
- 预估成本
- 平均响应时间

### 缓存统计

查看 RAG 缓存信息：
- 已缓存文件数
- 缓存大小
- 命中率
- 上次清理时间

**清理缓存**: 点击 `清空缓存` 按钮

## 🔄 导入导出设置

### 导出设置

```bash
设置 → AIPilot → 导出设置
```

生成 JSON 文件包含所有配置（不包括 API 密钥）。

### 导入设置

```bash
设置 → AIPilot → 导入设置
```

从 JSON 文件恢复配置。

**用途**:
- 备份配置
- 在多个库之间同步
- 分享配置模板

## 🆘 故障排查

### 常见问题

**问题**: API 调用失败
- 检查 API 密钥是否正确
- 检查网络连接
- 检查代理设置
- 查看控制台错误信息

**问题**: RAG 检索没有结果
- 降低相似度阈值
- 增加检索数量
- 清空缓存重试
- 检查笔记内容是否包含相关信息

**问题**: 响应速度慢
- 切换到更快的模型
- 减少 RAG 检索数量
- 关闭查询重写和 HyDE
- 检查网络延迟

## 📚 配置示例

### 日常写作
```
Provider: OpenAI
Model: gpt-3.5-turbo
Embedding: text-embedding-3-small
RAG Limit: 3
Lambda: 0.7
Query Rewriting: ✓
HyDE: ✗
Reflection: ✗
```

### 研究分析
```
Provider: OpenAI
Model: gpt-4
Embedding: text-embedding-3-large
RAG Limit: 10
Lambda: 0.5
Query Rewriting: ✓
HyDE: ✓
Reflection: ✓
```

### 快速浏览
```
Provider: Groq
Model: llama3-8b
Embedding: (不使用 RAG)
```

## 🔗 相关文档

- [快速开始](getting-started.md)
- [知识库使用](knowledge-base.md)
- [自定义功能](custom-functions.md)

---

**提示**: 根据您的使用场景和需求调整配置，找到最适合您的设置！

