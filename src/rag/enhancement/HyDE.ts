import { TFile } from 'obsidian';
import { Source } from '../RAGService';
import { VectorRetriever, RetrieverSettings } from '../retrieval/VectorRetriever';

/**
 * Interface for AI Service
 */
export interface AIService {
  callAIChat(messages: Array<{ role: string, content: string }>): Promise<string>;
}

/**
 * Interface for HyDE Settings
 */
export interface HyDESettings extends RetrieverSettings {
  minHypotheticalDocLength?: number;
}

/**
 * Hypothetical Document Embedding (HyDE) Enhancer
 * Uses generative models to create hypothetical documents to enhance retrieval
 */
export class HyDE {
  constructor(
    private settings: HyDESettings,
    private aiService?: AIService,
    private vectorRetriever?: VectorRetriever
  ) {}
  
  /**
   * Enhance retrieval using HyDE technique
   * @param query Original query
   * @returns Object containing hypothetical document and retrieval results
   */
  async generateAndSearch(query: string): Promise<{ hypotheticalDoc: string, hydeResults: Source[] }> {
    const empty = { hypotheticalDoc: '', hydeResults: [] };
    
    if (!this.aiService || !this.vectorRetriever) {
      return empty;
    }
    
    try {
      // Generate hypothetical answer
      const hypotheticalDoc = await this.generateHypotheticalDoc(query);
      
      const minLength = this.settings.minHypotheticalDocLength || 50;
      if (!hypotheticalDoc || hypotheticalDoc.length < minLength) return empty;
      
      const hydeResults = await this.vectorRetriever.retrieve(hypotheticalDoc);
      
      return { hypotheticalDoc, hydeResults };
    } catch (error) {
      console.error("Error in HyDE retrieval:", error);
      return empty;
    }
  }
  
  /**
   * Generate a hypothetical document/answer for the query
   * @param query User query
   * @returns Hypothetical document
   */
  private async generateHypotheticalDoc(query: string): Promise<string> {
    try {
      // Create prompt for ideal hypothetical document
      const messages = [
        { 
          role: 'system', 
          content: `Generate a detailed, factual passage that directly answers the user's question. Write as if you're a knowledgeable expert providing an ideal answer based on verified information. Include specific details, examples, and explanations. DO NOT include phrases like "As an AI" or "According to my knowledge". Write in a natural, informative style.` 
        },
        {
          role: 'user',
          content: query
        }
      ];
      
      return await this.aiService!.callAIChat(messages);
    } catch (error) {
      console.error("Error generating hypothetical document:", error);
      return "";
    }
  }
  
  /**
   * Create source object
   * @param file File
   * @param similarity Similarity score
   * @param content Content snippet
   * @returns Source object
   */
  private createSource(file: TFile, similarity: number, content: string): Source {
    return { file, similarity, content };
  }
} 