# Cursor 规则体系迁移总结

> **日期**: 2025-11-09  
> **任务**: 从 Epoch 项目借鉴规则，建立 AIPilot 的三层规则架构  

---

## 📊 迁移概览

### 迁移前
- **规则文件**: 1 个 (`obsidian-plugin-rule.mdc`)
- **内容**: 仅技术规范（安全、性能、TypeScript）
- **Token 估算**: ~500 tokens
- **架构**: 无组织结构

### 迁移后
- **规则文件**: 10 个
- **内容**: 完整的 AI 工作流程 + 技术规范
- **Token 估算**: ~9,200 tokens（核心规则）
- **架构**: 三层架构（优化 token 使用）

---

## 🏗️ 新规则架构

### Layer 1: 核心规则（Always Applied）

| 文件 | Token | 说明 |
|------|-------|------|
| `000-critical-rules.mdc` | ~5,000 | 辨证思考铁律、任务执行红线、核心原则 |
| `001-project-context.mdc` | ~1,500 | 项目状态、技术栈、文档索引 |
| `002-ai-checklist.mdc` | ~2,000 | AI 自检清单、任务类型判断、执行流程 |
| `003-structured-decision-workflow.mdc` | ~700 | 结构化决策流程、复杂问题分析 |

**小计**: ~9,200 tokens

### Layer 2: 场景检查清单（Auto-Attach）

| 文件 | Token | 触发条件 |
|------|-------|---------|
| `100-obsidian-plugin-checklist.mdc` | ~1,000 | 编辑 TS/JS 文件时 |
| `101-typescript-checklist.mdc` | ~800 | 编辑 TS 文件时 |
| `102-markdown-rendering-checklist.mdc` | ~600 | 编辑 Markdown 相关文件时 |

**特点**: 只在需要时加载

### Layer 3: 详细参考（Manual Load）

| 文件 | 说明 |
|------|------|
| `200-project-overview-detailed.mdc` | 项目完整背景、架构设计 |
| `204-anti-overengineering-detailed.mdc` | 防止过度设计、证据优先原则 |
| `207-task-execution-detailed.mdc` | 任务执行详解、验收标准、违规案例 |

**特点**: 手动查阅，深入分析时使用

---

## 📝 从 Epoch 项目借鉴的内容

### 1. 辨证思考铁律 ⭐⭐⭐⭐⭐

**来源**: `Epoch/.cursor/rules/000-critical-rules.mdc`

**核心原则**:
- 区分"不知道"和"知道不存在"
- 优先实验验证
- 承认错误
- 用户也可能错
- 禁止模棱两可

**改造**:
- 保留核心逻辑
- 去掉 Swift/iOS 特定示例
- 添加 TypeScript/Obsidian 示例

### 2. 任务执行红线 ⭐⭐⭐⭐⭐

**来源**: `Epoch/.cursor/rules/000-critical-rules.mdc`, `207-task-execution-detailed.mdc`

**四大原则**:
1. 必须逐项执行
2. 失败时必须停止
3. 验收标准明确
4. 等待明确允许

**改造**:
- 保留流程规则
- 修改验收标准（xcodebuild → npm run build）
- 调整测试场景（真机测试 → Obsidian 测试）

### 3. 结构化决策流程 ⭐⭐⭐⭐

**来源**: `Epoch/.cursor/rules/003-structured-decision-workflow.mdc`

**标准输出**:
1. 疑点识别
2. 方案矩阵
3. 逐项讨论
4. 综合整合

**改造**:
- 完全复用（通用方法论）
- 无需特定改造

### 4. 防止过度设计 ⭐⭐⭐⭐

**来源**: `Epoch/.cursor/rules/204-anti-overengineering-detailed.mdc`

**核心工具**:
- 证据优先决策流程
- 复杂度评分系统（1-10）
- 模式一致性检查

**改造**:
- Swift 示例 → TypeScript 示例
- SwiftData → Obsidian API
- HealthKit 示例 → ChatView 示例

### 5. AI 自检清单 ⭐⭐⭐⭐

**来源**: `Epoch/.cursor/rules/002-ai-checklist.mdc`

**检查流程**:
- 会话开始检查
- 任务类型判断
- 制定计划流程
- 执行验收流程

**改造**:
- 保留检查流程
- 修改项目特定内容
- 添加 Obsidian 测试场景

