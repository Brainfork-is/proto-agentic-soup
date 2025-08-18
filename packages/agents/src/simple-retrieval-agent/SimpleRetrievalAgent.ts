/**
 * Simple RetrievalAgent specialized for knowledge base queries and data retrieval
 * Optimized for retrieval tasks with enhanced search and knowledge integration
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOllama } from '@langchain/ollama';
import { JobData } from '@soup/common';
import { memoryManager } from '../agentMemory';
import { createToolsForAgent } from '../langchain-tools';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export class SimpleRetrievalAgent {
  id: string;
  temperature: number;
  tools: string[];
  private agent: any;

  constructor(id: string, temperature: number, tools: string[]) {
    this.id = id;
    this.temperature = temperature;
    this.tools = tools;
    
    // Create Ollama chat model with moderate temperature for balanced retrieval
    const llm = new ChatOllama({
      model: process.env.LOCAL_MODEL_PATH || 'llama3.1:8b',
      temperature: Math.max(0.3, temperature - 0.1), // Lower temperature for accurate retrieval
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });
    
    // Create LangChain tools with focus on retrieval capabilities
    const langchainTools = createToolsForAgent(id, tools);
    
    // Create ReAct agent optimized for retrieval tasks
    this.agent = createReactAgent({
      llm,
      tools: langchainTools,
    });
    
    console.log(`[SimpleRetrievalAgent] Created retrieval-specialized agent ${id} with tools: ${tools.join(', ')}`);
  }

  async handle(job: JobData) {
    try {
      console.log(`[SimpleRetrievalAgent] Agent ${this.id} handling ${job.category} job`);
      
      // Get agent memory for retrieval context
      const memory = memoryManager.getMemory(this.id);
      const memoryContext = memory.generateContext();
      
      // Build retrieval-focused task message
      const taskMessage = this.buildRetrievalTaskMessage(job, memoryContext);
      
      // Add system message for retrieval specialization
      const systemMessage = new SystemMessage(
        "You are a retrieval-specialized AI agent. You excel at searching knowledge bases, " +
        "finding relevant information, synthesizing data from multiple sources, and providing " +
        "accurate, well-sourced answers. You are methodical in your search approach and " +
        "skilled at identifying the most relevant and authoritative information."
      );
      
      // Invoke agent with retrieval-focused prompting
      const startTime = Date.now();
      const result = await this.agent.invoke({
        messages: [systemMessage, new HumanMessage(taskMessage)]
      });
      
      const duration = Date.now() - startTime;
      
      // Extract final response from agent messages
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const finalOutput = lastMessage?.content || 'Retrieval completed';
      
      // Retrieval agent success criteria - focus on information accuracy and relevance
      const success = finalOutput && 
                     finalOutput.length > 15 && 
                     !finalOutput.toLowerCase().includes('error') &&
                     !finalOutput.toLowerCase().includes('failed') &&
                     !finalOutput.toLowerCase().includes('not found') &&
                     this.validateRetrievalOutput(job, finalOutput);
      
      // Store retrieval experience in memory
      memory.remember({
        category: job.category,
        payload: job.payload,
        success,
        artifact: finalOutput,
        stepsUsed: 0,
        planUsed: `Retrieval strategy for ${job.category}`,
        adjustments: success ? 
          ['Maintain effective search methods'] : 
          ['Improve query formulation', 'Enhance search strategies'],
      });
      
      console.log(`[SimpleRetrievalAgent] Agent ${this.id} completed ${job.category} in ${duration}ms - Success: ${success}`);
      console.log(`[SimpleRetrievalAgent] Retrieval quality assessment: ${this.validateRetrievalOutput(job, finalOutput)}`);
      
      return {
        ok: success,
        artifact: finalOutput,
        stepsUsed: 0,
        planUsed: `Retrieval strategy for ${job.category}`,
        adjustments: success ? 
          ['Maintain effective search methods'] : 
          ['Improve query formulation'],
      };
      
    } catch (error) {
      console.error(`[SimpleRetrievalAgent] Agent ${this.id} failed:`, error);
      
      // Store failure in memory
      const memory = memoryManager.getMemory(this.id);
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: false,
        artifact: `Retrieval failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed retrieval attempt',
        adjustments: ['Fix retrieval agent error', 'Improve error handling'],
      });
      
      return {
        ok: false,
        artifact: `Retrieval agent failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed retrieval attempt',
        adjustments: ['Fix retrieval agent error'],
      };
    }
  }

  private buildRetrievalTaskMessage(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');
    
    let taskDescription = '';
    let retrievalGuidance = '';
    
    switch (job.category) {
      case 'web_research':{
        const { url, question } = job.payload as any;
        taskDescription = `Use retrieval methods to research "${question}" and then verify findings by navigating to ${url}.`;
        retrievalGuidance = "Start with knowledge base searches, then use browser tools to verify and supplement your findings. Combine multiple sources for comprehensive results.";
        break;
        }
        
      case 'classify':{
        const { labels, answer } = job.payload as any;
        taskDescription = `Retrieve relevant classification information and categorize this content: "${answer}" into categories: ${labels?.join(', ') || 'appropriate category'}.`;
        retrievalGuidance = "Search for similar examples and classification criteria in the knowledge base to make an informed decision.";
        break;
        }
        
      case 'summarize':{
        const { text, maxWords } = job.payload as any;
        taskDescription = `Retrieve context about the topic and summarize this text in ${maxWords || 50} words: ${text}`;
        retrievalGuidance = "Use retrieval tools to understand the context and background, then create a well-informed summary.";
        break;
        }
        
      case 'math':{
        const { expr } = job.payload as any;
        taskDescription = `Retrieve mathematical methods and solve: ${expr}`;
        retrievalGuidance = "Search for relevant mathematical approaches and formulas, then apply calculation tools systematically.";
        break;
        }
        
      default:
        taskDescription = `Use retrieval methods to complete the ${job.category} task: ${JSON.stringify(job.payload)}`;
        retrievalGuidance = "Search the knowledge base for relevant information and apply systematic retrieval methodology.";
    }
    
    return `You are a retrieval-specialized AI agent with access to these tools: ${availableTools}

RETRIEVAL EXPERIENCE AND MEMORY:
${memoryContext}

RETRIEVAL GUIDANCE: ${retrievalGuidance}

RETRIEVAL TASK: ${taskDescription}

Use your retrieval tools systematically to find the most relevant and accurate information. Search thoroughly, verify your findings, and provide comprehensive results based on retrieved data.`;
  }

  private validateRetrievalOutput(job: JobData, output: string): boolean {
    // General quality checks for retrieval output
    const hasSubstantiveContent = output.length > 20;
    const hasSpecificInformation = !output.includes('I cannot find') && !output.includes('No results');
    const containsUsefulData = output.includes('.') || output.includes(',') || output.includes(':') || /\d/.test(output);
    
    switch (job.category) {
      case 'web_research':{
        // Should contain specific retrieved information
        return hasSubstantiveContent && 
               hasSpecificInformation && 
               containsUsefulData &&
               !output.toLowerCase().includes('searching for');
        
      case 'classify':{
        const { labels } = job.payload as any;
        if (labels && labels.length > 0) {
          return labels.some((label: string) => 
            output.toLowerCase().includes(label.toLowerCase())
          ) && hasSubstantiveContent;
        }
        return hasSubstantiveContent && containsUsefulData;
        
      case 'summarize':{
        const { maxWords } = job.payload as any;
        const wordCount = output.trim().split(/\s+/).length;
        return wordCount <= (maxWords || 50) + 15 && // Allow buffer for retrieval context
               hasSubstantiveContent &&
               containsUsefulData;
        
      case 'math':{
        // Should contain numerical result and possibly method explanation
        return /\d/.test(output) && 
               hasSubstantiveContent &&
               !output.toLowerCase().includes('searching for');
        
      default:
        return hasSubstantiveContent && 
               hasSpecificInformation && 
               containsUsefulData;
    }
  }
}