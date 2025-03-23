import { ModelManager } from "../models/ModelManager";

export type DebateRole = "host" | "positive" | "negative" | "blue" | "red" | "yellow" | "green" | "white" | "black" | "custom";
export type DebateMode = "debate" | "sixHats" | "roundtable";

export interface AgentConfig {
  id: string;
  name: string;
  role: DebateRole;
  rolePrompt: string;
  modelId: string;
  active: boolean;
}

export interface DebateMessage {
  id: string;
  agentId: string;
  content: string;
  timestamp: number;
  round: number;
  streaming?: boolean;
}

export interface DebateConfig {
  id: string;
  title: string;
  topic: string;
  mode: DebateMode;
  agents: AgentConfig[];
  hostAgent: AgentConfig;
  maxRounds: number;
  maxTokensPerResponse: number;
  createdAt: number;
  active: boolean;
  language?: string;
}

export interface DebateStatus {
  currentRound: number;
  currentAgentIndex: number;
  isComplete: boolean;
  messages: DebateMessage[];
}

export class Agent {
  constructor(
    public id: string,
    public name: string,
    public rolePrompt: string,
    public modelId: string,
    private modelManager: ModelManager
  ) {}

  async think(message: string, context: string = "", onChunk?: (chunk: string) => void): Promise<string> {
    const fullPrompt = `${context}\n\n${this.rolePrompt}\n\n${message}`;
    try {
      return await this.modelManager.callModel(
        this.modelId, 
        fullPrompt, 
        {
          streaming: !!onChunk,
          onChunk: onChunk
        }
      );
    } catch (error) {
      console.error(`Error in agent ${this.name} thinking:`, error);
      return `[Agent ${this.name} encountered an error: ${error.message}]`;
    }
  }
}

