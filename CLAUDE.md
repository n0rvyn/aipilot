```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

## Project Overview

AIPilot is a powerful AI assistant plugin for Obsidian that enhances writing and organization workflows with AI-powered features including:
- AI Chat Interface (supports OpenAI, Zhipu AI, Groq, Claude, Ollama, and custom providers)
- Text Polish with visual diff highlighting
- Chat History management
- Custom Functions with personalized prompts
- Editor Integration (insert AI-generated content directly into notes)
- Knowledge Base (RAG system using embeddings)
- Multi-Agent Debate system

## Development Commands

### Installation
```bash
npm install
```

### Development Build (watch mode)
```bash
npm run dev
```
- Compiles TypeScript to `dist/main.js`
- Includes inline sourcemaps for debugging
- Copies `manifest.json` to `dist/`

### Production Build
```bash
npm run build
```
- Cleans previous build
- Compiles with minification (no sourcemaps)
- Optimized for performance

### Linting
```bash
npm run lint
```

### Clean Build
```bash
npm run clean
```

## Project Structure

```
aipilot/
├── src/                    # Source code
│   ├── main.ts            # Plugin entry point (extends Obsidian Plugin)
│   ├── ChatView.ts        # Chat interface view
│   ├── DebatePanel.ts     # Debate system UI
│   ├── KnowledgeBaseView.ts # RAG knowledge base UI
│   ├── models/            # Model management (ModelManager, config modals)
│   ├── rag/               # RAG system (retrieval, ranking, enhancement)
│   ├── services/          # Service layer (RAGService, AIService)
│   ├── icons.ts           # Icon definitions
│   ├── styles.css         # Plugin styles
│   └── MarkdownRenderer.ts # Markdown rendering utilities
├── dist/                  # Build output (not committed)
├── docs/                  # Documentation
│   ├── architecture/      # Architecture diagrams and decisions
│   ├── development/       # Setup and build process docs
│   ├── api/               # API documentation
│   └── guides/            # User guides
├── .cursor/
│   └── rules/             # Cursor AI rules (3-layer architecture)
├── esbuild.config.mjs     # Build configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Project dependencies
└── manifest.json          # Obsidian plugin manifest
```

## Core Architecture

### Plugin Entry Point
- **File**: `src/main.ts`
- **Class**: `AIPilotPlugin` (extends Obsidian's `Plugin`)
- **Responsibilities**:
  - Initializes plugin
  - Manages settings
  - Registers views and commands
  - Handles AI model management via `ModelManager`
  - Initializes RAG service

### Key Components

1. **Model Manager** (`src/models/ModelManager.ts`)
   - Manages AI model configurations
   - Handles API key encryption/decryption
   - Supports multiple providers (OpenAI, ZhipuAI, Claude, Ollama, custom)

2. **RAG System** (`src/rag/`)
   - **RAGService**: Main orchestrator for retrieval-augmented generation
   - **Retrievers**: Vector-based retrieval using embeddings
   - **Rankers**: MMR (Maximum Marginal Relevance) for result ranking
   - **Enhancers**: Query rewriting, HyDE (Hypothetical Document Embeddings)
   - **Reflectors**: Result refinement and filtering

3. **Chat System** (`src/ChatView.ts`)
   - UI for AI chat interactions
   - Supports custom functions
   - Manages chat history

4. **Debate System** (`src/debate/`)
   - Multi-agent debate engine
   - Supports Pro vs Con, Six Thinking Hats, Roundtable modes
   - Exports debates to notes

### Settings
- Stored in `AIPilotPluginSettings` interface
- Encrypts API keys using custom salted XOR encryption
- Migration system for legacy settings

## Building and Testing

### Development Workflow
1. Run `npm run dev`
2. Symlink the plugin directory to your Obsidian vault's plugins folder
3. Reload Obsidian to test changes

### Production Release
1. Update version in `manifest.json` and `package.json`
2. Run `npm run build`
3. Test the build
4. Create GitHub release with `main.js`, `styles.css`, and `manifest.json`

## Cursor Rules

The project uses a **3-layer Cursor AI rules architecture** in `.cursor/rules/`:

### Layer 1 (Core Rules) - Always Applied
- `000-critical-rules.mdc`:辩证思考铁律、任务执行红线
- `001-project-context.mdc`:项目状态、技术栈
- `002-ai-checklist.mdc`:AI自检清单、任务执行流程
- `003-structured-decision-workflow.mdc`:结构化决策流程

### Layer 2 (Scene Checklists) - Auto-Attach
- `100-obsidian-plugin-checklist.mdc`:For TypeScript files
- `101-typescript-checklist.mdc`:For TypeScript files
- `102-markdown-rendering-checklist.mdc`:For Markdown-related files

### Layer 3 (Detailed Reference) - Manual Load
- `200-project-overview-detailed.mdc`:Complete project overview
- `204-anti-overengineering-detailed.mdc`:Prevent over-engineering
- `207-task-execution-detailed.mdc`:Task execution guidelines

## Documentation

- **Architecture**: `docs/architecture/` (includes RAG system, debate system, and plugin lifecycle)
- **Development**: `docs/development/` (setup, build process, contributing guide)
- **API**: `docs/api/` (main plugin API, RAG service API)
- **User Guides**: `docs/guides/` (getting started, configuration, knowledge base)
