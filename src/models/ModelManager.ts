import { Plugin } from "obsidian";

export interface ModelConfig {
  id: string;
  name: string;
  type: 'openai' | 'zhipuai' | 'custom' | 'ollama' | 'claude' | 'zhipu' | 'baidu';
  modelName: string;
  active: boolean;  // Can be active for debate
  isDefault: boolean;  // Only one can be default for chat/functions
  description?: string;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
  useProxy?: boolean;
  systemPrompt?: string;
  localPath?: string;
}

// Interface for embedding model configuration
export interface EmbeddingModelConfig {
  id: string;
  name: string;
  type: 'openai' | 'zhipuai' | 'zhipu' | 'custom';
  modelName: string;
  dimensions?: number;
  apiKey?: string;
  baseUrl?: string;
  useProxy?: boolean;
  active?: boolean;
  isDefault?: boolean;
  description?: string;
}

export interface ProxyConfig {
  enabled: boolean;
  address: string;
  port: string;
  type: 'http' | 'https' | 'socks5';
  requiresAuth: boolean;
  username?: string;
  password?: string;
}

/**
 * Base options for model calls
 */
export interface BaseModelOptions {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  onChunk?: (chunk: string) => void;
  isChat?: boolean;
  messages?: Array<{ role: string, content: string }>;
  modelName?: string;
  [key: string]: any; // Allow for extension
}

/**
 * OpenAI-specific options
 */
export interface OpenAIOptions extends BaseModelOptions {
  presence_penalty?: number;
  frequency_penalty?: number;
  top_p?: number;
}

/**
 * Ollama-specific options
 */
export interface OllamaOptions extends BaseModelOptions {
  top_k?: number;
  top_p?: number;
  repeat_penalty?: number;
}

/**
 * Claude-specific options
 */
export interface ClaudeOptions extends BaseModelOptions {
  top_p?: number;
  top_k?: number;
}

/**
 * ZhipuAI-specific options
 */
export interface ZhipuOptions extends BaseModelOptions {
  conversation?: Array<{ role: string, content: string }>;
}

/**
 * Baidu-specific options
 */
export interface BaiduOptions extends BaseModelOptions {
  top_p?: number;
  penalty_score?: number;
}

/**
 * CustomAPI-specific options
 */
export interface CustomAPIOptions extends BaseModelOptions {
  customHeaders?: Record<string, string>;
  requestFormat?: string;
  responseField?: string;
}

export class ModelManager {
  private models: ModelConfig[] = [];
  private embeddingModels: EmbeddingModelConfig[] = [];
  private proxyConfig: ProxyConfig;
  private saveSettingsCallback: () => Promise<void>;
  private embeddingCache: Map<string, {
    vector: number[];
    timestamp: number;
    modelId: string;
  }> = new Map();
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour

  constructor(
    private plugin: Plugin, 
    initialModels: ModelConfig[] = [], 
    initialEmbeddingModels: EmbeddingModelConfig[] = [],
    initialProxyConfig: ProxyConfig = {
      enabled: false,
      address: "",
      port: "",
      type: "http",
      requiresAuth: false
    },
    saveCallback: () => Promise<void>
  ) {
    this.models = initialModels;
    this.embeddingModels = initialEmbeddingModels;
    this.proxyConfig = initialProxyConfig;
    this.saveSettingsCallback = saveCallback;
  }

  loadConfigs(models: ModelConfig[], embeddingModels: EmbeddingModelConfig[], proxyConfig: ProxyConfig) {
    this.models = models || [];
    this.embeddingModels = embeddingModels || [];
    this.proxyConfig = proxyConfig || {
      enabled: false,
      address: "",
      port: "",
      type: "http",
      requiresAuth: false
    };
  }

  getModels(): ModelConfig[] {
    return [...this.models];
  }

  getActiveModels(): ModelConfig[] {
    return this.models.filter(model => model.active);
  }

  getModelById(id: string): ModelConfig | undefined {
    return this.models.find(m => m.id === id);
  }

