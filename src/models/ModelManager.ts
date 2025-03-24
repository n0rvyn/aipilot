import { Plugin } from "obsidian";

export interface ModelConfig {
  id: string;
  name: string;
  type: 'openai' | 'ollama' | 'claude' | 'zhipu' | 'zhipuai' | 'baidu' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  localPath?: string;
  systemPrompt?: string;
  useProxy?: boolean;
  active: boolean;
  isDefault?: boolean;
  modelName?: string; // Specific model name for this provider (e.g., gpt-4, llama2, etc.)
}

// New interface for embedding configuration
export interface EmbeddingConfig {
  modelName: string; // Name of the embedding model (e.g., text-embedding-3-small)
  dimensions?: number; // Dimensions of embedding vectors (if needed)
  provider: 'openai' | 'zhipuai' | 'custom'; // Provider type for embeddings
  apiKey?: string; // Can use a separate API key just for embeddings
  baseUrl?: string; // Can use a separate endpoint for embeddings
  useProxy?: boolean; // Whether to use proxy for embedding requests
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

// Add a type definition for API options
interface OpenAIOptions {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
}

interface OllamaOptions {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ClaudeOptions {
  modelName?: string;
  maxTokens?: number;
}

type ModelOptions = OpenAIOptions | OllamaOptions | ClaudeOptions;

export class ModelManager {
  private models: ModelConfig[] = [];
  private embeddingConfig: EmbeddingConfig;
  private proxyConfig: ProxyConfig;
  private saveSettingsCallback: () => Promise<void>;

  constructor(
    private plugin: Plugin, 
    initialModels: ModelConfig[] = [], 
    initialEmbeddingConfig: EmbeddingConfig = {
      modelName: "text-embedding-3-small",
      provider: "openai",
      dimensions: 1536
    },
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
    this.embeddingConfig = initialEmbeddingConfig;
    this.proxyConfig = initialProxyConfig;
    this.saveSettingsCallback = saveCallback;
  }

