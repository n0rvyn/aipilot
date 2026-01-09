# Cursor Project Rules for AIPilot

> **Version**: 1.0  
> **Last Updated**: 2025-11-09  
> **Status**: Active ✅  
> **Architecture**: 三层架构（Token 优化）

---

## 📁 Rules Structure (3-Layer Architecture)

本目录包含 AIPilot 项目的 Cursor AI Project Rules。这些规则采用**三层架构**，根据使用频率和场景自动加载，**大幅降低 Token 消耗**。

### 🎯 Why 3-Layer Architecture?

**优势**：
- **Layer 1（核心规则）**: 4 个文件，~10,000 tokens，always-applied
- **Layer 2（场景检查清单）**: 3 个文件，~1,000 tokens/个，auto-attach（根据编辑的文件自动加载）
- **Layer 3（详细参考）**: 3 个文件，manual load（需要时手动引用）

**效果**：
- 核心规则始终加载，保证 AI 工作质量
- 场景规则按需加载，节省 token
- 详细参考手动查阅，深入时再加载

---

## 📚 Files Overview

### Layer 1: 核心规则（Always Applied）⭐⭐⭐⭐⭐

| File | Priority | Token | Description |
|------|----------|-------|-------------|
| `000-critical-rules.mdc` | 1 | ~5,000 | 辨证思考铁律、任务执行红线、必须遵守的原则 |
| `001-project-context.mdc` | 2 | ~1,500 | 项目状态、技术栈、关键文档索引 |
| `002-ai-checklist.mdc` | 3 | ~2,000 | AI 自检清单、任务执行流程、文档更新规范 |
| `003-structured-decision-workflow.mdc` | 4 | ~700 | 结构化决策流程、复杂问题分析、方案对比标准 |

**总计**: ~9,200 tokens（每次会话自动加载）

### Layer 2: 场景检查清单（Auto-Attach）🎯

| File | Priority | Token | Globs | 触发条件 |
|------|----------|-------|-------|---------|
| `100-obsidian-plugin-checklist.mdc` | 100 | ~1,000 | `**/*.ts` | 编辑 TypeScript 文件时 |
| `101-typescript-checklist.mdc` | 101 | ~800 | `**/*.ts` | 编辑 TypeScript 文件时 |
| `102-markdown-rendering-checklist.mdc` | 102 | ~600 | `**/MarkdownRenderer.ts`, `**/ChatView.ts` | 编辑 Markdown 相关文件时 |

**特点**：
- ✅ 只在需要时加载（根据编辑的文件自动触发）
- ✅ 包含核心约束、操作前检查清单、常见错误
- ✅ 节省 token（不编辑相关文件时不加载）

### Layer 3: 详细参考（Manual Load）📖

| File | Priority | Description | 何时查阅 |
|------|----------|-------------|---------|
| `200-project-overview-detailed.mdc` | 200 | 项目概述、完整背景、架构设计 | 新会话开始、不了解项目时 |
| `204-anti-overengineering-detailed.mdc` | 204 | 防止过度设计详解、证据优先原则 | 设计新功能、评估复杂度时 |
| `207-task-execution-detailed.mdc` | 207 | 任务执行红线详解、验收标准、违规案例 | 执行复杂任务、确认验收标准时 |

**特点**：
- ✅ 不自动加载（节省 token）
- ✅ 包含完整的背景、示例、边界情况
- ✅ 在 Chat 中提及文件名即可加载

---

## 🎯 Rule Hierarchy

```
User Rules (全局，跨项目)
    ↓
Layer 1: 核心规则（Always Applied，~9,200 tokens）
    ↓
Layer 2: 场景检查清单（Auto-Attach，按需加载）
    ↓
Layer 3: 详细参考（Manual Load，需要时引用）
    ↓
Project Documentation (docs/ 目录)
    ↓
Existing Code Patterns (实际代码)
```

---

## 📖 Quick Reference

### For New Contributors

**First Time Setup:**
1. Read `000-critical-rules.mdc` - 核心铁律（必读）
2. Read `001-project-context.mdc` - 项目当前状态
3. Read `002-ai-checklist.mdc` - AI 工作流程

**Before Writing Code:**
1. 核心规则会自动加载（Layer 1）
2. 场景规则会根据你编辑的文件自动加载（Layer 2）
3. 需要详细参考时，在 Chat 中提及文件名（Layer 3）

**Before Committing:**
1. Run build and check for errors
2. Update documentation if needed
3. Review 质量检查清单

### For AI Assistants

**Every Session Start:**
```markdown
✅ 自动加载 Layer 1（核心规则，~9,200 tokens）
✅ 在回复开头确认："✅ 已读取核心铁律 + AIPilot 项目状态"
```

**When Editing Files:**
```markdown
✅ Layer 2 场景规则自动加载（根据文件模式）
例如：编辑 MarkdownRenderer.ts → 自动加载 102-markdown-rendering-checklist.mdc
```

**When Need Details:**
```markdown
✅ 在 Chat 中提及文件名，手动加载 Layer 3
例如："请参考 204-anti-overengineering-detailed.mdc"
```

