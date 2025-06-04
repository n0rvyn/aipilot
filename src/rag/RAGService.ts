import { App, TFile, Notice } from 'obsidian';
import { AIService } from './AIService';
import { VectorRetriever } from './retrieval/VectorRetriever';
import { QueryRewriter } from './enhancement/QueryRewriter';
import { HyDE } from './enhancement/HyDE';
import { MMRReranker } from './ranking/MMR';
import { SemanticChunker } from './ranking/SemanticChunker';
import { Reflector } from './reflection/Reflector';

export interface RAGOptions {
  showProgress?: boolean;
  progressContainer?: HTMLElement;
  progressText?: HTMLElement;
  progressBar?: HTMLElement;
  limit?: number;
  streaming?: boolean;
  onChunk?: (chunk: string) => void;
  onProgress?: (stage: string, percent: number) => void;
  lambda?: number;
  directory?: string;
}

export interface RAGResult {
  answer: string;
  sources: Source[];
  reflectionRounds: number;
}

export interface Source {
  file: TFile;
  similarity: number; 
  content: string;
}

/**
 * RAGService - Retrieval Augmented Generation Service
 *
 * Provides unified retrieval-augmented generation functionality, integrating query rewriting, HyDE,
 * MMR reranking, semantic chunking, and reflection loops.
 */
export class RAGService {
  // These properties will be set by the initializeRAGService function in index.ts
  private aiService: AIService;
  private queryRewriter: QueryRewriter;
  private hyde: HyDE;
  private mmr: MMRReranker;
  private semanticChunker: SemanticChunker;
  private retriever: VectorRetriever;
  private reflector: Reflector;
  
  constructor() {}
  
  /**
   * Perform the complete RAG process
   * @param query User query
   * @param options Options
   * @returns RAG results, including answer, sources, and reflection rounds
   */
  async performCompleteRAG(query: string, options: RAGOptions = {}): Promise<RAGResult> {
    const { 
      limit = 10, 
      showProgress = false,
      streaming = false,
      onChunk = () => {},
      lambda = 0.6,
      progressContainer,
      progressText,
      progressBar
    } = options;
    
    // Create progress handler with proper arguments
    const progress = showProgress ? new ProgressIndicator(
      progressContainer || document.createElement('div'),
      progressText,
      progressBar
    ) : null;
    
    try {
      // Step 1: Query enhancement
      if (progress) progress.update("Optimizing query...", 10);
      // Query rewriting
      const optimizedQuery = await this.queryRewriter.rewriteQuery(query);
      
      if (progress) progress.update("Generating hypothetical answer...", 20);
      // HyDE enhancement
      const { hypotheticalDoc, hydeResults } = await this.hyde.generateAndSearch(optimizedQuery);
      
      if (progress) progress.update("Searching knowledge base...", 40);
      // Retrieve results
      const retrievalResults = await this.retriever.retrieve(optimizedQuery, limit);
      
      // Combine results from both methods - ensure proper type
      let combinedResults: Source[] = [...hydeResults, ...retrievalResults];
      
      // Step 2: Ranking refinement
      if (progress) progress.update("Reranking results...", 60);
      // Use MMR to ensure diversity in results - await and correctly type
      const rankedResults: Source[] = await this.mmr.rerank(combinedResults, optimizedQuery, lambda, limit);
      
      // Step 3: Generate initial answer
      if (progress) progress.update("Generating answer...", 75);
      const initialAnswer = await this.generateAnswer(query, optimizedQuery, rankedResults, hypotheticalDoc);
      
      // Step 4: Reflection loop (if streaming is enabled, use streaming reflection)
      if (progress) progress.update("Enhancing with knowledge base...", 90);
      
      let finalAnswer;
      if (streaming) {
        finalAnswer = await this.reflector.improveWithReflectionStreaming(
          query,
          initialAnswer,
          rankedResults,
          onChunk
        );
      } else {
        finalAnswer = await this.reflector.improveWithReflection(
          query,
          initialAnswer,
          rankedResults
        );
      }
      
      if (progress) progress.update("Completed!", 100);
      
      // Return final result
      return {
        answer: finalAnswer,
        sources: rankedResults,
        reflectionRounds: this.reflector.getReflectionCount()
      };
    } catch (error) {
      console.error("Error in RAG process:", error);
      throw error;
    }
  }
  
