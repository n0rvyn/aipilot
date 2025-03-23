# AIPilot for Obsidian

AIPilot 是一款功能强大的 Obsidian AI 助手插件，通过 AI 驱动的功能增强您的写作和组织工作流程。

![AIPilot 截图](https://path-to-screenshot.png)

## 功能特点

- **AI 聊天界面**：直接在 Obsidian 中与 OpenAI、智谱 AI 和 Groq 等模型进行交互
- **文本优化**：使用 AI 建议改进您的写作，并通过可视化差异高亮查看变更
- **聊天历史**：保存、组织和搜索以前的 AI 对话
- **自定义功能**：使用自定义提示创建个性化 AI 助手
- **编辑器集成**：将 AI 生成的内容直接插入到您的笔记中
- **知识库**：利用您现有的笔记作为 AI 响应的上下文
- **多智能体辩论**：生成具有不同视角的 AI 智能体之间的讨论

## 安装

1. 在 Obsidian 中，进入设置 → 第三方插件 → 浏览
2. 搜索 "AIPilot"
3. 点击安装，然后启用

或手动安装：
1. 从[发布页面](https://github.com/norvyn/aipilot/releases)下载最新版本文件（`main.js`，`styles.css` 和 `manifest.json`）
2. 在您的 Obsidian 仓库的 `.obsidian/plugins/` 目录中创建名为 `aipilot` 的文件夹
3. 将下载的文件放入此文件夹中
4. 重启 Obsidian 并在设置 → 第三方插件中启用该插件

## 设置

1. 打开设置 → AIPilot
2. 输入支持的提供商（OpenAI、智谱 AI 或 Groq）的 API 密钥
3. 配置您偏好的模型和设置

## 使用方法

### 聊天界面
- 打开 AIPilot 侧边栏开始与 AI 交互
- 通过点击聊天界面中的图标使用自定义功能
- 使用历史按钮查看和恢复您的聊天历史

### 优化功能
- 在编辑器中选择文本并使用优化命令来改进您的写作
- 通过视觉指示器查看更改（删除线表示删除的文本，紫色高亮表示添加的内容）
- 一键将更改应用到您的文档

### 自定义功能
- 为特定写作任务创建自定义提示
- 直接从聊天界面访问您的自定义功能

### 智能体辩论
- 创建具有不同视角的多个 AI 智能体之间的讨论
- 选择辩论模式，如正反辩论、六顶思考帽或圆桌讨论
- 将辩论导出到新笔记

## 贡献

要对此插件进行修改：

1. 克隆此仓库
2. 安装依赖
   ```
   npm install
   ```
3. 启动开发服务器
   ```
   npm run dev
   ```

### 构建发布版本

```
npm run build
```

这将在 `dist` 目录中生成三个文件：
- `main.js`：插件代码
- `styles.css`：插件样式
- `manifest.json`：插件清单

## 支持

- [在 GitHub 上报告问题](https://github.com/norvyn/aipilot/issues)
- [请我喝咖啡](https://buymeacoffee.com)

## 许可证

本项目基于 MIT 许可证 - 详情请查看 LICENSE 文件。

---

<sub>由 [norvyn](https://norvyn.com) 创建</sub> 