# 多代理辩论系统

本文档详细介绍 AIPilot 的多代理辩论系统设计与实现。

## 📖 什么是多代理辩论？

多代理辩论是一种让多个 AI 代理从不同角度讨论同一个话题的技术。通过模拟不同立场和思维方式，可以：

- ✅ 提供多角度分析
- ✅ 发现思维盲点
- ✅ 深化对问题的理解
- ✅ 生成更全面的观点

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────────┐
│              Debate System Architecture              │
│                                                      │
│  用户输入主题                                          │
│      ↓                                                │
│  ┌────────────────────────────────────────────┐     │
│  │  DebatePanel (UI)                          │     │
│  │  - 选择辩论模式                              │     │
│  │  - 配置代理参数                              │     │
│  │  - 显示辩论进程                              │     │
│  └────────────────────────────────────────────┘     │
│      ↓                                                │
│  ┌────────────────────────────────────────────┐     │
│  │  AgentDebateEngine (核心)                  │     │
│  │  - 创建代理                                  │     │
│  │  - 管理对话流程                              │     │
│  │  - 生成总结                                  │     │
│  └────────────────────────────────────────────┘     │
│      ↓                                                │
│  ┌────────────────────────────────────────────┐     │
│  │  Agent 1    Agent 2    Agent 3    ...      │     │
│  │  (立场A)    (立场B)    (立场C)               │     │
│  └────────────────────────────────────────────┘     │
│      ↓                                                │
│  ┌────────────────────────────────────────────┐     │
│  │  AIService                                  │     │
│  │  - 调用 LLM API                              │     │
│  │  - 生成回复                                  │     │
│  └────────────────────────────────────────────┘     │
│      ↓                                                │
│  辩论结果 + 总结                                      │
└──────────────────────────────────────────────────────┘
```

## 🎭 辩论模式

### 1. Pro vs Con（正反方）

**描述**: 两个代理分别支持和反对一个观点。

**代理配置**:
```typescript
{
  mode: 'pro-con',
  agents: [
    {
      name: '正方',
      role: '支持该观点，提供论据和证据',
      color: 'green'
    },
    {
      name: '反方',
      role: '反对该观点，指出问题和风险',
      color: 'red'
    }
  ],
  rounds: 3
}
```

**对话流程**:
```
Round 1:
  正方: 陈述支持理由
  反方: 陈述反对理由

Round 2:
  正方: 回应反方观点，补充论据
  反方: 回应正方观点，深化批评

Round 3:
  正方: 总结核心优势
  反方: 总结主要风险

总结: 综合双方观点
```

**适用场景**:
- 决策分析
- 方案评估
- 政策讨论

### 2. Six Thinking Hats（六顶思考帽）

**描述**: 六个代理分别代表不同的思考角度（爱德华·德·波诺的思考方法）。

**代理配置**:
```typescript
{
  mode: 'six-hats',
  agents: [
    {
      name: '白帽',
      role: '客观事实和数据',
      color: 'white',
      icon: '📊'
    },
    {
      name: '红帽',
      role: '情感和直觉',
      color: 'red',
      icon: '❤️'
    },
    {
      name: '黑帽',
      role: '批判和风险',
      color: 'black',
      icon: '⚠️'
    },
    {
      name: '黄帽',
      role: '乐观和利益',
      color: 'yellow',
      icon: '☀️'
    },
    {
      name: '绿帽',
      role: '创意和可能性',
      color: 'green',
      icon: '🌱'
    },
    {
      name: '蓝帽',
      role: '控制和总结',
      color: 'blue',
      icon: '🎯'
    }
  ],
  rounds: 2
}
```

**对话流程**:
```
Round 1: 每个代理按顺序发言
  白帽: 列举相关事实和数据
  红帽: 表达直觉感受
  黑帽: 指出潜在问题
  黄帽: 强调积极方面
  绿帽: 提出创新想法
  蓝帽: 阶段性总结

Round 2: 深化和交叉
  各代理根据其他帽子的观点进一步阐述
  
