/**
 * AI服务
 * 
 * 与LLM交互的统一接口，委托调用到插件的AI功能
 */
export class AIService {
  constructor(private plugin: any, private modelManager: any) {}
  
  /**
   * 获取AI回复
   * @param prompt 提示词
   * @returns AI生成的响应
   */
  async getAIResponse(prompt: string): Promise<string> {
    try {
      // Get default model
      const defaultModel = this.modelManager.getDefaultModel();
      if (!defaultModel) {
        throw new Error('No default model configured. Please configure a model in settings.');
      }

      // Call model
      return await this.modelManager.callModel(defaultModel.id, prompt, {
        maxTokens: 8192
      });
    } catch (error) {
      console.error('Error getting AI response:', error);
      throw error;
    }
  }
  
  /**
   * 调用AI聊天接口
   * @param messages 消息数组
   * @param onChunk 流式回调
   * @returns AI生成的响应
   */
  async callAIChat(
    messages: Array<{role: string, content: string}>, 
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    try {
      // Get default model
      const defaultModel = this.modelManager.getDefaultModel();
      if (!defaultModel) {
        throw new Error('No default model configured. Please configure a model in settings.');
      }

      // Call model with chat format
      return await this.modelManager.callModel(defaultModel.id, messages, {
        streaming: !!onChunk,
        onChunk: onChunk,
        isChat: true
      });
    } catch (error) {
      console.error('Error in AI chat:', error);
      throw error;
    }
  }
  
  /**
   * 简单的AI调用
   * @param content 要处理的内容
   * @returns AI生成的响应
   */
  async callAI(content: string): Promise<string> {
    try {
      // Get default model
      const defaultModel = this.modelManager.getDefaultModel();
      if (!defaultModel) {
        throw new Error('No default model configured. Please configure a model in settings.');
      }

      // Call model
      return await this.modelManager.callModel(defaultModel.id, content, {
        maxTokens: 8192
      });
    } catch (error) {
      console.error('Error calling AI:', error);
      throw error;
    }
  }
} 