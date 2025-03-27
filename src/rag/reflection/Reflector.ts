import { Source } from '../RAGService';

/**
 * Reflector
 * 
 * Implements reflection loop logic to improve answer quality through reflection and additional information
 */
export class Reflector {
  private reflectionCount: number = 0;
  
  constructor(
    private settings: any,
    private aiService?: any,
    private retriever?: any
  ) {}
  
  /**
   * Improve answer through reflection cycles (streaming version)
   * @param query Original query
   * @param initialAnswer Initial answer
   * @param initialContext Initial context
   * @param onChunk Streaming output callback
   * @returns Improved answer
   */
  async improveWithReflectionStreaming(
    query: string, 
    initialAnswer: string,
    initialContext: Source[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    this.reflectionCount = 0;
    
    if (!this.aiService || !this.retriever) {
      console.log("Reflector needs AI service and retriever, skipping reflection");
      return initialAnswer;
    }
    
    try {
      let currentAnswer = initialAnswer;
      let context = this.formatContext(initialContext);
      const MAX_REFLECTIONS = 2;
      const minReflectionLength = 50;
      
      // Tell the user we're starting the reflection process
      onChunk("\n\n_Enhancing with knowledge base..._");
      
      for (let i = 0; i < MAX_REFLECTIONS; i++) {
        console.log(`Executing reflection round ${i+1}/${MAX_REFLECTIONS}`);
        
        // Generate reflection, identifying missing information in the answer
        const reflection = await this.generateReflection(query, currentAnswer, context);
        
        // If reflection is too short or meaningless, end the loop
        if (!reflection || reflection.length < minReflectionLength) {
          console.log("Reflection result too short or meaningless, ending reflection loop");
          break;
        }
        
        this.reflectionCount++;
        
        // Extract search queries from reflection
        const searchQueries = await this.extractSearchQueries(reflection);
        if (!searchQueries || searchQueries.length === 0) {
          console.log("Unable to extract search queries from reflection, ending reflection loop");
          break;
        }
        
        // Perform additional searches
        let additionalContext = "";
        for (const searchQuery of searchQueries) {
          // Get more context
          const additionalResults = await this.retriever.retrieve(searchQuery, 3);
          
          if (additionalResults.length > 0) {
            // Add new information to context
            additionalContext += `\n\nRegarding: "${searchQuery}"\n\n`;
            additionalResults.forEach((result: Source, index: number) => {
              const sourceIndex = initialContext.length + index + 1;
              additionalContext += `Source [${sourceIndex}]: ${result.file.basename}\n`;
              additionalContext += `${result.content}\n\n`;
            });
          }
        }
        
        // If new information is found, use it to improve the answer
        if (additionalContext.length > 0) {
          context += additionalContext;
          
          // Tell the user we found new information
          onChunk(`\n\n_Found ${this.reflectionCount > 1 ? 'more' : ''} relevant information, enhancing answer..._`);
          
          // Generate improved answer (streaming)
          const messages = [
            { 
              role: 'system', 
              content: `You are a knowledge base Q&A assistant. You need to improve the previous answer, addressing issues identified in the reflection and utilizing newly provided information.` 
            },
            {
              role: 'user',
              content: `Please improve the answer below, addressing issues identified in the reflection and utilizing newly provided information.

Original question:
${query}

Current answer:
${currentAnswer}

Reflection feedback:
${reflection}

New information:
${additionalContext}

Please generate an improved, more comprehensive answer while maintaining the strengths of the original answer. The answer should be direct, authoritative, and cite sources. Do not add any meta-descriptions or preamble. Start your answer directly without repeating the question.`
            }
          ];
          
          // Clear previous intermediate status prompts
          onChunk("\n\n");
          
          // Generate improved answer using streaming API
          const improvedAnswer = await this.aiService.callAIChat(messages, onChunk);
          
          if (improvedAnswer && improvedAnswer.length > currentAnswer.length / 2) {
            currentAnswer = improvedAnswer;
          } else {
            console.log("Quality of improved answer insufficient, keeping current answer");
            break;
          }
        } else {
          console.log("No additional information found, ending reflection loop");
          break;
        }
      }
      
      return currentAnswer;
    } catch (error) {
      console.error("Error in reflection loop:", error);
      onChunk("\n\n_Error occurred during reflection, returning initial answer_");
      return initialAnswer; // Return initial answer on failure
    }
  }
  
  /**
   * Improve answer through reflection cycles
   * @param query Original query
   * @param initialAnswer Initial answer
   * @param initialContext Initial context
   * @returns Improved answer
   */
  async improveWithReflection(
    query: string, 
    initialAnswer: string,
    initialContext: Source[]
  ): Promise<string> {
    this.reflectionCount = 0;
    
    if (!this.aiService || !this.retriever) {
      console.log("Reflector needs AI service and retriever, skipping reflection");
      return initialAnswer;
    }
    
    try {
      let currentAnswer = initialAnswer;
      let context = this.formatContext(initialContext);
      const MAX_REFLECTIONS = 2;
      const minReflectionLength = 50;
      
      for (let i = 0; i < MAX_REFLECTIONS; i++) {
        console.log(`Executing reflection round ${i+1}/${MAX_REFLECTIONS}`);
        
        // Generate reflection, identifying missing information in the answer
        const reflection = await this.generateReflection(query, currentAnswer, context);
        
        // If reflection is too short or meaningless, end the loop
        if (!reflection || reflection.length < minReflectionLength) {
          console.log("Reflection result too short or meaningless, ending reflection loop");
          break;
        }
        
        this.reflectionCount++;
        
        // Extract search queries from reflection
        const searchQueries = await this.extractSearchQueries(reflection);
        if (!searchQueries || searchQueries.length === 0) {
          console.log("Unable to extract search queries from reflection, ending reflection loop");
          break;
        }
        
        // Perform additional searches
        let additionalContext = "";
        for (const searchQuery of searchQueries) {
          // Get more context
          const additionalResults = await this.retriever.retrieve(searchQuery, 3);
          
          if (additionalResults.length > 0) {
            // Add new information to context
            additionalContext += `\n\nRegarding: "${searchQuery}"\n\n`;
            additionalResults.forEach((result: Source, index: number) => {
              const sourceIndex = initialContext.length + index + 1;
              additionalContext += `Source [${sourceIndex}]: ${result.file.basename}\n`;
              additionalContext += `${result.content}\n\n`;
            });
          }
        }
        
        // If new information is found, use it to improve the answer
        if (additionalContext.length > 0) {
          context += additionalContext;
          
          // Generate improved answer
          const improvedAnswer = await this.generateImprovedAnswer(
            query, 
            currentAnswer, 
            reflection, 
            additionalContext
          );
          
          if (improvedAnswer && improvedAnswer.length > currentAnswer.length / 2) {
            currentAnswer = improvedAnswer;
          } else {
            console.log("Quality of improved answer insufficient, keeping current answer");
            break;
          }
        } else {
          console.log("No additional information found, ending reflection loop");
          break;
        }
      }
      
      return currentAnswer;
    } catch (error) {
      console.error("Error in reflection loop:", error);
      return initialAnswer; // Return initial answer on failure
    }
  }
  
  /**
   * Get the number of reflection rounds executed
   */
  getReflectionCount(): number {
    return this.reflectionCount;
  }
  
  /**
   * Format context as text
   * @param sources Array of sources
   * @returns Formatted context text
   */
  private formatContext(sources: Source[]): string {
    return sources.map((source, index) => {
      return `Source [${index + 1}]: ${source.file.basename}\n${source.content}`;
    }).join('\n\n');
  }
  
  /**
   * Generate reflection for current answer
   * @param query Original query
   * @param answer Current answer
   * @param context Current context
   * @returns Reflection text
   */
  private async generateReflection(
    query: string, 
    answer: string, 
    context: string
  ): Promise<string> {
    if (!this.aiService) return "";
    
    const prompt = `Your task is to evaluate the quality of the following answer and identify any missing information or gaps in the answer.
    
Original question:
${query}

Current answer:
${answer}

Please think:
1. What specific information is missing from the answer?
2. Are there any related but unaddressed aspects?
3. Which assertions in the answer lack sufficient evidence?
4. Are there any areas that need clarification?

Identify 3-5 specific points in the answer that need more information and list specific queries to search for.`;

    return await this.aiService.getAIResponse(prompt);
  }
  
  /**
   * Extract search queries from reflection
   * @param reflection Reflection text
   * @returns Array of search queries
   */
  private async extractSearchQueries(reflection: string): Promise<string[]> {
    if (!this.aiService) return [];
    
    // Try using regular expression directly to extract queries
    const queryMatches = reflection.match(/\d+\.\s*(.*?)(?=\d+\.|$)/g) || [];
    if (queryMatches.length > 0) {
      return queryMatches
        .map(m => m.replace(/^\d+\.\s*/, '').trim())
        .filter((q: string) => q.length > 5);
    }
    
    // If regular expression fails, use AI to extract
    const prompt = `Extract specific queries from the following reflection text. Please list 3-5 queries in short, direct questions or phrases, one per line, without numbering:

${reflection}

Queries:`;

    const extractedQueries = await this.aiService.getAIResponse(prompt);
    
    // Split result into array
    return extractedQueries
      .split('\n')
      .map((q: string) => q.trim())
      .filter((q: string) => q.length > 5 && !q.startsWith('Queries'));
  }
  
  /**
   * Generate improved answer
   * @param query Original query
   * @param currentAnswer Current answer
   * @param reflection Reflection text
   * @param additionalContext Additional context
   * @returns Improved answer
   */
  private async generateImprovedAnswer(
    query: string,
    currentAnswer: string,
    reflection: string,
    additionalContext: string
  ): Promise<string> {
    if (!this.aiService) return currentAnswer;
    
    const prompt = `Please improve the answer below, addressing issues identified in the reflection and utilizing newly provided information.

Original question:
${query}

Current answer:
${currentAnswer}

Reflection feedback:
${reflection}

New information:
${additionalContext}

Please generate an improved, more comprehensive answer while maintaining the strengths of the original answer. The answer should be direct, authoritative, and cite sources. Do not add any meta-descriptions or preamble.`;

    return await this.aiService.getAIResponse(prompt);
  }
} 