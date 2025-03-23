# AIPilot for Obsidian

AIPilot is a powerful AI assistant plugin for Obsidian that enhances your writing and organization workflow with AI-powered features.

![AIPilot Screenshot](https://path-to-screenshot.png)

## Features

- **AI Chat Interface**: Interact with AI models like OpenAI, Zhipu AI, and Groq directly within Obsidian
- **Text Polish**: Refine your writing with AI suggestions and see changes with visual diff highlighting
- **Chat History**: Save, organize, and search through previous AI conversations
- **Custom Functions**: Create personalized AI assistants with custom prompts
- **Editor Integration**: Insert AI-generated content directly into your notes
- **Knowledge Base**: Leverage your existing notes as context for AI responses
- **Multi-Agent Debate**: Generate discussions between AI agents with different perspectives

## Installation

1. In Obsidian, go to Settings → Community plugins → Browse
2. Search for "AIPilot"
3. Click Install, then Enable

Or install manually:
1. Download the latest release files (`main.js`, `styles.css`, and `manifest.json`) from the [releases page](https://github.com/norvyn/aipilot/releases)
2. Create a folder named `aipilot` in your Obsidian vault's `.obsidian/plugins/` directory
3. Place the downloaded files in this folder
4. Restart Obsidian and enable the plugin in Settings → Community plugins

## Setup

1. Open Settings → AIPilot
2. Enter your API key for supported providers (OpenAI, Zhipu AI, or Groq)
3. Configure your preferred model and settings

## Usage

### Chat Interface
- Open the AIPilot sidebar to start interacting with the AI
- Use custom functions by clicking their icons in the chat interface
- View and restore your chat history with the history button

### Polish Function
- Select text in the editor and use the Polish command to refine your writing
- Review changes with visual indicators (strikethrough for deleted text, purple highlights for additions)
- Apply changes to your document with a single click

### Custom Functions
- Create custom prompts for specific writing tasks
- Access your custom functions directly from the chat interface

### Agent Debate
- Create discussions between multiple AI agents with different perspectives
- Choose from debate modes like Pro vs Con, Six Thinking Hats, or Roundtable
- Export debates to new notes

## Contributing

To make changes to this plugin:

1. Clone this repository
2. Install dependencies
   ```
   npm install
   ```
3. Start the development server
   ```
   npm run dev
   ```

### Building for Release

```
npm run build
```

This will generate three files in the `dist` directory:
- `main.js`: The plugin code
- `styles.css`: The plugin styles
- `manifest.json`: The plugin manifest

## Support

- [Report issues on GitHub](https://github.com/norvyn/aipilot/issues)
- [Buy me a coffee](https://buymeacoffee.com)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<sub>Created by [norvyn](https://norvyn.com)</sub>
