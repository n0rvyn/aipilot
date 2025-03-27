import { TFile } from 'obsidian';
import { Source } from '../RAGService';

/**
 * Retriever interface
 * Defines methods all retrievers must implement
 */
export interface Retriever {
  /**
   * Perform retrieval operation
   * @param query Query string
   * @param limit Maximum number of results
   * @returns Array of retrieval results
   */
  retrieve(query: string, limit?: number): Promise<any[]>;
  
  /**
   * Get retriever name
   */
  getName(): string;
}

/**
 * Retriever priority
 * Defines execution order of retrievers, lower number means higher priority
 */
export enum RetrieverPriority {
  Vector = 1,    // Vector retrieval has highest priority
  Obsidian = 2,  // Obsidian search is second
  Text = 3       // Text matching has lowest priority
}

/**
 * Abstract retriever base class
 * Provides shared functionality and partial implementation
 */
export abstract class BaseRetriever implements Retriever {
  constructor(protected priority: RetrieverPriority) {}
  
  /**
   * Abstract method, must be implemented by subclasses
   */
  abstract retrieve(query: string, limit?: number): Promise<Source[]>;
  
  /**
   * Abstract method, must be implemented by subclasses
   */
  abstract getName(): string;
  
  /**
   * Get retriever priority
   */
  getPriority(): RetrieverPriority {
    return this.priority;
  }
  
  /**
   * Extract relevant text snippet
   * @param content Full document content
   * @param query Query string
   * @param snippetLength Snippet length
   * @returns Relevant text snippet
   */
  protected getRelevantSnippet(content: string, query: string, snippetLength: number = 300): string {
    // Basic implementation, can be overridden in subclasses
    // Simple snippet extraction containing query words
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);
    
    if (index !== -1) {
      const start = Math.max(0, index - snippetLength / 2);
      const end = Math.min(content.length, index + query.length + snippetLength / 2);
      return content.slice(start, end);
    }
    
    // If no exact match found, return document start
    return content.slice(0, snippetLength);
  }
} 