蓝帽最终总结
```

**适用场景**:
- 全面分析
- 创新思考
- 团队头脑风暴

### 3. Roundtable（圆桌讨论）

**描述**: 多个专家平等讨论，自由交流观点。

**代理配置**:
```typescript
{
  mode: 'roundtable',
  agents: [
    {
      name: '技术专家',
      role: '从技术可行性角度分析',
      expertise: 'technology'
    },
    {
      name: '商业顾问',
      role: '从商业价值角度分析',
      expertise: 'business'
    },
    {
      name: '用户代表',
      role: '从用户体验角度分析',
      expertise: 'user-experience'
    }
  ],
  rounds: 4
}
```

**对话流程**:
```
Round 1: 各专家初步观点
Round 2: 交叉讨论和质疑
Round 3: 深化和补充
Round 4: 达成共识或保留分歧

主持人总结
```

**适用场景**:
- 跨领域问题
- 复杂决策
- 方案设计

### 4. Expert Panel（专家小组）

**描述**: 多个领域专家从各自角度提供专业意见。

**代理配置**:
```typescript
{
  mode: 'expert-panel',
  agents: [
    {
      name: '法律专家',
      credentials: '资深律师',
      role: '分析法律风险和合规性'
    },
    {
      name: '财务专家',
      credentials: 'CFA',
      role: '评估财务影响和投资回报'
    },
    {
      name: '技术专家',
      credentials: '首席架构师',
      role: '评估技术方案和实施难度'
    }
  ],
  rounds: 2
}
```

**适用场景**:
- 专业咨询
- 风险评估
- 尽职调查

## 🎯 核心组件

### AgentDebateEngine

辩论引擎核心类。

```typescript
class AgentDebateEngine {
  private agents: Agent[];
  private config: DebateConfig;
  private history: Message[];
  
  constructor(
    config: DebateConfig,
    aiService: AIService
  ) {
    this.config = config;
    this.agents = this.createAgents(config);
  }
  
  /**
   * 开始辩论
   */
  async start(topic: string): Promise<DebateResult> {
    const rounds: Round[] = [];
    
    for (let i = 0; i < this.config.rounds; i++) {
      const roundResult = await this.executeRound(i + 1, topic);
      rounds.push(roundResult);
    }
    
    const summary = await this.generateSummary(topic, rounds);
    
    return {
      topic,
      rounds,
      summary,
      timestamp: new Date()
    };
  }
  
  /**
   * 执行一轮辩论
   */
  private async executeRound(
    roundNumber: number,
    topic: string
  ): Promise<Round> {
    const speeches: Speech[] = [];
    
    for (const agent of this.agents) {
      const context = this.buildContext(agent, speeches);
      const speech = await agent.speak(topic, context, roundNumber);
      speeches.push(speech);
      
      // 通知进度
      this.onProgress?.(agent.name, speech);
    }
    
    return {
      number: roundNumber,
      speeches
    };
  }
  
  /**
   * 构建上下文
   */
  private buildContext(
    currentAgent: Agent,
    previousSpeeches: Speech[]
  ): string {
    let context = `你是${currentAgent.name}，角色是：${currentAgent.role}\n\n`;
    
    if (previousSpeeches.length > 0) {
      context += '之前的发言：\n';
      for (const speech of previousSpeeches) {
        context += `\n${speech.agentName}: ${speech.content}\n`;
      }
    }
    
    return context;
  }
  
  /**
   * 生成总结
   */
  private async generateSummary(
    topic: string,
    rounds: Round[]
  ): Promise<string> {
    const allSpeeches = rounds.flatMap(r => r.speeches);
    
    const prompt = `
针对话题："${topic}"，以下是多位专家的讨论：

${this.formatSpeeches(allSpeeches)}

请作为中立的主持人，总结以下内容：
1. 主要观点和共识
2. 存在的分歧
3. 关键洞察
4. 实践建议

请保持客观、全面。
`;
    
    return await this.aiService.generate(prompt);
  }
}
```

### Agent

代理类，代表一个思考角色。

```typescript
class Agent {
  name: string;
  role: string;
  systemPrompt: string;
  color?: string;
  icon?: string;
  
  constructor(config: AgentConfig) {
    this.name = config.name;
    this.role = config.role;
    this.systemPrompt = this.buildSystemPrompt(config);
  }
  
