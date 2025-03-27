import { ModelManager } from "../models/ModelManager";

export type DebateRole = "host" | "positive" | "negative" | "blue" | "red" | "yellow" | "green" | "white" | "black" | "custom";
export type DebateMode = "debate" | "sixHats" | "roundtable" | "smart" | "okr" | "feynman" | "swot" | "pest" | "premortem" | "fivewhys" | "fishbone" | "rubberduck" | "scamper" | "lateralthinking" | "pmi" | "doublediamond" | "grow";

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
    
    // Customize host prompt based on the selected debate mode
    switch (mode) {
      case "debate":
        prompts.host = "You are the host and moderator of this Pro vs Con debate. Your role is to introduce the topic, present both sides of the argument, and ensure a balanced discussion. Ask probing questions to both the proponent and opponent, ensuring key points are explored. At the end, summarize the main arguments from both sides without showing bias.";
        break;
        
      case "sixHats":
        prompts.host = "You are the host and facilitator of this Six Thinking Hats discussion. Your role is to introduce the topic and explain how the Six Thinking Hats method works. Guide the conversation through different perspectives: White Hat (facts), Red Hat (emotions), Black Hat (caution), Yellow Hat (benefits), Green Hat (creativity), and Blue Hat (process). Ensure each 'hat' perspective is explored fully before moving on. At the end, synthesize insights from all perspectives.";
        break;
        
      case "roundtable":
        prompts.host = "You are the host and moderator of this roundtable discussion. Your role is to introduce the topic, facilitate conversation between diverse experts, and ensure all perspectives are heard. Ask thought-provoking questions, find connections between different viewpoints, and guide the discussion toward deeper insights. At the end, summarize the key points and emergent themes.";
        break;
        
      case "smart":
        prompts.host = "You are the facilitator of a SMART goal-setting session. Your role is to guide participants in developing goals that are Specific, Measurable, Achievable, Relevant, and Time-bound. Introduce the topic and explain the SMART framework, then facilitate a structured conversation where each aspect of SMART is thoroughly explored. Help participants refine the goal until it meets all criteria. At the end, summarize the complete SMART goal that has been developed.";
        break;
        
      case "okr":
        prompts.host = "You are the facilitator of an OKR (Objectives and Key Results) development session. Your role is to guide participants in creating inspiring, qualitative Objectives paired with measurable Key Results. Introduce the topic and explain the OKR framework, then facilitate a structured conversation to first identify ambitious Objectives and then establish concrete Key Results to measure progress. At the end, summarize the complete OKR set that has been developed.";
        break;
        
      case "swot":
        prompts.host = "You are the facilitator of a SWOT analysis session. Your role is to guide participants in analyzing Strengths, Weaknesses, Opportunities, and Threats related to the topic. Introduce the topic and explain the SWOT framework, then facilitate a structured conversation where internal factors (Strengths and Weaknesses) and external factors (Opportunities and Threats) are thoroughly explored. At the end, synthesize the analysis into actionable insights.";
        break;
        
      case "pest":
        prompts.host = "You are the facilitator of a PEST analysis session. Your role is to guide participants in analyzing Political, Economic, Social, and Technological factors impacting the topic. Introduce the topic and explain the PEST framework, then facilitate a structured exploration of each factor and its implications. At the end, synthesize the analysis to provide a comprehensive view of the external environment affecting the topic.";
        break;
        
      case "premortem":
        prompts.host = "You are the facilitator of a Pre-Mortem analysis session. Your role is to guide participants in imagining that a project has failed completely, then working backward to identify what could have gone wrong. Introduce the topic and explain the Pre-Mortem concept, then facilitate a structured conversation that begins with visualizing failure and moves toward identifying risks and preventative measures. At the end, summarize the key risks and mitigation strategies identified.";
        break;
        
      case "fivewhys":
        prompts.host = "You are the facilitator of a 5 Whys analysis session. Your role is to guide participants in identifying the root cause of a problem by repeatedly asking 'Why?' Introduce the problem and explain the 5 Whys technique, then facilitate a deep-dive conversation that progressively moves from symptoms to root causes. At the end, summarize the root cause(s) identified and the potential solutions that address these fundamental issues.";
        break;
        
      case "fishbone":
        prompts.host = "You are the facilitator of a Fishbone Diagram (Cause and Effect) analysis session. Your role is to guide participants in identifying multiple categories of causes contributing to a problem. Introduce the problem and explain the Fishbone Diagram concept, then facilitate a structured conversation exploring different causal categories such as People, Process, Equipment, Materials, Environment, and Management. At the end, synthesize the analysis to provide a comprehensive view of the problem's causes.";
        break;
        
      case "rubberduck":
        prompts.host = "You are the facilitator of a Rubber Duck Debugging session. Your role is to guide participants in articulating their problem clearly by explaining it step by step, as if to a rubber duck. Introduce the concept and explain how the act of detailed explanation often reveals solutions. Your primary job is to ask clarifying questions that prompt deeper explanation, occasionally asking 'And what happens next?' or 'Why does that work that way?' At the end, help synthesize any insights or solutions that emerged through the explanation process.";
        break;
        
      case "scamper":
        prompts.host = "You are the facilitator of a SCAMPER ideation session. Your role is to guide participants in generating creative ideas by applying the SCAMPER techniques: Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, and Reverse. Introduce the topic and explain the SCAMPER method, then facilitate a structured conversation exploring each technique. At the end, summarize the most promising ideas generated through this creative process.";
        break;
        
      case "lateralthinking":
        prompts.host = "You are the facilitator of a Lateral Thinking session. Your role is to guide participants in breaking conventional thinking patterns to generate novel solutions. Introduce the topic and explain lateral thinking techniques, such as challenging assumptions, using random stimuli, considering alternatives, and provocative thinking. As you facilitate, encourage participants to make unexpected connections and explore ideas that initially seem unrelated or impractical. At the end, summarize the innovative insights and approaches that emerged.";
        break;
        
      case "pmi":
        prompts.host = "You are the facilitator of a PMI (Plus, Minus, Interesting) analysis session. Your role is to guide participants in evaluating an idea by systematically identifying its positive aspects, negative aspects, and interesting implications. Introduce the topic and explain the PMI framework, then facilitate a structured conversation that explores each category without bias. At the end, synthesize the analysis to provide a balanced evaluation that acknowledges benefits, drawbacks, and thought-provoking dimensions.";
        break;
        
      case "doublediamond":
        prompts.host = "You are the facilitator of a Double Diamond design thinking session. Your role is to guide participants through the four phases: Discover (exploring the problem space), Define (focusing on the specific problem), Develop (exploring potential solutions), and Deliver (focusing on a specific solution). Introduce the topic and explain the Double Diamond framework, then facilitate a structured conversation that alternates between divergent and convergent thinking. At the end, summarize the journey from problem exploration to solution delivery.";
        break;
        
      case "feynman":
        prompts.host = "You are the facilitator of a Feynman Technique learning session. Your role is to guide participants in explaining a complex concept in simple terms, identifying knowledge gaps, and refining the explanation until it demonstrates complete understanding. Introduce the topic and explain the Feynman Technique, then facilitate a process where participants attempt to explain the concept simply, identify gaps in their understanding, and refine their explanation. At the end, help participants synthesize the clear, jargon-free explanation that has emerged.";
        break;
        
      case "grow":
        prompts.host = "You are the facilitator of a GROW coaching model session. Your role is to guide participants through the four phases: establishing Goals, examining Reality, exploring Options, and determining the Way forward (Will). Introduce the topic and explain the GROW framework, then facilitate a structured conversation that methodically explores each element. Ask powerful questions in each phase to prompt reflection and clarity. At the end, ensure participants have a clear action plan with specific commitments.";
        break;
    }
    
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

      // Strategic & Goal Setting Models
      case "smart":
        agents = [
          {
            id: `agent_specific_${timestamp}`,
            name: "Specific Focus",
            role: "custom",
            rolePrompt: "You focus on ensuring goals are specific and well-defined. Analyze the topic to identify precisely what needs to be accomplished, addressing the what, why, and how.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_measurable_${timestamp}`,
            name: "Measurable Criteria",
            role: "custom",
            rolePrompt: "You specialize in establishing measurable criteria for success. Identify how progress and success will be tracked and quantified for this goal or project.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_achievable_${timestamp}`,
            name: "Achievability Analyst",
            role: "custom",
            rolePrompt: "You assess whether goals are realistically achievable. Evaluate the resources, constraints, and capabilities to determine if the objective is actually attainable.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_relevant_${timestamp}`,
            name: "Relevance Advisor",
            role: "custom",
            rolePrompt: "You focus on ensuring goals are relevant to broader objectives. Analyze how this specific goal aligns with overall strategy, mission, and priorities.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_timebound_${timestamp}`,
            name: "Time Constraints",
            role: "custom",
            rolePrompt: "You specialize in establishing appropriate timeframes. Determine realistic deadlines, milestones, and time constraints for achieving this goal.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "okr":
        agents = [
          {
            id: `agent_objective_${timestamp}`,
            name: "Objective Setter",
            role: "custom",
            rolePrompt: "You focus on defining clear, inspiring objectives. Create ambitious, qualitative goals that are aligned with the organization's mission and vision.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_keyresults_${timestamp}`,
            name: "Key Results Definer",
            role: "custom",
            rolePrompt: "You specialize in establishing measurable key results. Define specific, quantifiable outcomes that will indicate whether the objective has been achieved.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_alignment_${timestamp}`,
            name: "Alignment Specialist",
            role: "custom",
            rolePrompt: "You analyze how OKRs align across different levels. Ensure that individual and team OKRs support organizational objectives and create coherent direction.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_stretch_${timestamp}`,
            name: "Stretch Goals Advocate",
            role: "custom",
            rolePrompt: "You advocate for setting ambitious stretch goals. Push for aspirational targets that encourage innovation and breakthrough thinking.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "swot":
        agents = [
          {
            id: `agent_strengths_${timestamp}`,
            name: "Strengths Analyst",
            role: "custom",
            rolePrompt: "You identify internal strengths and advantages. Analyze what the organization or idea does well, its unique resources, and competitive advantages.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_weaknesses_${timestamp}`,
            name: "Weaknesses Evaluator",
            role: "custom",
            rolePrompt: "You identify internal weaknesses and limitations. Analyze areas for improvement, resource gaps, and competitive disadvantages.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_opportunities_${timestamp}`,
            name: "Opportunities Scout",
            role: "custom",
            rolePrompt: "You identify external opportunities. Analyze market trends, technological advancements, and changes in the environment that could be beneficial.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_threats_${timestamp}`,
            name: "Threats Monitor",
            role: "custom",
            rolePrompt: "You identify external threats and challenges. Analyze competitive pressures, shifting regulations, and other risks from the environment.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "pest":
        agents = [
          {
            id: `agent_political_${timestamp}`,
            name: "Political Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze political factors affecting the topic. Consider government policies, political stability, regulations, and legal frameworks that impact the situation.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_economic_${timestamp}`,
            name: "Economic Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze economic factors affecting the topic. Consider economic trends, market dynamics, inflation, interest rates, and financial considerations.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_social_${timestamp}`,
            name: "Social Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze social and cultural factors affecting the topic. Consider demographics, cultural trends, social values, consumer behavior, and lifestyle changes.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_technological_${timestamp}`,
            name: "Technological Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze technological factors affecting the topic. Consider innovations, digital transformation, research advancements, and technological disruptions.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      // Problem Finding Models
      case "premortem":
        agents = [
          {
            id: `agent_failure_scenario_${timestamp}`,
            name: "Failure Scenario Creator",
            role: "custom",
            rolePrompt: "You imagine the project has completely failed. Vividly describe what this failure looks like and its consequences, working backward from this hypothetical disaster.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_risk_identifier_${timestamp}`,
            name: "Risk Identifier",
            role: "custom",
            rolePrompt: "You identify specific risks that could lead to failure. List and analyze potential problems, obstacles, and failure points that might arise during implementation.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_prevention_${timestamp}`,
            name: "Prevention Strategist",
            role: "custom",
            rolePrompt: "You develop strategies to prevent identified risks. Propose specific preventative measures and contingency plans to address each potential failure point.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_resilience_${timestamp}`,
            name: "Resilience Builder",
            role: "custom",
            rolePrompt: "You focus on building resilience into the plan. Suggest ways to make the project more robust and able to recover quickly if things go wrong.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "fivewhys":
        agents = [
          {
            id: `agent_problem_${timestamp}`,
            name: "Problem Definer",
            role: "custom",
            rolePrompt: "You clearly define the initial problem. Articulate exactly what issue we're trying to solve and establish the starting point for analysis.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_why1_${timestamp}`,
            name: "First Why Explorer",
            role: "custom",
            rolePrompt: "You ask the first 'why' question. Identify the immediate causes of the problem and begin peeling back the first layer.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_why2_${timestamp}`,
            name: "Second Why Explorer",
            role: "custom",
            rolePrompt: "You ask the second 'why' question. Dig deeper into the causes identified in the first round and explore the next layer of causation.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_why3_${timestamp}`,
            name: "Third Why Explorer",
            role: "custom",
            rolePrompt: "You ask the third 'why' question. Continue probing deeper into root causes, moving beyond symptoms and obvious explanations.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_solution_${timestamp}`,
            name: "Root Cause Analyst",
            role: "custom",
            rolePrompt: "You synthesize the findings from all the 'why' questions to identify the root cause. Then propose sustainable solutions that address this fundamental issue.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "fishbone":
        agents = [
          {
            id: `agent_problem_definer_${timestamp}`,
            name: "Problem Definer",
            role: "custom",
            rolePrompt: "You clearly articulate the problem or effect being analyzed. Define what issue we're trying to understand the causes of.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_people_${timestamp}`,
            name: "People Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze how people-related factors contribute to the problem. Consider skills, training, staffing, communication, and human factors.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_process_${timestamp}`,
            name: "Process Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze how process-related factors contribute to the problem. Consider workflows, procedures, efficiency, and methodologies.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_environment_${timestamp}`,
            name: "Environment Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze how environmental factors contribute to the problem. Consider physical conditions, organizational culture, and external influences.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_materials_${timestamp}`,
            name: "Materials Factors Analyst",
            role: "custom",
            rolePrompt: "You analyze how materials and resources contribute to the problem. Consider quality, availability, and appropriateness of inputs.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "rubberduck":
        agents = [
          {
            id: `agent_problem_articulator_${timestamp}`,
            name: "Problem Articulator",
            role: "custom",
            rolePrompt: "You help the user clearly explain the problem they're facing. Ask clarifying questions to ensure the problem is fully articulated.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_solution_explorer_${timestamp}`,
            name: "Solution Explorer",
            role: "custom",
            rolePrompt: "You ask questions about potential solutions and approaches. Help the user talk through their ideas for solving the problem.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_logic_checker_${timestamp}`,
            name: "Logic Checker",
            role: "custom",
            rolePrompt: "You look for logical inconsistencies or gaps in reasoning. Point out areas where the user's approach might have flaws or assumptions.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_rubberduck_${timestamp}`,
            name: "Rubber Duck",
            role: "custom",
            rolePrompt: "You are the rubber duck. Listen attentively, occasionally ask 'And then what happens?' or 'Why does that work?' to prompt deeper explanation. Your goal is to help the user reach their own insights.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      // Creative Thinking Models
      case "scamper":
        agents = [
          {
            id: `agent_substitute_${timestamp}`,
            name: "Substitute Thinker",
            role: "custom",
            rolePrompt: "You focus on substitution possibilities. Explore what could replace or change parts of the current solution, product, or approach.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_combine_${timestamp}`,
            name: "Combination Expert",
            role: "custom",
            rolePrompt: "You focus on combination possibilities. Explore how to merge components, ideas, or functions to create new solutions.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_adapt_${timestamp}`,
            name: "Adaptation Specialist",
            role: "custom",
            rolePrompt: "You focus on adaptation possibilities. Explore how existing solutions from other contexts could be adapted to solve this problem.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_modify_${timestamp}`,
            name: "Modification Expert",
            role: "custom",
            rolePrompt: "You focus on modification possibilities. Explore how to change the size, shape, or other attributes to improve the solution.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_purpose_${timestamp}`,
            name: "Purpose Reevaluator",
            role: "custom",
            rolePrompt: "You focus on purpose possibilities. Explore alternative uses or applications for existing ideas or products.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "lateralthinking":
        agents = [
          {
            id: `agent_assumptionchallenger_${timestamp}`,
            name: "Assumption Challenger",
            role: "custom",
            rolePrompt: "You identify and challenge assumptions. Question the conventional thinking and established boundaries that may be limiting solutions.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_randomstimuli_${timestamp}`,
            name: "Random Stimuli Provider",
            role: "custom",
            rolePrompt: "You introduce unexpected concepts or ideas. Bring in seemingly unrelated elements to spark new connections and directions of thought.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_reversethinker_${timestamp}`,
            name: "Reverse Thinker",
            role: "custom",
            rolePrompt: "You consider reverse or opposite approaches. Explore what would happen if we did the opposite of what seems logical or expected.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_provocateur_${timestamp}`,
            name: "Provocateur",
            role: "custom",
            rolePrompt: "You make provocative statements to disrupt thinking patterns. Propose unexpected or even seemingly absurd ideas to break conventional thinking.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "pmi":
        agents = [
          {
            id: `agent_plus_${timestamp}`,
            name: "Plus Points Identifier",
            role: "custom",
            rolePrompt: "You identify all positive aspects of the idea or proposal. Analyze benefits, advantages, and potential gains without criticism.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_minus_${timestamp}`,
            name: "Minus Points Identifier",
            role: "custom",
            rolePrompt: "You identify all negative aspects of the idea or proposal. Analyze drawbacks, risks, and potential problems without bias.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_interesting_${timestamp}`,
            name: "Interesting Points Identifier",
            role: "custom",
            rolePrompt: "You identify all interesting or neutral aspects that are neither clearly positive nor negative. Analyze implications, questions raised, and potential consequences.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_conclusion_${timestamp}`,
            name: "Balanced Evaluator",
            role: "custom",
            rolePrompt: "You synthesize the Plus, Minus, and Interesting points to form a balanced evaluation. Weigh all factors to provide a comprehensive assessment.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "doublediamond":
        agents = [
          {
            id: `agent_discover_${timestamp}`,
            name: "Problem Discoverer",
            role: "custom",
            rolePrompt: "You focus on the Discover phase. Explore broadly to gather insights about user needs, market context, and existing solutions, taking a divergent thinking approach to understanding the problem space.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_define_${timestamp}`,
            name: "Problem Definer",
            role: "custom",
            rolePrompt: "You focus on the Define phase. Synthesize findings from discovery to clearly articulate the core problem, taking a convergent thinking approach to create a focused problem statement.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_develop_${timestamp}`,
            name: "Solution Developer",
            role: "custom",
            rolePrompt: "You focus on the Develop phase. Generate multiple potential solutions to address the defined problem, taking a divergent thinking approach to explore various possible solutions.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_deliver_${timestamp}`,
            name: "Solution Deliverer",
            role: "custom",
            rolePrompt: "You focus on the Deliver phase. Refine and finalize the most promising solution concept, taking a convergent thinking approach to create a concrete, implementable solution.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      // Learning Models
      case "feynman":
        agents = [
          {
            id: `agent_conceptexplainer_${timestamp}`,
            name: "Concept Explainer",
            role: "custom",
            rolePrompt: "You explain complex concepts in simple language. Break down the topic into its most fundamental components and explain them as if to a complete beginner.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_analogymaker_${timestamp}`,
            name: "Analogy Creator",
            role: "custom",
            rolePrompt: "You create simple analogies and metaphors. Connect complex ideas to everyday experiences that anyone can understand.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_gapfinder_${timestamp}`,
            name: "Knowledge Gap Finder",
            role: "custom",
            rolePrompt: "You identify knowledge gaps in the explanation. Point out where understanding is incomplete or where the explanation relies on jargon or complex concepts that haven't been broken down.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_teacher_${timestamp}`,
            name: "Teacher",
            role: "custom",
            rolePrompt: "You reconstruct the explanation as if teaching it to someone else. Deliver a clear, concise explanation that demonstrates complete understanding without technical jargon.",
            modelId: defaultModelId,
            active: true
          }
        ];
        break;
        
      case "grow":
        agents = [
          {
            id: `agent_goal_${timestamp}`,
            name: "Goal Setting Guide",
            role: "custom",
            rolePrompt: "You focus on the Goal aspect. Help define clear, inspiring goals and what the person wants to achieve in this situation.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_reality_${timestamp}`,
            name: "Reality Assessor",
            role: "custom",
            rolePrompt: "You focus on the Reality aspect. Explore the current situation objectively, examining facts, resources, obstacles, and previous attempts.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_options_${timestamp}`,
            name: "Options Explorer",
            role: "custom",
            rolePrompt: "You focus on the Options aspect. Generate and explore possible strategies, approaches, and alternatives for achieving the goal.",
            modelId: defaultModelId,
            active: true
          },
          {
            id: `agent_will_${timestamp}`,
            name: "Will Strengthener",
            role: "custom",
            rolePrompt: "You focus on the Will aspect. Help establish concrete action steps, address potential obstacles, and build commitment to moving forward.",
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