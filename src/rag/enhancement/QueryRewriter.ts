/**
 * Query Rewriter
 * Used to optimize original queries to make them more suitable for semantic search
 */
export class QueryRewriter {
  constructor(private aiService?: any) {}
  
  /**
   * Rewrite query to make it more suitable for retrieval
   * @param originalQuery Original query
   * @returns Optimized query
   */
  async rewriteQuery(originalQuery: string): Promise<string> {
    // For very short or simple queries, no rewriting needed
    if (originalQuery.length < 10 || originalQuery.split(' ').length < 3) {
      return originalQuery;
    }
    
    if (!this.aiService) {
      console.log("AI service not configured, using original query");
      return originalQuery;
    }
    
    try {
      const messages = [
        { role: "system", content: "You are a search query optimization expert. Your task is to rewrite search queries to make them more effective for semantic search. Return ONLY the rewritten query without explanation or additional text." },
        { role: "user", content: `Original query: "${originalQuery}"\n\nRewrite this query to be more effective for semantic search in a personal knowledge base. Add relevant keywords and context. Return ONLY the rewritten query, without any explanation.` }
      ];
      
      const rewrittenQuery = await this.aiService.callAIChat(messages);
      
      // Clean up the response to remove quotes, explanations, etc.
      let cleanedQuery = rewrittenQuery.trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/^Rewritten query: /i, '') // Remove potential prefixes
        .replace(/\.$/, ''); // Remove trailing period
        
      // If the cleaned query is empty or too long, use the original
      if (!cleanedQuery || cleanedQuery.length < 3 || cleanedQuery.length > 200) {
        return originalQuery;
      }
      
      console.log(`Rewritten query: "${cleanedQuery}" (from: "${originalQuery}")`);
      return cleanedQuery;
    } catch (error) {
      console.error("Error rewriting query:", error);
      return originalQuery; // Fallback to original query on error
    }
  }
} 