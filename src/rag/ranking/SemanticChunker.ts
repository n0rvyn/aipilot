import { Source } from '../RAGService';

/**
 * Semantic Chunker
 * 
 * Intelligently chunks documents based on semantic structure to extract content most relevant to the query
 */
export class SemanticChunker {
  /**
   * Create semantic contexts for retrieval results
   * @param results Original retrieval results
   * @param query User query
   * @returns Enhanced results
   */
  async createContexts(results: Source[], query: string): Promise<Source[]> {
    const enhancedResults: Source[] = [];
    
    // Process each document to create semantic chunks
    for (const result of results) {
      try {
        // Create semantic chunks
        const semanticChunks = this.createSemanticChunks(result.content, query);
        
        // Include only the most relevant chunks
        for (const chunk of semanticChunks.slice(0, 2)) {
          enhancedResults.push({
            file: result.file,
            similarity: result.similarity,
            content: chunk
          });
        }
      } catch (error) {
        console.error(`Error processing file ${result.file.path}:`, error);
        // If chunking fails, use the original content
        enhancedResults.push(result);
      }
    }
    
    return enhancedResults;
  }
  
  /**
   * Create semantic chunks from text
   * @param text Original text
   * @param query User query
   * @param maxChunkSize Maximum chunk size
   * @returns Array of semantic chunks
   */
  createSemanticChunks(text: string, query: string, maxChunkSize: number = 1000): string[] {
    try {
      // 1. First divide by natural document structure
      // Look for headings, section dividers, etc.
      const structuralDividers = /\n#{1,6}\s+|\n---+|\n\*\*\*+|\n={3,}/g;
      let sections = text.split(structuralDividers).filter(s => s.trim().length > 0);
      
      // 2. Further divide each large section
      const result: string[] = [];
      for (const section of sections) {
        if (section.length <= maxChunkSize) {
          result.push(section);
          continue;
        }
        
        // Split by paragraphs
        const paragraphs = section.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        // Create paragraph chunks, respecting the maximum size
        let currentChunk = "";
        for (const paragraph of paragraphs) {
          // If adding the current paragraph would exceed the max size, save current chunk and start a new one
          if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
            result.push(currentChunk);
            currentChunk = "";
          }
          
          // For especially long paragraphs, may need further splitting
          if (paragraph.length > maxChunkSize) {
            // If current chunk is not empty, save it first
            if (currentChunk.length > 0) {
              result.push(currentChunk);
              currentChunk = "";
            }
            
            // Split long paragraph by sentences
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            let sentenceChunk = "";
            
            for (const sentence of sentences) {
              if (sentenceChunk.length + sentence.length > maxChunkSize && sentenceChunk.length > 0) {
                result.push(sentenceChunk);
                sentenceChunk = "";
              }
              sentenceChunk += sentence;
            }
            
            if (sentenceChunk.length > 0) {
              result.push(sentenceChunk);
            }
          } else {
            // Normal paragraph, add to current chunk
            currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + paragraph;
          }
        }
        
        // Save the last chunk
        if (currentChunk.length > 0) {
          result.push(currentChunk);
        }
      }
      
      // 3. Score and sort chunks by relevance to the query
      const scoredChunks = this.scoreChunksByRelevance(result, query);
      
      return scoredChunks;
    } catch (error) {
      console.error("Error creating semantic chunks:", error);
      // On failure, return the original text as a single chunk
      return [text];
    }
  }
  
  /**
   * Score and sort chunks by relevance to the query
   * @param chunks Text chunks
   * @param query Query
   * @returns Sorted chunks
   */
  private scoreChunksByRelevance(chunks: string[], query: string): string[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    
    // Score each chunk
    const scoredChunks = chunks.map(chunk => {
      const lowerChunk = chunk.toLowerCase();
      let score = 0;
      
      // Check for exact matches
      if (lowerChunk.includes(query.toLowerCase())) {
        score += 100;
      }
      
      // Count matching query terms
      for (const term of queryTerms) {
        if (lowerChunk.includes(term)) {
          score += 10;
          
          // Extra bonus for matches in headings
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (/^#+\s+/.test(line) && line.toLowerCase().includes(term)) {
              score += 5;
            }
          }
        }
      }
      
      return { chunk, score };
    });
    
    // Sort by score
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .map(item => item.chunk);
  }
} 