export class AgentDebateEngine {
  private round = 0;
  private agents: Agent[] = [];
  private hostAgent: Agent;
  private maxRounds: number;
  private messages: DebateMessage[] = [];
  private currentAgentIndex = 0;
  private isRunning = false;
  private isComplete = false;
  private onMessageCallback: ((message: DebateMessage) => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;
  private onMessageUpdateCallback: ((message: DebateMessage) => void) | null = null;
  private language: string = "English"; // Default language

  constructor(
    agents: Agent[],
    hostAgent: Agent,
    maxRounds: number = 3,
    language: string = "English"
  ) {
    this.agents = agents;
    this.hostAgent = hostAgent;
    this.maxRounds = maxRounds;
    this.language = language;
  }

  getMessages(): DebateMessage[] {
    return [...this.messages];
  }

  getStatus(): DebateStatus {
    return {
      currentRound: this.round,
      currentAgentIndex: this.currentAgentIndex,
      isComplete: this.isComplete,
      messages: [...this.messages]
    };
  }

  onMessage(callback: (message: DebateMessage) => void): void {
    this.onMessageCallback = callback;
  }

  onComplete(callback: () => void): void {
    this.onCompleteCallback = callback;
  }

  onMessageUpdate(callback: (message: DebateMessage) => void): void {
    this.onMessageUpdateCallback = callback;
  }

  resetDebate(): void {
    this.round = 0;
    this.messages = [];
    this.currentAgentIndex = 0;
    this.isRunning = false;
    this.isComplete = false;
  }

  async startDebate(topic: string): Promise<void> {
    if (this.isRunning) {
      throw new Error("Debate is already running");
    }

    this.resetDebate();
    this.isRunning = true;

    try {
      // Get language from config or default to English
      const config = this.getConfig();
      const language = config?.language || "English";
      
      // Host agent introduces the topic and sets the stage
      const hostPrompt = `You are the host of a debate or discussion. Your role is to introduce the topic, establish the key points to be discussed, and guide the conversation.
      
      First, provide a thoughtful introduction to this topic: "${topic}"
      
      Then, outline the key aspects that should be discussed by our participants. What are the main points to consider?
      
      Please respond in ${language}.`;

      // Create placeholder message for streaming updates
      const hostMessageId = `msg_${Date.now()}`;
      const hostMessage: DebateMessage = {
        id: hostMessageId,
        agentId: this.hostAgent.id,
        content: "",
        timestamp: Date.now(),
        round: 0,
        streaming: true
      };
      
      this.messages.push(hostMessage);
      
      if (this.onMessageCallback) {
        this.onMessageCallback(hostMessage);
      }

      // Process streaming response
      const hostIntro = await this.hostAgent.think(hostPrompt, "", (chunk) => {
        // Update the message with new content
        const messageIndex = this.messages.findIndex(m => m.id === hostMessageId);
        if (messageIndex >= 0) {
          this.messages[messageIndex].content += chunk;
          
          if (this.onMessageUpdateCallback) {
            this.onMessageUpdateCallback(this.messages[messageIndex]);
          }
        }
      });
      
      // Update to final content and mark streaming as complete
      const finalMessageIndex = this.messages.findIndex(m => m.id === hostMessageId);
      if (finalMessageIndex >= 0) {
        this.messages[finalMessageIndex].streaming = false;
        
        if (this.onMessageUpdateCallback) {
          this.onMessageUpdateCallback(this.messages[finalMessageIndex]);
        }
      }

      // Now start the actual debate rounds
      await this.runDebateRounds(topic);
      
      // Finally, have the host provide a conclusion
      await this.generateConclusion(topic);
      
      this.isComplete = true;
      this.isRunning = false;
      
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
    } catch (error) {
      console.error("Error running debate:", error);
      this.isRunning = false;
      throw error;
    }
  }
  
  private async runDebateRounds(topic: string): Promise<void> {
    const context = this.buildDebateContext();
    const config = this.getConfig();
    const language = config?.language || "English";
    
    for (this.round = 1; this.round <= this.maxRounds; this.round++) {
      for (let i = 0; i < this.agents.length; i++) {
        this.currentAgentIndex = i;
        const agent = this.agents[i];
        
        // Build a prompt for this agent that includes context from previous messages
        const updatedContext = this.buildDebateContext();
        const agentPrompt = `We are in round ${this.round} of the debate on: "${topic}"

Previous messages:
${updatedContext}

Based on the previous discussion, provide your perspective as ${agent.name}. 
Address points made by other participants if relevant, and further develop your own arguments.

Please respond in ${language}.`;

        // Create placeholder message for streaming
        const messageId = `msg_${Date.now()}_${agent.id}_${this.round}`;
        const message: DebateMessage = {
          id: messageId,
          agentId: agent.id,
          content: "",
          timestamp: Date.now(),
          round: this.round,
          streaming: true
        };
        
        this.messages.push(message);
        
        if (this.onMessageCallback) {
          this.onMessageCallback(message);
        }
        
        // Process the streaming response
        await agent.think(agentPrompt, "", (chunk) => {
          // Update the message with new content
          const messageIndex = this.messages.findIndex(m => m.id === messageId);
          if (messageIndex >= 0) {
            this.messages[messageIndex].content += chunk;
            
            if (this.onMessageUpdateCallback) {
              this.onMessageUpdateCallback(this.messages[messageIndex]);
            }
          }
        });
        
        // Mark streaming as complete
        const finalMessageIndex = this.messages.findIndex(m => m.id === messageId);
        if (finalMessageIndex >= 0) {
          this.messages[finalMessageIndex].streaming = false;
          
          if (this.onMessageUpdateCallback) {
            this.onMessageUpdateCallback(this.messages[finalMessageIndex]);
          }
        }
      }
    }
  }
  
  private async generateConclusion(topic: string): Promise<void> {
    const context = this.buildDebateContext();
    const config = this.getConfig();
    const language = config?.language || "English";
    
    const conclusionPrompt = `Now that we've completed ${this.maxRounds} rounds of our debate on "${topic}", please provide a thoughtful conclusion.

Summarize the key points made by each participant, identify areas of agreement and disagreement, and provide your own synthesis of the discussion.

The full debate transcript:
${context}

Please respond in ${language}.`;

    // Create placeholder message for streaming
    const conclusionId = `msg_conclusion_${Date.now()}`;
    const conclusionMessage: DebateMessage = {
      id: conclusionId,
      agentId: this.hostAgent.id,
      content: "",
      timestamp: Date.now(),
      round: this.maxRounds + 1,
      streaming: true
    };
    
    this.messages.push(conclusionMessage);
    
    if (this.onMessageCallback) {
      this.onMessageCallback(conclusionMessage);
    }

    // Process the streaming conclusion
    await this.hostAgent.think(conclusionPrompt, "", (chunk) => {
      // Update the message with new content
      const messageIndex = this.messages.findIndex(m => m.id === conclusionId);
      if (messageIndex >= 0) {
        this.messages[messageIndex].content += chunk;
        
        if (this.onMessageUpdateCallback) {
          this.onMessageUpdateCallback(this.messages[messageIndex]);
        }
      }
    });
    
    // Mark streaming as complete
    const finalMessageIndex = this.messages.findIndex(m => m.id === conclusionId);
    if (finalMessageIndex >= 0) {
      this.messages[finalMessageIndex].streaming = false;
      
      if (this.onMessageUpdateCallback) {
        this.onMessageUpdateCallback(this.messages[finalMessageIndex]);
      }
    }
  }
  
  private buildDebateContext(): string {
    // Build a string containing all previous messages in a readable format
    return this.messages.map(msg => {
      const agent = this.agents.find(a => a.id === msg.agentId) || this.hostAgent;
      return `[Round ${msg.round}] ${agent.name}: ${msg.content}`;
    }).join('\n\n');
  }
  
  static createFromConfig(
    config: DebateConfig, 
    modelManager: ModelManager
  ): AgentDebateEngine {
    // Create agents from config
    const agents = config.agents
      .filter(a => a.active)
      .map(agentConfig => new Agent(
        agentConfig.id,
        agentConfig.name,
        agentConfig.rolePrompt,
        agentConfig.modelId,
        modelManager
      ));
    
    // Create host agent
    const hostAgent = new Agent(
      config.hostAgent.id,
      config.hostAgent.name,
      config.hostAgent.rolePrompt,
      config.hostAgent.modelId,
      modelManager
    );
    
    // Create and return debate engine with language
    return new AgentDebateEngine(
      agents,
      hostAgent,
      config.maxRounds,
      config.language
    );
  }
  
  static generateDebatePrompts(mode: DebateMode): Record<DebateRole, string> {
    const prompts: Record<DebateRole, string> = {
      host: "You are the host and moderator of this discussion. Your role is to introduce the topic, guide the conversation, ask probing questions, and ensure all perspectives are heard. At the end, you'll summarize the key points and provide a balanced conclusion.",
      positive: "You are advocating for the positive or affirmative position on this topic. Present the strongest arguments in favor, backed by reasoning and evidence where possible. Address counterarguments in a respectful way.",
      negative: "You are advocating for the negative or critical position on this topic. Present the strongest arguments against, backed by reasoning and evidence where possible. Address counterarguments in a respectful way.",
      blue: "Blue Hat (Process): You focus on managing the thinking process and ensuring productive discussion. You think about how to approach the problem, what thinking tools to use, and how to organize the conversation.",
      red: "Red Hat (Emotions): You focus on intuition, feelings, and emotional reactions. Express how the topic makes you feel, and consider the emotional aspects and impacts on people.",
      yellow: "Yellow Hat (Benefits): You focus on positivity, optimism, and benefits. Identify advantages, opportunities, and potential gains related to the topic.",
      green: "Green Hat (Creativity): You focus on creativity, alternatives, and new ideas. Propose innovative solutions, possibilities, and 'what if' scenarios related to the topic.",
      white: "White Hat (Facts): You focus on data, information, and objective facts. Provide relevant statistics, research findings, and verified information about the topic.",
      black: "Black Hat (Caution): You focus on critical judgment and potential problems. Identify risks, difficulties, and challenges related to the topic.",
      custom: "You are a participant in this discussion. Share your unique perspective on the topic based on your expertise and viewpoint."
    };
    
    return prompts;
  }
  
  static generateDefaultConfig(
    topic: string,
    mode: DebateMode,
    defaultModelId: string,
    language: string = "English"
  ): DebateConfig {
    const prompts = AgentDebateEngine.generateDebatePrompts(mode);
    const timestamp = Date.now();
    
    let agents: AgentConfig[] = [];
    
    // Create appropriate agents based on the selected mode
    switch (mode) {
      case "debate":
        agents = [
          {
            id: `agent_positive_${timestamp}`,
            name: "Proponent",
            role: "positive",
            rolePrompt: prompts.positive,
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_negative_${timestamp}`,
            name: "Opponent",
            role: "negative",
            rolePrompt: prompts.negative,
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "sixHats":
        agents = [
          {
            id: `agent_white_${timestamp}`,
            name: "White Hat (Facts)",
            role: "white",
            rolePrompt: prompts.white,
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_red_${timestamp}`,
            name: "Red Hat (Emotions)",
            role: "red",
            rolePrompt: prompts.red,
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_black_${timestamp}`,
            name: "Black Hat (Caution)",
            role: "black",
            rolePrompt: prompts.black,
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_yellow_${timestamp}`,
            name: "Yellow Hat (Benefits)",
            role: "yellow",
            rolePrompt: prompts.yellow,
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_green_${timestamp}`,
            name: "Green Hat (Creativity)",
            role: "green",
            rolePrompt: prompts.green,
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_blue_${timestamp}`,
            name: "Blue Hat (Process)",
            role: "blue",
            rolePrompt: prompts.blue,
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "roundtable":
        agents = [
          {
            id: `agent_expert1_${timestamp}`,
            name: "Subject Matter Expert",
            role: "custom",
            rolePrompt: "You are a subject matter expert with deep knowledge of this topic. Provide factual information, historical context, and technical details that help illuminate the discussion.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_critic_${timestamp}`,
            name: "Critical Analyst",
            role: "custom",
            rolePrompt: "You analyze the topic critically, looking for logical flaws, inconsistencies, and areas that deserve more scrutiny. Your goal is to strengthen the discussion through thoughtful criticism.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_innovator_${timestamp}`,
            name: "Innovator",
            role: "custom",
            rolePrompt: "You specialize in finding new approaches and creative solutions. Consider how the topic could be reimagined or what novel perspectives might add value to the discussion.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_custom_${timestamp}`,
            name: "Custom",
            role: "custom",
            rolePrompt: "You are a custom participant in this discussion. Share your unique perspective on the topic based on your expertise and viewpoint.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
    }
    
    // Create host agent
    const hostAgent: AgentConfig = {
      id: `host_${timestamp}`,
      name: "Host",
      role: "host" as DebateRole,
      rolePrompt: prompts.host,
      modelId: defaultModelId,
      active: true
    };
    
    // Create and return debate config
    return {
      id: `debate_${timestamp}`,
      title: `Debate on ${topic}`,
      topic: topic,
      mode: mode,
      agents: agents,
      hostAgent: hostAgent,
      maxRounds: 3,
      maxTokensPerResponse: 1000,
      createdAt: timestamp,
      active: true,
      language: language
    };
  }

  // Helper method to get config from debate context
  private getConfig(): DebateConfig | null {
    // Return a simple object with the language
    return {
      id: "",
      title: "",
      topic: "",
      mode: "debate",
      agents: [],
      hostAgent: { id: "", name: "", role: "host" as DebateRole, rolePrompt: "", modelId: "", active: true },
      maxRounds: this.maxRounds,
      maxTokensPerResponse: 1000,
      createdAt: Date.now(),
      active: true,
      language: this.language
    };
  }
}