  addModel(model: ModelConfig): void {
    // Check if this is set as default
    if (model.isDefault) {
      // Unset any other default models
      this.models.forEach(m => {
        if (m.id !== model.id) {
          m.isDefault = false;
        }
      });
    }
    
    const existingIndex = this.models.findIndex(m => m.id === model.id);
    if (existingIndex >= 0) {
      this.models[existingIndex] = model;
    } else {
      this.models.push(model);
    }
    this.saveModels();
  }

  updateModel(id: string, updates: Partial<ModelConfig>): void {
    const modelIndex = this.models.findIndex(m => m.id === id);
    if (modelIndex >= 0) {
      // If this model is being set as default, unset others
      if (updates.isDefault) {
        this.models.forEach(m => {
          if (m.id !== id) {
            m.isDefault = false;
          }
        });
      }
      this.models[modelIndex] = { ...this.models[modelIndex], ...updates };
      this.saveModels();
    }
  }

  removeModel(id: string): void {
    this.models = this.models.filter(model => model.id !== id);
    this.saveModels();
  }

  getProxyConfig(): ProxyConfig {
    return this.proxyConfig;
  }

  updateProxyConfig(config: Partial<ProxyConfig>): void {
    this.proxyConfig = { ...this.proxyConfig, ...config };
    this.saveProxyConfig();
  }

  getEmbeddingModels(): EmbeddingModelConfig[] {
    return this.embeddingModels;
  }

  getActiveEmbeddingModel(): EmbeddingModelConfig | undefined {
    return this.embeddingModels.find(m => m.active);
  }

  addEmbeddingModel(model: EmbeddingModelConfig): void {
    // Ensure only one model is active
    if (model.active) {
      this.embeddingModels.forEach(m => m.active = false);
    }
    this.embeddingModels.push(model);
    this.saveModels();
  }

  updateEmbeddingModel(id: string, updates: Partial<EmbeddingModelConfig>): void {
    const index = this.embeddingModels.findIndex(m => m.id === id);
    if (index !== -1) {
      // If this model is being set to active, deactivate others
      if (updates.active) {
        this.embeddingModels.forEach(m => m.active = false);
      }
      this.embeddingModels[index] = { ...this.embeddingModels[index], ...updates };
      this.saveModels();
    }
  }

  removeEmbeddingModel(id: string): void {
    this.embeddingModels = this.embeddingModels.filter(m => m.id !== id);
    this.saveModels();
  }

  private saveModels(): void {
    this.saveSettingsCallback();
  }

  private saveProxyConfig(): void {
    this.saveSettingsCallback();
  }

