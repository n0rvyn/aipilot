# 开发环境搭建

本文档介绍如何设置 AIPilot 插件的开发环境。

## 📋 前置要求

### 必需
- **Node.js**: v16.x 或更高版本
- **npm**: v7.x 或更高版本
- **Git**: 用于版本控制
- **Obsidian**: 最新版本

### 推荐
- **VS Code** 或其他支持 TypeScript 的编辑器
- **TypeScript**: 全局安装（`npm install -g typescript`）

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/norvyn/aipilot.git
cd aipilot
```

### 2. 安装依赖

```bash
npm install
```

这将安装所有必要的依赖：
- **TypeScript**: 类型系统和编译器
- **esbuild**: 快速打包工具
- **Obsidian API**: 插件开发 API
- **其他依赖**: axios, marked, tiktoken 等

### 3. 开发构建

```bash
npm run dev
```

这个命令会：
1. 编译 TypeScript 代码
2. 将所有模块打包到 `dist/main.js`
3. 复制 `manifest.json` 到 `dist/`
4. 启用 watch 模式（文件修改时自动重新构建）

### 4. 链接到 Obsidian

#### 方法一：使用软链接（推荐）

**Linux/macOS**:
```bash
# 假设你的 Obsidian 库路径是 ~/Documents/MyVault
ln -s /path/to/aipilot ~/Documents/MyVault/.obsidian/plugins/aipilot
```

**Windows** (以管理员身份运行):
```cmd
mklink /D "C:\Users\YourName\Documents\MyVault\.obsidian\plugins\aipilot" "C:\path\to\aipilot"
```

#### 方法二：手动复制

将 `dist/` 目录的内容复制到：
```
<你的库>/.obsidian/plugins/aipilot/
```

每次修改后需要重新复制。

### 5. 在 Obsidian 中启用插件

1. 打开 Obsidian
2. 进入 `设置` → `社区插件`
3. 确保 "安全模式" 已关闭
4. 点击 "重新加载插件"
5. 在插件列表中启用 "AIPilot"

### 6. 开发调试

**热重载**:
- 修改代码后，运行 `Ctrl+R` (或 `Cmd+R`) 重新加载 Obsidian
- 或使用 [Hot Reload Plugin](https://github.com/pjeby/hot-reload)

**查看日志**:
- 打开开发者工具：`Ctrl+Shift+I` (或 `Cmd+Option+I`)
- 查看 Console 标签的输出

**断点调试**:
1. 在代码中添加 `debugger;` 语句
2. 打开开发者工具
3. 触发相关功能
4. 在 Sources 标签中调试

## 📁 项目结构

```
aipilot/
├── src/                    # 源代码
│   ├── main.ts            # 插件入口
│   ├── ChatView.ts        # 聊天视图
│   ├── debate/            # 辩论系统
│   ├── models/            # 模型管理
│   ├── rag/               # RAG 系统
│   └── services/          # 服务层
├── dist/                  # 构建输出（不提交到 Git）
├── docs/                  # 文档
├── test-icons/            # 测试文件
├── esbuild.config.mjs     # 构建配置
├── tsconfig.json          # TypeScript 配置
├── package.json           # 项目配置
└── manifest.json          # 插件清单
```

## 🔧 开发工具

### TypeScript 配置

`tsconfig.json` 配置说明：

```json
{
  "compilerOptions": {
    "target": "ES2018",           // 目标 ES 版本
    "module": "ESNext",           // 模块系统
    "lib": ["ES2018", "DOM"],     // 引入的库
    "moduleResolution": "node",   // 模块解析策略
    "esModuleInterop": true,      // CommonJS 互操作
    "strict": true,               // 严格模式
    "skipLibCheck": true          // 跳过库检查
  },
  "include": ["src/**/*"]
}
```

### esbuild 配置

`esbuild.config.mjs` 配置说明：

```javascript
import esbuild from "esbuild";

const production = process.argv[2] === "production";

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",           // Obsidian API 不打包
    "electron",
    "@codemirror/*"
  ],
  format: "cjs",          // CommonJS 格式
  target: "es2018",
  logLevel: "info",
  sourcemap: production ? false : "inline",  // 开发模式启用 sourcemap
  treeShaking: true,      // 删除未使用的代码
  minify: production,     // 生产模式压缩
  outfile: "dist/main.js"
}).catch(() => process.exit(1));
```

### ESLint 配置（可选）

创建 `.eslintrc.json`:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parserOptions": {
    "sourceType": "module"
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn"
  }
}
```

