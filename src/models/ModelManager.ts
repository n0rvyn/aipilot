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
  embeddingModel?: string; // The embedding model associated with this LLM
  embeddingDimensions?: number; // Dimensions of the embedding model output
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
  private proxyConfig: ProxyConfig;
  private saveSettingsCallback: () => Promise<void>;

  constructor(
    private plugin: Plugin, 
    initialModels: ModelConfig[] = [], 
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
    this.proxyConfig = initialProxyConfig;
    this.saveSettingsCallback = saveCallback;
  }

  loadConfigs(models: ModelConfig[], proxyConfig: ProxyConfig) {
    this.models = models || [];
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
    // If modelId is provided, use that model; otherwise use the default model
    const model = modelId ? this.getModelById(modelId) : this.getDefaultModel();
    
    if (!model) {
      throw new Error('No model found for embedding generation');
    }
    
    // If the model doesn't have an embedding model specified, use the default global one
    const embeddingModel = model.embeddingModel || 'embedding-3'; // Fallback to a safe default
    
    try {
      console.log(`Getting embedding using model: ${model.name}, embedding model: ${embeddingModel}`);
      
      // Determine if we should use proxy
      const useProxy = model.useProxy !== undefined ? model.useProxy : this.proxyConfig.enabled;
      
      switch(model.type) {
        case 'openai':
          return await this.getOpenAIEmbedding(model, text, embeddingModel, useProxy);
        case 'zhipu':
        case 'zhipuai':
          return await this.getZhipuEmbedding(model, text, embeddingModel, useProxy);
        case 'custom':
          return await this.getCustomEmbedding(model, text, embeddingModel, useProxy);
        default:
          throw new Error(`Embedding not supported for model type: ${model.type}`);
      }
    } catch (error) {
      console.error(`Error getting embedding using model ${model.name}:`, error);
      throw error;
    }
  }
  
  private async getOpenAIEmbedding(model: ModelConfig, text: string, embeddingModel: string, useProxy: boolean): Promise<number[]> {
    const url = 'https://api.openai.com/v1/embeddings';
    const headers = {
      'Authorization': `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
    };
    
    const payload = {
      model: embeddingModel,
      input: text,
    };
    
    const response = await this.fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid embedding response from OpenAI');
    }
    
    return data.data[0].embedding;
  }
  
  private async getZhipuEmbedding(model: ModelConfig, text: string, embeddingModel: string, useProxy: boolean): Promise<number[]> {
    // Use the complete URL for the embeddings endpoint
    const url = model.baseUrl || 'https://open.bigmodel.cn/api/paas/v4/embeddings';
    
    const headers = {
      'Authorization': `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
    };
    
    // Add text chunking for large texts
    const MAX_CHARS = 3000; // Safe limit for embedding
    if (text.length > MAX_CHARS) {
      // Take the first part of the text up to MAX_CHARS, trying to break at a sentence
      const truncated = text.substring(0, MAX_CHARS);
      const lastPeriod = truncated.lastIndexOf('.');
      const lastNewline = truncated.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      text = breakPoint > 0 ? truncated.substring(0, breakPoint + 1) : truncated;
    }
    
    const payload = {
      model: embeddingModel,
      input: text,
      dimensions: embeddingModel === 'embedding-3' ? 1024 : undefined
    };
    
    console.log(`ZhipuAI Embedding: Sending request to ${url} with model ${embeddingModel}`);
    
    const response = await this.fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, useProxy);
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`ZhipuAI Embedding API error (${response.status}): ${errorData}`);
      
      if (response.status === 404) {
        throw new Error(`ZhipuAI Embedding API endpoint not found. Please check your model configuration and API documentation for the correct URL. Status: ${response.status}`);
      }
      
      throw new Error(`ZhipuAI Embedding API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      console.error('Invalid embedding response from ZhipuAI:', data);
      throw new Error('Invalid embedding response from ZhipuAI');
    }
    
    return data.data[0].embedding;
  }
  
  private async getCustomEmbedding(model: ModelConfig, text: string, embeddingModel: string, useProxy: boolean): Promise<number[]> {
    if (!model.baseUrl) {
      throw new Error('Base URL is required for custom embedding API');
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (model.apiKey) {
      headers['Authorization'] = `Bearer ${model.apiKey}`;
    }
    
    const payload = {
      model: embeddingModel,
      input: text,
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