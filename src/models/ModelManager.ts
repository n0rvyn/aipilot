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

    // Determine if we should use proxy based on global and model-specific settings
    const useProxy = model.useProxy !== undefined ? model.useProxy : this.proxyConfig.enabled;
    
    let result = "";
    
    try {
      console.log(`Calling model: ${model.name} (${model.type}) with prompt: ${prompt.substring(0, 50)}...`);
      
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
      messages: [
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
    
    const payload = {
      model: options.modelName || model.modelName || "llama2",
      prompt: prompt,
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
      messages: [
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
    
    console.log(`ZhipuAI: Using endpoint ${baseUrl} for model type ${model.type}`);
    
    // For ZhipuAI, we need to generate the proper authentication header
    let headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    
    if (model.apiKey) {
      headers["Authorization"] = `Bearer ${model.apiKey}`;
    }
    
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
    
    // Prepare the payload based on the specific API requirements
    const payload = {
      model: modelIdentifier,
      messages: options.conversation || [
        { role: "system", content: model.systemPrompt || "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048,
      stream: streaming
    };
    
    try {
      console.log(`ZhipuAI: Using model ${modelIdentifier} (mapped from ${model.modelName}), streaming: ${streaming}`);
      
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
          console.error(`ZhipuAI API error (${response.status}): ${errorData}`);
          throw new Error(`ZhipuAI API error: ${response.status} ${response.statusText}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader for streaming');
        }
        
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process any complete lines in the buffer
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            
            if (line.startsWith('data:')) {
              const jsonData = line.slice(5).trim();
              
              // Skip empty lines and [DONE] marker
              if (jsonData === '' || jsonData === '[DONE]') continue;
              
              try {
                const parsedData = JSON.parse(jsonData);
                if (parsedData.choices?.[0]?.delta?.content) {
                  const content = parsedData.choices[0].delta.content;
                  fullResponse += content;
                  onChunk(content);
                }
              } catch (e) {
                console.error('Error parsing streaming data:', e, jsonData);
              }
            }
          }
        }
        
        return fullResponse;
      } 
      
      // Handle non-streaming
      const response = await this.fetchWithProxy(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }, useProxy);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error(`ZhipuAI API error (${response.status}): ${errorData}`);
        
        if (response.status === 404) {
          // If we get a 404, it might be due to an incorrect endpoint
          console.error("ZhipuAI API endpoint not found. Please verify the correct endpoint URL.");
          throw new Error(`ZhipuAI API endpoint not found. Please check your model configuration and API documentation for the correct URL. Status: ${response.status}`);
        }
        
        throw new Error(`ZhipuAI API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("ZhipuAI response:", JSON.stringify(data).substring(0, 200) + "...");
      
      // Handle different response formats
      if (data.choices && data.choices[0]?.message?.content) {
        return data.choices[0].message.content;
      } else if (data.data && data.data.choices && data.data.choices[0]?.content) {
        return data.data.choices[0].content;
      } else if (data.response) {
        return data.response;
      } else {
        console.warn("Unexpected ZhipuAI response format:", data);
        return JSON.stringify(data);
      }
    } catch (error) {
      console.error("Error calling ZhipuAI:", error);
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
      messages: [
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
    
    // This is a generic implementation - would need to be customized based on the actual API
    const payload = {
      prompt: prompt,
      system_prompt: model.systemPrompt || "You are a helpful assistant.",
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048
    };
    
    const response = await this.fetchWithProxy(model.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    return data.response || data.result || data.text || JSON.stringify(data);
  }
  
  private async fetchWithProxy(url: string, options: RequestInit, useProxy: boolean): Promise<Response> {
    try {
      console.log(`Making request to: ${url}`);
      
      if (!useProxy || !this.proxyConfig.enabled) {
        return fetch(url, options);
      }
      
      // In a real implementation, you'd need to use a proxy agent
      // This would require a library like 'https-proxy-agent' in Node.js
      // For Obsidian, you might need to implement a custom solution or use a plugin API
      
      // This is a placeholder for proxy implementation
      console.log(`Using proxy: ${this.proxyConfig.type}://${this.proxyConfig.address}:${this.proxyConfig.port}`);
      
      // In an actual implementation, you'd modify the fetch options to use the proxy
      // For now, we'll just do a regular fetch with a console log
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

      console.log(`Getting embedding using provider: ${activeModel.type}, model: ${activeModel.modelName}`);
      
      let vector: number[];
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

      // Cache the result
      this.setCachedEmbedding(text, activeModel.id, vector);
      return vector;

    } catch (error) {
      console.error(`Error getting embedding:`, error);
      throw error;
    }
  }
  
  private async getOpenAIEmbedding(model: EmbeddingModelConfig, text: string, useProxy: boolean): Promise<number[]> {
    const url = model.baseUrl || 'https://api.openai.com/v1/embeddings';
    
    if (!model.apiKey) {
      throw new Error('API key is required for OpenAI embeddings');
    }
    
    const headers = {
      'Authorization': `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
    };
    
    const payload = {
      model: model.modelName,
      input: text,
    };
    
    const response = await this.fetchWithProxy(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid embedding response from OpenAI');
    }
    
    return data.data[0].embedding;
  }
  
  private async getZhipuEmbedding(model: EmbeddingModelConfig, text: string, useProxy: boolean): Promise<number[]> {
    // Use v3 endpoint for embedding-2 and v4 for embedding-3
    const version = model.modelName === 'embedding-2' ? 'v3' : 'v4';
    const baseUrl = model.baseUrl || `https://open.bigmodel.cn/api/paas/${version}/embeddings`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (model.apiKey) {
      headers["Authorization"] = `Bearer ${model.apiKey}`;
    }

    const payload = {
      model: model.modelName,
      input: text
    };

    try {
      console.log(`Making request to: ${baseUrl}`);
      const response = await this.fetchWithProxy(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }, useProxy);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`ZhipuAI embedding API error (${response.status}):`, errorText);
        throw new Error(`ZhipuAI embedding API error: ${response.status} ${response.statusText}`);
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
      input: text,
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