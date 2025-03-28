import { App } from 'obsidian';
import { RAGService, RAGOptions, RAGResult, Source } from './RAGService';
import { AIService } from './AIService';
import { VectorRetriever, RetrieverSettings } from './retrieval/VectorRetriever';
import { QueryRewriter } from './enhancement/QueryRewriter';
import { HyDE, HyDESettings } from './enhancement/HyDE';
import { MMRReranker } from './ranking/MMR';
import { SemanticChunker } from './ranking/SemanticChunker';
import { Reflector, ReflectorSettings } from './reflection/Reflector';
import AIPilotPlugin from '../main';

/**
 * Combined settings for all RAG components
 */
export interface RAGSettings extends RetrieverSettings, HyDESettings, ReflectorSettings {
  // Any additional settings specific to the RAG service
}

/**
 * Create complete RAG service
 * @param app Obsidian app instance
 * @param plugin Plugin instance
 * @param settings Settings object
 * @returns Configured RAG service
 */
export function createRAGService(app: App, plugin: AIPilotPlugin, settings: RAGSettings): RAGService {
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
  AIService,
  VectorRetriever,
  QueryRewriter,
  HyDE,
  MMRReranker,
  SemanticChunker,
  Reflector
};

// Export types
export type {
  RAGOptions, 
  RAGResult, 
  Source
}; 