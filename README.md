# AIPilot 插件

AIPilot 是一个用于 Obsidian 的插件，集成了 OpenAI 和 ZhipuAI 两大 AI 提供商的模型，帮助用户更高效地整理文本、检查语法、生成内容以及比较文本差异。用户可以通过设置自定义提示词以及选择不同的 AI 模型，以满足个性化的使用需求。

## 功能介绍

AIPilot 提供以下四个主要功能：

1. **文本整理**：根据指定的提示，将选定文本或整个文档的内容进行整理。
2. **语法检查**：检查选定文本或整个文档的语法，并返回修改建议。
3. **内容生成**：基于用户输入的提示，为选定文本或整个文档生成扩展内容。
4. **文本差异比较**：对比当前文档中的内容，显示文本之间的差异。

每个功能都可在插件设置中自定义提示词，以获得更符合需求的 AI 结果。

## 安装和配置

### 安装插件

1. 将插件文件放置在 Obsidian 的插件目录中。
2. 在 Obsidian 中进入 `设置` -> `社区插件`，开启 `AIPilot` 插件。

### 配置插件

打开插件设置界面，配置以下选项：

- **API Key**：输入您在 OpenAI 或 ZhipuAI 的 API Key，用于验证访问。
- **Provider**：选择 AI 提供商，支持 `OpenAI` 和 `ZhipuAI`。
- **AI Model**：选择 AI 模型。根据选择的提供商会有不同的可选模型，如：
  - `OpenAI`：GPT-4、GPT-4 Turbo、GPT-3.5 Turbo、Text-DaVinci-003 等。
  - `ZhipuAI`：GLM-3-Turbo、GLM-4、GLM-4-Air 等。

### 自定义提示词

用户可以根据需求自定义四个功能的提示词，以便获得最符合要求的 AI 输出：

- **Organize Text Prompt**：设置整理文本的提示词。
- **Check Grammar Prompt**：设置语法检查的提示词。
- **Generate Content Prompt**：设置生成内容的提示词。
- **Compare Text Prompt**：设置文本差异比较的提示词。

## 使用方法

在 Obsidian 中激活插件后，可以通过以下方式使用各个功能：

1. **文本整理**：点击插件提供的工具栏图标，或使用命令面板中的 `Organize text` 命令，将选定文本或整个文档内容整理成结构更清晰的文本。
2. **语法检查**：选择文本后，点击语法检查图标，或使用 `Check grammar` 命令，检查文本的语法并提供建议。
3. **内容生成**：点击内容生成图标，或使用 `Generate content` 命令，为选定内容或整个文档生成扩展内容。
4. **文本差异比较**：点击比较差异图标，或使用 `Compare text differences` 命令，对比选定文档中的不同文本段落。

### 交互界面

每个功能都会打开一个对话框，显示 AI 返回的结果，用户可以选择：

- **应用**：将生成的内容插入文档中。
- **复制**：将生成的内容复制到剪贴板。
- **丢弃**：关闭对话框而不做任何修改。

### 弹窗确认

若用户未选定文本，插件会弹出确认对话框，询问是否对整个文档应用该功能。

## 依赖项

- `axios`：用于发送 API 请求。
- `uuid-browser`：生成唯一请求 ID，便于跟踪请求。

## 代码示例

以下是如何使用 `AIPilot` 插件执行语法检查的代码示例：

```typescript
async checkGrammar(editor: any) {
    this.initializeRequestId();
    const selectedText = editor.getSelection();
    if (!selectedText) {
        new ConfirmModal(this.app, "未选择文本，是否对整个文档执行语法检查？", () => {
            const content = editor.getValue();
            this.processGrammar(content, editor);
        }).open();
    } else {
        await this.processGrammar(selectedText, editor);
    }
}
```

## 注意事项

1. **确保 API Key 的安全性**：请勿公开您的 API Key，以避免未经授权的使用。
2. **请求失败处理**：在使用中如果 API 请求失败，将会在控制台输出错误信息。插件会提示“Error fetching AI response”。

## 更新日志

### v0.0.1

- 实现了文本整理、语法检查、内容生成和文本差异比较功能。
- 支持 OpenAI 和 ZhipuAI 两大 AI 提供商。
- 添加了自定义提示词设置。

## 常见问题

**Q1：为什么我没有收到 AI 响应？**  
A1：请检查您的 API Key 是否正确输入，确保网络连接畅通，或者查看控制台中的错误日志。当文本内容过长时，请耐心等待。

**Q2：我可以在一个文档中多次使用插件吗？**  
A2：可以，每次执行操作时都会生成一个新的请求 ID，确保请求的唯一性。