  async callModel(modelId: string, prompt: string, options: BaseModelOptions = {}): Promise<string> {
    const model = this.getModelById(modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    // If the model is not active, throw an error
    if (!model.active) {
      throw new Error(`Model ${model.name} is not active`);
    }
    
    // Check if we should use proxy
    const useProxy = model.useProxy !== undefined ? model.useProxy : this.proxyConfig.enabled;
    
    let result = "";
    
    try {
      // Calling model with prompt
      
      switch(model.type) {
        case 'openai':
          result = await this.callOpenAI(model, prompt, useProxy, options as OpenAIOptions);
          break;
        case 'ollama':
          result = await this.callOllama(model, prompt, useProxy, options as OllamaOptions);
          break;
        case 'claude':
          result = await this.callClaude(model, prompt, useProxy, options as ClaudeOptions);
          break;
        case 'zhipu':
        case 'zhipuai':  // Add zhipuai as an alias for zhipu
          result = await this.callZhipu(model, prompt, useProxy, options as ZhipuOptions);
          break;
        case 'baidu':
          result = await this.callBaidu(model, prompt, useProxy, options as BaiduOptions);
          break;
        case 'custom':
          result = await this.callCustomAPI(model, prompt, useProxy, options as CustomAPIOptions);
          break;
        default:
          throw new Error(`Model type ${model.type} not supported`);
      }
      return result;
    } catch (error) {
      console.error(`Error calling model ${model.name} (${model.type}):`, error);
      throw error;
    }
  }
  
  private async callOpenAI(model: ModelConfig, prompt: string, useProxy: boolean, options: OpenAIOptions): Promise<string> {
    const url = model.baseUrl || "https://api.openai.com/v1/chat/completions";
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${model.apiKey}`
    };
    
    const payload = {
      model: options.modelName || model.modelName || "gpt-3.5-turbo",
      messages: options.messages || [
        { role: "system", content: model.systemPrompt || "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048
    };
    
    const response = await this.fetchWithProxy(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
  
  private async callOllama(model: ModelConfig, prompt: string, useProxy: boolean, options: OllamaOptions): Promise<string> {
    const url = model.baseUrl || "http://localhost:11434/api/generate";
    const headers = {
      "Content-Type": "application/json"
    };
    
    // Handle case where we have messages instead of prompt
    let effectivePrompt = prompt;
    if (!prompt && options.messages && options.messages.length > 0) {
      effectivePrompt = options.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }
    
    const payload = {
      model: options.modelName || model.modelName || "llama2",
      prompt: effectivePrompt,
      system: model.systemPrompt || "You are a helpful assistant.",
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 2048
      }
    };
    
    const response = await this.fetchWithProxy(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    return data.response;
  }
  
  private async callClaude(model: ModelConfig, prompt: string, useProxy: boolean, options: ClaudeOptions): Promise<string> {
    // Implementation for Claude API
    const url = model.baseUrl || "https://api.anthropic.com/v1/messages";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01"
    };
    
    if (model.apiKey) {
      headers["x-api-key"] = model.apiKey;
    }
    
    const payload = {
      model: options.modelName || model.modelName || "claude-3-opus-20240229",
      messages: options.messages || [
        { role: "user", content: prompt }
      ],
      system: model.systemPrompt || "You are Claude, a helpful AI assistant.",
      max_tokens: options.maxTokens || 2048
    };
    
    const response = await this.fetchWithProxy(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    return data.content[0].text;
  }
  
  private async callZhipu(model: ModelConfig, prompt: string, useProxy: boolean, options: ZhipuOptions): Promise<string> {
    // Implementation for ZhipuAI API
    const isZhipuAI = model.type === 'zhipuai'; 
    
    // Check if custom baseUrl is provided, otherwise use the default API endpoint
    let baseUrl = '';
    if (model.baseUrl) {
      baseUrl = model.baseUrl;
      // Make sure the baseUrl doesn't end abruptly without the required path
      if (baseUrl.endsWith('/v4') || baseUrl.endsWith('/v3')) {
        baseUrl += '/chat/completions';
      }
    } else {
      baseUrl = isZhipuAI 
        ? "https://open.bigmodel.cn/api/paas/v4/chat/completions" 
        : "https://open.bigmodel.cn/api/paas/v3/chat/completions";
    }
    
    // Validate API key
    if (!this.validateApiKey(model.apiKey, 'zhipuai')) {
      throw new Error('Invalid or missing ZhipuAI API key');
    }
    
    // Headers with authentication
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${model.apiKey}`
    };
    
    // Map model names to their API identifiers
    const modelNameMap: Record<string, string> = {
      'GLM-4-Long': 'glm-4',
      'GLM-4-Air': 'glm-4',
      'GLM-4': 'glm-4',
      'GLM-3-Turbo': 'glm-3-turbo',
      'GLM-4V': 'glm-4v'
    };
    
    // Get the correct model identifier
    const modelIdentifier = modelNameMap[model.modelName] || model.modelName || options.modelName || 'glm-4';
    
    // Check if streaming is requested
    const streaming = !!options.streaming;
    const onChunk = options.onChunk;
    
    // Ensure prompt or messages are not empty
    if (!prompt && (!options.conversation || options.conversation.length === 0) && (!options.messages || options.messages.length === 0)) {
      console.warn('Empty prompt and no messages provided to ZhipuAI, using fallback prompt');
      prompt = "Hello";
    }
    
    // Prepare messages array
    const messages = options.conversation || options.messages || [
      { role: "system", content: model.systemPrompt || "You are a helpful assistant." },
      { role: "user", content: prompt }
    ];
    
    // Validate messages format
    const validMessages = messages.filter(msg => 
      msg && typeof msg === 'object' && 
      typeof msg.role === 'string' && 
      typeof msg.content === 'string' &&
      msg.content.trim().length > 0
    );
    
    if (validMessages.length === 0) {
      console.warn('No valid messages for ZhipuAI, using fallback message');
      validMessages.push({ 
        role: "user", 
        content: "Hello, can you help me?" 
      });
    }
    
    // Prepare the payload with validated data
    const payload = {
      model: modelIdentifier,
      messages: validMessages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048,
      stream: streaming
    };
    
    try {
      // Handle streaming
      if (streaming && typeof onChunk === 'function') {
        let fullResponse = '';
        
        const response = await this.fetchWithProxy(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        }, useProxy);
        
        if (!response.ok) {
          const errorData = await response.text();
          console.error(`ZhipuAI API error (${response.status}):`, errorData);
          throw new Error(`ZhipuAI API error: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader for streaming');
        }
        
        let decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            
            // Remove the "data: " prefix if present
            const dataLine = line.startsWith('data: ') ? line.slice(6) : line;
            
            if (dataLine === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataLine);
              
              // Handle different response formats
              let chunkText = '';
              
              // Format for zhipuai GLM-4
              if (data.choices && data.choices[0] && data.choices[0].delta) {
                chunkText = data.choices[0].delta.content || '';
              } 
              // Format for v3 API
              else if (data.data && data.data.choices && data.data.choices[0]) {
                chunkText = data.data.choices[0].content || '';
              }
              
              if (chunkText) {
                fullResponse += chunkText;
                onChunk(chunkText);
              }
            } catch (e) {
              // Skip this line if it's not valid JSON
              continue;
            }
          }
        }
        
        // Return the full response that was accumulated
        return fullResponse;
      } else {
        // Non-streaming request
        payload.stream = false;
        
        const response = await this.fetchWithProxy(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        }, useProxy);
        
        if (!response.ok) {
          const errorData = await response.text();
          console.error(`ZhipuAI API error (${response.status}):`, errorData);
          throw new Error(`ZhipuAI API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Handle different response formats
        // For v4 API
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content;
        }
        // For v3 API
        else if (data.data && data.data.choices && data.data.choices[0]) {
          return data.data.choices[0].content;
        } else {
          throw new Error('Unexpected response format from ZhipuAI API');
        }
      }
    } catch (error) {
      console.error('Error calling ZhipuAI:', error);
      
      // Try to provide helpful error messages based on common issues
      if (error instanceof Error) {
        if (error.message.includes('400')) {
          console.error('ZhipuAI 400 error - common causes: invalid input format, invalid model name, or exceeded context length');
        } else if (error.message.includes('401')) {
          console.error('ZhipuAI 401 error - authentication failure: check API key');
        } else if (error.message.includes('429')) {
          console.error('ZhipuAI 429 error - rate limit exceeded: slow down requests');
        }
      }
      
      throw error;
    }
  }
  
