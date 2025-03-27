import { TFile } from 'obsidian';
import { Source } from '../RAGService';
import { VectorRetriever } from '../retrieval/VectorRetriever';

/**
 * Hypothetical Document Embedding (HyDE) Enhancer
 * Uses generative models to create hypothetical documents to enhance retrieval
 */
export class HyDE {
  constructor(
    private settings: any,
    private aiService?: any,
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
      console.log("HyDE requires AI service and vector retriever, skipping");
      return empty;
    }
    
    try {
      // Generate hypothetical answer
      const hypotheticalDoc = await this.generateHypotheticalDoc(query);
      
      if (!hypotheticalDoc || hypotheticalDoc.length < 50) return empty;
      
      // Use hypothetical document as query for retrieval
      // Assumes vectorRetriever implements retrieve method
      const hydeResults = await this.vectorRetriever.retrieve(hypotheticalDoc);
      
      console.log(`HyDE retrieval returned ${hydeResults.length} results`);
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
      
      return await this.aiService.callAIChat(messages);
    } catch (error) {
      console.error("Error generating hypothetical document:", error);
      return "";
    }
  }
  
  /**
   * 创建源对象
   * @param file 文件
   * @param similarity 相似度分数
   * @param content 内容片段
   * @returns 源对象
   */
  private createSource(file: TFile, similarity: number, content: string): Source {
    return { file, similarity, content };
  }
} 