  loadConfigs(models: ModelConfig[], embeddingConfig: EmbeddingConfig, proxyConfig: ProxyConfig) {
    this.models = models || [];
    this.embeddingConfig = embeddingConfig || {
      modelName: "text-embedding-3-small",
      provider: "openai",
      dimensions: 1536
    };
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

  getEmbeddingConfig(): EmbeddingConfig {
    return this.embeddingConfig;
  }

  updateEmbeddingConfig(config: Partial<EmbeddingConfig>): void {
    this.embeddingConfig = { ...this.embeddingConfig, ...config };
    this.saveModels();
  }

  private saveModels(): void {
    this.saveSettingsCallback();
  }

  private saveProxyConfig(): void {
    this.saveSettingsCallback();
  }

  async callModel(modelId: string, prompt: string, options: any = {}): Promise<string> {
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
          result = await this.callZhipu(model, prompt, useProxy, options);
          break;
        case 'baidu':
          result = await this.callBaidu(model, prompt, useProxy, options);
          break;
        case 'custom':
          result = await this.callCustomAPI(model, prompt, useProxy, options);
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
  
  private async callZhipu(model: ModelConfig, prompt: string, useProxy: boolean, options: any): Promise<string> {
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
    
    // Prepare the model name - use options.modelName or fallback to model-specific defaults
    const modelName = model.modelName || options.modelName || (isZhipuAI ? "glm-4" : "glm-4");
    
    // Check if streaming is requested
    const streaming = !!options.streaming;
    const onChunk = options.onChunk;
    
    // Prepare the payload based on the specific API requirements
    const payload = {
      model: modelName,
      messages: options.conversation || [
        { role: "system", content: model.systemPrompt || "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048,
      stream: streaming // Enable streaming if requested
    };
    
    try {
      console.log(`ZhipuAI: Sending request to ${baseUrl} with model ${modelName}, streaming: ${streaming}`);
      
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
  
  private async callBaidu(model: ModelConfig, prompt: string, useProxy: boolean, options: any): Promise<string> {
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
  
  private async callCustomAPI(model: ModelConfig, prompt: string, useProxy: boolean, options: any): Promise<string> {
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
  
  async callMultipleModels(modelIds: string[], prompt: string, options: any = {}): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    // Use Promise.all to call all models in parallel
    await Promise.all(modelIds.map(async (modelId) => {
      try {
        const result = await this.callModel(modelId, prompt, options);
        results[modelId] = result;
      } catch (error) {
        console.error(`Error calling model ${modelId}:`, error);
        results[modelId] = `Error: ${error.message}`;
      }
    }));
    
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

  // Add new methods for embedding functionality
  async getEmbedding(text: string, modelId?: string): Promise<number[]> {
    // For backward compatibility: if modelId is provided, try to use that model's configured embedding settings
    // Otherwise, use the global embedding configuration
    let embeddingConfig = this.embeddingConfig; // Initialize with the global config by default
    let apiKey: string | undefined = embeddingConfig.apiKey;
    let baseUrl: string | undefined = embeddingConfig.baseUrl;
    let useProxy: boolean = embeddingConfig.useProxy !== undefined ? embeddingConfig.useProxy : this.proxyConfig.enabled;
    
    if (modelId) {
      const model = this.getModelById(modelId);
      
      if (model) {
        console.log(`Using model ${model.name} for embedding context`);
        apiKey = model.apiKey || apiKey;
        baseUrl = model.baseUrl || baseUrl;
        useProxy = model.useProxy !== undefined ? model.useProxy : this.proxyConfig.enabled;
      } else {
        console.log(`Model with ID ${modelId} not found, using global embedding config`);
      }
    } else {
      console.log('Using global embedding configuration');
    }
    
    try {
      console.log(`Getting embedding using provider: ${embeddingConfig.provider}, model: ${embeddingConfig.modelName}`);
      
      switch(embeddingConfig.provider) {
        case 'openai':
          return await this.getOpenAIEmbedding(text, embeddingConfig, apiKey, baseUrl, useProxy);
        case 'zhipuai':
          return await this.getZhipuEmbedding(text, embeddingConfig, apiKey, baseUrl, useProxy);
        case 'custom':
          return await this.getCustomEmbedding(text, embeddingConfig, apiKey, baseUrl, useProxy);
        default:
          throw new Error(`Embedding not supported for provider: ${embeddingConfig.provider}`);
      }
    } catch (error) {
      console.error(`Error getting embedding:`, error);
      throw error;
    }
  }
  
  private async getOpenAIEmbedding(
    text: string, 
    embeddingConfig: EmbeddingConfig, 
    apiKey?: string, 
    baseUrl?: string, 
    useProxy?: boolean
  ): Promise<number[]> {
    const url = baseUrl || 'https://api.openai.com/v1/embeddings';
    
    if (!apiKey) {
      throw new Error('API key is required for OpenAI embeddings');
    }
    
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    
    const payload = {
      model: embeddingConfig.modelName,
      input: text,
    };
    
    const response = await this.fetchWithProxy(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }, !!useProxy);
    
    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid embedding response from OpenAI');
    }
    
    return data.data[0].embedding;
  }
  
  private async getZhipuEmbedding(
    text: string, 
    embeddingConfig: EmbeddingConfig, 
    apiKey?: string, 
    baseUrl?: string, 
    useProxy?: boolean
  ): Promise<number[]> {
    // Use the complete URL for the embeddings endpoint
    const url = baseUrl || 'https://open.bigmodel.cn/api/paas/v4/embeddings';
    
    if (!apiKey) {
      throw new Error('API key is required for Zhipu AI embeddings');
    }
    
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    
    const payload = {
      model: embeddingConfig.modelName,
      input: text,
      dimensions: embeddingConfig.dimensions || 1024
    };
    
    console.log(`ZhipuAI Embedding: Sending request to ${url} with model ${embeddingConfig.modelName}`);
    
    const response = await this.fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, !!useProxy);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ZhipuAI embedding API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid embedding response from ZhipuAI');
    }
    
    return data.data[0].embedding;
  }
  
  private async getCustomEmbedding(
    text: string, 
    embeddingConfig: EmbeddingConfig, 
    apiKey?: string, 
    baseUrl?: string, 
    useProxy?: boolean
  ): Promise<number[]> {
    if (!baseUrl) {
      throw new Error('Base URL is required for custom embedding API');
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const payload = {
      model: embeddingConfig.modelName,
      input: text,
      dimensions: embeddingConfig.dimensions
    };
    
    const response = await this.fetchWithProxy(baseUrl + '/embeddings', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, !!useProxy);
    
    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid embedding response from custom API');
    }
    
    return data.data[0].embedding;
  }
} 