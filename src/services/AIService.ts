export class AIService {
  private plugin: AIPilot;
  private modelManager: ModelManager;

  constructor(plugin: AIPilot, modelManager: ModelManager) {
    this.plugin = plugin;
    this.modelManager = modelManager;
  }

  async getAIResponse(prompt: string, options: AIRequestOptions = {}): Promise<string> {
    try {
      // Get default model
      const defaultModel = this.modelManager.getDefaultModel();
      if (!defaultModel) {
        throw new Error('No default model configured. Please configure a model in settings.');
      }

      // Call model with streaming if requested
      const response = await this.modelManager.callModel(defaultModel.id, prompt, {
        streaming: options.streaming,
        onChunk: options.onChunk,
        signal: options.signal
      });

      return response;
    } catch (error) {
      console.error('Error getting AI response:', error);
      throw error;
    }
  }

  async callAIChat(messages: any[], options: AIRequestOptions = {}): Promise<string> {
    try {
      // Get default model
      const defaultModel = this.modelManager.getDefaultModel();
      if (!defaultModel) {
        throw new Error('No default model configured. Please configure a model in settings.');
      }

      // Format messages for chat
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call model with chat format
      const response = await this.modelManager.callModel(defaultModel.id, formattedMessages, {
        streaming: options.streaming,
        onChunk: options.onChunk,
        signal: options.signal,
        isChat: true
      });

      return response;
    } catch (error) {
      console.error('Error in AI chat:', error);
      throw error;
    }
  }
} 