---

## 🆕 新增内容

### 1. Obsidian 插件特定规则

**新文件**: `100-obsidian-plugin-checklist.mdc`

**内容**:
- 安全性规则（DOM 操作）
- 插件生命周期
- 视图开发模式
- 设置面板开发
- 快捷键规范

### 2. TypeScript 最佳实践

**新文件**: `101-typescript-checklist.mdc`

**内容**:
- 类型安全原则
- 接口定义规范
- 类型工具使用
- 代码风格
- 异步处理模式

### 3. Markdown 渲染规范

**新文件**: `102-markdown-rendering-checklist.mdc`

**内容**:
- 安全渲染（MarkdownRenderer）
- 代码高亮（CodeMirror）
- 流式渲染
- 性能优化

### 4. 项目概述详细参考

**新文件**: `200-project-overview-detailed.mdc`

**内容**:
- 项目背景和技术选型
- 整体架构设计
- 核心组件说明
- 数据流分析
- 设计决策记录

---

## 📊 Token 优化效果

### 旧系统
```
总 Token: ~500
上下文占用: 极低（但缺少关键指导）
```

### 新系统
```
Layer 1（Always）: ~9,200 tokens
Layer 2（Auto）: 按需加载
Layer 3（Manual）: 手动加载

平均会话 Token: ~9,200 - ~11,000 tokens
（根据编辑的文件动态加载 Layer 2）
```

### 对比分析
- ✅ 核心原则始终加载（保证 AI 工作质量）
- ✅ 场景规则按需加载（节省 token）
- ✅ 详细参考手动查阅（深入时再用）

---

## ✅ 验证清单

### 文件创建完成
- [x] README.md - 规则体系说明
- [x] 000-critical-rules.mdc - 核心铁律
- [x] 001-project-context.mdc - 项目状态
- [x] 002-ai-checklist.mdc - AI 自检
- [x] 003-structured-decision-workflow.mdc - 决策流程
- [x] 100-obsidian-plugin-checklist.mdc - Obsidian 规范
- [x] 101-typescript-checklist.mdc - TypeScript 规范
- [x] 102-markdown-rendering-checklist.mdc - Markdown 规范
- [x] 200-project-overview-detailed.mdc - 项目概述
- [x] 204-anti-overengineering-detailed.mdc - 防止过度设计
- [x] 207-task-execution-detailed.mdc - 任务执行详解

### 内容改造完成
- [x] Swift → TypeScript
- [x] iOS → Obsidian Plugin
- [x] HealthKit → Obsidian API
- [x] xcodebuild → npm run build
- [x] 真机测试 → Obsidian 测试
- [x] 移除 Epoch 特定内容
- [x] 添加 AIPilot 特定示例

### 旧文件清理
- [x] 删除 obsidian-plugin-rule.mdc

---

## 🎯 下一步

### 立即生效
新规则已创建，Cursor 将在下次会话自动加载。

### 验证方式
1. 开启新的 Cursor 会话
2. 检查 AI 是否在回复开头确认规则加载
3. 编辑不同类型文件，验证场景规则自动加载
4. 测试手动加载 Layer 3 详细参考

### 持续优化
- 根据实际使用情况调整 token 分配
- 收集常见问题，完善规则内容
- 定期更新项目状态（001-project-context.mdc）

---

## 📚 参考资源

### 源项目
- **Epoch 项目规则**: `/Users/norvyn/Code/Projects/Epoch/.cursor/rules/`
- **三层架构设计**: Epoch README.md

### 官方文档
- **Cursor Rules**: https://docs.cursor.com/context/rules-for-ai
- **Obsidian API**: https://docs.obsidian.md/
- **TypeScript**: https://www.typescriptlang.org/docs/

---

## 🙏 致谢

感谢 Epoch 项目提供的优秀规则体系，特别是：
- 辨证思考铁律（避免"找不到就否定"）
- 任务执行红线（逐项执行、失败必停）
- 三层架构设计（Token 优化）
- 结构化决策流程（复杂问题分析）

这些经验极大地提升了 AI 工作质量和一致性。

---

**完成时间**: 2025-11-09  
**耗时**: ~30 分钟  
**文件数**: 10 个规则文件 + 1 个 README + 本总结  
**总代码量**: ~3000 行  
**状态**: ✅ 完成

