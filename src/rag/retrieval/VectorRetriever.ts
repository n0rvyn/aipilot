import { App, TFile } from 'obsidian';
import { Source } from '../RAGService';
import { BaseRetriever, RetrieverPriority } from './Retriever';
import { ModelManager } from '../../models/ModelManager';

/**
 * Interface for Retriever Settings
 */
export interface RetrieverSettings {
  knowledgeBasePath?: string;
  similarityThreshold?: number;
  maxResults?: number;
}

/**
 * Vector Retriever
 * Uses embedding vectors to implement semantic document retrieval
 */
export class VectorRetriever extends BaseRetriever {
  private app: App;
  private modelManager: ModelManager;
  private settings: RetrieverSettings;
  
  constructor(app: App, modelManager: ModelManager, settings: RetrieverSettings) {
    super(RetrieverPriority.Vector);
    this.app = app;
    this.modelManager = modelManager;
    this.settings = settings;
  }
  
  getName(): string {
    return "Vector Retriever";
  }
  
  /**
   * Perform vector retrieval
   * @param query Query text
   * @param limit Maximum number of results
   * @returns Relevant documents
   */
  async retrieve(query: string, limit: number = 5): Promise<Source[]> {
    try {
      const files = await this.getKnowledgeBaseNotes();
      const results: Source[] = [];
      
      // Get query embedding using model manager
      const queryEmbedding = await this.modelManager.getEmbedding(query);
      
      // Set similarity threshold from settings or default to 0.5
      const similarityThreshold = this.settings.similarityThreshold || 0.5;
      
      for (const file of files) {
        try {
          const content = await this.app.vault.read(file);
          
          // Get content embedding using model manager
          const contentEmbedding = await this.modelManager.getEmbedding(content);
          
          // Calculate cosine similarity
          const similarity = this.calculateCosineSimilarity(queryEmbedding, contentEmbedding);
          
          if (similarity > similarityThreshold) {
            const snippet = this.getRelevantSnippet(content, query, 1000);
            results.push({ file, similarity, content: snippet });
          }
        } catch (error) {
          console.error(`Error processing file ${file.path} for vector search:`, error);
        }
      }
      
      // Sort by similarity and limit results
      const maxResults = limit || this.settings.maxResults || 5;
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);
    } catch (error) {
      console.error("Vector retrieval failed:", error);
      return []; // Return empty array on failure
    }
  }
  
  /**
   * Get knowledge base notes
   * @returns Note files in the knowledge base
   */
  private async getKnowledgeBaseNotes(): Promise<TFile[]> {
    const kbPath = this.settings.knowledgeBasePath;
    if (!kbPath) {
      return this.app.vault.getMarkdownFiles();
    }
    
    const files = this.app.vault.getMarkdownFiles();
    return files.filter(file => file.path.startsWith(kbPath));
  }
  
  /**
   * Calculate cosine similarity between two vectors
   * @param vec1 First vector
   * @param vec2 Second vector
   * @returns Similarity score (0-1)
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error("Vectors must have the same dimensions");
    }
    
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }
    
    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    return dotProduct / (mag1 * mag2);
  }
  
  /**
   * Enhanced snippet extraction that intelligently extracts relevant context based on query
   * @override
   */
  protected getRelevantSnippet(content: string, query: string, snippetLength: number = 300): string {
    // Split content into sentences
    const sentences = content.split(/[.!?]+/);
    let bestScore = 0;
    let bestSnippet = '';
    
    // Find the most relevant sentence group
    for (let i = 0; i < sentences.length - 2; i++) {
      const snippet = sentences.slice(i, i + 3).join('. ');
      const score = this.calculateSnippetRelevance(snippet, query);
      
      if (score > bestScore) {
        bestScore = score;
        bestSnippet = snippet;
      }
    }
    
    // If no good snippet found, fall back to base implementation
    if (!bestSnippet) {
      return super.getRelevantSnippet(content, query, snippetLength);
    }
    
    return bestSnippet;
  }
  
  /**
   * Calculate relevance score for a snippet
   */
  private calculateSnippetRelevance(snippet: string, query: string): number {
    const snippetWords = new Set(snippet.toLowerCase().split(/\s+/));
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    
    let matchCount = 0;
    for (const word of queryWords) {
      if (snippetWords.has(word)) {
        matchCount++;
      }
    }
    
    return matchCount / queryWords.size;
  }
} 