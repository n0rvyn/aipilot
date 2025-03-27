import { App } from 'obsidian';
import { RAGService, RAGOptions, RAGResult, Source } from './RAGService';
import { AIService } from './AIService';
import { VectorRetriever } from './retrieval/VectorRetriever';
import { QueryRewriter } from './enhancement/QueryRewriter';
import { HyDE } from './enhancement/HyDE';
import { MMRReranker } from './ranking/MMR';
import { SemanticChunker } from './ranking/SemanticChunker';
import { Reflector } from './reflection/Reflector';
import AIPilotPlugin from '../main';

/**
 * Create complete RAG service
 * @param app Obsidian app instance
 * @param plugin Plugin instance
 * @param settings Settings object
 * @returns Configured RAG service
 */
export function createRAGService(app: App, plugin: AIPilotPlugin, settings: any): RAGService {
  // Create AI service with model manager
  const aiService = new AIService(plugin, plugin.modelManager);
  
  // Create retriever with model manager
  const vectorRetriever = new VectorRetriever(app, plugin.modelManager, settings);
  
  // Create enhancers
  const queryRewriter = new QueryRewriter(aiService);
  const hydeEnhancer = new HyDE(settings, aiService, vectorRetriever);
  
  // Create ranking and chunking components
  const ranker = new MMRReranker();
  const chunker = new SemanticChunker();
  
  // Create reflector
  const reflector = new Reflector(settings, aiService, vectorRetriever);
  
  // Create and initialize RAG service
  const ragService = new RAGService();
  
  // Configure RAG service, inject all components
  initializeRAGService(
    ragService, 
    aiService, 
    vectorRetriever, 
    queryRewriter, 
    hydeEnhancer, 
    ranker, 
    chunker, 
    reflector
  );
  
  return ragService;
}

/**
 * Initialize RAG service
 */
function initializeRAGService(
  ragService: RAGService,
  aiService: AIService,
  vectorRetriever: VectorRetriever,
  queryRewriter: QueryRewriter,
  hydeEnhancer: HyDE,
  ranker: MMRReranker,
  chunker: SemanticChunker,
  reflector: Reflector
) {
  // Set RAG service components
  Object.assign(ragService, {
    aiService,
    retriever: vectorRetriever,
    queryRewriter,
    hyde: hydeEnhancer,
    mmr: ranker,
    semanticChunker: chunker,
    reflector
  });
}

// Export all RAG-related types and services
export { 
  RAGService, 
  RAGOptions, 
  RAGResult, 
  Source,
  AIService,
  VectorRetriever,
  QueryRewriter,
  HyDE,
  MMRReranker,
  SemanticChunker,
  Reflector
}; 