  private async callBaidu(model: ModelConfig, prompt: string, useProxy: boolean, options: BaiduOptions): Promise<string> {
    // Implementation for Baidu Wenxin API
    // This is a placeholder implementation - would need to be updated with actual API details
    const url = model.baseUrl || "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/";
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${model.apiKey}`
    };
    
    const payload = {
      messages: options.messages || [
        { role: "system", content: model.systemPrompt || "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048
    };
    
    const response = await this.fetchWithProxy(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    return data.result;
  }
  
  private async callCustomAPI(model: ModelConfig, prompt: string, useProxy: boolean, options: CustomAPIOptions): Promise<string> {
    // Implementation for custom LLM API
    if (!model.baseUrl) throw new Error("Base URL is required for custom API model");
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    
    if (model.apiKey) {
      headers["Authorization"] = `Bearer ${model.apiKey}`;
    }
    
    // Add custom headers if provided
    if (options.customHeaders) {
      Object.keys(options.customHeaders).forEach(key => {
        headers[key] = options.customHeaders![key];
      });
    }
    
    // Prepare payload based on format
    let payload: any = {};
    
    // If requestFormat is set, use it
    if (options.requestFormat) {
      try {
        // Replace placeholders
        const format = options.requestFormat
          .replace('{{prompt}}', prompt || '')
          .replace('{{system_prompt}}', model.systemPrompt || 'You are a helpful assistant.')
          .replace('{{temperature}}', String(options.temperature || 0.7))
          .replace('{{max_tokens}}', String(options.maxTokens || 2048));
        
        payload = JSON.parse(format);
      } catch (e) {
        console.error('Error parsing custom request format:', e);
        // Fallback to default format
        payload = {
          model: model.modelName,
          prompt: prompt,
          messages: options.messages || [
            { role: "system", content: model.systemPrompt || "You are a helpful assistant." },
            { role: "user", content: prompt }
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 2048
        };
      }
    } else {
      // Default format (similar to OpenAI)
      payload = {
        model: model.modelName,
        messages: options.messages || [
          { role: "system", content: model.systemPrompt || "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048
      };
    }
    
    const response = await this.fetchWithProxy(model.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    
    // Extract the response based on responseField or default path
    if (options.responseField) {
      // Split by dots and traverse the object
      return options.responseField.split('.').reduce((o, key) => o?.[key], data);
    } else {
      // Default OpenAI format
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      } else {
        throw new Error('Unexpected response format from custom API');
      }
    }
  }
  
  private async fetchWithProxy(url: string, options: RequestInit, useProxy: boolean): Promise<Response> {
    try {
      // Making request to URL
      
      if (!useProxy || !this.proxyConfig.enabled) {
        return fetch(url, options);
      }
      
      // In a real implementation, you'd need to use a proxy agent
      // This would require a library like 'https-proxy-agent' in Node.js
      // For Obsidian, you might need to implement a custom solution or use a plugin API
      
      // This is a placeholder for proxy implementation
      // Using proxy configuration
      
      // In an actual implementation, you'd modify the fetch options to use the proxy
      // For now, just do a regular fetch
      return fetch(url, options);
    } catch (error) {
      console.error(`Fetch error for ${url}:`, error);
      throw error;
    }
  }
  
  /**
   * Call multiple models with the same prompt in parallel
   * @param modelIds Array of model IDs to call
   * @param prompt Prompt to send to all models
   * @param options Options for the API calls
   * @returns Object mapping model IDs to their responses
   */
  async callMultipleModels(modelIds: string[], prompt: string, options: BaseModelOptions = {}): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    const promises = modelIds.map(async (modelId) => {
      try {
        const response = await this.callModel(modelId, prompt, options);
        results[modelId] = response;
      } catch (error) {
        results[modelId] = `Error: ${error.message}`;
      }
    });
    
    await Promise.all(promises);
    return results;
  }

  getDefaultModel(): ModelConfig | null {
    const defaultModel = this.models.find(m => m.isDefault && m.active);
    if (defaultModel) {
      return defaultModel;
    }
    
    // If no default is set, use the first active model
    const firstActive = this.models.find(m => m.active);
    return firstActive || null;
  }

  private getCacheKey(text: string, modelId: string): string {
    return `${modelId}:${text}`;
  }

  private async getCachedEmbedding(text: string, modelId: string): Promise<number[] | null> {
    const key = this.getCacheKey(text, modelId);
    const cached = this.embeddingCache.get(key);
    
    if (cached) {
      const now = Date.now();
      if (now - cached.timestamp < this.CACHE_DURATION) {
        return cached.vector;
      } else {
        // Cache expired
        this.embeddingCache.delete(key);
      }
    }
    return null;
  }

  private setCachedEmbedding(text: string, modelId: string, vector: number[]): void {
    const key = this.getCacheKey(text, modelId);
    this.embeddingCache.set(key, {
      vector,
      timestamp: Date.now(),
      modelId
    });
    
    // Clean up old cache entries
    const now = Date.now();
    for (const [key, value] of this.embeddingCache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.embeddingCache.delete(key);
      }
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const activeModel = this.getActiveEmbeddingModel();
    if (!activeModel) {
      throw new Error('No active embedding model configured');
    }
    
    try {
      // Check cache first
      const cached = await this.getCachedEmbedding(text, activeModel.id);
      if (cached) {
        return cached;
      }

      // Getting embedding using provider and model
      
      let vector: number[];
      try {
        switch(activeModel.type) {
          case 'openai':
            vector = await this.getOpenAIEmbedding(activeModel, text, activeModel.useProxy !== undefined ? activeModel.useProxy : this.proxyConfig.enabled);
            break;
          case 'zhipuai':
          case 'zhipu':
            vector = await this.getZhipuEmbedding(activeModel, text, activeModel.useProxy !== undefined ? activeModel.useProxy : this.proxyConfig.enabled);
            break;
          case 'custom':
            vector = await this.getCustomEmbedding(activeModel, text, activeModel.useProxy !== undefined ? activeModel.useProxy : this.proxyConfig.enabled);
            break;
          default:
            throw new Error(`Embedding not supported for provider: ${activeModel.type}`);
        }
      } catch (error) {
        console.error(`Error with primary embedding model (${activeModel.type}):`, error);
        // Try to find a fallback model if primary fails
        const fallbackModel = this.embeddingModels.find(m => m.id !== activeModel.id && m.type !== activeModel.type);
        if (fallbackModel) {
          console.log(`Attempting fallback to ${fallbackModel.type} embedding model`);
          switch(fallbackModel.type) {
            case 'openai':
              vector = await this.getOpenAIEmbedding(fallbackModel, text, fallbackModel.useProxy !== undefined ? fallbackModel.useProxy : this.proxyConfig.enabled);
              break;
            case 'zhipuai':
            case 'zhipu':
              vector = await this.getZhipuEmbedding(fallbackModel, text, fallbackModel.useProxy !== undefined ? fallbackModel.useProxy : this.proxyConfig.enabled);
              break;
            case 'custom':
              vector = await this.getCustomEmbedding(fallbackModel, text, fallbackModel.useProxy !== undefined ? fallbackModel.useProxy : this.proxyConfig.enabled);
              break;
            default:
              throw error; // Re-throw if no fallback available
          }
        } else {
          throw error; // Re-throw if no fallback available
        }
      }
      
      // Cache the result
      this.setCachedEmbedding(text, activeModel.id, vector);
      return vector;

    } catch (error) {
      console.error(`Error getting embedding:`, error);
      throw error;
    }
  }
  
  /**
   * Validate API key format
   * @param apiKey API key to validate
   * @param provider Provider type
   * @returns Whether the API key appears valid
   */
  private validateApiKey(apiKey: string | undefined, provider: string): boolean {
    if (!apiKey) {
      return false;
    }
    
    // Basic validation for common API key formats
    switch(provider) {
      case 'openai':
        return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey);
      case 'zhipuai':
      case 'zhipu':
        return /^[a-zA-Z0-9_\.-]{40,}$/.test(apiKey);
      default:
        // For other providers, just check if it's not empty and has a reasonable length
        return apiKey.length >= 8;
    }
  }

  private async getOpenAIEmbedding(model: EmbeddingModelConfig, text: string, useProxy: boolean): Promise<number[]> {
    // Check and process text first
    if (!text || text.trim().length === 0) {
      console.warn("Empty text provided to OpenAI embedding, using fallback text");
      // Use placeholder text instead of throwing an error
      text = "placeholder text for embedding";
    }
    
    // Trim text to avoid token limits
    const truncatedText = text.slice(0, 8000);
    
    const baseUrl = model.baseUrl || "https://api.openai.com/v1/embeddings";
    
    // Validate API key
    if (!this.validateApiKey(model.apiKey, 'openai')) {
      throw new Error('Invalid or missing OpenAI API key');
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${model.apiKey}`
    };

