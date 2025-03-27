export class RAGService {
  private plugin: AIPilot;
  private modelManager: ModelManager;
  private aiService: AIService;

  constructor(plugin: AIPilot, modelManager: ModelManager, aiService: AIService) {
    this.plugin = plugin;
    this.modelManager = modelManager;
    this.aiService = aiService;
  }

  async findRelevantNotes(query: string): Promise<RelevantNote[]> {
    try {
      console.log('Vector retrieval: Finding relevant notes for', query);

      // Get embedding for query
      const embedding = await this.modelManager.getQueryEmbedding(query);
      if (!embedding) {
        throw new Error('Failed to get query embedding');
      }

      // Get all note embeddings
      const notes = await this.plugin.getAllNotes();
      const relevantNotes: RelevantNote[] = [];

      for (const note of notes) {
        try {
          // Get or compute note embedding
          const noteEmbedding = await this.modelManager.getNoteEmbedding(note);
          if (!noteEmbedding) continue;

          // Calculate similarity
          const similarity = this.cosineSimilarity(embedding, noteEmbedding);
          if (similarity > this.plugin.settings.similarityThreshold) {
            relevantNotes.push({
              note,
              similarity
            });
          }
        } catch (error) {
          console.error(`Error processing note ${note.path}:`, error);
          continue;
        }
      }

      // Sort by similarity
      relevantNotes.sort((a, b) => b.similarity - a.similarity);

      // Return top N results
      return relevantNotes.slice(0, this.plugin.settings.maxResults || 5);
    } catch (error) {
      console.error('Vector retrieval failed:', error);
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }
} 