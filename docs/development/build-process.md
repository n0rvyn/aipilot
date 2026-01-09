# 构建流程

本文档详细说明 AIPilot 插件的构建流程和打包机制。

## 📦 构建工具

AIPilot 使用 **esbuild** 作为构建工具：

- ⚡ 极快的构建速度
- 📦 自动打包依赖
- 🔄 支持 watch 模式
- 🗜️ 生产模式压缩

## 🔧 构建配置

### esbuild.config.mjs

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

esbuild.build({
  // 入口文件
  entryPoints: ["src/main.ts"],
  
  // 输出配置
  bundle: true,
  outfile: "dist/main.js",
  format: "cjs",  // CommonJS 格式
  target: "es2018",
  
  // 外部依赖（不打包）
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    ...builtins
  ],
  
  // 开发/生产配置
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  minify: production
}).catch(() => process.exit(1));
```

### 关键配置说明

#### entryPoints
插件的入口文件，esbuild 从这里开始解析依赖。

```javascript
entryPoints: ["src/main.ts"]
```

#### bundle
将所有依赖打包到一个文件中。

```javascript
bundle: true
```

#### external
不打包的外部依赖。

**为什么要 external？**
- `obsidian`: Obsidian 运行时提供
- `electron`: Obsidian 内置
- `@codemirror/*`: Obsidian 内置
- `builtins`: Node.js 内置模块

#### format
输出格式，Obsidian 需要 CommonJS。

```javascript
format: "cjs"
```

#### sourcemap
开发模式生成 sourcemap 便于调试。

```javascript
sourcemap: production ? false : "inline"
```

#### minify
生产模式压缩代码减小体积。

```javascript
minify: production
```

## 🛠️ 构建命令

### 开发构建

```bash
npm run dev
```

**执行内容**:
```bash
node esbuild.config.mjs && cp manifest.json dist/
```

**特点**:
- 非压缩代码
- 包含 inline sourcemap
- 便于调试

**输出**:
```
dist/
├── main.js (未压缩，带 sourcemap)
└── manifest.json
```

### 生产构建

```bash
npm run build
```

**执行内容**:
```bash
npm run clean && node esbuild.config.mjs production && cp manifest.json dist/
```

**特点**:
- 压缩代码
- 无 sourcemap
- 优化性能
- 删除注释

**输出**:
```
dist/
├── main.js (压缩)
└── manifest.json
```

### 清理构建

```bash
npm run clean
```

**执行内容**:
```bash
rm -rf dist/*
```

删除所有构建输出。

## 📊 构建流程图

```
┌─────────────────────────────────────────────────────┐
│                  Build Process                      │
│                                                     │
│  源代码 (src/*.ts)                                   │
│      ↓                                               │
│  TypeScript 编译                                     │
│      ↓                                               │
│  模块解析和依赖分析                                    │
│      ↓                                               │
│  打包所有模块                                         │
│      ↓                                               │
│  Tree Shaking (删除未使用代码)                        │
│      ↓                                               │
│  [生产模式] 代码压缩                                   │
│      ↓                                               │
│  生成 dist/main.js                                   │
│      ↓                                               │
│  复制 manifest.json                                  │
│      ↓                                               │
│  复制 styles.css (如果有)                            │
│      ↓                                               │
│  构建完成                                            │
└─────────────────────────────────────────────────────┘
```

## 📁 文件结构

### 构建前
```
aipilot/
├── src/
│   ├── main.ts
│   ├── ChatView.ts
│   ├── rag/
│   │   ├── RAGService.ts
│   │   └── ...
│   └── ...
├── manifest.json
├── styles.css
└── esbuild.config.mjs
```

### 构建后
```
aipilot/
├── dist/
│   ├── main.js          # 所有 TS 代码打包后的结果
│   ├── manifest.json    # 从根目录复制
│   └── styles.css       # 从根目录复制（如果有）
└── ...
```

## 🔍 构建分析

### 查看打包大小

```bash
npm run build
ls -lh dist/main.js
```

典型大小：
- 开发版: ~500KB
- 生产版: ~200KB（压缩后）

### 分析打包内容

使用 esbuild 的 metafile：

```javascript
// esbuild.config.mjs
esbuild.build({
  // ...其他配置
  metafile: true
}).then(result => {
  console.log(result.metafile);
});
```

## 🎯 优化技巧

### 1. Tree Shaking

确保只导入需要的内容：

```typescript
// ❌ 导入整个库
import * as _ from 'lodash';

// ✅ 只导入需要的函数
import { debounce } from 'lodash-es';
```

### 2. 代码分割（未实现）

未来可以考虑：
```javascript
// 动态导入
const module = await import('./heavy-module');
```

### 3. 外部化大型依赖

如果某个库特别大，考虑 external：

```javascript
external: [
  'obsidian',
  'heavy-library'  // 不打包
]
```

### 4. 生产优化

生产构建时的额外优化：

```javascript
esbuild.build({
  // ...
  drop: production ? ['console', 'debugger'] : [],
  legalComments: 'none',
  mangleProps: /^_/  // 混淆以 _ 开头的属性
});
```

## 🧪 验证构建

### 1. 检查文件存在

```bash
ls dist/
# 应该看到: main.js manifest.json
```

### 2. 检查大小合理

```bash
ls -lh dist/main.js
# 生产版应该 < 300KB
```

### 3. 测试加载

1. 复制 `dist/` 内容到测试库
2. 在 Obsidian 中重新加载插件
3. 检查控制台无错误
4. 测试基本功能

### 4. 检查依赖

```bash
# 查看 main.js 不应包含 obsidian 代码
grep "obsidian" dist/main.js
# 应该只是引用，没有实际代码
```

## 🔄 Watch 模式

### 实现 Watch 模式

修改 `esbuild.config.mjs`:

```javascript
const production = process.argv[2] === "production";
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  // ... 所有配置
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
}
```

### 使用 Watch

```bash
node esbuild.config.mjs --watch
```

**特点**:
- 文件改动自动重新构建
- 构建速度极快（增量构建）
- 适合开发时使用

## 🐛 常见构建错误

### 错误 1: 找不到模块

```
Error: Could not resolve "xxx"
```

**解决**:
```bash
npm install xxx
```

### 错误 2: TypeScript 错误

```
Error: Transform failed with 1 error:
src/main.ts:10:5: ERROR: ...
```

**解决**: 修复 TypeScript 语法错误

### 错误 3: 外部模块警告

```
Warning: Could not mark "xxx" as external
```

**解决**: 确认模块名称正确，或从 external 列表移除

### 错误 4: 构建过大

```
dist/main.js: 5MB
```

**原因**: 可能打包了不该打包的依赖

**解决**: 
1. 检查 external 配置
2. 查看是否导入了整个大型库

## 📚 高级配置

### 多入口点

如果有多个独立模块：

```javascript
entryPoints: {
  main: 'src/main.ts',
  worker: 'src/worker.ts'
},
outdir: 'dist'
```

### 自定义插件

esbuild 插件示例：

```javascript
const myPlugin = {
  name: 'my-plugin',
  setup(build) {
    build.onLoad({ filter: /\.txt$/ }, async (args) => {
      const text = await fs.readFile(args.path, 'utf8');
      return {
        contents: `export default ${JSON.stringify(text)}`,
        loader: 'js'
      };
    });
  }
};

esbuild.build({
  // ...
  plugins: [myPlugin]
});
```

### 环境变量

注入构建时变量：

```javascript
esbuild.build({
  // ...
  define: {
    'process.env.VERSION': JSON.stringify(pkg.version),
    'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
  }
});
```

使用：
```typescript
console.log(`Version: ${process.env.VERSION}`);
console.log(`Built at: ${process.env.BUILD_TIME}`);
```

## 🚀 发布构建

发布前的检查清单：

- [ ] 运行 `npm run build`
- [ ] 测试所有主要功能
- [ ] 检查控制台无错误
- [ ] 更新 `manifest.json` 版本号
- [ ] 更新 `package.json` 版本号
- [ ] 更新 CHANGELOG
- [ ] 提交所有更改
- [ ] 创建 Git tag
- [ ] 推送到 GitHub
- [ ] 创建 Release
- [ ] 上传构建文件

详见 [发布流程](release.md)。

## 🔗 相关文档

- [开发环境搭建](setup.md)
- [发布流程](release.md)
- [esbuild 官方文档](https://esbuild.github.io/)

---

**提示**: 理解构建流程有助于优化性能和排查问题！