  /**
   * Generate answer based on context
   * @param query Original query
   * @param optimizedQuery Enhanced query
   * @param results Retrieved documents
   * @param hypotheticalDoc Hypothetical document (if generated)
   * @returns Generated answer
   */
  private async generateAnswer(
    query: string,
    optimizedQuery: string,
    results: Source[],
    hypotheticalDoc?: string
  ): Promise<string> {
    // Build combined context from retrieved documents and hypothetical document
    const combinedContext = [
      ...results.map(r => r.content),
      hypotheticalDoc || ''
    ].filter(Boolean).join("\n\n");

    // Detect primary language based on combined context
    const primaryLanguage = this.detectLanguage(combinedContext);

    // Format context for prompt
    let formattedContext = results.map((source, index) => {
      return `Source [${index + 1}]: ${source.file.basename}\n${source.content}`;
    }).join('\n\n');

    // Include hypothetical document if available
    if (hypotheticalDoc) {
      formattedContext += `\n\nHypothetical answer based on the query:\n${hypotheticalDoc}`;
    }
    
    // Create prompt
    let prompt = '';
    if (primaryLanguage === 'chinese') {
      prompt = `Please answer the following question in Chinese:

Question: "${optimizedQuery || query}"

Below are document sections that may contain relevant information:

${formattedContext}

Instructions:
1. Provide a direct, comprehensive answer based on the provided documents
2. If different documents contain conflicting information, note the differences and explain pros and cons
3. When using information from a specific document, cite it as [Source X] in your answer
4. If the provided documents don't fully answer the question, clearly indicate what information is missing
5. Format code blocks, lists, and any structured content appropriately
6. Highlight key points using markdown formatting for readability
7. DO NOT summarize the documents - instead, directly answer the question
8. Keep your answer focused and concise`;
    } else {
      prompt = `Please answer the following question in English:

QUESTION: "${optimizedQuery || query}"

Below are document sections that may contain relevant information:

${formattedContext}

Instructions:
1. Provide a direct, comprehensive answer to the question based on the provided documents
2. If different documents contain conflicting information, note the differences and explain pros and cons 
3. When using information from a specific document, cite it as [Source X] in your answer
4. If the provided documents don't fully answer the question, clearly indicate what information is missing
5. Format code blocks, lists, and any structured content appropriately
6. Highlight key points using markdown formatting for readability
7. DO NOT summarize the documents - instead, directly answer the question
8. Keep your answer focused and concise`;
    }
    
    // Use AI service to generate answer
    return await this.aiService.getAIResponse(prompt);
  }
  
  /**
   * Detect the primary language of text
   * @param text Text to detect
   * @returns Language identifier ('chinese' or 'english')
   */
  private detectLanguage(text: string): string {
    // Simple language detection, count proportion of Chinese characters
    const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = text.length;
    
    // If Chinese character ratio exceeds 15%, consider it Chinese
    return (chineseCharCount / totalChars > 0.15) ? 'chinese' : 'english';
  }
  
  /**
   * Extract sources from context
   */
  private extractSources(context: Source[]): Source[] {
    // Remove duplicate sources
    const uniqueSources = new Map<string, Source>();
    
    for (const source of context) {
      if (!uniqueSources.has(source.file.path)) {
        uniqueSources.set(source.file.path, source);
      }
    }
    
    return Array.from(uniqueSources.values());
  }
  
  /**
   * Get the retriever instances used by this service
   */
  getRetrievers(): VectorRetriever[] {
    return [this.retriever];
  }
}

/**
 * Progress indicator component
 */
export class ProgressIndicator {
  constructor(
    private container: HTMLElement,
    private textElement?: HTMLElement,
    private barElement?: HTMLElement
  ) {
    // Ensure progress bar is visible
    if (container) {
      container.style.display = 'block';
    }
  }
  
  /**
   * Update progress status
   * @param status Status text
   * @param percentage Progress percentage
   */
  update(status: string, percentage: number) {
    if (this.textElement) {
      this.textElement.textContent = status;
    }
    
    if (this.barElement) {
      this.barElement.style.width = `${percentage}%`;
    }
  }
  
  /**
   * Complete progress and hide indicator
   */
  complete() {
    if (this.container) {
      // Delay hiding to let user see 100% completion
      setTimeout(() => {
        this.container.style.display = 'none';
      }, 500);
    }
  }
}

// Use the existing ProgressIndicator as ProgressHandler
// This fixes the reference in the performCompleteRAG method
// or you would need to change to a different implementation
export type ProgressHandler = ProgressIndicator; 