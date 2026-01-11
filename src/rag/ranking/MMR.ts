import { Source } from '../RAGService';

/**
 * Document with similarity score interface
 */
export interface RankableDocument {
  score?: number;
  content?: string;
  embedding?: number[];
  file?: any;
  similarity?: number;
  [key: string]: any; // Allow additional properties
}

/**
 * Maximum Marginal Relevance Reranker
 * 
 * Uses MMR algorithm to rerank retrieval results, balancing relevance and diversity
 */
export class MMRReranker {
  /**
   * Rerank documents using MMR algorithm
   * @param docs Document list to be reranked
   * @param query Original query
   * @param lambda Relevance vs diversity balance factor (0-1), higher values prioritize relevance
   * @param k Number of results to return
   * @returns Reranked document list
   */
  async rerank(docs: RankableDocument[], query: string, lambda = 0.7, k = 5): Promise<RankableDocument[]> {
    if (!docs || docs.length === 0) {
      return [];
    }
    
    if (docs.length <= k) {
      // If too few documents, return all
      return docs;
    }
    
    // First sort by similarity
    const sortedDocs = [...docs].sort((a, b) => 
      (b.score || 0) - (a.score || 0)
    );
    
    // MMR implementation
    const selected = [sortedDocs[0]];
    const remaining = sortedDocs.slice(1);
    
    while (selected.length < k && remaining.length > 0) {
      let nextBestIdx = -1;
      let nextBestScore = -Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const doc = remaining[i];
        // Relevance component
        const relevanceScore = doc.score || 0; 
        
        // Diversity component - max similarity to any already selected document
        let maxSimilarity = 0;
        for (const selectedDoc of selected) {
          const similarity = this.calculateSimilarity(doc, selectedDoc);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }
        
        // MMR score
        const mmrScore = lambda * relevanceScore - (1 - lambda) * maxSimilarity;
        
        if (mmrScore > nextBestScore) {
          nextBestScore = mmrScore;
          nextBestIdx = i;
        }
      }
      
      if (nextBestIdx >= 0) {
        selected.push(remaining[nextBestIdx]);
        remaining.splice(nextBestIdx, 1);
      } else {
        break;
      }
    }
    
    return selected;
  }
  
  /**
   * Calculate similarity between two documents
   * Using existing score by default, can be extended for more complex similarity
   */
  private calculateSimilarity(docA: RankableDocument, docB: RankableDocument): number {
    // Basic implementation - can be enhanced for more sophisticated similarity measures
    if (docA.embedding && docB.embedding) {
      return this.cosineSimilarity(docA.embedding, docB.embedding);
    }
    
    // Fallback to content-based similarity
    if (docA.content && docB.content) {
      // Simple text overlap as a basic similarity measure
      const wordsA = new Set(docA.content.toLowerCase().split(/\s+/));
      const wordsB = new Set(docB.content.toLowerCase().split(/\s+/));
      
      const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
      const union = new Set([...wordsA, ...wordsB]);
      
      return intersection.size / union.size;
    }
    
    return 0;
  }
  
  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
} 