  /**
   * 发言
   */
  async speak(
    topic: string,
    context: string,
    round: number
  ): Promise<Speech> {
    const prompt = `
${context}

当前话题：${topic}
当前轮次：第 ${round} 轮

请根据你的角色发言。要求：
- 保持角色立场
- 回应之前的观点
- 提供新的见解
- 简洁有力（200-300字）
`;
    
    const content = await this.aiService.generate(prompt, {
      system: this.systemPrompt,
      temperature: 0.8  // 增加多样性
    });
    
    return {
      agentName: this.name,
      content,
      timestamp: new Date()
    };
  }
  
  private buildSystemPrompt(config: AgentConfig): string {
    return `你是${config.name}，你的角色是：${config.role}。

${this.getRoleSpecificInstructions(config)}

发言时请：
- 始终保持你的角色立场
- 提供有价值的观点
- 尊重但可以质疑其他观点
- 语言简洁、逻辑清晰
`;
  }
}
```

### DebatePanel

辩论 UI 面板。

```typescript
class DebatePanel extends ItemView {
  private engine: AgentDebateEngine;
  private currentDebate: DebateResult | null;
  
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    
    // 创建 UI
    this.createHeader(container);
    this.createModeSelector(container);
    this.createTopicInput(container);
    this.createDebateView(container);
    this.createControls(container);
  }
  
  /**
   * 开始辩论
   */
  private async startDebate() {
    const topic = this.topicInput.value;
    if (!topic) {
      new Notice('请输入辩论主题');
      return;
    }
    
    // 创建引擎
    this.engine = new AgentDebateEngine(
      this.getConfig(),
      this.plugin.aiService
    );
    
    // 监听进度
    this.engine.onProgress = (agent, speech) => {
      this.displaySpeech(agent, speech);
    };
    
    // 开始辩论
    this.currentDebate = await this.engine.start(topic);
    
    // 显示总结
    this.displaySummary(this.currentDebate.summary);
    
    // 启用导出
    this.exportButton.disabled = false;
  }
  
  /**
   * 显示发言
   */
  private displaySpeech(agent: Agent, speech: Speech) {
    const speechEl = this.debateContainer.createDiv('debate-speech');
    
    // 代理头像和名称
    const header = speechEl.createDiv('speech-header');
    header.createSpan({ text: agent.icon || '🗣️' });
    header.createSpan({
      text: agent.name,
      cls: 'speech-agent-name'
    });
    
    // 发言内容
    const content = speechEl.createDiv('speech-content');
    MarkdownRenderer.renderMarkdown(
      speech.content,
      content,
      '',
      this
    );
    
    // 滚动到底部
    this.debateContainer.scrollTop = this.debateContainer.scrollHeight;
  }
  
  /**
   * 导出辩论
   */
  private async exportDebate() {
    if (!this.currentDebate) return;
    
    const filename = `辩论-${this.sanitizeFilename(this.currentDebate.topic)}-${Date.now()}.md`;
    const content = this.formatDebateAsMarkdown(this.currentDebate);
    
    const file = await this.app.vault.create(
      `Debates/${filename}`,
      content
    );
    
    new Notice('辩论已导出');
    
    // 打开文件
    this.app.workspace.getLeaf().openFile(file);
  }
  
  /**
   * 格式化为 Markdown
   */
  private formatDebateAsMarkdown(debate: DebateResult): string {
    let md = `# 辩论：${debate.topic}\n\n`;
    md += `时间：${debate.timestamp.toLocaleString()}\n`;
    md += `模式：${this.config.mode}\n\n`;
    
    for (const round of debate.rounds) {
      md += `## 第 ${round.number} 轮\n\n`;
      
      for (const speech of round.speeches) {
        md += `### ${speech.agentName}\n\n`;
        md += `${speech.content}\n\n`;
      }
    }
    
    md += `## 总结\n\n${debate.summary}\n`;
    
    return md;
  }
}
```

## 🎨 UI 设计

### 辩论视图布局

```
┌─────────────────────────────────────────┐
│  🎭 多代理辩论                           │
├─────────────────────────────────────────┤
│  模式: [正反方 ▼]  轮数: [3 ▼]          │
│  话题: [_____________________________]  │
│        [开始辩论]                        │
├─────────────────────────────────────────┤
│  第 1 轮                                 │
│  ┌─────────────────────────────────┐   │
│  │ 🟢 正方                          │   │
│  │ 内容内容内容...                  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ 🔴 反方                          │   │
│  │ 内容内容内容...                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  第 2 轮                                 │
│  ...                                     │
│                                         │
│  📊 总结                                 │
│  ┌─────────────────────────────────┐   │
│  │ 综合分析...                      │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  [导出到笔记] [保存] [清空]              │
└─────────────────────────────────────────┘
```

### 样式定制

```css
/* 辩论面板 */
.debate-panel {
  padding: 20px;
}