**Before Implementation:**
- ⭐ 检查 `001-project-context.mdc` 的"关键文档索引"
- ⭐ 阅读相关的技术文档（docs/ 目录）
- ✅ 场景规则会自动提示需要阅读的文档
- ✅ 遵循辨证思考铁律（`000-critical-rules.mdc`）

**During Implementation:**
- ✅ 遵循任务执行红线（逐项完成、失败必停）
- ✅ 保护现有行为（Preserve existing behavior）
- ✅ 保持变更最小化（Minimal changes）

---

## 🚨 Critical Reminders

### 辨证思考铁律 ⭐⭐⭐⭐⭐

**核心原则**：
1. **区分"不知道"和"知道不存在"**
   - ❌ "我找不到文档，所以不存在"
   - ✅ "我找不到文档，建议测试验证"

2. **优先实验验证**
   - 证据层级：实验 > 文档 > 推测
   - 找不到文档时，设计实验验证

3. **承认错误**
   - 发现错误立即承认
   - 说明原因，避免重复

4. **用户也可能错**
   - 辨证看待，不盲目服从或反对
   - 发现错误礼貌但明确指出

5. **禁止模棱两可**
   - 不用"可能"、"大概"、"应该"
   - 明确说"我不知道，建议验证"

### 任务执行红线 🔴

**⚠️ 绝对禁止违反**:

1. **逐项执行**: 每个步骤必须完成并验收后才能继续
2. **失败必停**: 任何失败或未完成时，立即停止，等待明确允许
3. **验收明确**: 编译=build 通过，部署=服务 running，测试=明确结果
4. **等待允许**: 不能自己决定"先做其他的"或"这步可以跳过"

**记住**：
> "任何步骤失败或未完成时，立即停止，等待明确允许。"

---

## 🔄 Rule Updates

### When to Update Rules

- ✅ When project architecture changes → Update `001-project-context.mdc`
- ✅ When new patterns are established → Update relevant Layer 2 checklist
- ✅ When common issues are identified → Strengthen Layer 1 constraints
- ✅ When technology stack changes → Update `100-obsidian-plugin-checklist.mdc`

### How to Update Rules

1. **Propose Change**: Discuss with team
2. **Update Rule**: Modify relevant `.cursor/rules/*.mdc` file
3. **Document**: Add to changelog or commit message
4. **Version Bump**: Update version in file header

---

## 📚 Related Documentation

### Project Documentation (Main Source of Truth)
- **`docs/README.md`** - 文档中心首页
- **`docs/STRUCTURE.md`** - 项目完整目录树
- **`docs/architecture/`** - 架构文档
- **`docs/api/`** - API 参考文档
- **`docs/guides/`** - 使用指南
- **`docs/development/`** - 开发文档

### Cursor Configuration
- **`.cursor/rules/`** - **✅ Current**（本目录，三层架构）
- **User Rules** - Global rules configured in Cursor settings

---

## ❓ FAQ

### Q1: 为什么要三层架构？

**A**: 根据使用频率分层，核心原则始终加载，场景规则按需加载，详细参考手动查阅，**优化 token 使用**。

### Q2: Auto-attach 是如何工作的？

**A**: 
- Layer 2 文件使用 `globs` 模式（如 `**/*.ts`）
- 当你编辑匹配文件时，Cursor **自动加载**对应的规则
- 不编辑时不加载，节省 token

**示例**：
```markdown
编辑 src/MarkdownRenderer.ts
  ↓
Cursor 自动加载 102-markdown-rendering-checklist.mdc
  ↓
AI 看到 Markdown 渲染的核心约束和检查清单
```

### Q3: 如何手动加载 Layer 3 详细参考？

**A**: 在 Chat 中提及文件名即可：
```markdown
"请参考 204-anti-overengineering-detailed.mdc"
"我需要查看任务执行的详细文档"
```

### Q4: 三层架构会影响 AI 的规则遵守吗？

**A**: 
- ✅ **不会**。核心铁律（Layer 1）仍然 always-applied
- ✅ **更好**。场景规则按需加载，更专注相关约束
- ✅ **更快**。减少 token 负担，AI 响应更快

---

## 🔗 External Resources

### Official Documentation
- **Obsidian Plugin API**: https://docs.obsidian.md/Plugins
- **TypeScript Documentation**: https://www.typescriptlang.org/docs/
- **CodeMirror 6**: https://codemirror.net/docs/
- **Cursor Rules Documentation**: https://docs.cursor.com/context/rules-for-ai

### Community Resources
- **Obsidian Plugin Developer Docs**: https://marcus.se.net/obsidian-plugin-docs/
- **TypeScript Deep Dive**: https://basarat.gitbook.io/typescript/

---

## 📝 Maintenance Log

| Date | Change | Version | Author |
|------|--------|---------|--------|
| 2025-11-09 | 🆕 Initial rule set created | 1.0 | AI + Developer |
| | - Created 10 rule files | | |
| | - Established 3-layer architecture | | |
| | - Migrated from single rule file | | |
| | - Token optimization (~9,200 core) | | |

---

**For questions or suggestions, update this README or discuss with the team.**

---

**Last Updated**: 2025-11-09  
**Maintained By**: AIPilot Development Team  
**Version**: 1.0（三层架构）