运行 linter:
```bash
npm run lint
```

## 🔍 调试技巧

### 1. 日志输出

使用 `console.log()` 输出调试信息：

```typescript
console.log('[AIPilot] 用户输入:', userInput);
console.log('[AIPilot] API 响应:', response.data);
```

**提示**: 添加前缀（如 `[AIPilot]`）便于过滤日志。

### 2. 错误捕获

使用 try-catch 捕获错误：

```typescript
try {
  const result = await this.apiCall();
} catch (error) {
  console.error('[AIPilot] API 错误:', error);
  new Notice('API 调用失败: ' + error.message);
}
```

### 3. Obsidian 调试技巧

**查看插件状态**:
```typescript
console.log(this.app.plugins.plugins['aipilot']);
```

**查看设置**:
```typescript
console.log(this.settings);
```

**查看活动文件**:
```typescript
const activeFile = this.app.workspace.getActiveFile();
console.log(activeFile);
```

### 4. 网络请求调试

在 Chrome DevTools 的 Network 标签：
- 查看 API 请求和响应
- 检查请求头和响应头
- 查看响应时间

## 🧪 测试

### 手动测试清单

开发新功能后，测试以下场景：

- [ ] 插件加载和卸载
- [ ] 设置保存和加载
- [ ] 基础聊天功能
- [ ] 流式响应
- [ ] 错误处理（无效 API 密钥、网络错误等）
- [ ] UI 响应性（按钮点击、输入等）
- [ ] 与其他插件的兼容性

### 单元测试（TODO）

计划添加：
```bash
npm test
```

## 📦 构建发布版本

### 生产构建

```bash
npm run build
```

这会：
1. 以生产模式编译（压缩、无 sourcemap）
2. 输出到 `dist/` 目录

### 验证构建

检查 `dist/` 目录应包含：
- `main.js` - 主要代码（压缩后）
- `manifest.json` - 插件清单
- `styles.css` - 样式文件（如果有）

### 测试发布版本

1. 将 `dist/` 目录内容复制到测试库
2. 在 Obsidian 中测试所有功能
3. 确认没有控制台错误

## 🔗 常用命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run dev` | 开发构建（watch 模式） |
| `npm run build` | 生产构建 |
| `npm run clean` | 清理 dist 目录 |
| `npm run lint` | 运行 linter |

## 🛠️ 常见问题

### Q: 修改代码后没有生效？

**A**: 
1. 确认 `npm run dev` 正在运行
2. 检查控制台是否有编译错误
3. 在 Obsidian 中重新加载（Ctrl+R）
4. 清理缓存：删除 `dist/` 重新构建

### Q: TypeScript 报错？

**A**: 
1. 运行 `npm install` 确保依赖完整
2. 重启 VS Code
3. 检查 `tsconfig.json` 配置
4. 安装类型定义：`npm install -D @types/node`

### Q: 找不到 Obsidian API？

**A**: 
确保 `obsidian` 包已安装：
```bash
npm install -D obsidian
```

### Q: esbuild 构建失败？

**A**: 
1. 检查语法错误
2. 确认所有 import 路径正确
3. 查看详细错误信息
4. 尝试删除 `node_modules` 重新安装

## 📚 学习资源

### Obsidian 插件开发

- [官方示例插件](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian API 文档](https://github.com/obsidianmd/obsidian-api)
- [插件开发者文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

### TypeScript

- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

### esbuild

- [esbuild 官网](https://esbuild.github.io/)
- [esbuild API](https://esbuild.github.io/api/)

## 🤝 贡献代码

准备好贡献代码？查看 [贡献指南](contributing.md)。

## 🔗 相关文档

- [构建流程](build-process.md)
- [贡献指南](contributing.md)
- [测试指南](testing.md)
- [发布流程](release.md)

---

**提示**: 遇到问题？在 [GitHub Issues](https://github.com/norvyn/aipilot/issues) 搜索或提问！

