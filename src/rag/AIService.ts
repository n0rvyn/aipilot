import AIPilotPlugin from '../main';
import { ModelManager } from '../models/ModelManager';

/**
 * AI Service
 * 
 * Interface for interacting with LLM, delegating to the plugin's AI capabilities
 */
export class AIService {
  constructor(private plugin: AIPilotPlugin, private modelManager: ModelManager) {}
  
  /**
   * Get AI response
   * @param prompt Prompt
   * @returns AI-generated response
   */
  async getAIResponse(prompt: string): Promise<string> {
    try {
      // Validate prompt
      if (!prompt || prompt.trim().length === 0) {
        console.warn('Empty prompt provided to getAIResponse, using placeholder prompt');
        prompt = "Hello, please provide a general response.";
      }
      
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
      
      // If there's a specific ZhipuAI 400 error, add extra logging
      if (error instanceof Error && error.message.includes('ZhipuAI API error: 400')) {
        console.error('This might be due to invalid input format, exceeded context length, or API rate limiting');
      }
      
      throw error;
    }
  }
  
  /**
   * Call AI chat interface
   * @param messages Message array
   * @param onChunk Streaming callback
   * @returns AI-generated response
   */
  async callAIChat(
    messages: Array<{role: string, content: string}>, 
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    try {
      // Validate messages
      if (!messages || messages.length === 0) {
        console.warn('No messages provided to callAIChat, using default message');
        messages = [{ role: 'user', content: 'Hello' }];
      }
      
      // Ensure all messages have valid content
      messages = messages.filter(msg => 
        msg && typeof msg.role === 'string' && 
        typeof msg.content === 'string' && 
        msg.content.trim().length > 0
      );
      
      if (messages.length === 0) {
        console.warn('No valid messages after filtering, using default message');
        messages = [{ role: 'user', content: 'Hello' }];
      }
      
      // Get default model
      const defaultModel = this.modelManager.getDefaultModel();
      if (!defaultModel) {
        throw new Error('No default model configured. Please configure a model in settings.');
      }

      // Try with the default model
      try {
        // Call model with chat format
        return await this.modelManager.callModel(defaultModel.id, '', {
          streaming: !!onChunk,
          onChunk: onChunk,
          isChat: true,
          messages: messages
        });
      } catch (error) {
        // If the default model fails, try to find an alternative model
        console.error(`Error with default model (${defaultModel.name}):`, error);
        
        // Look for an active alternative model
        const activeModels = this.modelManager.getActiveModels();
        const alternativeModel = activeModels.find(m => m.id !== defaultModel.id);
        
        if (alternativeModel) {
          console.log(`Attempting with alternative model: ${alternativeModel.name}`);
          return await this.modelManager.callModel(alternativeModel.id, '', {
            streaming: !!onChunk,
            onChunk: onChunk,
            isChat: true,
            messages: messages
          });
        } else {
          throw error; // Re-throw if no alternative model available
        }
      }
    } catch (error) {
      console.error('Error in AI chat:', error);
      throw error;
    }
  }
  
  /**
   * Simple AI call
   * @param content Content to process
   * @returns AI-generated response
   */
  async callAI(content: string): Promise<string> {
    try {
      // Validate content
      if (!content || content.trim().length === 0) {
        console.warn('Empty content provided to callAI, using placeholder content');
        content = "Hello, please provide a general response.";
      }
      
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