    const payload = {
      model: model.modelName || "text-embedding-3-small",
      input: truncatedText
    };

    try {
      const response = await this.fetchWithProxy(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }, useProxy);

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`OpenAI API error (${response.status}):`, errorData);
        throw new Error(`OpenAI embedding API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.data && data.data[0] && data.data[0].embedding) {
        return data.data[0].embedding;
      } else {
        console.error('Unexpected OpenAI embedding response format:', data);
        throw new Error('Invalid embedding response format from OpenAI');
      }
    } catch (error) {
      console.error('Error getting OpenAI embedding:', error);
      throw error;
    }
  }
  
  private async getZhipuEmbedding(model: EmbeddingModelConfig, text: string, useProxy: boolean): Promise<number[]> {
    // Check and process text first
    if (!text || text.trim().length === 0) {
      console.warn("Empty text provided to ZhipuEmbedding, using fallback text");
      // Use placeholder text instead of throwing an error
      text = "placeholder text for embedding";
    }

    // Trim very long text to avoid API failures (ZhipuAI has length limits)
    // Also remove any characters that might cause issues with the API
    const processedText = text.slice(0, 3000).replace(/[\uD800-\uDFFF]/g, '');
    
    // Use v3 endpoint for embedding-2 and v4 for embedding-3  
    const version = model.modelName === 'embedding-2' ? 'v3' : 'v4';
    const baseUrl = model.baseUrl || `https://open.bigmodel.cn/api/paas/${version}/embeddings`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    // Validate API key
    if (!this.validateApiKey(model.apiKey, 'zhipuai')) {
      throw new Error('Invalid or missing ZhipuAI API key');
    }
    
    headers["Authorization"] = `Bearer ${model.apiKey}`;

    // Text has already been validated and prepared above

    const payload = {
      model: model.modelName,
      input: processedText
    };

    try {
      const response = await this.fetchWithProxy(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }, useProxy);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`ZhipuAI embedding API error (${response.status}):`, errorText);
        throw new Error(`ZhipuAI embedding API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle both v3 and v4 response formats
      if (data.data && data.data[0] && data.data[0].embedding) {
        return data.data[0].embedding;
      } else if (data.data && data.data.embedding) {
        return data.data.embedding;
      } else {
        console.error('Unexpected ZhipuAI embedding response format:', data);
        throw new Error('Invalid embedding response format from ZhipuAI');
      }
    } catch (error) {
      console.error('Error getting ZhipuAI embedding:', error);
      throw error;
    }
  }
  
  private async getCustomEmbedding(model: EmbeddingModelConfig, text: string, useProxy: boolean): Promise<number[]> {
    // Check and process text first
    if (!text || text.trim().length === 0) {
      console.warn("Empty text provided to custom embedding, using fallback text");
      // Use placeholder text instead of throwing an error
      text = "placeholder text for embedding";
    }
    
    if (!model.baseUrl) {
      throw new Error('Base URL is required for custom embedding API');
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (model.apiKey) {
      headers['Authorization'] = `Bearer ${model.apiKey}`;
    }
    
    const payload = {
      model: model.modelName,
      input: text.slice(0, 8000), // Limit text length
      dimensions: model.dimensions
    };
    
    const response = await this.fetchWithProxy(model.baseUrl + '/embeddings', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid embedding response from custom API');
    }
    
    return data.data[0].embedding;
  }
} 