/* 发言气泡 */
.debate-speech {
  margin: 15px 0;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid var(--agent-color);
  background: var(--background-secondary);
}

/* 代理标识 */
.speech-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-weight: 600;
}

/* 不同模式的颜色 */
.agent-pro { --agent-color: #10b981; }
.agent-con { --agent-color: #ef4444; }
.agent-white { --agent-color: #6b7280; }
.agent-red { --agent-color: #ef4444; }
.agent-black { --agent-color: #1f2937; }
.agent-yellow { --agent-color: #f59e0b; }
.agent-green { --agent-color: #10b981; }
.agent-blue { --agent-color: #3b82f6; }
```

## ⚙️ 配置选项

### DebateConfig

```typescript
interface DebateConfig {
  mode: 'pro-con' | 'six-hats' | 'roundtable' | 'expert-panel';
  rounds: number;                  // 辩论轮数（1-10）
  agents: AgentConfig[];           // 代理配置
  temperature?: number;            // 创造性（0-1，默认 0.8）
  maxTokensPerSpeech?: number;    // 单次发言最大 tokens
  enableSummary?: boolean;         // 是否生成总结（默认 true）
  summaryStyle?: 'concise' | 'detailed';  // 总结风格
}

interface AgentConfig {
  name: string;
  role: string;
  color?: string;
  icon?: string;
  systemPrompt?: string;  // 自定义系统提示词
  temperature?: number;    // 该代理的创造性
}
```

## 🚀 使用示例

### 基础使用

```typescript
// 创建正反方辩论
const engine = new AgentDebateEngine({
  mode: 'pro-con',
  rounds: 3,
  agents: [
    { name: '正方', role: '支持远程工作' },
    { name: '反方', role: '反对远程工作' }
  ]
}, aiService);

const result = await engine.start('公司应该永久实行远程工作制度吗？');

console.log(result.summary);
```

### 六顶思考帽

```typescript
const engine = new AgentDebateEngine({
  mode: 'six-hats',
  rounds: 2,
  agents: SIX_HATS_AGENTS  // 预定义配置
}, aiService);

const result = await engine.start('开发新产品的策略');
```

### 自定义专家小组

```typescript
const engine = new AgentDebateEngine({
  mode: 'expert-panel',
  rounds: 3,
  temperature: 0.7,
  agents: [
    {
      name: 'CTO',
      role: '首席技术官，评估技术可行性',
      icon: '👨‍💻',
      systemPrompt: '你是一位经验丰富的 CTO...'
    },
    {
      name: 'CFO',
      role: '首席财务官，评估财务影响',
      icon: '💼'
    },
    {
      name: 'CMO',
      role: '首席营销官，评估市场机会',
      icon: '📈'
    }
  ]
}, aiService);

const result = await engine.start('是否投资开发移动应用？');
```

## 📊 最佳实践

### 1. 选择合适的模式

| 场景 | 推荐模式 |
|------|---------|
| 决策评估 | Pro vs Con |
| 全面分析 | Six Thinking Hats |
| 跨领域问题 | Roundtable |
| 专业咨询 | Expert Panel |

### 2. 轮数设置

- **1-2 轮**: 快速概览
- **3-4 轮**: 标准分析（推荐）
- **5+ 轮**: 深度讨论

### 3. 提示词优化

好的提示词应该：
```typescript
{
  name: '技术评审员',
  role: `你是一位资深技术评审员，专注于：
- 代码质量和架构设计
- 性能和可扩展性
- 安全性和最佳实践
- 技术债务识别

请从技术角度严格评审，指出潜在问题并提供建议。`,
  temperature: 0.7
}
```

## 🔗 相关文档

- [AgentDebateEngine API](../api/debate-engine.md)
- [代理辩论使用指南](../guides/agent-debate.md)
- [架构总览](overview.md)

---

**提示**: 多代理辩论是一个强大的思考工具，合理使用可以大大提升决策质量！

